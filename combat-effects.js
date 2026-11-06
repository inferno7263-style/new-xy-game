// Reference-inspired procedural combat artwork. Geometry is deterministic so
// embers and slash ribbons move with the animation instead of flickering.
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const easeOut = t => 1 - (1 - t) ** 3;
const fraction = seed => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const gold = { edge: '#fff6cc', light: '#ffdc72', mid: '#ff8b24', hot: '#ff4c20', dark: '#6a1015', transparent: '#ff481000' };
const green = { edge: '#f2ffcf', light: '#d9ff74', mid: '#94f745', hot: '#35ba45', dark: '#123c25', transparent: '#48d52900' };

function halo(c, x, y, radius, palette, alpha = 1) {
  if (radius <= 0 || alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  const fill = c.createRadialGradient(x, y, 0, x, y, radius);
  fill.addColorStop(0, `${palette.light}70`);
  fill.addColorStop(.25, `${palette.hot}36`);
  fill.addColorStop(1, palette.transparent);
  c.fillStyle = fill;
  c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  c.restore();
}

function lensStar(c, x, y, size, color, angle = 0, opacity = 1) {
  c.save();
  c.translate(x, y); c.rotate(angle); c.globalAlpha *= opacity;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-size, 0); c.quadraticCurveTo(-size * .08, -size * .07, 0, -size * .65);
  c.quadraticCurveTo(size * .08, -size * .07, size, 0);
  c.quadraticCurveTo(size * .08, size * .07, 0, size * .65);
  c.quadraticCurveTo(-size * .08, size * .07, -size, 0);
  c.fill(); c.restore();
}

function ellipsePoint(rx, ry, angle) { return [Math.cos(angle) * rx, Math.sin(angle) * ry]; }

// A tapered band, rather than a uniform stroked circle, reads as a blade sweep.
function ribbon(c, rx, ry, start, sweep, thickness, fill) {
  const steps = 24;
  c.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = start + sweep * t;
    const flare = Math.sin(Math.PI * t) ** .65;
    const [x, y] = ellipsePoint(rx + thickness * .23 * flare, ry + thickness * .23 * flare, angle);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps, angle = start + sweep * t;
    const flare = Math.sin(Math.PI * t) ** .65;
    const [x, y] = ellipsePoint(rx - thickness * flare, ry - thickness * .7 * flare, angle);
    c.lineTo(x, y);
  }
  c.closePath(); c.fillStyle = fill; c.fill();
}

