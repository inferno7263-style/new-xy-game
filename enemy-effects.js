// Jade fire, crescent blades, and defensive energy. Stable geometry bends with
// time; effects never randomize their shape from one rendered frame to the next.
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seed = n => { const v = Math.sin(n * 127.1 + 76.31) * 43758.5453; return v - Math.floor(v); };
const emerald = { core: '#fbffe4', light: '#dfff71', edge: '#a5ff34', mid: '#41dc45', dark: '#073d2a', shade: '#031b1c', glow: '#60ff32' };
const crimson = { core: '#fff6ed', light: '#ffd5d0', edge: '#ff6b7c', mid: '#f22f53', dark: '#471522', shade: '#1d111e', glow: '#ff385d' };
const palette = owner => owner === 'player' ? crimson : emerald;
function halo(c, x, y, radius, color, opacity = 1) {
  if (radius <= 0 || opacity <= 0) return;
  c.save(); c.globalAlpha *= opacity;
  const g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `${color}88`); g.addColorStop(.35, `${color}35`); g.addColorStop(1, `${color}00`);
  c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); c.restore();
}
function star(c, x, y, size, color, rotation = 0) {
  c.save(); c.translate(x, y); c.rotate(rotation); c.fillStyle = color;
  c.beginPath(); c.moveTo(-size, 0); c.quadraticCurveTo(-2, -2, 0, -size * .7);
  c.quadraticCurveTo(2, -2, size, 0); c.quadraticCurveTo(2, 2, 0, size * .7);
  c.quadraticCurveTo(-2, 2, -size, 0); c.fill(); c.restore();
}
function ellipseArc(c, rx, ry, start, sweep, color, width) {
  c.beginPath(); c.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, start, start + sweep);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function tongue(c, x, base, height, width, phase, fill) {
  const sway = Math.sin(phase) * width * .65;
  c.beginPath(); c.moveTo(x - width, base);
  c.bezierCurveTo(x - width * 1.5, base - height * .28, x + width * .7 + sway, base - height * .39, x - width * .25 + sway, base - height * .69);
  c.bezierCurveTo(x - width * .7 + sway, base - height * .9, x + width * .8 + sway, base - height * 1.05, x + width * .55 + sway, base - height);
  c.bezierCurveTo(x + width * .1 + sway, base - height * .76, x + width * 1.5, base - height * .58, x + width, base - height * .39);
  c.bezierCurveTo(x + width * 1.9, base - height * .18, x + width * 1.2, base - height * .05, x + width * .4, base);
  c.closePath(); c.fillStyle = fill; c.fill();
}
function drawFlame(c, fx, clock) {
  const ground = (fx.groundY ?? fx.y + 55) - fx.y;
  const elapsed = fx.elapsed || 0, active = fx.phase === 'active';
  const charge = clamp(elapsed / .65), progress = clamp((elapsed - .65) / .65);
  const fade = active ? clamp((1.3 - elapsed) / .15) : 1, r = fx.radius || 100;
  c.save(); c.translate(fx.x, fx.y);
  halo(c, 0, ground - 22, r * (active ? 1.85 : 1.2), emerald.glow, active ? .24 * fade : .14 + charge * .1);
  c.save(); c.translate(0, ground); c.rotate(-.06);
  c.fillStyle = active ? '#03170ec7' : '#062e1c5c'; c.beginPath(); c.ellipse(0, 0, r * 1.12, 24, 0, 0, TAU); c.fill();
  c.shadowColor = emerald.edge; c.shadowBlur = active ? 15 : 8;
  ellipseArc(c, r * (active ? 1.03 : .78 + charge * .25), 22, clock * 2, TAU * .82, active ? '#b9ff75' : '#8cdf6280', active ? 2.2 : 1.2);
  ellipseArc(c, r * .84, 17, -clock * 2.8, TAU * .58, emerald.mid, 1); c.shadowBlur = 0;
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6, x = Math.cos(a) * r * .97, y = Math.sin(a) * 22;
    c.strokeStyle = active ? '#cfff73' : '#68b959bb'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x * .81, y * .81); c.lineTo(x * 1.13, y * 1.13);
    c.moveTo(x * .98, y * .98); c.lineTo(x * 1.04 + Math.sin(a) * 5, y * 1.04 - Math.cos(a) * 5); c.stroke();
  }
  c.restore();
  if (!active) {
    c.globalAlpha *= .28 + charge * .6;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 29, rise = (clock * .9 + i * .2) % 1;
      c.fillStyle = i % 2 ? emerald.edge : '#246848';
      c.beginPath(); c.moveTo(x, ground - 8 - rise * 40); c.quadraticCurveTo(x - 9, ground - 15 - rise * 40, x + 1, ground - 24 - rise * 40);
      c.quadraticCurveTo(x + 10, ground - 16 - rise * 40, x, ground - 8 - rise * 40); c.fill();
    }
    c.restore(); return;
  }
  c.globalAlpha *= fade;
  const envelope = clamp(progress * 10);
  const g = c.createLinearGradient(0, ground - 166, 0, ground);
  g.addColorStop(0, '#194e43'); g.addColorStop(.37, '#65df40'); g.addColorStop(.7, '#c0ff35'); g.addColorStop(1, '#c9ffe4');
  for (let i = 0; i < 7; i++) tongue(c, (i - 3) * 23, ground - 1, (100 + seed(i + 10) * 75) * envelope, 17 + seed(i) * 8, clock * 5 + i * 1.7, i % 2 ? '#073b2d' : '#124e3e');
  c.shadowColor = emerald.glow; c.shadowBlur = 12;
  for (let i = 0; i < 5; i++) tongue(c, (i - 2) * 25, ground - 3, (98 + seed(i + 27) * 51) * envelope, 15 + seed(i + 5) * 9, clock * 6.5 + i * 1.9, g);
  c.shadowBlur = 0;
  for (let i = 0; i < 3; i++) tongue(c, (i - 1) * 26, ground - 4, (76 + i % 2 * 38) * envelope, 12, clock * 6 + i, i % 2 ? '#f6ffb0' : '#aaff35');
  // Crossing black-jade ribbons give the bright flame an ink-like silhouette.
  c.fillStyle = '#021a16'; c.beginPath(); c.moveTo(-110, ground - 52); c.bezierCurveTo(-63, ground + 9, 63, ground - 10, 100, ground - 64);
  c.bezierCurveTo(83, ground - 6, -58, ground + 24, -110, ground - 52); c.fill();
  c.fillStyle = '#052b23'; c.beginPath(); c.moveTo(-100, ground - 23); c.bezierCurveTo(-25, ground - 81, 62, ground - 8, 108, ground - 88);
  c.bezierCurveTo(87, ground - 20, -9, ground - 59, -100, ground - 23); c.fill();
  c.save(); c.translate(0, ground - 8); c.rotate(-.17);
  ellipseArc(c, 81, 23, .1, Math.PI * .9, '#b7ff4d', 3); ellipseArc(c, 77, 19, .45, Math.PI * .61, '#f9ffd7', 2); c.restore();
  for (let i = 0; i < 13; i++) {
    const t = (clock * .8 + seed(i + 20)) % 1;
    const x = (seed(i + 7) - .5) * 188 + Math.sin(t * 5 + i) * 10, y = ground - 18 - t * (100 + seed(i + 90) * 85);
    c.globalAlpha = fade * Math.sin(Math.PI * t) * .8; c.fillStyle = i % 3 === 0 ? '#f1ffb4' : '#a3e343';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 6, y - 5, x + 2, y - 13); c.quadraticCurveTo(x + 7, y - 7, x, y); c.fill();
  }
  c.restore();
}
export function drawEnemySpecials(c, game) {
  for (const fx of game.specials || []) if (fx.type === 'flame' && !fx.cancelled && fx.life > 0) drawFlame(c, fx, game.clock || 0);
}
function drawCrescent(c, shot, clock) {
  c.save(); c.translate(shot.x, shot.y); c.rotate(Math.atan2(shot.vy || 0, shot.vx || 1)); c.scale((shot.radius || 30) / 30, (shot.radius || 30) / 30);
  halo(c, 6, 0, 87, emerald.glow, .45);
  const tail = c.createLinearGradient(-155, 0, 36, 0); tail.addColorStop(0, '#37ff2900'); tail.addColorStop(.64, '#50ef3560'); tail.addColorStop(1, '#d4ff9e');
  c.fillStyle = tail; c.beginPath(); c.moveTo(44, 0); c.bezierCurveTo(4, -30, -78, -38, -163, -21);
  c.bezierCurveTo(-93, -26, -15, -12, 5, 0); c.bezierCurveTo(-29, 11, -75, 12, -115, 19); c.quadraticCurveTo(-9, 23, 44, 0); c.fill();
  // Two nested curved bands leave an open inner edge: a crescent blade,
  // not a filled arrowhead. Its long wake still points along its flight.
  c.fillStyle = '#052b1e'; c.beginPath(); c.moveTo(19, -58);
  c.bezierCurveTo(76, -24, 77, 30, 13, 59);
  c.bezierCurveTo(40, 25, 39, -27, 19, -58); c.fill();
  c.shadowColor = '#6aff24'; c.shadowBlur = 13; c.fillStyle = '#6eff32';
  c.beginPath(); c.moveTo(24, -56); c.bezierCurveTo(76, -20, 74, 27, 17, 56);
  c.bezierCurveTo(46, 21, 44, -24, 24, -56); c.fill();
  c.shadowColor = '#eeffca'; c.shadowBlur = 5; c.fillStyle = '#f0ffd5';
  c.beginPath(); c.moveTo(29, -46); c.bezierCurveTo(64, -15, 66, 21, 25, 47);
  c.bezierCurveTo(46, 17, 47, -19, 29, -46); c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = '#ccff81'; c.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const t = (clock * 2 + i / 4) % 1, x = -25 - t * 108, y = Math.sin(i * 2.9) * (14 + t * 10); c.globalAlpha = (1 - t) * .7; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 15, y + Math.sin(i) * 2); c.stroke(); }
  c.restore();
}
function drawThorn(c, shot, clock) {
  c.save(); c.translate(shot.x, shot.y); c.rotate(Math.atan2(shot.vy || 0, shot.vx || 1)); c.scale((shot.radius || 12) / 12, (shot.radius || 12) / 12);
  halo(c, 0, 0, 38, emerald.glow, .3);
  c.fillStyle = '#42ad3c55'; c.beginPath(); c.moveTo(22, 0); c.lineTo(-49, -5); c.lineTo(-24, 0); c.lineTo(-50, 5); c.closePath(); c.fill();
  c.strokeStyle = '#7c9b41'; c.lineWidth = 3; c.beginPath(); c.moveTo(-22, 0); c.lineTo(17, 0); c.stroke();
  c.fillStyle = '#163c2c'; c.strokeStyle = '#9aff55'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(24, 0); c.lineTo(-7, -12); c.lineTo(-1, -3); c.lineTo(-22, -9); c.lineTo(-14, 0); c.lineTo(-22, 9); c.lineTo(1, 3); c.lineTo(-7, 12); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#e4ffab'; c.beginPath(); c.moveTo(24, 0); c.lineTo(-3, -3); c.lineTo(3, 0); c.lineTo(-3, 3); c.closePath(); c.fill();
  c.globalAlpha *= .45 + Math.sin(clock * 16) * .15; c.strokeStyle = '#bbff88'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-7, -6); c.quadraticCurveTo(-20, -17, -35, -10); c.stroke(); c.restore();
}
export function drawEnemyProjectile(c, shot, clock = 0) {
  if (shot.kind !== 'crescent' && shot.kind !== 'thorn') return false;
  if (shot.cancelled || shot.life <= 0) return true;
  if (shot.kind === 'crescent') drawCrescent(c, shot, clock); else drawThorn(c, shot, clock);
  return true;
}
function shieldPath(c) {
  c.beginPath(); c.moveTo(-7, -66); c.bezierCurveTo(40, -54, 45, 48, -7, 66); c.bezierCurveTo(9, 20, 9, -20, -7, -66); c.closePath();
}
function letterSigil(c, p, isPlayer, size = 18) {
  c.strokeStyle = p.core; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath();
  if (isPlayer) { c.moveTo(-size * .52, -size); c.lineTo(size * .52, size); c.moveTo(size * .52, -size); c.lineTo(-size * .52, size); }
  else { c.moveTo(-size * .64, -size); c.lineTo(0, 0); c.lineTo(size * .64, -size); c.moveTo(0, 0); c.lineTo(0, size); } c.stroke();
}
export function drawDefense(c, actor, isPlayer, clock = 0) {
  const guarding = actor.guarding && !(actor.guardBroken > 0), parry = actor.parryFlash > 0, broken = actor.guardBroken > 0, evading = actor.evadeTime > 0;
  if (!guarding && !parry && !broken && !evading) return;
  const p = isPlayer ? crimson : emerald;
  c.save(); c.translate(actor.x, actor.y - 78); c.scale(actor.dir || 1, 1);
  if (guarding || parry) {
    const stamina = clamp((actor.stamina ?? 100) / 100), perfect = (actor.guardTime ?? 1) < .16 || parry;
    c.save(); c.translate(43, 0); c.globalAlpha *= (.6 + stamina * .4) * (.87 + Math.sin(clock * 8) * .08);
    halo(c, 9, 0, perfect ? 89 : 73, p.glow, perfect ? .35 : .18);
    const fill = c.createLinearGradient(-8, 0, 43, 0); fill.addColorStop(0, `${p.dark}04`); fill.addColorStop(.67, `${p.mid}25`); fill.addColorStop(1, `${p.light}80`);
    shieldPath(c); c.fillStyle = fill; c.fill(); c.shadowColor = p.glow; c.shadowBlur = perfect ? 17 : 10;
    c.strokeStyle = perfect ? p.core : p.edge; c.lineWidth = perfect ? 2.7 : 1.8; c.stroke(); c.shadowBlur = 0;
    c.strokeStyle = `${p.light}88`; c.lineWidth = .8; c.beginPath(); c.moveTo(-3, -54); c.bezierCurveTo(32, -42, 34, 40, -3, 54); c.stroke();
    for (let i = -2; i <= 2; i++) { const yy = i * 21, xx = 30 - Math.abs(i) * 5; c.beginPath(); c.moveTo(4, yy - 8); c.lineTo(xx, yy - 3); c.lineTo(xx + 1, yy + 4); c.lineTo(4, yy + 10); c.stroke(); }
    c.save(); c.translate(18, 0); c.scale(.68, .8); c.shadowColor = p.glow; c.shadowBlur = 9; letterSigil(c, p, isPlayer, 16); c.restore();
    c.strokeStyle = `${p.light}55`; c.lineWidth = 1.3; c.beginPath(); c.arc(8, 0, 47, -1.2, -1.2 + stamina * 2.4); c.stroke();
    if (perfect) star(c, 40, -5, parry ? 29 : 11, p.core, .2); c.restore();
  }
  if (evading) {
    const direction = (actor.evadeDir || -(actor.dir || 1)) * (actor.dir || 1);
    c.save(); c.scale(direction, 1); c.globalAlpha *= clamp(actor.evadeTime / .24) * .45;
    const trail = c.createLinearGradient(-140, 0, 20, 0); trail.addColorStop(0, `${p.mid}00`); trail.addColorStop(1, `${p.light}80`); c.fillStyle = trail;
    for (let i = 0; i < 3; i++) { const y = (i - 1) * 28; c.beginPath(); c.moveTo(20, y); c.lineTo(-98 - i * 13, y - 3); c.lineTo(-64 - i * 12, y + 6); c.closePath(); c.fill(); }
    c.strokeStyle = p.light; c.lineWidth = 1.3; c.beginPath(); c.ellipse(-18, 8, 23, 62, -.15, -.9, .9); c.stroke(); c.restore();
  }
  if (broken) {
    const t = clamp(1 - actor.guardBroken / .9); c.save(); c.translate(40, 0); c.globalAlpha *= (1 - t) * .6;
    for (let i = 0; i < 7; i++) { const a = (i - 3) * .4, r = 28 + t * 28; c.save(); c.translate(Math.cos(a) * r - 15, Math.sin(a) * r * 1.5); c.rotate(a + t); c.strokeStyle = p.edge; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-5, -9); c.lineTo(6, -4); c.lineTo(3, 8); c.lineTo(-4, 2); c.closePath(); c.stroke(); c.restore(); } c.restore();
  }
  c.restore();
}
export function drawDefenseEffect(c, fx, clock = 0) {
  if (!['block', 'parry', 'guard-break', 'evade'].includes(fx.type)) return false;
  if (fx.life <= 0) return true;
  const p = palette(fx.owner), progress = clamp(1 - fx.life / (fx.max || .4)), ease = 1 - (1 - progress) ** 3, fade = (1 - progress) ** 1.4;
  c.save(); c.translate(fx.x, fx.y); c.scale(fx.dir || 1, 1); c.globalAlpha *= fade;
  if (fx.type === 'evade') {
    c.strokeStyle = p.light; c.lineWidth = 2 * (1 - progress) + .5; c.shadowColor = p.glow; c.shadowBlur = 7;
    c.beginPath(); c.ellipse(-ease * 50, 8, 20 + ease * 28, 35 + ease * 30, -.15, -.8, .8); c.stroke(); c.lineWidth = 1;
    c.beginPath(); c.ellipse(-ease * 67, 8, 19 + ease * 15, 30 + ease * 20, -.15, -.8, .8); c.stroke();
  } else if (fx.type === 'guard-break') {
    halo(c, 0, 0, 88, p.glow, .28);
    for (let i = 0; i < 14; i++) { const a = i * 2.39996, r = (20 + seed(i + 8) * 90) * ease; c.save(); c.translate(Math.cos(a) * r, Math.sin(a) * r); c.rotate(a + ease * 2); c.strokeStyle = i % 3 ? p.edge : p.core; c.fillStyle = `${p.mid}40`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-8, -13); c.lineTo(10, -5); c.lineTo(3, 12); c.lineTo(-6, 3); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    c.strokeStyle = p.light; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 15 + ease * 90, .2, Math.PI * 1.5); c.stroke();
  } else {
    const parry = fx.type === 'parry'; halo(c, 0, 0, (parry ? 120 : 65) * (.4 + ease), p.glow, parry ? .4 : .2);
    c.shadowColor = parry ? p.light : p.glow; c.shadowBlur = parry ? 15 : 9; c.strokeStyle = parry ? p.core : p.edge; c.lineWidth = (parry ? 4 : 2) * (1 - progress) + .5;
    c.beginPath(); c.ellipse(0, 0, 18 + ease * (parry ? 70 : 28), 28 + ease * (parry ? 68 : 34), 0, -1.4, 1.4); c.stroke();
    if (parry) { c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, 24 + ease * 85, 31 + ease * 80, 0, 0, TAU); c.stroke(); c.save(); c.scale(1 + ease * .8, 1 + ease * .8); letterSigil(c, p, fx.owner === 'player', 17); c.restore(); star(c, 5, 0, 54 * (1 - progress) + 5, p.core, -.3); }
    else star(c, 9, 0, 30 * (1 - progress) + 3, p.core, .2);
    c.shadowBlur = 0;
    for (let i = 0; i < (parry ? 12 : 7); i++) { const a = (seed(i + 90) - .5) * Math.PI * 1.4, r = (19 + seed(i + 3) * (parry ? 90 : 57)) * ease; c.strokeStyle = i % 3 === 0 ? p.core : p.light; c.lineWidth = i % 3 === 0 ? 1.7 : 1; c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9)); c.stroke(); }
  }
  c.restore(); return true;
}
