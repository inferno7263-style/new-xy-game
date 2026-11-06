import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaGame } from '../game.js';
import { resolveCombat } from '../combat.js';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPAWN, ENEMY_SPAWN } from '../world.js';
import { drawXMan, xManFrame, xManAtlasFrames } from '../fighter-sprites.js';

// Combat simulation is independent of browser drawing and audio. Browser QA
// covers the actual canvas; these shims only supply the lifecycle APIs it uses.
globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.Image = class { set src(_) {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function withGame(run, options = {}) {
  const canvas = {
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 1440, height: 780 }),
  };
  const game = new ArenaGame(canvas, options);
  game.setSound(false);
  game.start();
  // Combat cases use a known open-floor fixture; reset tests exercise actual
  // expanded-arena spawns separately. This keeps contact timing deterministic.
  game.player.x = 360; game.enemy.x = 1080;
  game.camera.reset(game.player, game.enemy);
  try { return run(game); } finally { game.destroy(); }
}

function advance(game, seconds) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60);
}

test('physics allows two jumps and restores jumps after landing on a platform', () => {
  withGame(game => {
    game.player.x = 850;
    game.player.y = 510;
    assert.equal(game.jump(), true);
    advance(game, .15);
    assert.equal(game.jump(), true);
    assert.equal(game.jump(), false, 'a third airborne jump must be rejected');
    advance(game, 2);
    assert.equal(game.player.y, 510);
    assert.equal(game.player.grounded, true);
    assert.equal(game.player.jumps, 0);
  });
});

test('falling off the arena costs health and respawns the player safely', () => {
  withGame(game => {
    game.player.y = WORLD_HEIGHT + 150;
    game.update(1 / 60);
    assert.equal(game.player.hp, 88);
    assert.equal(game.player.x, PLAYER_SPAWN.x);
    assert.equal(game.player.y, 630);
    assert.ok(game.player.invincible > 1);
  });
});

test('Y-Man pursues the player, fires a blast, and can damage the player', () => {
  withGame(game => {
    const initialDistance = Math.abs(game.enemy.x - game.player.x);
    let sawBlast = false;
    for (let frame = 0; frame < 480; frame++) {
      game.update(1 / 60);
      sawBlast ||= game.projectiles.some(shot => shot.owner === 'enemy');
    }
    assert.ok(Math.abs(game.enemy.x - game.player.x) < initialDistance - 200);
    assert.equal(sawBlast, true, 'AI must actually emit hostile projectiles');
    assert.ok(game.player.hp < 100, 'hostile attacks must apply combat damage');
  });
});

test('blade slash deals damage, builds energy, and respects its cooldown', () => {
  withGame(game => {
    game.player.x = game.enemy.x - 90;
    game.player.dir = 1;
    const energyBefore = game.energy;
    assert.equal(game.attack('slash'), true);
    assert.equal(game.enemy.hp, 100, 'melee damage waits for same-step attack clash resolution');
    game.update(1 / 120);
    assert.equal(game.enemy.hp, 83);
    assert.ok(game.energy > energyBefore);
    assert.equal(game.combo, 1);
    assert.equal(game.attack('slash'), false);
    assert.equal(game.enemy.hp, 83, 'cooldown must prevent repeated immediate damage');
    advance(game, .4);
    assert.equal(game.cooldowns.slash, 0);
  });
});

test('cross-strike travels across the arena and damages its opponent', () => {
  withGame(game => {
    game.enemy.x = 680;
    game.enemy.shoot = 100;
    assert.equal(game.attack('cross'), true);
    assert.equal(game.projectiles.length, 1);
    assert.equal(game.attack('cross'), false);
    advance(game, .5);
    assert.equal(game.enemy.hp, 87);
    assert.equal(game.projectiles.filter(shot => shot.owner === 'player').length, 0);
  });
});

test('dash covers ground, grants brief invulnerability, and has a cooldown', () => {
  withGame(game => {
    const x = game.player.x;
    assert.equal(game.dash(), true);
    assert.ok(game.player.invincible > 0);
    assert.equal(game.dash(), false);
    advance(game, 1 / 6);
    assert.ok(game.player.x > x + 140);
    advance(game, 1.5);
    assert.equal(game.cooldowns.dash, 0);
    assert.equal(game.dash(), true);
  });
});