function arc(c, rx, ry, start, sweep, color, width) {
  c.beginPath(); c.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, start, start + sweep);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function orbit(c, special, clock) {
  const p = special.owner === 'enemy' ? green : gold;
  const elapsed = Math.max(0, special.elapsed || 0);
  const charging = special.phase === 'charging';
  const age = clamp((elapsed - .12) / .65);
  const direction = special.dir || 1;
  c.save(); c.translate(special.x, special.y); c.scale(direction, 1);
  if (charging) {
    const charge = clamp(elapsed / .12);
    halo(c, 0, 0, 60 + charge * 55, p, .5);
    c.save(); c.rotate(-.3);
    c.shadowColor = p.hot; c.shadowBlur = 12;
    arc(c, 28 + charge * 42, 20 + charge * 17, clock * 12, Math.PI * 1.2, p.light, 2);
    arc(c, 42 + charge * 45, 29 + charge * 16, -clock * 16 + 1.5, Math.PI * .7, p.edge, 1);
    c.restore();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + clock * 3, r = 18 + (1 - charge) * 65;
      lensStar(c, Math.cos(a) * r, Math.sin(a) * r * .7, 3 + charge * 4, p.light, a);
    }
    c.restore(); return;
  }
  const envelope = clamp((elapsed - .12) / .035) * clamp((.77 - elapsed) / .14);
  c.globalAlpha *= envelope;
  const expansion = .72 + easeOut(Math.min(1, age * 5)) * .28;
  c.scale(expansion, expansion);
  const angle = -1.4 + age * 8.5;
  halo(c, 0, 2, 225, p, .28);
  c.save(); c.rotate(-.24);
  // Dark wine-colored underside and burnt edge preserve the reference's depth.
  ribbon(c, 185, 104, angle - .08, Math.PI * 1.78, 29, p.dark);
  ribbon(c, 181, 100, angle + .03, Math.PI * 1.67, 19, p.hot);
  const heat = c.createLinearGradient(-175, -80, 170, 90);
  heat.addColorStop(0, '#ff4c16'); heat.addColorStop(.25, p.mid);
  heat.addColorStop(.56, p.edge); heat.addColorStop(.75, p.light); heat.addColorStop(1, p.hot);
  c.shadowColor = p.hot; c.shadowBlur = 17;
  ribbon(c, 185, 104, angle + .12, Math.PI * 1.58, 10, heat);
  c.shadowColor = p.light; c.shadowBlur = 7;
  arc(c, 186, 105, angle + .18, Math.PI * 1.5, p.edge, 2.7);
  c.shadowBlur = 0;
  // A second displaced stroke gives the slash a fully circular, spinning read.
  ribbon(c, 205, 120, angle + Math.PI * .9, Math.PI * .69, 12, p.dark);
  ribbon(c, 204, 119, angle + Math.PI * .94, Math.PI * .64, 5, p.mid);
  arc(c, 207, 122, angle + Math.PI, Math.PI * .51, p.light, 1);
  arc(c, 170, 89, angle - .5, Math.PI * .74, `${p.mid}8c`, 1);
  for (let i = 0; i < 3; i++) {
    const a = angle + .7 + i * 1.75;
    const [x, y] = ellipsePoint(185, 105, a);
    lensStar(c, x, y, 13 + Math.sin(age * 12 + i) * 4, p.edge, -.1 - a * .15, .9);
  }
  c.restore();
  for (let i = 0; i < 19; i++) {
    const seed = fraction(i + 21), a = angle + i * 2.39996;
    const r = 115 + seed * 105;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * .66 - (age * 16 * seed);
    c.globalAlpha = envelope * (.25 + fraction(i + 91) * .55);
    c.strokeStyle = i % 3 === 0 ? p.edge : p.mid;
    c.lineWidth = i % 4 === 0 ? 2 : 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.sin(a) * (4 + seed * 13), y + Math.cos(a) * (3 + seed * 9)); c.stroke();
  }
  c.restore();
}

export function drawCombatSpecials(c, game) {
  for (const special of game.specials || []) {
    if (special.cancelled || special.life <= 0) continue;
    if (special.type === 'orbit' || special.kind === 'orbit') orbit(c, special, game.clock || 0);
    else if (special.type === 'nova-charge') novaCharge(c, special, game.clock || 0);
  }
}

function novaCharge(c, special, clock) {
  const p = special.owner === 'enemy' ? green : gold;
  const charge = clamp((special.elapsed || 0) / .25);
  c.save(); c.translate(special.x, special.y); c.scale(special.dir || 1, 1);
  halo(c, 0, 0, 48 + charge * 45, p, .4 + charge * .25);
  c.save(); c.rotate(-.6 + charge * .35);
  const r = 31 + charge * 24;
  ribbon(c, r, r * .59, clock * 6, Math.PI * 1.7, 10 + charge * 7, p.dark);
  ribbon(c, r + 1, r * .6 + 1, clock * 6 + .15, Math.PI * 1.5, 4 + charge * 3, p.hot);
  c.shadowColor = p.hot; c.shadowBlur = 10;
  arc(c, r + 2, r * .6 + 2, clock * 6 + .25, Math.PI * 1.3, p.light, 1.6);
  c.shadowBlur = 0; c.restore();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996 + clock * 2;
    const r = 9 + (1 - charge) * (25 + fraction(i + 20) * 43);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    c.strokeStyle = i % 3 === 0 ? p.edge : p.mid; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); c.stroke();
  }
  lensStar(c, 0, 0, 4 + charge * 22, p.edge, -.15, .5 + charge * .5);
  c.restore();
}

