// Combat is resolved on a shared timeline: opposing attacks collide before a
// fighter at the same contact time, while earlier body hits cannot be undone
// by a collision farther down a projectile's path.
const EPSILON = 1e-8;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const start = attack => ({ x: attack.previousX ?? attack.x, y: attack.previousY ?? attack.y });
const end = attack => ({ x: attack.x, y: attack.y });
const pointAt = (attack, time) => {
  const p = start(attack);
  return { x: p.x + (attack.x - p.x) * time, y: p.y + (attack.y - p.y) * time };
};

export const ATTACK_STRENGTH = Object.freeze({ slash: 1, cross: 1, blast: 1, melee: 1, orbit: 2, heavy: 2, laser: 3, nova: 3, burst: 4, crescent: 2, flame: 2, thorn: 1 });

export function sweptCircles(a, b) {
  const ap = start(a), bp = start(b);
  const x = ap.x - bp.x, y = ap.y - bp.y;
  const vx = (a.x - ap.x) - (b.x - bp.x), vy = (a.y - ap.y) - (b.y - bp.y);
  const radius = (a.radius || 0) + (b.radius || 0);
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const aa = vx * vx + vy * vy;
  if (aa < EPSILON) return null;
  const bb = 2 * (x * vx + y * vy);
  const discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const time = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return time >= -EPSILON && time <= 1 + EPSILON ? clamp(time, 0, 1) : null;
}

function rayBox(a, box, expansion = 0) {
  const p = start(a), q = end(a);
  const delta = { x: q.x - p.x, y: q.y - p.y };
  let enter = 0, exit = 1;
  for (const axis of ['x', 'y']) {
    const min = box[axis + '1'] - expansion, max = box[axis + '2'] + expansion;
    if (Math.abs(delta[axis]) < EPSILON) {
      if (p[axis] < min || p[axis] > max) return null;
      continue;
    }
    let first = (min - p[axis]) / delta[axis], last = (max - p[axis]) / delta[axis];
    if (first > last) [first, last] = [last, first];
    enter = Math.max(enter, first); exit = Math.min(exit, last);
    if (enter > exit) return null;
  }
  return enter >= -EPSILON && enter <= 1 + EPSILON ? clamp(enter, 0, 1) : null;
}

function beamBox(beam) {
  const extent = beam.length ?? 1500;
  return { x1: Math.min(beam.x, beam.x + beam.dir * extent), x2: Math.max(beam.x, beam.x + beam.dir * extent), y1: beam.y - 27, y2: beam.y + 27 };
}
function boxesOverlap(a, b) { return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1; }
function targetBox(target) { return { x1: target.x - 23, x2: target.x + 23, y1: target.y - 110, y2: target.y - 20 }; }
function alive(attack) { return !attack.cancelled && attack.life > 0; }
function ready(attack) { return alive(attack) && attack.phase !== 'charging'; }

export function attackContact(a, b) {
  if (a.shape === 'beam' && b.shape === 'beam') return boxesOverlap(beamBox(a), beamBox(b)) ? 0 : null;
  if (a.shape === 'beam') return rayBox(b, beamBox(a), b.radius || 0);
  if (b.shape === 'beam') return rayBox(a, beamBox(b), a.radius || 0);
  return sweptCircles(a, b);
}

export function bodyContact(attack, target) {
  if (attack.shape === 'beam') return boxesOverlap(beamBox(attack), targetBox(target)) ? 0 : null;
  const previous = start(attack);
  // Account for the fighter moving during this simulation step as well.
  const relative = { ...attack, previousX: previous.x + target.x - (target.previousX ?? target.x), previousY: previous.y + target.y - (target.previousY ?? target.y) };
  return rayBox(relative, targetBox(target), attack.radius || 0);
}

export function combatAttacks(game, includeCharging = false) {
  const list = [...game.projectiles, ...game.attackVolumes, ...game.specials.filter(attack => attack.type === 'orbit' || attack.type === 'flame')];
  if (game.laser) list.push(game.laser);
  return list.filter(attack => includeCharging ? alive(attack) : ready(attack));
}

function kill(game, attack) {
  attack.cancelled = true;
  attack.life = 0;
  if (attack.visual) attack.visual.life = 0;
  if (game.laser === attack) game.laser = null;
}