test('X Burst requires a full charge and damages nearby enemies while clearing blasts', () => {
  withGame(game => {
    game.enemy.x = game.player.x + 200;
    game.energy = 99;
    assert.equal(game.attack('burst'), false);
    assert.equal(game.enemy.hp, 100);
    game.energy = 100;
    game.projectiles.push({ owner: 'enemy', x: game.player.x + 100, y: game.player.y - 65, vx: -100, vy: 0, life: 2, radius: 17, strength: 1, damage: 10, rotation: 0 });
    assert.equal(game.attack('burst'), true);
    game.update(1 / 120);
    assert.equal(game.enemy.hp, 62);
    assert.ok(game.energy >= 12 && game.energy < 13, 'the hit grants energy after consuming the full charge');
    assert.equal(game.projectiles.length, 0);
    assert.ok(game.cooldowns.burst > 7.9);
  });
});

test('pause freezes combat and resume continues the same round', () => {
  const pauses = [];
  withGame(game => {
    advance(game, .5);
    game.pause();
    const pausedTime = game.time;
    const pausedX = game.enemy.x;
    advance(game, 2);
    assert.equal(game.mode, 'paused');
    assert.equal(game.time, pausedTime);
    assert.equal(game.enemy.x, pausedX);
    assert.equal(game.attack('slash'), false);
    game.resume();
    advance(game, .2);
    assert.equal(game.mode, 'playing');
    assert.ok(game.time > pausedTime);
    assert.deepEqual(pauses, [true, false]);
  }, { onPause: paused => pauses.push(paused) });
});

test('defeating Y-Man ends the round once and restart restores combat state', () => {
  const results = [];
  withGame(game => {
    game.player.x = game.enemy.x - 50;
    game.enemy.hp = 1;
    game.attack('slash');
    game.update(1 / 120);
    assert.equal(game.mode, 'ended');
    assert.equal(results.length, 1);
    assert.equal(results[0].winner, 'player');
    assert.equal(results[0].victory, true);
    game.finish('enemy');
    assert.equal(results.length, 1, 'round completion callback must fire exactly once');
    game.restart();
    assert.equal(game.mode, 'playing');
    assert.equal(game.player.hp, 100);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.time, 0);
    assert.equal(game.energy, 40);
    assert.equal(game.combo, 0);
    assert.equal(game.projectiles.length, 0);
  }, { onEnd: result => results.push(result) });
});

test('player defeat reports the enemy victory', () => {
  let result;
  withGame(game => {
    game.player.hp = 5;
    game.hit(game.player, 10, -1, 'projectile');
    assert.equal(game.mode, 'ended');
    assert.equal(game.player.hp, 0);
    assert.equal(result.winner, 'enemy');
    assert.equal(result.victory, false);
  }, { onEnd: value => { result = value; } });
});

test('movement accelerates, settles at running speed, and decelerates without snapping', () => {
  withGame(game => {
    game.updateAI = () => {};
    game.move(1, true);
    game.update(1 / 60);
    assert.ok(game.player.vx > 0 && game.player.vx < 385);
    advance(game, .4);
    assert.ok(game.player.vx > 375);
    const phase = game.player.poseTime;
    assert.ok(phase > 0, 'running must advance the animation clock');
    game.move(1, false);
    game.update(1 / 60);
    assert.ok(game.player.vx > 0 && game.player.vx < 375);
    advance(game, .4);
    assert.equal(game.player.vx, 0);
  });
});

test('coyote time preserves the ground jump immediately after leaving a ledge', () => {
  withGame(game => {
    game.updateAI = () => {};
    game.player.x = 70;
    game.update(1 / 60);
    assert.equal(game.player.grounded, false);
    assert.ok(game.player.coyote > 0);
    assert.equal(game.jump(), true);
    assert.equal(game.player.jumps, 1, 'ledge grace must preserve the airborne second jump');
    assert.equal(game.jump(), true);
    assert.equal(game.player.jumps, 2);
  });
});

