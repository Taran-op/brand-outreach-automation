import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(root, 'src');
const files = (await readdir(sourceDirectory))
  .filter((name) => name.endsWith('.gs'))
  .sort();
const banner = [
  '/**',
  ' * GENERATED FILE — edit the numeric modules under src/, then run npm run build.',
  ' * Paste this file into Code.gs and add appsscript/Index.html as an HTML file.',
  ' */',
  ''
].join('\n');
const body = (await Promise.all(files.map((name) => readFile(join(sourceDirectory, name), 'utf8'))))
  .join('\n\n');
await writeFile(join(root, 'dist', 'BrandOutreach.gs'), banner + body.replace(/\r\n/g, '\n').trimEnd() + '\n', 'utf8');
console.log(`Built dist/BrandOutreach.gs from ${files.length} modules.`);
