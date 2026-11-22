import * as vscode from 'vscode';
import { analyzeProject } from '../core/project/analyzeProject';
import { detectProject } from '../core/project/detectProject';
import { nodeProjectFiles } from '../core/project/projectFiles';
import type { ViewVariables } from '../core/views/collectViewVariables';
import { applyHintBlock } from '../core/views/hintBlock';

const SHOW_LOG = 'Show Log';

/** Result of writing the block into one view file. */
type WriteResult = 'updated' | 'unchanged' | 'skipped';

/**
 * Command "ViewSense: Update View Hints": analyzes each CodeIgniter project of the workspace
 * and updates the generated block of every view.
 */
export async function updateViewHints(log: vscode.LogOutputChannel): Promise<void> {
  // ViewSense reads files with Node.js, so it only works on folders on disk.
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(
    (folder) => folder.uri.scheme === 'file',
  );

  const summary = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ViewSense: updating view hints' },
    async () => {
      let projects = 0;
      let updated = 0;
      for (const folder of folders) {
        const result = await updateFolder(folder, log);
        if (result !== null) {
          projects += 1;
          updated += result;
        }
      }
      return { projects, updated };
    },
  );

  if (summary.projects === 0) {
    void vscode.window.showWarningMessage(
      'ViewSense: no CodeIgniter 3 or 4 project found in this workspace.',
    );
    return;
  }

  const views = summary.updated === 1 ? 'view' : 'views';
  const choice = await vscode.window.showInformationMessage(
    `ViewSense: updated ${String(summary.updated)} ${views}.`,
    SHOW_LOG,
  );
  if (choice === SHOW_LOG) {
    log.show();
  }
}

/** Updates the views of one workspace folder. Returns the number of updated views, or `null`. */
async function updateFolder(
  folder: vscode.WorkspaceFolder,
  log: vscode.LogOutputChannel,
): Promise<number | null> {
  const files = nodeProjectFiles(folder.uri.fsPath);
  const project = await detectProject(files);
  if (project === null) {
    log.info(`${folder.name}: no CodeIgniter project found`);
    return null;
  }

  log.info(`${folder.name}: CodeIgniter ${String(project.version)} project`);
  const analysis = await analyzeProject(project, files);
  for (const view of analysis.missingViews) {
    log.warn(`${folder.name}: no file found for the view '${view}'`);
  }

  for (const [path, content] of analysis.generatedFiles) {
    const uri = vscode.Uri.joinPath(folder.uri, ...path.split('/'));
    if (await writeGeneratedFile(uri, content)) {
      log.info(`${folder.name}: generated ${path}`);
    }
  }

  let updated = 0;
  for (const [path, variables] of analysis.views) {
    const uri = vscode.Uri.joinPath(folder.uri, ...path.split('/'));
    const result = await writeHintBlock(uri, variables);
    if (result === 'updated') {
      updated += 1;
      log.info(`${folder.name}: updated ${path}`);
    } else if (result === 'skipped') {
      log.warn(`${folder.name}: skipped ${path} because it isn't a UTF-8 file`);
    }
  }
  return updated;
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

async function writeHintBlock(uri: vscode.Uri, variables: ViewVariables): Promise<WriteResult> {
  // A view with unsaved changes: edit the editor content, so those changes aren't lost.
  const openDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );
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