test('a jump pressed just before landing is buffered and triggers on contact', () => {
  withGame(game => {
    game.updateAI = () => {};
    Object.assign(game.player, { y: 650, vy: 300, grounded: false, coyote: 0, jumps: 2 });
    assert.equal(game.jump(), false, 'both airborne jumps have already been spent');
    advance(game, .05);
    assert.ok(game.player.vy < -600, 'landing must consume the queued ground jump');
    assert.equal(game.player.jumps, 1);
    assert.equal(game.player.jumpBuffer, 0);
  });
});

test('releasing jump produces a shorter arc than holding jump', () => {
  const apex = released => {
    let highest = 660;
    withGame(game => {
      game.updateAI = () => {};
      game.player.x = 720;
      game.jump();
      advance(game, .07);
      if (released) game.releaseJump();
      for (let frame = 0; frame < 80; frame++) {
        game.update(1 / 120);
        highest = Math.min(highest, game.player.y);
      }
    });
    return highest;
  };
  assert.ok(apex(false) < apex(true) - 55, 'a held jump should reach meaningfully higher');
});

test('airborne ghosts keep snapshots of their pose and fade out after landing', () => {
  withGame(game => {
    game.updateAI = () => {};
    game.jump();
    game.move(1, true);
    advance(game, .2);
    const ghosts = game.effects.filter(effect => effect.type === 'ghost');
    assert.ok(ghosts.length >= 4 && ghosts.length <= 9, 'a bounded trail is emitted at a steady rate');
    const snapshot = { ...ghosts[0] };
    assert.equal(typeof snapshot.poseTime, 'number');
    assert.equal(snapshot.action, 'jump');
    advance(game, .05);
    assert.equal(ghosts[0].poseTime, snapshot.poseTime);
    assert.equal(ghosts[0].y, snapshot.y, 'ghosts must not move with the player');
    assert.ok(ghosts[0].life < snapshot.life, 'ghost opacity lifetime must decay');
    Object.assign(game.player, { x: 720, y: 660, vx: 0, vy: 0, grounded: true });
    game.move(1, false);
    advance(game, .4);
    assert.equal(game.effects.filter(effect => effect.type === 'ghost').length, 0);
  });
});

function stationaryOpponent(game) {
  game.updateAI = dt => game.physics(game.enemy, dt);
  game.enemy.x = game.player.x + 640;
}

test('laser has a harmless windup, deals one forward hit, and respects cooldown', () => {
  withGame(game => {
    stationaryOpponent(game);
    assert.equal(game.attack('laser'), true);
    assert.equal(game.laser.phase, 'charging');
    assert.equal(game.attack('laser'), false);
    advance(game, .3);
    assert.equal(game.enemy.hp, 100, 'charging must not deal early damage');
    advance(game, .05);
    assert.equal(game.laser.phase, 'firing');
    assert.equal(game.enemy.hp, 71);
    advance(game, .4);
    assert.equal(game.enemy.hp, 71, 'a single beam cannot repeatedly damage its target');
    advance(game, .1);
    assert.equal(game.laser, null);
    assert.equal(game.attack('laser'), false);
    advance(game, 3.2);
    assert.equal(game.attack('laser'), true);
  });
});

test('laser fires to the left and does not hit targets behind or above it', () => {
  withGame(game => {
    stationaryOpponent(game);
    game.player.x = 1100; game.player.dir = -1; game.enemy.x = 400;
    game.attack('laser'); advance(game, .4);
    assert.equal(game.enemy.hp, 71, 'left-facing beam must apply damage');
    game.restart(); stationaryOpponent(game);
    game.player.x = 600; game.player.dir = 1; game.enemy.x = 300;
    game.attack('laser'); advance(game, .7);
    assert.equal(game.enemy.hp, 100, 'enemies behind the caster must not be hit');
    game.restart(); stationaryOpponent(game);
    game.enemy.x = 720; game.enemy.y = 290; game.enemy.grounded = true;
    game.attack('laser'); advance(game, .7);
    assert.equal(game.enemy.hp, 100, 'targets on higher platforms must be able to evade the beam');
  });
});

