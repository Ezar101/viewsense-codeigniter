import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activateExtension, projectUri, readText, UPDATE_COMMAND } from '../helpers';

suite('CodeIgniter 4 project', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  test('writes the blocks with the command', async () => {
    await vscode.commands.executeCommand(UPDATE_COMMAND);

    const index = await readText('app/Views/products/index.php');
    assert.match(index, /\/\*\* @var \\CodeIgniter\\View\\View \$this \*\//);
    assert.match(index, /\/\*\* @var \\App\\Entities\\Product\[\] \$products \*\//);
    assert.match(
      await readText('app/Views/products/form.php'),
      /\/\*\* @var \\App\\Entities\\Product \$product \*\//,
    );
  });

  test('generates no file for $this', async () => {
    await assert.rejects(async () => {
      await vscode.workspace.fs.stat(projectUri('.viewsense'));
    });
  });
});
