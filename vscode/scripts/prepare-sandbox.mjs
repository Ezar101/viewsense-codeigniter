// Copies the fixtures into .sandbox/, so you can try the extension (F5) without changing them.
// The sandbox is reset on each launch.
import { cp, rm } from 'node:fs/promises';

const fixtures = new URL('../../fixtures/', import.meta.url);
const sandbox = new URL('../.sandbox/', import.meta.url);

await rm(sandbox, { recursive: true, force: true });
for (const project of ['ci3', 'ci4']) {
  await cp(new URL(project, fixtures), new URL(project, sandbox), { recursive: true });
}
console.log('Sandbox ready in vscode/.sandbox/');
