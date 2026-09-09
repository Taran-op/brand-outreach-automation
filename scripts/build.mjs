await import('./build-server.mjs');
await import('./build-web.mjs');
const { copyFile } = await import('node:fs/promises');
const { dirname, join, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(join(root, 'appsscript.json'), join(root, 'gas', 'appsscript.json'));
console.log('Staged gas/ for clasp deployment.');
