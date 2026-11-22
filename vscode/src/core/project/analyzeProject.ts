import type { ClassIndex } from '../php/classIndex';
import { buildClassIndex } from '../php/indexClasses';
import { formatType, unionTypes, type PhpType } from '../types/phpType';
import { collectViewVariables, type ViewVariables } from '../views/collectViewVariables';
import {
  analyzeViewFile,
  type FileAnalysis,
  type SharedVariables,
  type ViewCall,
} from '../views/findViewCalls';
import { hasHintBlock, removeHintBlock } from '../views/hintBlock';
import {
  CI3_STUB_PATH,
  ci3ViewProperties,
  GENERATED_GITIGNORE_PATH,
  renderCi3ViewStub,
  usesThis,
  viewThisType,
} from '../views/viewThis';
import type { ViewCallRule } from './config';
import type { CodeIgniterProject } from './detectProject';
import type { ProjectFiles } from './projectFiles';

export interface ProjectAnalysis {
  /** Variables of each view file that needs a block, keyed by its path (e.g. `app/Views/home.php`). */
  readonly views: ReadonlyMap<string, ViewVariables>;
  /** Views that are rendered somewhere but whose file doesn't exist, e.g. `products/missing`. */
  readonly missingViews: readonly string[];
  /** Helper files to write, keyed by their path, e.g. the class of `$this` in CodeIgniter 3. */
  readonly generatedFiles: ReadonlyMap<string, string>;
}

interface SourceFile {
  readonly code: string;
  readonly path: string;
}

/**
 * A partial gets the variables of the view that includes it, which may itself be a partial.
 * Each round passes the variables one level further down; we stop when nothing changes.
 * The limit protects against views that include each other.
 */
const MAX_ROUNDS = 10;

/**
 * Reads every PHP file of the application, finds the view calls and gives the variables each
 * view file receives, including `$this` when the view uses it. A view that still has a block but
 * no longer receives anything gets an empty list, so the caller removes its block.
 */
export async function analyzeProject(
  project: CodeIgniterProject,
  files: ProjectFiles,
): Promise<ProjectAnalysis> {
  const phpFiles = await files.listPhpFiles(project.appFolder);
  const sources: SourceFile[] = [];
  for (const path of phpFiles) {
    const code = await files.read(path);
    if (code !== null) {
      sources.push({ code, path });
    }
  }

  // First pass: learn the classes, so the next ones can type `$this->model->method()`.
  const classes = buildClassIndex(sources);
  const isView = (path: string): boolean => path.startsWith(`${project.viewsFolder}/`);
  const existingFiles = new Set(phpFiles);
  const toViewFiles = (calls: ViewCall[]): Map<string, ViewVariables> => {
    const byFile = new Map<string, ViewVariables>();
    for (const [view, variables] of collectViewVariables(calls)) {
      const path = viewFilePath(project, view);
      if (existingFiles.has(path)) {
        byFile.set(path, variables);
      }
    }
    return byFile;
  };

  // Controllers, models and helpers don't depend on view variables: analyze them once.
  const codeResults = analyzeAll(
    sources.filter(({ path }) => !isView(path)),
    () => undefined,
    { classes, viewCalls: project.viewCalls },
  );

  let received = new Map<string, ViewVariables>();
  let calls: ViewCall[] = [];
  let signature = '';
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const viewsBefore = received;
    const viewResults = analyzeAll(
      sources.filter(({ path }) => isView(path)),
      (path) => viewsBefore.get(path),
      { classes, viewCalls: project.viewCalls },
    );
    const results = [...codeResults, ...viewResults];
    const shared = results.flatMap(({ analysis }) => analysis.shared);
    calls = results.flatMap(({ path, analysis }) =>
      analysis.calls.map((call) =>
        withContext(
          call,
          sharedFor(call.fromClass, shared, classes),
          isView(path) ? viewsBefore.get(path) : undefined,
        ),
      ),
    );

    received = toViewFiles(calls);
    const next = describe(received);
    if (next === signature) {
      break;
    }
    signature = next;
  }

  const views = new Map(received);
  const missingViews = [
    ...new Set(
      calls
        .map((call) => call.view)
        .filter((view) => !existingFiles.has(viewFilePath(project, view))),
    ),
  ].sort();

  // Our own block mentions `$this`, so look at the view without it.
  const viewsUsingThis = sources
    .filter(({ path }) => isView(path))
    .filter(({ code }) => usesThis(removeHintBlock(code)))
    .map(({ path }) => path);
  for (const path of viewsUsingThis) {
    views.set(path, new Map([...(views.get(path) ?? []), ['this', viewThisType(project.version)]]));
  }

  for (const { code, path } of sources) {
    if (!views.has(path) && hasHintBlock(code)) {
      views.set(path, new Map());
    }
  }

  const generatedFiles = new Map<string, string>();
  if (project.version === 3 && viewsUsingThis.length > 0) {
    generatedFiles.set(CI3_STUB_PATH, renderCi3ViewStub(ci3ViewProperties(classes)));
    generatedFiles.set(GENERATED_GITIGNORE_PATH, '# Generated by ViewSense for CodeIgniter\n*\n');
  }

  return { views, missingViews, generatedFiles };
}

