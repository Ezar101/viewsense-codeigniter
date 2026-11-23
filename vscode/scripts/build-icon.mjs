// Converts images/icon.svg (the source to edit) into images/icon.png (the file the
// Marketplace shows). Run it after you change the SVG: npm run icon
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// The Marketplace needs at least 128 x 128 pixels: twice that stays sharp on high-density screens.
const SIZE = 256;

const svg = await readFile(new URL('../images/icon.svg', import.meta.url));
const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
await writeFile(new URL('../images/icon.png', import.meta.url), png);
console.log(`images/icon.png written (${String(SIZE)} x ${String(SIZE)})`);