function collisionPoint(a, b, time) {
  const ap = pointAt(a, time), bp = pointAt(b, time);
  if (a.shape === 'beam') return { x: bp.x, y: clamp(bp.y, a.y - 27, a.y + 27) };
  if (b.shape === 'beam') return { x: ap.x, y: clamp(ap.y, b.y - 27, b.y + 27) };
  const sum = (a.radius || 0) + (b.radius || 0) || 1;
  const weight = (a.radius || 0) / sum;
  return { x: ap.x + (bp.x - ap.x) * weight, y: ap.y + (bp.y - ap.y) * weight };
}

function beamOccludedByBody(beam, other, time, game) {
  if (beam.shape !== 'beam' || beam.hit) return false;
  const target = beam.owner === 'player' ? game.enemy : game.player;
  const targetTime = bodyContact(beam, target);
  if (targetTime === null) return false;
  const point = pointAt(other, time);
  return (point.x - beam.x) * beam.dir > (target.x - beam.x) * beam.dir + 23;
}

function clash(game, a, b, time) {
  const point = collisionPoint(a, b, time);
  const equal = a.strength === b.strength;
  const winner = equal ? null : a.strength > b.strength ? a : b;
  const loser = equal ? null : winner === a ? b : a;
  if (equal) { kill(game, a); kill(game, b); }
  else kill(game, loser);
  const outcome = equal ? 'cancel' : 'breakthrough';
  game.lastClash = { outcome, winner: winner?.owner ?? null, strengths: [a.strength, b.strength], time: game.time };
  game.clashCounts[outcome]++;
  const color = equal ? '#ffe8c1' : winner.owner === 'player' ? '#ffb56c' : '#b2ff6a';
  game.effects.push({ type: equal ? 'clash' : 'breakthrough', ...point, life: .5, max: .5, winner: winner?.owner ?? null, color, strength: Math.max(a.strength, b.strength) });
  game.sparks(point.x, point.y, color, equal ? 22 : 32, equal ? 240 : 340);
  game.shake = Math.max(game.shake, equal ? 3 : 5);
  game.tone(equal ? 720 : 165, equal ? 240 : 60, .15, equal ? 'triangle' : 'sawtooth', .035);
}

export function resolveCombat(game) {
  const attacks = combatAttacks(game);
  const events = [];
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i];
    // Old local helpers and third-party smoke tests can still emit the original
    // projectile format. Its explicit damage does not determine clash strength.
    a.strength ??= ATTACK_STRENGTH[a.kind || a.type] || 1;
    for (let j = i + 1; j < attacks.length; j++) {
      const b = attacks[j];
      b.strength ??= ATTACK_STRENGTH[b.kind || b.type] || 1;
      if (a.owner === b.owner) continue;
      const time = attackContact(a, b);
      if (time === null || beamOccludedByBody(a, b, time, game) || beamOccludedByBody(b, a, time, game)) continue;
      events.push({ type: 'clash', time, a, b });
    }
    if (!a.hit) {
      const target = a.owner === 'player' ? game.enemy : game.player;
      const time = bodyContact(a, target);
      if (time !== null) events.push({ type: 'body', time, a, target });
    }
  }
  events.sort((a, b) => Math.abs(a.time - b.time) > EPSILON ? a.time - b.time : a.type === b.type ? 0 : a.type === 'clash' ? -1 : 1);
  for (const event of events) {
    if (game.mode !== 'playing') break;
    if (!ready(event.a)) continue;
    if (event.type === 'clash') {
      if (ready(event.b)) clash(game, event.a, event.b, event.time);
      continue;
    }
    const attack = event.a;
    if (attack.hit) continue;
    const hp = event.target.hp;
    const point = pointAt(attack, event.time);
    const result = game.hit(event.target, attack.damage, attack.dir || Math.sign(attack.vx) || Math.sign(event.target.x - point.x), attack.kind || attack.type || 'projectile', attack);
    attack.hit = !!result?.consumed || event.target.hp < hp;
    if (result?.outcome === 'parried') kill(game, attack);
    if (attack.kind === 'nova') {
      game.effects.push({ type: 'nova-impact', x: point.x, y: point.y, life: .6, max: .6, dir: attack.dir || Math.sign(attack.vx), color: '#ffb34b' });
      game.sparks(point.x, point.y, '#ffcf78', 45, 380);
      game.shake = Math.max(game.shake, 8);
    } else if (attack.projectile) game.sparks(point.x, point.y, attack.owner === 'player' ? '#ff5369' : '#95ff54', 12, 170);
    if (attack.projectile) kill(game, attack);
  }
  game.projectiles = game.projectiles.filter(alive);
  game.attackVolumes = game.attackVolumes.filter(alive);
  game.specials = game.specials.filter(alive);
  game.effects = game.effects.filter(effect => effect.life > 0);
}