/** `products/list` becomes `application/views/products/list.php` in CodeIgniter 3. */
export function viewFilePath(project: CodeIgniterProject, view: string): string {
  return `${project.viewsFolder}/${view.replace(/^\/+/, '')}.php`;
}

function analyzeAll(
  sources: SourceFile[],
  initialVariables: (path: string) => ViewVariables | undefined,
  options: { classes: ClassIndex; viewCalls: readonly ViewCallRule[] },
): { path: string; analysis: FileAnalysis }[] {
  return sources.map(({ code, path }) => {
    const initial = initialVariables(path);
    const analysis = analyzeViewFile(code, path, {
      ...options,
      ...(initial === undefined ? {} : { initialVariables: initial }),
    });
    return { path, analysis };
  });
}

/**
 * Variables shared with `$this->load->vars()` in the class of the call or one of its parents.
 * Shared variables from outside any class reach every view.
 */
function sharedFor(
  fromClass: string | null,
  shared: SharedVariables[],
  classes: ClassIndex,
): Map<string, PhpType> {
  const lineage = fromClass === null ? [] : classes.lineage(fromClass);
  const variables = new Map<string, PhpType>();
  for (const entry of shared) {
    if (entry.fromClass !== null && !lineage.includes(entry.fromClass.toLowerCase())) {
      continue;
    }
    for (const { name, type } of entry.variables) {
      const known = variables.get(name);
      variables.set(name, known === undefined ? type : unionTypes(known, type));
    }
  }
  return variables;
}

/**
 * Adds what a view call receives without passing it: shared variables, and for a partial, the
 * variables of the view it's in. What the call passes itself wins, as in CodeIgniter.
 */
function withContext(
  call: ViewCall,
  shared: ReadonlyMap<string, PhpType>,
  parent: ViewVariables | undefined,
): ViewCall {
  const variables = new Map<string, PhpType>(shared);
  for (const [name, type] of parent ?? []) {
    if (name !== 'this') {
      variables.set(name, type);
    }
  }
  for (const { name, type } of call.variables) {
    variables.set(name, type);
  }
  return { ...call, variables: [...variables].map(([name, type]) => ({ name, type })) };
}

/** A text that changes when any view variable or type changes. */
function describe(views: ReadonlyMap<string, ViewVariables>): string {
  return [...views]
    .map(([path, variables]) => {
      const list = [...variables].map(([name, type]) => `${name}:${formatType(type)}`).sort();
      return `${path}=${list.join(',')}`;
    })
    .sort()
    .join(';');
}
