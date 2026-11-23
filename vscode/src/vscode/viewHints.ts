import * as vscode from 'vscode';
import { CONFIG_FILE } from '../core/project/config';
import { isOwnSave, syncFolder, type SyncMode, type SyncResult } from './syncFolder';

/** Diagnostic code of an out-of-date block, used by the quick fix. */
export const OUTDATED_CODE = 'outdated-hints';
export const UPDATE_COMMAND = 'viewsense.updateViewHints';

/** Waits for a pause in saves (e.g. "Save All") before analyzing the project. */
const SAVE_DELAY_MS = 400;

/**
 * Keeps the view hints of the workspace up to date: runs the command, reacts to saved files,
 * and shows a warning on views whose block is out of date.
 */
export class ViewHints implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('viewsense');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Runs one analysis at a time, so two runs never write the same file together. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly log: vscode.LogOutputChannel) {}

  /** Command "ViewSense: Update View Hints": updates every project of the workspace. */
  async updateWorkspace(): Promise<void> {
    const folders = localFolders();
    const results = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'ViewSense: updating view hints' },
      () => Promise.all(folders.map((folder) => this.run(folder, 'write'))),
    );
    const found = results.filter((result): result is SyncResult => result !== null);

    if (found.length === 0) {
      void vscode.window.showWarningMessage(
        'ViewSense: no CodeIgniter 3 or 4 project found in this workspace.',
      );
      return;
    }

    const updated = found.reduce((total, result) => total + result.updated, 0);
    const configProblems = found.reduce((total, result) => total + result.configProblems, 0);
    const message = `ViewSense: updated ${String(updated)} ${updated === 1 ? 'view' : 'views'}.`;
    const showLog = 'Show Log';
    const shown =
      configProblems > 0
        ? vscode.window.showWarningMessage(
            `${message} ${CONFIG_FILE} has problems: see the log.`,
            showLog,
          )
        : vscode.window.showInformationMessage(message, showLog);
    // Don't wait for the message: it only closes when the user dismisses it, and the command
    // must end as soon as the update is done.
    void shown.then((choice) => {
      if (choice === showLog) {
        this.log.show();
      }
    });
  }

  /** Looks for out-of-date blocks without changing anything, e.g. when the workspace opens. */
  async checkWorkspace(): Promise<void> {
    await Promise.all(localFolders().map((folder) => this.run(folder, 'check')));
  }

  /** A PHP file or `.viewsense.json` was saved: update or check its project, after a pause. */
  onDidSave(document: vscode.TextDocument): void {
    const isConfig = document.uri.path.endsWith(`/${CONFIG_FILE}`);
    if ((document.languageId !== 'php' && !isConfig) || isOwnSave(document.uri)) {
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (folder?.uri.scheme !== 'file') {
      return;
    }

    const key = folder.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const updateOnSave = vscode.workspace
          .getConfiguration('viewsense', folder.uri)
          .get<boolean>('updateOnSave', true);
        void this.run(folder, updateOnSave ? 'write' : 'check');
      }, SAVE_DELAY_MS),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.diagnostics.dispose();
  }

  private run(folder: vscode.WorkspaceFolder, mode: SyncMode): Promise<SyncResult | null> {
    const next = this.queue.then(async () => {
      try {
        const result = await syncFolder(folder, this.log, mode);
        this.showOutdated(folder, result);
        return result;
      } catch (error) {
        this.log.error(`${folder.name}: analysis failed`, error);
        return null;
      }
    });
    this.queue = next;
    return next;
  }

  /** Replaces the warnings of a folder with the out-of-date views of the last run. */
  private showOutdated(folder: vscode.WorkspaceFolder, result: SyncResult | null): void {
    const prefix = folder.uri.toString();
    const stale: vscode.Uri[] = [];
    this.diagnostics.forEach((uri) => {
      if (uri.toString().startsWith(`${prefix}/`)) {
        stale.push(uri);
      }
    });
    for (const uri of stale) {
      this.diagnostics.delete(uri);
    }

    for (const view of result?.outdated ?? []) {
      const diagnostic = new vscode.Diagnostic(
        view.range,
        'The ViewSense @var block of this view is out of date.',
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = 'ViewSense';
      diagnostic.code = OUTDATED_CODE;
      this.diagnostics.set(view.uri, [diagnostic]);
    }
  }
}

/** Offers "Update view hints" on the out-of-date warning. */
export class UpdateHintsQuickFix implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const outdated = context.diagnostics.filter(
      (diagnostic) => diagnostic.source === 'ViewSense' && diagnostic.code === OUTDATED_CODE,
    );
    if (outdated.length === 0) {
      return [];
    }

    const action = new vscode.CodeAction('Update view hints', vscode.CodeActionKind.QuickFix);
    action.diagnostics = outdated;
    action.isPreferred = true;
    action.command = { command: UPDATE_COMMAND, title: 'Update view hints' };
    return [action];
  }
}

/** ViewSense reads files with Node.js, so it only works on folders on disk. */
function localFolders(): vscode.WorkspaceFolder[] {
  return (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === 'file');
}
