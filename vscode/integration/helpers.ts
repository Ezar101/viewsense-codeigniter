import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'ezar101.viewsense-codeigniter';
export const UPDATE_COMMAND = 'viewsense.updateViewHints';

/** The fixture project VS Code opened for this test run. */
export function projectUri(...path: string[]): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'VS Code opened no folder');
  return vscode.Uri.joinPath(folder.uri, ...path.flatMap((part) => part.split('/')));
}

export async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(projectUri(path)));
}

export async function writeText(path: string, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(projectUri(path), new TextEncoder().encode(text));
}

export async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} isn't installed`);
  await extension.activate();
}

export async function setUpdateOnSave(enabled: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration('viewsense')
    .update('updateOnSave', enabled, vscode.ConfigurationTarget.Workspace);
}

/** Opens a file, replaces `search` with `replacement`, and saves it as a user would. */
export async function editAndSave(
  path: string,
  search: string,
  replacement: string,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(projectUri(path));
  const offset = document.getText().indexOf(search);
  assert.notEqual(offset, -1, `"${search}" not found in ${path}`);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(offset), document.positionAt(offset + search.length)),
    replacement,
  );
  assert.ok(await vscode.workspace.applyEdit(edit));
  assert.ok(await document.save());
}

export function viewSenseDiagnostics(path: string): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(projectUri(path))
    .filter((diagnostic) => diagnostic.source === 'ViewSense');
}

/** Checks `condition` until it's true, for things that happen after a delay (e.g. on save). */
export async function waitFor(
  description: string,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 10000,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Timed out waiting for: ${description}`);
}
