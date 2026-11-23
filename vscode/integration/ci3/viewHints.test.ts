import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  activateExtension,
  editAndSave,
  EXTENSION_ID,
  projectUri,
  readText,
  setUpdateOnSave,
  UPDATE_COMMAND,
  viewSenseDiagnostics,
  waitFor,
} from '../helpers';

const LIST_VIEW = 'application/views/products/list.php';
const DASHBOARD = 'application/controllers/Dashboard.php';

suite('CodeIgniter 3 project', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('activates when the project opens', () => {
    assert.equal(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  test('warns about views without a block when the project opens, and changes no file', async () => {
    await waitFor('a warning on products/list', () => viewSenseDiagnostics(LIST_VIEW).length > 0);
    assert.doesNotMatch(await readText(LIST_VIEW), /viewsense:start/);
  });

  test('writes the blocks and the class of $this with the command', async () => {
    await vscode.commands.executeCommand(UPDATE_COMMAND);

    const list = await readText(LIST_VIEW);
    assert.match(list, /\/\*\* @var ViewSense_CI3_View \$this \*\//);
    assert.match(list, /\/\*\* @var Product\[\] \$products \*\//);
    assert.match(list, /\/\*\* @var string\|null \$title \*\//);
    assert.match(
      await readText('application/views/layouts/main.php'),
      /\/\*\* @var array \$errors \*\//,
    );
    assert.match(
      await readText('.viewsense/ci3_view.php'),
      /class ViewSense_CI3_View extends CI_Loader/,
    );
    assert.equal(viewSenseDiagnostics(LIST_VIEW).length, 0);
  });

  test('updates the blocks when a controller is saved', async () => {
    await setUpdateOnSave(true);
    await editAndSave(DASHBOARD, "'page' => '1',", "'page' => '1', 'greeting' => 'Hello',");

    await waitFor('$greeting in products/list', async () =>
      (await readText(LIST_VIEW)).includes('/** @var string $greeting */'),
    );
  });

  test('only warns when updateOnSave is off, and the quick fix updates the view', async () => {
    await setUpdateOnSave(false);
    await editAndSave(DASHBOARD, "'greeting' => 'Hello',", "'greeting' => 42,");

    await waitFor('a warning on products/list', () => viewSenseDiagnostics(LIST_VIEW).length > 0);
    assert.match(await readText(LIST_VIEW), /\/\*\* @var string \$greeting \*\//);

    const [diagnostic] = viewSenseDiagnostics(LIST_VIEW);
    assert.ok(diagnostic);
    // VS Code only gives the code actions of a file that's open.
    await vscode.window.showTextDocument(projectUri(LIST_VIEW));
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      projectUri(LIST_VIEW),
      diagnostic.range,
    );
    const fix = actions.find((action) => action.title === 'Update view hints');
    assert.ok(fix?.command, 'no "Update view hints" quick fix');

    const fixArguments: unknown[] = fix.command.arguments ?? [];
    await vscode.commands.executeCommand(fix.command.command, ...fixArguments);
    assert.match(await readText(LIST_VIEW), /\/\*\* @var int \$greeting \*\//);
    assert.equal(viewSenseDiagnostics(LIST_VIEW).length, 0);

    // The open view was changed through its editor, then saved: editor and disk agree.
    const document = await vscode.workspace.openTextDocument(projectUri(LIST_VIEW));
    assert.equal(document.isDirty, false);
    assert.equal(document.getText(), await readText(LIST_VIEW));
  });

  test('keeps the unsaved changes of an open view', async () => {
    const document = await vscode.workspace.openTextDocument(projectUri(LIST_VIEW));
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, document.positionAt(document.getText().length), '<!-- draft -->\n');
    assert.ok(await vscode.workspace.applyEdit(edit));

    // Change the controller without saving through VS Code, then run the command.
    const controller = await readText(DASHBOARD);
    await vscode.workspace.fs.writeFile(
      projectUri(DASHBOARD),
      new TextEncoder().encode(controller.replace("'greeting' => 42,", "'greeting' => 1.5,")),
    );
    await vscode.commands.executeCommand(UPDATE_COMMAND);

    assert.ok(document.isDirty, 'the view was saved');
    assert.match(document.getText(), /\/\*\* @var float \$greeting \*\//);
    assert.match(document.getText(), /<!-- draft -->/);
    // The file on disk still has the old block: only the editor changed.
    assert.match(await readText(LIST_VIEW), /\/\*\* @var int \$greeting \*\//);
  });
});