test('pausing freezes the laser and restarting clears its charge and cooldown', () => {
  withGame(game => {
    stationaryOpponent(game);
    game.attack('laser'); advance(game, .15);
    game.pause();
    const elapsed = game.laser.elapsed;
    const cooldown = game.cooldowns.laser;
    advance(game, .7);
    assert.equal(game.laser.elapsed, elapsed);
    assert.equal(game.cooldowns.laser, cooldown);
    assert.equal(game.enemy.hp, 100);
    game.resume(); advance(game, .2);
    assert.equal(game.enemy.hp, 71);
    game.restart();
    assert.equal(game.laser, null);
    assert.equal(game.cooldowns.laser, 0);
  });
});

test('X-Man uses changing running poses and distinct rising, falling, and firing poses', () => {
  const base = { action: 'run', grounded: true, vx: 365, vy: 0 };
  const frames = [0, .09, .18, .27].map(poseTime => xManFrame({ ...base, poseTime }));
  assert.equal(new Set(frames).size, 3, 'running must cycle through the three actual stride drawings');
  assert.notEqual(xManFrame({ ...base, grounded: false, vy: -400 }), xManFrame({ ...base, grounded: false, vy: 400 }));
  assert.equal(xManFrame({ ...base, action: 'laser' }), 7);
});

test('rendered jump afterimages preserve the airborne pose after the real player lands', () => {
  const draws = [];
  const context = {
    globalAlpha: 1,
    save() {}, restore() {}, rotate() {}, scale() {},
    drawImage(...args) { draws.push(args); },
  };
  const landedActor = { action: 'idle', grounded: true, vx: 0, vy: 0, dir: 1, poseTime: 2 };
  const snapshot = { action: 'jump', grounded: false, vx: 150, vy: -350, dir: 1, poseTime: 1, life: .2, max: .32 };
  drawXMan(context, {}, landedActor, 4, snapshot);
  const rising = xManAtlasFrames[4];
  assert.deepEqual(draws[0].slice(1, 5), [rising.x, rising.y, rising.w, rising.h]);
  assert.ok(context.globalAlpha > .1 && context.globalAlpha < .44, 'afterimage opacity must fade while remaining visible');
});

test('resizing preserves unchanged canvas pixels and immediately repaints a changed viewport', () => {
  withGame(game => {
    let width = game.canvas.width, height = game.canvas.height;
    let clears = 0, paints = 0;
    Object.defineProperty(game.canvas, 'width', { get: () => width, set: value => { width = value; clears++; } });
    Object.defineProperty(game.canvas, 'height', { get: () => height, set: value => { height = value; clears++; } });
    game.render = () => { paints++; };
    game.resize();
    assert.equal(clears, 0, 'unchanged layout must not clear the visible fight');
    game.canvas.getBoundingClientRect = () => ({ width: 1280, height: 720 });
    game.resize();
    assert.equal(clears, 2);
    assert.equal(paints, 1, 'a resized canvas must redraw before the next animation frame');
  });
});

function noChase(game) {
  game.updateAI = dt => game.physics(game.enemy, dt);
}
function projectile(owner, x, y, vx, strength = 1, damage = owner === 'player' ? 13 : 10, extra = {}) {
  return { owner, x, y, vx, vy: 0, radius: 17, life: 2, max: 2, rotation: 0, strength, damage, projectile: true, ...extra };
}

test('equal opposing projectiles cancel without either fighter taking damage', () => {
  withGame(game => {
    noChase(game);
    game.projectiles.push(projectile('player', 610, 595, 950), projectile('enemy', 680, 595, -450));
    advance(game, .1);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.player.hp, 100);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.lastClash.outcome, 'cancel');
    assert.equal(game.clashCounts.cancel, 1);
  });
});