function novaProjectile(c, shot, clock) {
  const p = shot.owner === 'enemy' ? green : gold;
  const dir = shot.vx < 0 ? -1 : 1;
  const size = (shot.radius || 38) / 38;
  c.save(); c.translate(shot.x, shot.y); c.scale(dir * size, size);
  halo(c, -5, 0, 105, p, .55);
  const tail = c.createLinearGradient(-132, 0, 34, 0);
  tail.addColorStop(0, p.transparent); tail.addColorStop(.65, `${p.hot}90`); tail.addColorStop(1, p.light);
  c.fillStyle = tail;
  c.beginPath(); c.moveTo(40, 0); c.lineTo(-5, -30); c.lineTo(-116, -16); c.lineTo(-56, -7);
  c.lineTo(-135, 1); c.lineTo(-62, 10); c.lineTo(-112, 23); c.lineTo(-2, 30); c.closePath(); c.fill();
  c.save(); c.rotate(-.48);
  // The moving breaker retains a red-black elliptical blade around its core.
  ribbon(c, 51, 29, -1.3, Math.PI * 1.78, 18, p.dark);
  ribbon(c, 52, 30, -1.15, Math.PI * 1.62, 10, p.hot);
  c.shadowColor = p.hot; c.shadowBlur = 16;
  arc(c, 53, 31, -.9, Math.PI * 1.4, p.light, 3);
  c.shadowBlur = 0;
  c.restore();
  c.save(); c.rotate(Math.sin(clock * 17) * .08);
  c.shadowColor = p.light; c.shadowBlur = 12;
  c.fillStyle = p.mid;
  c.beginPath(); c.moveTo(47, 0); c.lineTo(5, -23); c.lineTo(17, -9); c.lineTo(-24, -15); c.lineTo(-10, 0); c.lineTo(-30, 14); c.lineTo(15, 8); c.lineTo(5, 25); c.closePath(); c.fill();
  c.fillStyle = p.edge;
  c.beginPath(); c.moveTo(47, 0); c.lineTo(1, -8); c.lineTo(16, 0); c.lineTo(-14, 8); c.lineTo(20, 6); c.closePath(); c.fill();
  c.shadowBlur = 0; lensStar(c, 23, 0, 18, '#fffdf0', .08, .9);
  c.restore();
  c.strokeStyle = p.light; c.lineWidth = 1.1;
  for (let i = 0; i < 6; i++) {
    const t = ((clock * 2.2 + i / 6) % 1), x = -18 - t * 126;
    const y = (fraction(i + 70) - .5) * 68;
    c.globalAlpha = (1 - t) * .8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - 10 - t * 10, y * 1.05); c.stroke();
  }
  c.restore();
}

function heavyProjectile(c, shot, clock) {
  const p = shot.owner === 'player' ? gold : green;
  c.save(); c.translate(shot.x, shot.y);
  c.rotate(Math.atan2(shot.vy || 0, shot.vx || 1));
  const radius = shot.radius || 25;
  const r = radius * (.98 + Math.sin(clock * 22) * .025);
  halo(c, 0, 0, r * 3.1, p, .5);
  c.fillStyle = `${p.hot}80`; c.beginPath(); c.moveTo(r * 1.3, 0); c.lineTo(-r * 2.9, -r * .75); c.lineTo(-r * 1.4, 0); c.lineTo(-r * 3.2, r * .7); c.closePath(); c.fill();
  c.shadowColor = p.mid; c.shadowBlur = 12;
  c.fillStyle = p.dark; c.strokeStyle = p.mid; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(r * 1.5, 0); c.lineTo(0, -r); c.lineTo(-r * 1.2, -r * .38); c.lineTo(-r * .7, 0); c.lineTo(-r * 1.2, r * .38); c.lineTo(0, r); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = p.light; c.beginPath(); c.moveTo(r * 1.4, 0); c.lineTo(-r * .4, -r * .4); c.lineTo(-r * .05, 0); c.lineTo(-r * .4, r * .4); c.closePath(); c.fill();
  c.shadowBlur = 0; c.strokeStyle = p.edge; c.lineWidth = 1;
  c.beginPath(); c.ellipse(0, 0, r * .42, r * 1.3, 0, -1.2, 1.2); c.stroke();
  c.restore();
}

