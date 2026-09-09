import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = join(root, 'web', '.build');
await mkdir(buildDirectory, { recursive: true });

await build({
  entryPoints: [join(root, 'web', 'src', 'main.tsx')],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome100', 'safari15'],
  format: 'iife',
  outfile: join(buildDirectory, 'app.js'),
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  define: { 'process.env.NODE_ENV': '"production"' }
});

const [template, css, javascript] = await Promise.all([
  readFile(join(root, 'web', 'index.template.html'), 'utf8'),
  readFile(join(root, 'web', 'src', 'styles.css'), 'utf8'),
  readFile(join(buildDirectory, 'app.js'), 'utf8')
]);
const html = template
  .replace('/*__INLINE_CSS__*/', css)
  .replace('/*__INLINE_JS__*/', javascript);
await Promise.all([
  mkdir(join(root, 'appsscript'), { recursive: true }),
  mkdir(join(root, 'gas'), { recursive: true })
]);
await Promise.all([
  writeFile(join(root, 'appsscript', 'Index.html'), html, 'utf8'),
  writeFile(join(root, 'gas', 'Index.html'), html, 'utf8')
]);
console.log(`Built appsscript/Index.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB).`);