test('a stronger player attack survives a clash with its original damage and hits the enemy', () => {
  withGame(game => {
    noChase(game);
    const nova = projectile('player', 500, 595, 700, 3, 32, { kind: 'nova', radius: 38 });
    game.projectiles.push(nova, projectile('enemy', 650, 595, -450));
    advance(game, .2);
    assert.equal(game.lastClash.outcome, 'breakthrough');
    assert.equal(game.lastClash.winner, 'player');
    assert.equal(nova.damage, 32);
    assert.equal(nova.strength, 3);
    assert.ok(game.projectiles.includes(nova));
    advance(game, .7);
    assert.equal(game.enemy.hp, 68);
    assert.equal(game.player.hp, 100);
  });
});

test('a stronger enemy attack breaks through the player attack and damages the player', () => {
  withGame(game => {
    noChase(game);
    const heavy = projectile('enemy', 800, 595, -500, 2, 18, { kind: 'heavy', radius: 25 });
    game.projectiles.push(projectile('player', 650, 595, 950), heavy);
    advance(game, .2);
    assert.equal(game.lastClash.winner, 'enemy');
    assert.ok(game.projectiles.includes(heavy));
    advance(game, .7);
    assert.equal(game.player.hp, 82);
    assert.equal(game.enemy.hp, 100);
    assert.equal(heavy.damage, 18);
  });
});

test('swept attack collisions catch opposing fast shots that exchange positions in one frame', () => {
  withGame(game => {
    noChase(game);
    game.projectiles.push(projectile('player', 500, 595, 4000), projectile('enemy', 900, 595, -4000));
    game.update(.1);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.clashCounts.cancel, 1);
    assert.equal(game.player.hp, 100);
    assert.equal(game.enemy.hp, 100);
  });
});

test('friendly attacks and opposing attacks at different heights do not clash', () => {
  withGame(game => {
    noChase(game);
    game.projectiles.push(projectile('player', 500, 300, 4000), projectile('player', 900, 300, -4000), projectile('enemy', 900, 420, -4000));
    game.update(.1);
    assert.equal(game.projectiles.length, 3);
    assert.equal(game.clashCounts.cancel, 0);
  });
});

test('an earlier fighter hit is resolved before a later projectile clash farther down the path', () => {
  withGame(game => {
    noChase(game);
    game.enemy.x = 900;
    const laterEnemy = projectile('enemy', 1100, 595, -400);
    game.projectiles.push(projectile('player', 500, 595, 3000), laterEnemy);
    game.update(.2);
    assert.equal(game.enemy.hp, 87, 'a future clash cannot retroactively protect an already-hit fighter');
    assert.equal(game.projectiles.length, 1);
    assert.equal(game.projectiles[0], laterEnemy);
    assert.equal(game.clashCounts.cancel, 0);
  });
});

test('equal beam and projectile strength cancels the entire persistent beam before damage', () => {
  withGame(game => {
    noChase(game);
    game.attack('laser');
    advance(game, .3);
    game.projectiles.push(projectile('enemy', 650, 588, -450, 3, 29));
    advance(game, .05);
    assert.equal(game.laser, null);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.player.hp, 100);
    assert.equal(game.lastClash.outcome, 'cancel');
    advance(game, .6);
    assert.equal(game.enemy.hp, 100, 'a cancelled beam must never return on a later active frame');
  });
});

test('a stronger beam destroys a heavy shot before applying its own damage', () => {
  withGame(game => {
    noChase(game);
    game.attack('laser'); advance(game, .3);
    game.projectiles.push(projectile('enemy', 650, 588, -400, 2, 18));
    advance(game, .05);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.laser.phase, 'firing');
    assert.equal(game.enemy.hp, 71);
    assert.equal(game.lastClash.winner, 'player');
  });
});

test('beam collisions beyond the opponent do not undo damage to a body in front', () => {
  withGame(game => {
    noChase(game);
    game.attack('laser'); advance(game, .3);
    game.projectiles.push(projectile('enemy', 1250, 588, -100, 3, 29));
    advance(game, .05);
    assert.equal(game.enemy.hp, 71, 'the beam reaches the opponent before a farther attack');
  });
});

