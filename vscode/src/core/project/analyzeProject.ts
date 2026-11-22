import { collectViewVariables, type ViewVariables } from '../views/collectViewVariables';
import { findViewCalls, type ViewCall } from '../views/findViewCalls';
import { hasHintBlock } from '../views/hintBlock';
import type { CodeIgniterProject } from './detectProject';
import type { ProjectFiles } from './projectFiles';

export interface ProjectAnalysis {
  /** Variables of each view file that needs a block, keyed by its path (e.g. `app/Views/home.php`). */
  readonly views: ReadonlyMap<string, ViewVariables>;
  /** Views that are rendered somewhere but whose file doesn't exist, e.g. `products/missing`. */
  readonly missingViews: readonly string[];
}

/**
 * Reads every PHP file of the application, finds the view calls and gives the variables each
 * view file receives. A view that still has a block but no longer receives anything gets an
 * empty list, so the caller removes its block.
 */
export async function analyzeProject(
  project: CodeIgniterProject,
  files: ProjectFiles,
): Promise<ProjectAnalysis> {
  const phpFiles = await files.listPhpFiles(project.appFolder);
  const calls: ViewCall[] = [];
  const filesWithBlock: string[] = [];

  for (const path of phpFiles) {
    const code = await files.read(path);
    if (code === null) {
      continue;
    }
    calls.push(...findViewCalls(code, path));
    if (hasHintBlock(code)) {
      filesWithBlock.push(path);
    }
  }

  const existingFiles = new Set(phpFiles);
  const views = new Map<string, ViewVariables>();
  const missingViews: string[] = [];

  for (const [view, variables] of collectViewVariables(calls)) {
    const path = viewFilePath(project, view);
    if (existingFiles.has(path)) {
      views.set(path, variables);
    } else {
      missingViews.push(view);
    }
  }

  for (const path of filesWithBlock) {
    if (!views.has(path)) {
      views.set(path, new Map());
    }
  }

  return { views, missingViews: missingViews.sort() };
}

/** `products/list` becomes `application/views/products/list.php` in CodeIgniter 3. */
export function viewFilePath(project: CodeIgniterProject, view: string): string {
  return `${project.viewsFolder}/${view.replace(/^\/+/, '')}.php`;
}
