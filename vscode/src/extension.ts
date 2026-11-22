import * as vscode from 'vscode';
import { UPDATE_COMMAND, UpdateHintsQuickFix, ViewHints } from './vscode/viewHints';

/** Called by VS Code when a CodeIgniter project opens, or the first time a command runs. */
export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('ViewSense', { log: true });
  const viewHints = new ViewHints(log);

  context.subscriptions.push(
    log,
    viewHints,
    vscode.commands.registerCommand(UPDATE_COMMAND, () => viewHints.updateWorkspace()),
    vscode.workspace.onDidSaveTextDocument((document) => {
      viewHints.onDidSave(document);
    }),
    vscode.languages.registerCodeActionsProvider({ language: 'php' }, new UpdateHintsQuickFix(), {
      providedCodeActionKinds: UpdateHintsQuickFix.kinds,
    }),
  );

  // Show which views are out of date, without changing any file.
  void viewHints.checkWorkspace();
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered in context.subscriptions.
}
