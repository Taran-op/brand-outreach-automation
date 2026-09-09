import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
const compiled = banner + body.replace(/\r\n/g, '\n').trimEnd() + '\n';
await mkdir(join(root, 'gas'), { recursive: true });
await Promise.all([
  writeFile(join(root, 'dist', 'BrandOutreach.gs'), compiled, 'utf8'),
  writeFile(join(root, 'gas', 'Code.gs'), compiled, 'utf8')
]);
console.log(`Built dist/BrandOutreach.gs from ${files.length} modules.`);
