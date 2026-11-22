import * as vscode from 'vscode';
import { analyzeProject } from '../core/project/analyzeProject';
import { CONFIG_FILE, loadConfig } from '../core/project/config';
import { detectProject } from '../core/project/detectProject';
import { nodeProjectFiles } from '../core/project/projectFiles';
import type { ViewVariables } from '../core/views/collectViewVariables';
import { applyHintBlock, hintBlockLines } from '../core/views/hintBlock';

/**
 * - `write`: update the block of every view, and the generated files.
 * - `check`: change nothing, only list the views whose block isn't up to date.
 */
export type SyncMode = 'write' | 'check';

export interface OutdatedView {
  readonly uri: vscode.Uri;
  /** Lines of the current block, or the first line when the view has no block yet. */
  readonly range: vscode.Range;
}

export interface SyncResult {
  readonly updated: number;
  readonly configProblems: number;
  readonly outdated: readonly OutdatedView[];
}

/** Analyzes one workspace folder. Returns `null` when it isn't a CodeIgniter project. */
export async function syncFolder(
  folder: vscode.WorkspaceFolder,
  log: vscode.LogOutputChannel,
  mode: SyncMode,
): Promise<SyncResult | null> {
  const files = nodeProjectFiles(folder.uri.fsPath);
  const { config, problems } = await loadConfig(files);
  for (const problem of problems) {
    log.error(`${folder.name}: ${CONFIG_FILE}: ${problem}`);
  }

  const project = await detectProject(files, config);
  if (project === null) {
    log.debug(`${folder.name}: no CodeIgniter project found`);
    return null;
  }

  const started = Date.now();
  const analysis = await analyzeProject(project, files);
  log.info(
    `${folder.name}: CodeIgniter ${String(project.version)} project analyzed in ${String(Date.now() - started)} ms`,
  );
  for (const view of analysis.missingViews) {
    log.warn(`${folder.name}: no file found for the view '${view}'`);
  }

  if (mode === 'write') {
    for (const [path, content] of analysis.generatedFiles) {
      if (await writeGeneratedFile(uriOf(folder, path), content)) {
        log.info(`${folder.name}: generated ${path}`);
      }
    }
  }

  let updated = 0;
  const outdated: OutdatedView[] = [];
  for (const [path, variables] of analysis.views) {
    const uri = uriOf(folder, path);
    if (mode === 'check') {
      const view = await outdatedView(uri, variables);
      if (view !== null) {
        outdated.push(view);
      }
      continue;
    }

    const result = await writeHintBlock(uri, variables);
    if (result === 'updated') {
      updated += 1;
      log.info(`${folder.name}: updated ${path}`);
    } else if (result === 'skipped') {
      log.warn(`${folder.name}: skipped ${path} because it isn't a UTF-8 file`);
    }
  }
  return { updated, configProblems: problems.length, outdated };
}

function uriOf(folder: vscode.WorkspaceFolder, path: string): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, ...path.split('/'));
}

/** Current text of a view: the editor content when it's open, else the file on disk. */
async function readView(uri: vscode.Uri): Promise<string | null> {
  const openDocument = findOpenDocument(uri);
  if (openDocument !== undefined) {
    return openDocument.getText();
  }
  try {
    return decodeUtf8(await vscode.workspace.fs.readFile(uri));
  } catch {
    return null;
  }
}

async function outdatedView(
  uri: vscode.Uri,
  variables: ViewVariables,
): Promise<OutdatedView | null> {
  const current = await readView(uri);
  if (current === null || applyHintBlock(current, variables) === current) {
    return null;
  }
  const lines = hintBlockLines(current) ?? { start: 0, end: 0 };
  return { uri, range: new vscode.Range(lines.start, 0, lines.end, Number.MAX_SAFE_INTEGER) };
}

/** Writes a file ViewSense owns, only when its content changed. Returns true when written. */
async function writeGeneratedFile(uri: vscode.Uri, content: string): Promise<boolean> {
  try {
    const current = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    if (current === content) {
      return false;
    }
  } catch {
    // The file doesn't exist yet. writeFile() creates the missing folders.
  }
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
  return true;
}

/** Result of writing the block into one view file. */
type WriteResult = 'updated' | 'unchanged' | 'skipped';

async function writeHintBlock(uri: vscode.Uri, variables: ViewVariables): Promise<WriteResult> {
  // A view with unsaved changes: edit the editor content, so those changes aren't lost.
  const openDocument = findOpenDocument(uri);
  if (openDocument?.isDirty === true) {
    return (await editDocument(openDocument, variables)) ? 'updated' : 'unchanged';
  }

  const current = decodeUtf8(await vscode.workspace.fs.readFile(uri));
  if (current === null) {
    return 'skipped';
  }
  const next = applyHintBlock(current, variables);
  if (next === current) {
    return 'unchanged';
  }
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(next));
  return 'updated';
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );
}

async function editDocument(
  document: vscode.TextDocument,
  variables: ViewVariables,
): Promise<boolean> {
  const current = document.getText();
  const next = applyHintBlock(current, variables);
  if (next === current) {
    return false;
  }

  // Replace only the part that changed, so the cursor and the undo history stay sensible.
  const { start, currentEnd, nextEnd } = changedRange(current, next);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(start), document.positionAt(currentEnd)),
    next.slice(start, nextEnd),
  );
  return vscode.workspace.applyEdit(edit);
}

/** Finds the smallest range of `current` to replace with a slice of `next`. */
function changedRange(
  current: string,
  next: string,
): { start: number; currentEnd: number; nextEnd: number } {
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) {
    start += 1;
  }

  let currentEnd = current.length;
  let nextEnd = next.length;
  while (currentEnd > start && nextEnd > start && current[currentEnd - 1] === next[nextEnd - 1]) {
    currentEnd -= 1;
    nextEnd -= 1;
  }
  return { start, currentEnd, nextEnd };
}

/**
 * Decodes UTF-8 and keeps the byte order mark. Returns `null` for another encoding (some old
 * CodeIgniter 3 projects use Latin-1), because writing it back as UTF-8 would break the file.
 */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
