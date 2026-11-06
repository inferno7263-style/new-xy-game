import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaCamera } from '../camera.js';
import { WORLD_WIDTH, WORLD_HEIGHT, createPlatforms, PLAYER_SPAWN, ENEMY_SPAWN } from '../world.js';

const fighter = (x, y = 660, vx = 0, vy = 0) => ({ x, y, vx, vy });
function advance(camera, a, b, seconds = 3, step = 1 / 60) {
  for (let frame = 0; frame < Math.round(seconds / step); frame++) camera.update(step, a, b);
}
function assertFramed(camera, ...fighters) {
  for (const actor of fighters) {
    const upperLeft = camera.worldToScreen(actor.x - 90, actor.y - 200);
    const lowerRight = camera.worldToScreen(actor.x + 90, actor.y + 50);
    assert.ok(upperLeft.x >= -1e-5, `left shoulder clipped at ${upperLeft.x}`);
    assert.ok(lowerRight.x <= camera.viewWidth + 1e-5, `right shoulder clipped at ${lowerRight.x}`);
    assert.ok(upperLeft.y >= camera.topInset - 1e-5, `head hidden by HUD at ${upperLeft.y}`);
    assert.ok(lowerRight.y <= camera.viewHeight - camera.bottomInset + 1e-5, `feet clipped at ${lowerRight.y}`);
  }
}

test('the expanded world has a broad continuous floor and fresh raised-platform meshes', () => {
  const platforms = createPlatforms();
  const main = platforms.find(platform => platform.y === 660);
  assert.equal(WORLD_WIDTH, 3200);
  assert.equal(WORLD_HEIGHT, 900);
  assert.ok(main.w >= 3000, 'retreating must have substantially more room than the original small arena');
  assert.ok(platforms.length >= 8, 'both sides need multiple elevated escape routes');
  for (const spawn of [PLAYER_SPAWN, ENEMY_SPAWN]) {
    assert.ok(spawn.x > main.x && spawn.x < main.x + main.w);
    assert.equal(spawn.y, main.y);
  }
  platforms[0].rock = { cached: true };
  assert.equal(createPlatforms()[0].rock, undefined, 'render caches must not leak between games');
});

test('a close fight zooms in and a distant fight zooms out while keeping both fighters framed', () => {
  const camera = new ArenaCamera();
  const nearA = fighter(1470), nearB = fighter(1730);
  camera.reset(nearA, nearB);
  const nearZoom = camera.zoom;
  assertFramed(camera, nearA, nearB);
  const farA = fighter(110), farB = fighter(3090);
  camera.reset(farA, farB);
  assert.ok(camera.zoom < nearZoom * .5, 'wide separation should produce a visibly wider view');
  assert.ok(camera.zoom >= .4 && nearZoom <= 1.08);
  assertFramed(camera, farA, farB);
});

test('camera eases back into a close fight rather than snapping to maximum zoom', () => {
  const camera = new ArenaCamera();
  camera.reset(fighter(110), fighter(3090));
  const before = camera.zoom;
  const a = fighter(1470), b = fighter(1730);
  camera.update(1 / 60, a, b);
  assert.ok(camera.zoom > before);
  assert.ok(camera.zoom < camera.targetZoom - .2, 'one frame must not snap from a wide view to a close-up');
  advance(camera, a, b);
  assert.ok(Math.abs(camera.zoom - camera.targetZoom) < .001);
  assertFramed(camera, a, b);
});

test('rapid opposite dashes trigger safe pull-back before either silhouette leaves the frame', () => {
  const camera = new ArenaCamera();
  const a = fighter(1470), b = fighter(1730);
  camera.reset(a, b);
  a.x = 22; a.vx = -1080;
  b.x = WORLD_WIDTH - 22; b.vx = 1080;
  camera.update(1 / 60, a, b);
  assertFramed(camera, a, b);
  advance(camera, a, b);
  assertFramed(camera, a, b);
});

test('high jumps on raised islands stay below the HUD while the grounded opponent remains visible', () => {
  const camera = new ArenaCamera();
  const a = fighter(1500, 660), b = fighter(1740, 660);
  camera.reset(a, b);
  a.y = -70; a.vy = -300;
  camera.update(1 / 120, a, b);
  assertFramed(camera, a, b);
  advance(camera, a, b);
  assertFramed(camera, a, b);
});

test('framing remains safe at arena edges and the camera can be frozen by skipping updates', () => {
  const camera = new ArenaCamera();
  const a = fighter(22), b = fighter(230);
  camera.reset(a, b);
  assertFramed(camera, a, b);
  const frozen = camera.getState();
  camera.update(0, fighter(2200), fighter(2900));
  assert.deepEqual(camera.getState(), frozen);
  camera.reset(PLAYER_SPAWN, ENEMY_SPAWN);
  assertFramed(camera, PLAYER_SPAWN, ENEMY_SPAWN);
});

test('camera transforms use the same center and zoom as world-to-screen coordinates', () => {
  const camera = new ArenaCamera();
  camera.reset(PLAYER_SPAWN, ENEMY_SPAWN);
  const calls = [];
  camera.apply({ translate: (...values) => calls.push(['translate', ...values]), scale: (...values) => calls.push(['scale', ...values]) });
  assert.deepEqual(calls, [['translate', 720, 390], ['scale', camera.zoom, camera.zoom], ['translate', -camera.x, -camera.y]]);
  assert.deepEqual(camera.worldToScreen(camera.x, camera.y), { x: 720, y: 390 });
});