export function drawAttackProjectile(c, shot, clock = 0) {
  const custom = shot.kind === 'nova' || shot.kind === 'heavy' || shot.strength === 2;
  if (!custom) return false;
  // Handled-but-invisible prevents a cancelled special falling back to the
  // ordinary projectile renderer during a collision/removal boundary.
  if (shot.cancelled || shot.life <= 0) return true;
  if (shot.kind === 'nova') { novaProjectile(c, shot, clock); return true; }
  if (shot.kind === 'heavy' || shot.strength === 2) { heavyProjectile(c, shot, clock); return true; }
  return false;
}

function impact(c, fx, progress) {
  const p = fx.winner === 'enemy' || fx.owner === 'enemy' ? green : gold;
  const grow = easeOut(clamp(progress * 3.2));
  const fade = (1 - progress) ** 1.25;
  c.save(); c.scale(fx.dir || 1, 1); c.rotate(-.48);
  c.globalAlpha *= fade;
  halo(c, 0, 0, 165 * grow + 15, p, .7);
  // Curving black/red ribbon and the bright impact at its crossing reflect the
  // second reference while keeping the center transparent enough to see hits.
  c.save(); c.rotate(.14 + progress * .4); c.scale(1, .9);
  ribbon(c, 110 * grow + 8, 61 * grow + 5, -1.6, Math.PI * 1.82, 27, p.dark);
  ribbon(c, 111 * grow + 8, 62 * grow + 5, -1.5, Math.PI * 1.74, 10, p.hot);
  arc(c, 114 * grow + 8, 64 * grow + 5, -1.2, Math.PI * 1.45, p.light, 1.5);
  c.restore();
  const spread = 36 + grow * 105;
  c.shadowColor = p.hot; c.shadowBlur = 13;
  for (let i = 0; i < 15; i++) {
    const a = i * TAU / 15 + .15;
    const length = spread * (.48 + fraction(i + 14) * .68);
    const width = 5 + fraction(i + 55) * 8;
    c.save(); c.rotate(a);
    c.fillStyle = i % 3 === 0 ? p.hot : p.mid;
    c.beginPath(); c.moveTo(2, -width); c.lineTo(length, (fraction(i + 27) - .5) * 8);
    c.lineTo(length * .36, width * .25); c.lineTo(length * .48, width); c.lineTo(0, width * .65); c.closePath(); c.fill();
    c.fillStyle = p.light; c.beginPath(); c.moveTo(0, -width * .28); c.lineTo(length * .77, 0); c.lineTo(length * .25, width * .18); c.closePath(); c.fill();
    c.restore();
  }
  c.shadowBlur = 0;
  const core = c.createRadialGradient(0, 0, 1, 0, 0, 38 + grow * 9);
  core.addColorStop(0, '#ffffff'); core.addColorStop(.32, p.edge); core.addColorStop(.63, p.light); core.addColorStop(1, p.transparent);
  c.fillStyle = core; c.beginPath(); c.ellipse(0, 0, 45 + grow * 10, 31 + grow * 5, 0, 0, TAU); c.fill();
  lensStar(c, 0, 0, 74 * (1 - progress) + 12, '#fffdf1', .35, .8);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996;
    const r = (42 + fraction(i + 50) * 105) * grow;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * .8;
    c.fillStyle = i % 3 === 0 ? p.dark : p.light;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 5, y - 8); c.lineTo(x + 13, y - 3); c.lineTo(x + 6, y + 4); c.closePath(); c.fill();
  }
  c.restore();
}

