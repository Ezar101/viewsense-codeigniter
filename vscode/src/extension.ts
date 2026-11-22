import * as vscode from 'vscode';
import { updateViewHints } from './vscode/updateViewHints';

/** Called by VS Code the first time a ViewSense command runs. */
export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('ViewSense', { log: true });

  context.subscriptions.push(
    log,
    vscode.commands.registerCommand('viewsense.updateViewHints', () => updateViewHints(log)),
  );
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered in context.subscriptions.
}
