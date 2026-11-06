import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'game.js', 'fighter-sprites.js', 'combat.js', 'combat-effects.js', 'world.js', 'camera.js', 'enemy-effects.js']) await copyFile(new URL(file, root), new URL(file, out));
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });
console.log('Built static game in dist/');