function collision(c, fx, progress) {
  const equal = fx.type === 'clash';
  const p = fx.winner === 'enemy' ? green : gold;
  const expansion = easeOut(progress);
  const fade = (1 - progress) ** 1.5;
  c.save(); c.globalAlpha *= fade;
  if (!equal) {
    c.scale(fx.dir || 1, 1);
    c.rotate(-.15);
  }
  halo(c, 0, 0, 110 * expansion + 22, equal ? { ...gold, light: '#edfaff', hot: '#a9d3f7', transparent: '#8fb7dc00' } : p, .75);
  c.strokeStyle = equal ? '#d6f4ff' : p.edge; c.lineWidth = 3 * (1 - progress) + .5;
  c.beginPath(); c.ellipse(0, 0, 10 + expansion * 80, 8 + expansion * 65, equal ? 0 : -.4, 0, TAU); c.stroke();
  c.lineWidth = 1; c.strokeStyle = equal ? '#9ecad59a' : p.mid;
  c.beginPath(); c.ellipse(0, 0, 20 + expansion * 97, 11 + expansion * 74, equal ? 0 : -.4, .1, TAU * .85); c.stroke();
  const shards = equal ? 16 : 19;
  for (let i = 0; i < shards; i++) {
    const a = i * 2.39996 + .1;
    const r = (17 + fraction(i + 24) * 83) * expansion;
    const len = (5 + fraction(i + 33) * 20) * (1 - progress * .6);
    c.save(); c.translate(Math.cos(a) * r, Math.sin(a) * r); c.rotate(a);
    c.fillStyle = equal ? i % 2 ? '#ff657a' : '#bfff83' : i % 3 ? p.light : p.hot;
    c.beginPath(); c.moveTo(-len * .3, -2); c.lineTo(len, 0); c.lineTo(-len * .3, 2); c.closePath(); c.fill();
    c.restore();
  }
  if (!equal) {
    // One dominant slash tears through the loser's fragments.
    c.shadowColor = p.hot; c.shadowBlur = 13;
    ribbon(c, 70 * expansion + 12, 48 * expansion + 8, -1.6, Math.PI * 1.13, 15 * (1 - progress) + 2, p.hot);
    arc(c, 72 * expansion + 12, 49 * expansion + 8, -1.55, Math.PI, p.edge, 2.5);
    c.shadowBlur = 0;
  }
  lensStar(c, 0, 0, (equal ? 48 : 65) * (1 - progress) + 4, equal ? '#f4fcff' : p.edge, equal ? -.45 : -.7);
  c.restore();
}

export function drawClashEffect(c, fx, clock = 0) {
  if (!['clash', 'breakthrough', 'nova-impact', 'orbit-charge', 'nova-charge'].includes(fx.type)) return false;
  const progress = clamp(1 - (fx.life || 0) / (fx.max || .5));
  c.save(); c.translate(fx.x, fx.y);
  if (fx.type === 'nova-impact') impact(c, fx, progress);
  else if (fx.type === 'orbit-charge' || fx.type === 'nova-charge') {
    const p = fx.owner === 'enemy' ? green : gold;
    halo(c, 0, 0, 80 * (1 - progress) + 8, p, .55);
    c.save(); c.rotate(clock * 4);
    arc(c, 14 + (1 - progress) * 50, 10 + (1 - progress) * 35, 0, Math.PI * 1.6, p.light, 2);
    c.restore(); lensStar(c, 0, 0, 8 + progress * 13, p.edge, -.2, 1 - progress * .5);
  } else collision(c, fx, progress);
  c.restore();
  return true;
}