test('opposing equal melee attacks cancel before either deferred hit can deal damage', () => {
  withGame(game => {
    noChase(game);
    game.enemy.x = game.player.x + 90;
    game.attack('slash');
    const visual = { type: 'slash', x: game.enemy.x - 35, y: 595, life: .2, max: .2 };
    game.effects.push(visual);
    game.attackVolumes.push({ type: 'melee', owner: 'enemy', x: game.enemy.x - 35, y: 595, radius: 52, life: .2, strength: 1, damage: 7, dir: -1, visual });
    game.update(1 / 120);
    assert.equal(game.player.hp, 100);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.attackVolumes.length, 0);
    assert.equal(visual.life, 0);
    assert.equal(game.effects.filter(effect => effect.type === 'slash').length, 0, 'cancelled attacks must stop drawing');
  });
});

test('Inferno Orbit has a windup, hits once, and equal heavy attacks cancel the active orbit', () => {
  withGame(game => {
    noChase(game);
    game.enemy.x = game.player.x + 150;
    assert.equal(game.attack('orbit'), true);
    advance(game, .1);
    assert.equal(game.enemy.hp, 100);
    advance(game, .05);
    assert.equal(game.enemy.hp, 74);
    advance(game, .4);
    assert.equal(game.enemy.hp, 74, 'the continuous orbit can only hit this enemy once');
    game.restart(); noChase(game);
    game.attack('orbit'); advance(game, .1);
    game.projectiles.push(projectile('enemy', game.player.x + 120, 590, -100, 2, 18));
    advance(game, .05);
    assert.equal(game.specials.length, 0);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.player.hp, 100);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.lastClash.outcome, 'cancel');
  });
});

test('Nova Breaker charges before launch, pierces weaker attacks, and explodes on contact', () => {
  withGame(game => {
    noChase(game);
    assert.equal(game.attack('nova'), true);
    advance(game, .2);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.enemy.hp, 100);
    assert.equal(game.specials[0].type, 'nova-charge');
    advance(game, .1);
    assert.equal(game.specials.length, 0);
    assert.equal(game.projectiles[0].kind, 'nova');
    game.projectiles.push(projectile('enemy', 700, 590, -200));
    advance(game, .8);
    assert.equal(game.enemy.hp, 68);
    assert.equal(game.lastClash.outcome, 'breakthrough');
    assert.ok(game.effects.some(effect => effect.type === 'nova-impact'));
    assert.equal(game.attack('nova'), false);
  });
});

test('AI telegraphs and fires tier-two heavy attacks after the opening volleys', () => {
  withGame(game => {
    game.player.invincible = 100;
    let sawHeavy = false, sawHeavyTelegraph = false;
    for (let i = 0; i < 16 * 60; i++) {
      game.update(1 / 60);
      sawHeavyTelegraph ||= game.enemy.heavy && game.enemy.charge > 0;
      for (const shot of game.projectiles) if (shot.owner === 'enemy' && shot.kind === 'heavy') {
        assert.equal(shot.strength, 2);
        assert.ok(game.time >= 6);
        sawHeavy = true;
      }
    }
    assert.equal(sawHeavyTelegraph, true);
    assert.equal(sawHeavy, true);
  });
});

test('pausing freezes special windups and restart clears attacks and clash counters', () => {
  withGame(game => {
    noChase(game);
    game.attack('orbit');
    advance(game, .05);
    game.pause();
    const elapsed = game.specials[0].elapsed;
    advance(game, .5);
    assert.equal(game.specials[0].elapsed, elapsed);
    game.resume(); advance(game, .1);
    assert.equal(game.specials[0].phase, 'active');
    game.clashCounts.cancel = 3;
    game.restart();
    assert.equal(game.specials.length, 0);
    assert.equal(game.attackVolumes.length, 0);
    assert.equal(game.projectiles.length, 0);
    assert.deepEqual(game.clashCounts, { cancel: 0, breakthrough: 0 });
    assert.equal(game.lastClash, null);
    assert.equal(game.cooldowns.nova, 0);
    assert.equal(game.cooldowns.orbit, 0);
  });
});
