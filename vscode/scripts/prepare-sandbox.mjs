// Copies the fixtures into a folder of vscode/, so you can run the extension on them without
// changing them. The folder is reset each time.
// Usage: node scripts/prepare-sandbox.mjs [folder]   (default: .sandbox)
import { cp, rm } from 'node:fs/promises';

const folder = process.argv[2] ?? '.sandbox';
const fixtures = new URL('../../fixtures/', import.meta.url);
const target = new URL(`../${folder}/`, import.meta.url);

await rm(target, { recursive: true, force: true });
for (const project of ['ci3', 'ci4']) {
  await cp(new URL(project, fixtures), new URL(project, target), { recursive: true });
}
console.log(`Fixtures copied to vscode/${folder}/`);
