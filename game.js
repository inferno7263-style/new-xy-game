import { drawXMan } from './fighter-sprites.js';
import { ATTACK_STRENGTH, combatAttacks, resolveCombat } from './combat.js';
import { drawCombatSpecials, drawAttackProjectile, drawClashEffect } from './combat-effects.js';
import { drawEnemySpecials, drawEnemyProjectile, drawDefense, drawDefenseEffect } from './enemy-effects.js';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPAWN, ENEMY_SPAWN, createPlatforms } from './world.js';
import { ArenaCamera } from './camera.js';

const WIDTH = 1440;
const HEIGHT = 780;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const random = (a, b) => a + Math.random() * (b - a);
const defenseState = () => ({ stamina: 100, guarding: false, guardTime: 0, guardCooldown: 0, guardBroken: 0, staminaDelay: 0, evadeTime: 0, evadeDir: 0, evadeCooldown: 0, parryFlash: 0 });

export class ArenaGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.mode = 'ready';
    this.sound = true;
    this.difficulty = 'normal';
    this.keys = new Set();
    this.clock = 0;
    this.last = performance.now();
    this.assets = {};
    for (const name of ['arena', 'x-man', 'y-man', 'x-man-atlas']) {
      const img = new Image();
      img.src = `./assets/${name}.${name === 'x-man-atlas' ? 'png' : 'svg'}`;
      img.onload = () => { this.assets[name] = img; };
    }
    this.world = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
    this.platforms = createPlatforms();
    this.camera = new ArenaCamera();
    this.ambient = Array.from({ length: 46 }, (_, i) => ({ x: random(0, WORLD_WIDTH), y: random(80, WORLD_HEIGHT), speed: random(5, 20), size: random(.7, 2.1), phase: i * 1.7 }));
    this.reset();
    this.keydown = this.handleKeyDown.bind(this);
    this.keyup = this.handleKeyUp.bind(this);
    this.blur = () => { this.neutralControls(); if (this.mode === 'playing') this.pause(); };
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  reset() {
    this.player = { ...defenseState(), ...PLAYER_SPAWN, vx: 0, vy: 0, hp: 100, dir: 1, grounded: true, jumps: 0, invincible: 0, action: 'idle', actionTime: 0, dashTime: 0, drop: 0, coyote: .1, jumpBuffer: 0, jumpHeld: false, poseTime: 0, stridePhase: 0, footTimer: 0, landing: 0 };
    this.enemy = { ...defenseState(), ...ENEMY_SPAWN, vx: 0, vy: 0, hp: 100, dir: -1, grounded: true, jumps: 0, invincible: 0, action: 'idle', actionTime: 0, shoot: 1.6, charge: 0, jumpTimer: 0, aiTime: 0, drop: 0, volley: 0, heavy: false, move: 'blast', guardTimer: 0, defenseReaction: 0 };
    this.energy = 40;
    this.time = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.cooldowns = { slash: 0, cross: 0, burst: 0, dash: 0, laser: 0, orbit: 0, nova: 0, evade: 0 };
    this.attackVolumes = [];
    this.specials = [];
    this.lastClash = null;
    this.clashCounts = { cancel: 0, breakthrough: 0 };
    this.projectiles = [];
    this.particles = [];
    this.effects = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
    this.emitTimer = 0;
    this.endPending = false;
    this.laser = null;
    this.ghostTimer = 0;
    this.accumulator = 0;
    this.camera.reset(this.player, this.enemy);
  }

  start() {
    if (this.mode === 'paused') return this.resume();
    if (this.mode === 'ended') this.reset();
    this.mode = 'playing';
    this.unlockAudio();
    this.emit();
  }

  restart() { this.reset(); this.mode = 'playing'; this.keys.clear(); this.unlockAudio(); this.emit(); }
  pause() { if (this.mode !== 'playing') return; this.mode = 'paused'; this.neutralControls(); this.emit(); this.options.onPause?.(true); }
  resume() { if (this.mode !== 'paused') return; this.mode = 'playing'; this.neutralControls(); this.unlockAudio(); this.emit(); this.options.onPause?.(false); }
  setSound(value) { this.sound = Boolean(value); }
  setDifficulty(value) { this.difficulty = value === 'hard' ? 'hard' : 'normal'; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * this.dpr));
    const height = Math.max(1, Math.round(rect.height * this.dpr));
    const changed = this.canvas.width !== width || this.canvas.height !== height;
    // Assigning even the same dimensions clears the canvas. Repaint actual
    // resizes immediately rather than exposing an empty frame until the next RAF.
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    this.offsetX = (this.canvas.width - WIDTH * this.scale) / 2;
    this.offsetY = (this.canvas.height - HEIGHT * this.scale) / 2;
    if (changed && this.raf) this.render();
  }

  handleKeyDown(event) {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable) return;
    const code = event.code;
    if (['Escape', 'KeyP'].includes(code)) {
      if (event.repeat) return;
      if (this.mode === 'playing') { event.preventDefault(); this.pause(); }
      else if (this.mode === 'paused') { event.preventDefault(); this.resume(); }
      return;
    }
    if (this.mode !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyO', 'KeyI', 'KeyF', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(code)) event.preventDefault();
    this.keys.add(code);
    if (event.repeat) return;
    if (['Space', 'KeyW', 'ArrowUp'].includes(code)) this.jump();
    if (['KeyS', 'ArrowDown'].includes(code)) { this.player.drop = .22; this.player.coyote = 0; this.player.y += 6; this.player.grounded = false; }
    if (code === 'KeyJ') this.attack('slash');
    if (code === 'KeyK') this.attack('cross');
    if (code === 'KeyL') this.attack('burst');
    if (code === 'KeyU') this.attack('laser');
    if (code === 'KeyO') this.attack('orbit');
    if (code === 'KeyI') this.attack('nova');
    if (code === 'KeyF') this.guard(true);
    if (code === 'KeyE') this.evade();
    if (code.startsWith('Shift')) this.dash();
  }
  handleKeyUp(event) {
    this.keys.delete(event.code);
    if (event.code === 'KeyF') this.guard(false);
    if (['Space', 'KeyW', 'ArrowUp'].includes(event.code) && !['Space', 'KeyW', 'ArrowUp'].some(key => this.keys.has(key))) this.releaseJump();
  }
  move(direction, pressed) {
    const key = direction < 0 ? 'KeyA' : 'KeyD';
    if (pressed) this.keys.add(key); else this.keys.delete(key);
  }
  jump() {
    const p = this.player;
    if (this.mode !== 'playing' || p.guardBroken > 0 || p.evadeTime > 0) return false;
    p.jumpBuffer = .12;
    p.jumpHeld = true;
    return this.consumeJump();
  }
  consumeJump() {
    const p = this.player;
    const groundJump = p.grounded || p.coyote > 0;
    if (!groundJump && p.jumps >= 2) return false;
    if (groundJump) p.jumps = 0;
    else if (p.jumps === 0) p.jumps = 1;
    p.vy = p.jumps === 0 ? -715 : -665;
    if (!p.jumpHeld) p.vy *= .6;
    p.grounded = false;
    p.jumps++;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.action = 'jump';
    p.actionTime = 0;
    p.landing = 0;
    this.ghostTimer = .04;
    this.sparks(p.x, p.y, '#c6d8ef', 11, 150);
    this.effects.push({ type: 'jump', x: p.x, y: p.y, life: .4, max: .4, color: '#f54e5e' });
    this.tone(180, 450, .13, 'sine', .05);
    return true;
  }
  releaseJump() {
    this.player.jumpHeld = false;
    if (this.player.vy < -285) this.player.vy = -285;
  }
  dash() {
    if (this.mode !== 'playing' || this.cooldowns.dash > 0 || this.laser || this.player.guardBroken > 0 || this.player.evadeTime > 0) return false;
    this.guard(false);
    this.player.dashTime = .17;
    this.player.invincible = .22;
    this.player.vy *= .1;
    this.cooldowns.dash = 1.45;
    this.tone(230, 60, .16, 'sawtooth', .025);
    return true;
  }

  neutralControls() {
    this.keys.clear();
    for (const actor of [this.player, this.enemy]) {
      if (!actor) continue;
      actor.guarding = false;
      actor.jumpHeld = false;
      actor.guardTime = 0;
      actor.guardTimer = 0;
    }
  }

  guard(pressed) { return this.setGuard(this.player, pressed); }
  setGuard(actor, pressed) {
    if (!pressed) {
      if (actor.guarding) {
        actor.guarding = false;
        actor.guardCooldown = Math.max(actor.guardCooldown, .25);
        actor.staminaDelay = Math.max(actor.staminaDelay, .3);
      }
      return true;
    }
    if (this.mode !== 'playing' || actor.guarding || actor.guardBroken > 0 || actor.guardCooldown > 0 || actor.evadeTime > 0 || actor.stamina < 10 || (actor === this.player && this.laser)) return false;
    actor.guarding = true;
    actor.guardTime = 0;
    actor.action = 'guard';
    actor.actionTime = 0;
    if (actor === this.enemy) { actor.charge = 0; actor.shoot = Math.max(actor.shoot, .6); }
    return true;
  }

  breakGuard(actor) {
    actor.guarding = false;
    actor.stamina = 0;
    actor.guardBroken = .9;
    actor.staminaDelay = 1.1;
    actor.guardCooldown = 1;
    actor.action = 'guard-break'; actor.actionTime = .9;
    actor.vx *= .25;
    this.effects.push({ type: 'guard-break', owner: actor === this.player ? 'player' : 'enemy', x: actor.x, y: actor.y - 70, dir: actor.dir, life: .6, max: .6, color: '#ffe2a3' });
    this.floaters.push({ x: actor.x, y: actor.y - 175, text: 'GUARD BREAK', color: '#ffd08b', life: 1 });
    this.shake = Math.max(this.shake, 5);
    this.tone(130, 45, .2, 'square', .04);
  }

  updateDefense(actor, dt) {
    actor.guardCooldown = Math.max(0, actor.guardCooldown - dt);
    actor.guardBroken = Math.max(0, actor.guardBroken - dt);
    actor.evadeCooldown = Math.max(0, actor.evadeCooldown - dt);
    actor.evadeTime = Math.max(0, actor.evadeTime - dt);
    actor.staminaDelay = Math.max(0, actor.staminaDelay - dt);
    actor.parryFlash = Math.max(0, actor.parryFlash - dt);
    if (actor.guarding) {
      actor.guardTime += dt;
      actor.stamina = Math.max(0, actor.stamina - 12 * dt);
      if (actor.stamina <= 0) this.breakGuard(actor);
    } else if (actor.evadeTime <= 0 && actor.guardBroken <= 0 && actor.staminaDelay <= 0) actor.stamina = Math.min(100, actor.stamina + 22 * dt);
  }

  evade() {
    const input = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    return this.evadeFighter(this.player, input || -this.player.dir);
  }
  evadeFighter(actor, direction, hop = false) {
    const cooldown = actor === this.player ? this.cooldowns.evade : actor.evadeCooldown;
    if (this.mode !== 'playing' || cooldown > 0 || actor.stamina < 20 || actor.guardBroken > 0 || actor.evadeTime > 0 || (actor === this.player && this.laser)) return false;
    this.setGuard(actor, false);
    actor.stamina -= 20;
    actor.staminaDelay = .7;
    actor.evadeTime = .24;
    actor.evadeDir = direction < 0 ? -1 : 1;
    actor.invincible = Math.max(actor.invincible, .27);
    actor.evadeCooldown = actor === this.player ? 2.2 : 4.5;
    if (actor === this.player) { this.cooldowns.evade = 2.2; actor.dashTime = 0; }
    else { actor.charge = 0; actor.shoot = Math.max(actor.shoot, .7); }
    actor.vx = actor.evadeDir * 850;
    if (hop && actor.grounded) { actor.vy = -520; actor.grounded = false; actor.jumps = 1; }
    actor.action = 'evade'; actor.actionTime = .24;
    this.effects.push({ type: 'evade', owner: actor === this.player ? 'player' : 'enemy', x: actor.x, y: actor.y - 70, dir: actor.evadeDir, life: .3, max: .3 });
    this.tone(230, 55, .15, 'triangle', .025);
    return true;
  }

  attack(type = 'slash') {
    if (this.mode !== 'playing' || this.cooldowns[type] > 0 || this.laser || this.player.guarding || this.player.guardBroken > 0 || this.player.evadeTime > 0) return false;
    const p = this.player;
    if (type === 'slash') {
      this.cooldowns.slash = .38;
      p.action = 'slash'; p.actionTime = .3;
      const visual = { type: 'slash', x: p.x + p.dir * 45, y: p.y - 68, dir: p.dir, life: .27, max: .27, color: '#ff394f' };
      this.effects.push(visual);
      this.attackVolumes.push({ type: 'slash', owner: 'player', x: p.x + p.dir * 65, y: p.y - 65, radius: 92, dir: p.dir, strength: 1, damage: 17, life: .22, max: .22, follow: true, offset: 65, hit: false, visual });
      this.tone(530, 95, .12, 'sawtooth', .028);
    } else if (type === 'cross') {
      this.cooldowns.cross = 1.25;
      p.action = 'cross'; p.actionTime = .35;
      this.projectiles.push({ x: p.x + p.dir * 45, y: p.y - 65, vx: p.dir * 950, vy: 0, life: 4, owner: 'player', kind: 'cross', radius: 26, damage: 13, strength: 1, projectile: true, rotation: 0 });
      this.sparks(p.x + p.dir * 48, p.y - 64, '#ff5267', 9, 150);
      this.tone(620, 180, .2, 'triangle', .055);
    } else if (type === 'laser') {
      this.cooldowns.laser = 4;
      p.action = 'laser'; p.actionTime = .86;
      this.laser = { type: 'laser', owner: 'player', shape: 'beam', length: WORLD_WIDTH, strength: 3, damage: 29, life: .82, phase: 'charging', elapsed: 0, dir: p.dir, x: p.x + p.dir * 55, y: p.y - 72, hit: false, particleTimer: 0 };
      this.effects.push({ type: 'charge-ring', x: p.x + p.dir * 55, y: p.y - 72, life: .32, max: .32, color: '#ff344e' });
      this.tone(170, 950, .32, 'sine', .045);
    } else if (type === 'orbit') {
      this.cooldowns.orbit = 3.2;
      p.action = 'orbit'; p.actionTime = .77;
      this.specials.push({ type: 'orbit', owner: 'player', x: p.x, y: p.y - 70, dir: p.dir, elapsed: 0, phase: 'charging', life: .77, max: .77, radius: 180, strength: 2, damage: 26, cancelled: false, hit: false });
      this.tone(150, 600, .25, 'triangle', .04);
    } else if (type === 'nova') {
      this.cooldowns.nova = 5.5;
      p.action = 'nova'; p.actionTime = .6;
      this.specials.push({ type: 'nova-charge', owner: 'player', x: p.x + p.dir * 48, y: p.y - 70, dir: p.dir, elapsed: 0, phase: 'charging', life: .25, max: .25, strength: 3, damage: 32 });
      this.tone(120, 700, .25, 'sine', .055);
    } else if (type === 'burst') {
      if (this.energy < 100) { this.floaters.push({ x: p.x, y: p.y - 150, text: 'CHARGE TO 100%', color: '#ecb6bc', life: .9 }); return false; }
      this.energy = 0;
      this.cooldowns.burst = 8;
      p.action = 'burst'; p.actionTime = .8; p.invincible = .9;
      const visual = { type: 'burst', x: p.x, y: p.y - 70, life: .9, max: .9, color: '#ff2947' };
      this.effects.push(visual);
      this.attackVolumes.push({ type: 'burst', owner: 'player', x: p.x, y: p.y - 60, dir: p.dir, radius: 560, strength: 4, damage: 38, life: .55, max: .55, hit: false, visual });
      this.shake = 18; this.flash = .24;
      this.sparks(p.x, p.y - 60, '#ff324f', 75, 600);
      this.tone(80, 500, .5, 'sawtooth', .07);
    } else return false;
    this.emit();
    return true;
  }

  hit(target, damage, direction, type, attack = null) {
    if (target.hp <= 0 || target.invincible > 0 || target.evadeTime > 0) return { outcome: 'evaded', consumed: false };
    const isPlayer = target === this.player;
    let outcome = 'hit';
    const source = attack?.owner === 'player' ? this.player : attack?.owner === 'enemy' ? this.enemy : null;
    const frontal = attack?.projectile ? direction * target.dir < 0 : source ? (source.x - target.x) * target.dir >= -8 : direction * target.dir < 0;
    if (target.guarding && target.guardBroken <= 0 && frontal) {
      if (target.guardTime <= .16) {
        target.parryFlash = .3;
        this.effects.push({ type: 'parry', owner: isPlayer ? 'player' : 'enemy', x: target.x + target.dir * 34, y: target.y - 70, dir: target.dir, life: .4, max: .4 });
        this.floaters.push({ x: target.x, y: target.y - 170, text: 'PERFECT PARRY', color: isPlayer ? '#ffe3bf' : '#d9ffb1', life: .8 });
        this.tone(900, 500, .13, 'triangle', .04);
        return { outcome: 'parried', consumed: true };
      }
      const cost = damage * 1.2 + 5;
      target.staminaDelay = .8;
      if (target.stamina < cost) { this.breakGuard(target); damage = Math.ceil(damage * .6); outcome = 'guard-broken'; }
      else {
        target.stamina -= cost;
        damage = Math.max(1, Math.ceil(damage * .2));
        outcome = 'blocked';
        this.effects.push({ type: 'block', owner: isPlayer ? 'player' : 'enemy', x: target.x + target.dir * 34, y: target.y - 70, dir: target.dir, life: .25, max: .25 });
      }
    }
    target.hp = Math.max(0, target.hp - damage);
    target.invincible = outcome === 'blocked' ? .08 : isPlayer ? .62 : .22;
    target.vx = direction * (outcome === 'blocked' ? 55 : type === 'burst' ? 520 : 230);
    if (outcome !== 'blocked') {
      target.vy = Math.min(target.vy, -100);
      if (target.guardBroken <= 0) { target.action = 'hurt'; target.actionTime = .21; }
    }
    this.shake = Math.max(this.shake, outcome === 'blocked' ? 2 : isPlayer ? 8 : 5);
    this.floaters.push({ x: target.x + random(-15, 15), y: target.y - 120, text: outcome === 'blocked' ? `BLOCK −${damage}` : `−${damage}`, color: isPlayer ? '#ff6678' : '#b7ff9f', life: 1 });
    this.sparks(target.x, target.y - 70, isPlayer ? '#ff6678' : '#a6ff5d', outcome === 'blocked' ? 7 : 18, 260);
    if (!isPlayer && outcome !== 'blocked') {
      this.energy = Math.min(100, this.energy + (type === 'slash' ? 18 : 12));
      this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.comboTimer = 2.6;
    } else if (isPlayer) { this.combo = 0; this.energy = Math.min(100, this.energy + 6); }
    this.tone(isPlayer ? 95 : 145, 45, .1, 'square', .035);
    if (target.hp <= 0) this.finish(isPlayer ? 'enemy' : 'player');
    return { outcome, consumed: true, damage };
  }

  finish(winner) {
    if (this.endPending) return;
    this.endPending = true;
    this.mode = 'ended';
    this.laser = null;
    this.attackVolumes = [];
    this.specials = [];
    this.projectiles = [];
    this.neutralControls();
    const loser = winner === 'player' ? this.enemy : this.player;
    loser.action = 'defeat';
    this.sparks(loser.x, loser.y - 60, winner === 'player' ? '#adff5f' : '#ff4a64', 65, 380);
    this.emit();
    this.options.onEnd?.({ winner, victory: winner === 'player', time: this.time, bestCombo: this.bestCombo, playerHealth: this.player.hp, enemyHealth: this.enemy.hp });
  }

  update(dt) {
    if (this.mode !== 'paused') this.clock += dt;
    if (this.mode !== 'paused') {
      for (const a of this.particles) { a.x += a.vx * dt; a.y += a.vy * dt; a.vy += a.gravity * dt; a.life -= dt; }
      this.particles = this.particles.filter(a => a.life > 0);
      for (const a of this.effects) a.life -= dt;
      this.effects = this.effects.filter(a => a.life > 0);
      for (const a of this.floaters) { a.y -= 36 * dt; a.life -= dt; }
      this.floaters = this.floaters.filter(a => a.life > 0);
      this.shake = Math.max(0, this.shake - dt * 32);
      this.flash = Math.max(0, this.flash - dt);
    }
    if (this.mode !== 'playing') { if (this.mode === 'ready') this.camera.update(dt, this.player, this.enemy); return; }
    this.time += dt;
    this.updateDefense(this.player, dt);
    this.updateDefense(this.enemy, dt);
    this.energy = Math.min(100, this.energy + dt * 2.5);
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const p = this.player;
    for (const fighter of [this.player, this.enemy]) { fighter.previousX = fighter.x; fighter.previousY = fighter.y; }
    p.poseTime += dt * (p.grounded ? Math.abs(p.vx) / 365 : 1);
    p.stridePhase += Math.abs(p.vx) * dt * .05;
    p.coyote = p.grounded ? .1 : Math.max(0, p.coyote - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    p.landing = Math.max(0, p.landing - dt * 5);
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    if (p.evadeTime > 0) {
      p.vx = p.evadeDir * 850;
    } else if (p.guardBroken > 0) {
      p.vx *= Math.exp(-dt * 18);
    } else if (p.dashTime > 0) {
      p.dashTime -= dt; p.vx = p.dir * 1080; p.vy = 0;
    } else {
      const input = Number(right) - Number(left);
      const response = input ? (p.grounded ? 19 : 11) : (p.grounded ? 22 : 3.5);
      p.vx = lerp(p.vx, input * (p.guarding ? 105 : this.laser ? 100 : 385), 1 - Math.exp(-dt * response));
      if (Math.abs(p.vx) < 2 && !input) p.vx = 0;
      if (input && !this.laser) p.dir = input;
      if (this.keys.has('KeyJ') && !this.laser && !p.guarding) this.attack('slash');
    }
    this.physics(p, dt);
    if (p.grounded && p.jumpBuffer > 0) this.consumeJump();
    if ((!p.grounded && Math.hypot(p.vx, p.vy) > 60) || p.dashTime > 0) {
      this.ghostTimer += dt;
      if (this.ghostTimer >= .04) {
        this.ghostTimer %= .04;
        this.effects.push({ type: 'ghost', x: p.x, y: p.y, dir: p.dir, action: p.action, actionTime: p.actionTime, vx: p.vx, vy: p.vy, grounded: p.grounded, poseTime: p.poseTime, phase: p.stridePhase, stridePhase: p.stridePhase, life: .32, max: .32 });
      }
    } else this.ghostTimer = 0;
    if (p.grounded && Math.abs(p.vx) > 85) {
      p.footTimer += dt;
      if (p.footTimer > .075) { p.footTimer = 0; this.sparks(p.x - p.dir * 19, p.y - 1, '#a5a9bf', 2, 45); }
    } else p.footTimer = 0;
    this.updateAI(dt);
    this.updateLaser(dt);
    this.updateSpecials(dt);
    for (const volume of this.attackVolumes) {
      volume.previousX = volume.x; volume.previousY = volume.y;
      volume.life -= dt;
      if (volume.follow) {
        const owner = volume.owner === 'player' ? this.player : this.enemy;
        volume.x = owner.x + volume.dir * volume.offset; volume.y = owner.y - 65;
      }
    }
    for (const a of this.projectiles) {
      a.previousX = a.x; a.previousY = a.y;
      a.projectile = true;
      a.strength ??= ATTACK_STRENGTH[a.kind] || 1;
      a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; a.rotation += dt * 8;
      if (Math.random() < .5) this.particles.push({ x: a.x, y: a.y, vx: -a.vx * .08 + random(-20, 20), vy: random(-35, 35), life: .3, max: .3, color: a.owner === 'player' ? '#ff3f59' : '#9efb4b', size: random(1, 4), gravity: 0 });
    }
    resolveCombat(this);
    this.camera.update(dt, this.player, this.enemy);
    this.projectiles = this.projectiles.filter(a => a.life > 0 && a.x > -100 && a.x < WORLD_WIDTH + 100 && a.y > -300 && a.y < WORLD_HEIGHT + 100);
    this.emitTimer += dt;
    if (this.emitTimer > .1) { this.emit(); this.emitTimer = 0; }
  }

  updateLaser(dt) {
    const beam = this.laser;
    if (!beam) return;
    beam.elapsed += dt;
    const p = this.player;
    beam.previousX = beam.x; beam.previousY = beam.y;
    beam.life = .82 - beam.elapsed;
    p.dir = beam.dir;
    p.action = 'laser';
    p.actionTime = Math.max(p.actionTime, .05);
    beam.x = p.x + beam.dir * 55;
    beam.y = p.y - 72;
    beam.particleTimer += dt;
    if (beam.elapsed < .32) {
      if (beam.particleTimer >= .04) {
        beam.particleTimer = 0;
        const angle = random(0, Math.PI * 2), r = random(24, 48);
        this.particles.push({ x: beam.x + Math.cos(angle) * r, y: beam.y + Math.sin(angle) * r, vx: -Math.cos(angle) * 95, vy: -Math.sin(angle) * 95, life: .22, max: .22, color: '#ff657a', size: 3, gravity: 0 });
      }
      return;
    }
    if (beam.phase !== 'firing') {
      beam.phase = 'firing';
      this.shake = Math.max(this.shake, 6);
      this.flash = .07;
      this.sparks(beam.x, beam.y, '#ff8595', 22, 250);
      this.tone(780, 85, .45, 'sawtooth', .045);
      this.tone(145, 45, .5, 'triangle', .06);
      this.emit();
    }
    if (beam.elapsed >= .82) { this.laser = null; this.emit(); return; }
    if (beam.particleTimer >= .05) {
      beam.particleTimer = 0;
      this.sparks(beam.x + beam.dir * 20, beam.y, '#ff8c9b', 3, 180);
    }
  }

  updateSpecials(dt) {
    const p = this.player;
    for (const special of this.specials) {
      if (special.cancelled || special.life <= 0) continue;
      special.previousX = special.x; special.previousY = special.y;
      special.elapsed += dt; special.life -= dt;
      if (special.type !== 'flame') {
        special.x = p.x + (special.type === 'nova-charge' ? special.dir * 48 : 0);
        special.y = p.y - 70;
      }
      if (special.type === 'flame' && special.elapsed >= .65 && special.phase === 'charging') {
        special.phase = 'active';
        this.sparks(special.x, special.groundY - 20, '#b9ff48', 24, 260);
        this.tone(120, 340, .25, 'sawtooth', .035);
      }
      if (special.type === 'orbit') {
        if (special.elapsed >= .12 && special.phase === 'charging') {
          special.phase = 'active';
          this.sparks(special.x, special.y, '#ffb23f', 22, 300);
          this.tone(520, 120, .4, 'sawtooth', .035);
        }
      } else if (special.type === 'nova-charge' && special.life <= 0) {
        this.projectiles.push({ kind: 'nova', owner: special.owner, x: special.x + special.dir * 20, y: special.y, vx: special.dir * 700, vy: 0, life: 3.8, max: 3.8, radius: 38, strength: 3, damage: 32, rotation: 0, dir: special.dir, projectile: true });
        this.sparks(special.x, special.y, '#ffbb63', 18, 210);
        this.tone(620, 65, .28, 'sawtooth', .055);
      }
    }
    this.specials = this.specials.filter(special => !special.cancelled && special.life > 0);
  }

  physics(actor, dt) {
    const isPlayer = actor === this.player;
    actor.invincible = Math.max(0, actor.invincible - dt);
    actor.actionTime = Math.max(0, actor.actionTime - dt);
    actor.drop = Math.max(0, actor.drop - dt);
    const previousY = actor.y;
    if (!actor.dashTime || actor.dashTime <= 0) {
      // A gentler apex joins the rising and falling arcs without a hard snap.
      const gravity = !isPlayer ? 1850 : actor.vy > 80 ? 2160 : Math.abs(actor.vy) < 110 && actor.jumpHeld ? 1120 : 1720;
      actor.vy = Math.min(1100, actor.vy + gravity * dt);
    }
    actor.x = clamp(actor.x + actor.vx * dt, 22, WORLD_WIDTH - 22);
    actor.y += actor.vy * dt;
    actor.grounded = false;
    if (actor.vy >= 0 && actor.drop <= 0) {
      for (const platform of [...this.platforms].sort((a, b) => a.y - b.y)) {
        if (actor.x > platform.x + 8 && actor.x < platform.x + platform.w - 8 && previousY <= platform.y + 3 && actor.y >= platform.y) {
          const impact = actor.vy;
          actor.y = platform.y; actor.vy = 0; actor.grounded = true; actor.jumps = 0;
          if (impact > 240) {
            this.sparks(actor.x, actor.y - 3, '#abbad4', impact > 450 ? 12 : 7, 130);
            this.effects.push({ type: 'land', x: actor.x, y: actor.y - 1, life: .3, max: .3, color: isPlayer ? '#ff7d8c' : '#a6ed7a' });
            if (isPlayer) actor.landing = Math.min(1, impact / 850);
            if (actor.actionTime <= 0) { actor.action = 'land'; actor.actionTime = .16; }
          }
          break;
        }
      }
    }
    if (actor.y > WORLD_HEIGHT + 140) {
      actor.x = isPlayer ? PLAYER_SPAWN.x : ENEMY_SPAWN.x; actor.y = 630; actor.vx = 0; actor.vy = 0; actor.jumps = 0;
      actor.hp = Math.max(0, actor.hp - 12); actor.invincible = 1.5;
      this.floaters.push({ x: actor.x, y: 510, text: 'FALL −12', color: isPlayer ? '#ff7383' : '#b4ff91', life: 1.2 });
      if (actor.hp <= 0) this.finish(isPlayer ? 'enemy' : 'player');
    }
    if (actor.hp > 0 && actor.guardBroken > 0) actor.action = 'guard-break';
    else if (actor.guarding) actor.action = 'guard';
    else if (actor.evadeTime > 0) actor.action = 'evade';
    else if (actor.actionTime <= 0 && actor.hp > 0) actor.action = !actor.grounded ? 'jump' : Math.abs(actor.vx) > 55 ? 'run' : 'idle';
  }

  updateAI(dt) {
    const e = this.enemy, p = this.player;
    e.aiTime += dt; e.shoot -= dt; e.jumpTimer -= dt;
    e.dir = p.x > e.x ? 1 : -1;
    const dx = p.x - e.x, dy = p.y - e.y;
    const hard = this.difficulty === 'hard';
    const approaching = this.projectiles.filter(shot => shot.owner === 'player' && (shot.x - e.x) * shot.vx < 0 && Math.abs(shot.y - (e.y - 65)) < 130 && Math.abs(shot.x - e.x) < 520);
    const bigThreat = (this.laser && this.laser.dir * (e.x - p.x) > 0 && Math.abs(dy) < 130 && Math.abs(dx) < 2000) || approaching.some(shot => shot.strength >= 3);
    e.defenseReaction = bigThreat ? e.defenseReaction + dt : 0;
    if (this.time > 4 && e.defenseReaction > .12 && e.evadeCooldown <= 0) {
      const away = Math.sign(e.x - p.x) || 1;
      const direction = e.x + away * 220 < 100 || e.x + away * 220 > WORLD_WIDTH - 100 ? -away : away;
      this.evadeFighter(e, direction, true);
      e.defenseReaction = 0;
    } else if (this.time > 3 && !bigThreat && approaching.length && e.guardCooldown <= 0 && !e.guarding && e.evadeTime <= 0 && e.stamina > 30) {
      if (this.setGuard(e, true)) e.guardTimer = .48;
    }
    if (e.guarding) {
      e.guardTimer -= dt;
      if (e.guardTimer <= 0) { this.setGuard(e, false); e.guardCooldown = 3; }
    }
    let desired = Math.abs(dx) > 230 ? e.dir * (hard ? 285 : 230) : Math.abs(dx) < 95 ? -e.dir * 100 : 0;
    if (dy < -80 && !e.guarding && e.evadeTime <= 0 && e.guardBroken <= 0) {
      const reachable = this.platforms.filter(a => a.y < e.y - 30 && a.y > e.y - 250);
      const platform = reachable.sort((a, b) => Math.abs(clamp(p.x, a.x + 35, a.x + a.w - 35) - e.x) - Math.abs(clamp(p.x, b.x + 35, b.x + b.w - 35) - e.x))[0];
      if (platform) {
        const targetX = clamp(p.x, platform.x + 35, platform.x + platform.w - 35);
        desired = Math.sign(targetX - e.x) * (hard ? 280 : 225);
        if (e.grounded && e.jumpTimer <= 0 && Math.abs(targetX - e.x) < 340) { e.vy = -730; e.grounded = false; e.jumps = 1; e.jumpTimer = 1; }
        if (!e.grounded && e.jumps === 1 && e.vy > -60 && e.y > platform.y + 20) { e.vy = -640; e.jumps = 2; }
      }
    } else if (dy > 100 && e.grounded && e.jumpTimer <= 0) { e.drop = .22; e.y += 6; e.jumpTimer = .7; }
    const canAttack = !e.guarding && e.guardBroken <= 0 && e.evadeTime <= 0;
    if (canAttack && e.charge > 0) {
      e.charge -= dt; desired *= .12;
      if (e.charge <= 0) this.fireEnemyMove();
    } else if (canAttack && e.shoot <= 0 && Math.abs(dx) < 2800 && Math.abs(dy) < 600) {
      const sequence = ['blast', 'crescent', 'flame', 'volley', 'heavy'];
      e.move = this.time < 5 ? 'blast' : sequence[e.volley % sequence.length];
      e.heavy = e.move === 'heavy';
      e.charge = e.move === 'flame' ? .5 : e.move === 'volley' ? .5 : e.move === 'crescent' ? .58 : e.heavy ? (hard ? .7 : .95) : (hard ? .48 : .7);
      e.shoot = e.move === 'flame' ? 4.3 : e.move === 'volley' ? 3.1 : e.move === 'crescent' ? 2.8 : e.heavy ? 2.6 : 2.1;
      e.action = 'charge'; e.actionTime = e.charge;
    }
    if (e.evadeTime > 0) e.vx = e.evadeDir * 850;
    else if (e.guardBroken > 0) e.vx *= Math.exp(-dt * 18);
    else {
      if (e.guarding) desired *= .25;
      e.vx = lerp(e.vx, desired, 1 - Math.exp(-dt * 5));
    }
    if (e.y > 590 && ((e.x < 115 && e.vx < 0) || (e.x > WORLD_WIDTH - 115 && e.vx > 0))) { e.vx *= -.5; if (e.grounded && e.evadeTime <= 0) e.vy = -670; }
    this.physics(e, dt);
    if (canAttack && Math.abs(e.x - p.x) < 66 && Math.abs(e.y - p.y) < 95 && e.aiTime > .8) {
      e.aiTime = 0;
      const visual = { type: 'slash', x: e.x + e.dir * 40, y: e.y - 65, dir: e.dir, life: .28, max: .28, color: '#a2ff53' };
      this.effects.push(visual);
      this.attackVolumes.push({ type: 'melee', owner: 'enemy', x: e.x + e.dir * 35, y: e.y - 65, radius: 52, dir: e.dir, strength: 1, damage: 7, life: .2, max: .2, hit: false, visual });
    }
  }

  fireEnemyMove() {
    const e = this.enemy, p = this.player;
    const origin = { x: e.x + e.dir * 38, y: e.y - 72 };
    const aimX = p.x + p.vx * .17, aimY = p.y - 65 + clamp(p.vy * .12, -65, 65);
    const angle = Math.atan2(aimY - origin.y, aimX - origin.x);
    const hard = this.difficulty === 'hard';
    e.volley++;
    if (e.move === 'flame') {
      const floor = this.platforms.filter(platform => p.x > platform.x && p.x < platform.x + platform.w && platform.y >= p.y - 12).sort((a, b) => a.y - b.y)[0] || this.platforms[0];
      const x = clamp(p.x + clamp(p.vx * .2, -100, 100), floor.x + 45, floor.x + floor.w - 45);
      this.specials.push({ type: 'flame', owner: 'enemy', x, y: floor.y - 55, groundY: floor.y, dir: e.dir, elapsed: 0, phase: 'charging', life: 1.3, max: 1.3, radius: 100, strength: 2, damage: 20, hit: false });
    } else {
      const volley = e.move === 'volley';
      const crescent = e.move === 'crescent';
      const heavy = e.move === 'heavy';
      const speed = crescent ? 600 : volley ? 650 : heavy ? (hard ? 485 : 395) : (hard ? 550 : 450);
      const spread = volley ? [-.2, 0, .2] : hard && this.time > 10 && !crescent ? [-.12, 0, .12] : [0];
      for (const offset of spread) this.projectiles.push({ ...origin, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed, owner: 'enemy', kind: crescent ? 'crescent' : volley ? 'thorn' : heavy ? 'heavy' : 'blast', strength: crescent || heavy ? 2 : 1, projectile: true, life: WORLD_WIDTH / speed + 1, max: WORLD_WIDTH / speed + 1, radius: crescent ? 30 : volley ? 12 : heavy ? 25 : 17, damage: crescent ? 16 : volley ? 8 : heavy ? 18 : hard ? 12 : 10, rotation: 0 });
    }
    this.sparks(origin.x, origin.y, '#b0ff4e', 15, 230);
    e.action = 'blast'; e.actionTime = .35;
    this.tone(e.move === 'flame' ? 120 : 310, 90, .2, 'triangle', .035);
  }

  sparks(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2), force = random(speed * .2, speed);
      const life = random(.2, .65);
      this.particles.push({ x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 55, color, size: random(1.5, 4), life, max: life, gravity: 450 });
    }
  }

  emit() {
    const recentClash = this.lastClash && this.time - this.lastClash.time < 1.6 ? { ...this.lastClash } : null;
    const defense = { player: { guardBroken: this.player.guardBroken, evadeTime: this.player.evadeTime, parryFlash: this.player.parryFlash }, enemy: { guardBroken: this.enemy.guardBroken, evadeTime: this.enemy.evadeTime, parryFlash: this.enemy.parryFlash } };
    const enemyMove = this.enemy.guarding ? 'guard' : this.enemy.evadeTime > 0 ? 'evade' : this.enemy.move;
    const state = { clash: recentClash, clashes: { cancels: this.clashCounts.cancel, breakthroughs: this.clashCounts.breakthrough }, playerHealth: Math.ceil(this.player.hp), enemyHealth: Math.ceil(this.enemy.hp), energy: Math.floor(this.energy), time: this.time, combo: this.combo, bestCombo: this.bestCombo, mode: this.mode, cooldowns: { ...this.cooldowns }, laser: this.laser ? { phase: this.laser.phase, elapsed: this.laser.elapsed, dir: this.laser.dir, hit: this.laser.hit } : null, playerStamina: this.player.stamina, enemyStamina: this.enemy.stamina, guardActive: this.player.guarding, enemyGuard: this.enemy.guarding, defense, camera: this.camera.getState(), world: { ...this.world }, positions: { player: { x: this.player.x, y: this.player.y }, enemy: { x: this.enemy.x, y: this.enemy.y } }, enemyMove };
    this.options.onUpdate?.(state);
    window.__arenaDebug = { ...state, player: { x: this.player.x, y: this.player.y, vx: this.player.vx, vy: this.player.vy, jumps: this.player.jumps, grounded: this.player.grounded, action: this.player.action, poseTime: this.player.poseTime, guarding: this.player.guarding, guardTime: this.player.guardTime, guardBroken: this.player.guardBroken, stamina: this.player.stamina, evadeTime: this.player.evadeTime, parryFlash: this.player.parryFlash }, enemy: { x: this.enemy.x, y: this.enemy.y, action: this.enemy.action, guarding: this.enemy.guarding, guardTime: this.enemy.guardTime, guardBroken: this.enemy.guardBroken, stamina: this.enemy.stamina, evadeTime: this.enemy.evadeTime, parryFlash: this.enemy.parryFlash }, projectiles: this.projectiles.length, attacks: combatAttacks(this, true).map(attack => ({ type: attack.kind || attack.type || 'projectile', owner: attack.owner, strength: attack.strength, damage: attack.damage, x: attack.x, y: attack.y, radius: attack.radius, phase: attack.phase, life: attack.life, hit: !!attack.hit })), clashCounts: { ...this.clashCounts }, enemyHeavy: this.enemy.heavy, ghosts: this.effects.filter(fx => fx.type === 'ghost').length };
  }

  loop(now) {
    const dt = Math.max(0, Math.min((now - this.last) / 1000, .067));
    this.last = now;
    this.accumulator += dt;
    // Fixed small steps preserve jump arcs and controls across frame rates.
    while (this.accumulator >= 1 / 120) {
      this.update(1 / 120);
      this.accumulator -= 1 / 120;
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  render() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#080e1c'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    c.save();
    this.drawBackground(c);
    c.save();
    this.camera.apply(c);
    if (this.shake > 0) c.translate(random(-this.shake, this.shake) / this.camera.zoom, random(-this.shake * .5, this.shake * .5) / this.camera.zoom);
    for (const platform of [...this.platforms].sort((a, b) => a.y - b.y)) this.drawPlatform(c, platform);
    // Floating atmospheric specks keep the arena alive between rounds.
    for (const a of this.ambient) {
      const y = (a.y - this.clock * a.speed % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      c.globalAlpha = .2 + .3 * Math.sin(this.clock + a.phase) ** 2;
      c.fillStyle = a.phase % 3 < 1 ? '#bca4ff' : '#a5c7f5';
      c.fillRect(a.x + Math.sin(this.clock * .2 + a.phase) * 14, y, a.size, a.size);
    }
    c.globalAlpha = 1;
    for (const fx of this.effects) if (fx.type === 'ghost') this.drawFighter(c, this.player, true, fx);
    this.drawFighter(c, this.player, true);
    this.drawFighter(c, this.enemy, false);
    drawDefense(c, this.player, true, this.clock);
    drawDefense(c, this.enemy, false, this.clock);
    drawCombatSpecials(c, this);
    drawEnemySpecials(c, this);
    for (const shot of this.projectiles) this.drawProjectile(c, shot);
    this.drawLaser(c);
    for (const fx of this.effects) this.drawEffect(c, fx);
    if (this.enemy.charge > 0 && this.mode === 'playing') {
      const e = this.enemy, p = this.player;
      c.save(); c.globalAlpha = .2 + Math.sin(this.clock * 35) * .12; c.strokeStyle = '#aaff54'; c.lineWidth = 2; c.setLineDash([8, 12]);
      c.beginPath(); c.moveTo(e.x + e.dir * 38, e.y - 72); c.lineTo(p.x, p.y - 65); c.stroke(); c.restore();
      const duration = e.heavy ? (this.difficulty === 'hard' ? .7 : .95) : (this.difficulty === 'hard' ? .48 : .7);
      const chargeProgress = clamp(1 - e.charge / duration, 0, 1);
      const radius = (e.heavy ? 19 : 12) + chargeProgress * (e.heavy ? 27 : 21);
      this.glow(c, e.x + e.dir * 38, e.y - 72, radius * 2.5, '#aaff4f', .6);
      c.strokeStyle = '#d3ff9b'; c.lineWidth = 2; c.beginPath(); c.arc(e.x + e.dir * 38, e.y - 72, radius, 0, Math.PI * 2); c.stroke();
      if (e.heavy) {
        c.save(); c.fillStyle = '#dcffab'; c.textAlign = 'center'; c.font = '700 10px Arial';
        c.shadowColor = '#10210b'; c.shadowBlur = 8;
        c.fillText('HEAVY · POWER II', e.x, e.y - 184);
        c.restore();
      }
    }
    for (const a of this.particles) {
      c.globalAlpha = clamp(a.life / a.max, 0, 1); c.fillStyle = a.color; c.shadowColor = a.color; c.shadowBlur = 8;
      c.fillRect(a.x, a.y, a.size, a.size * .65);
    }
    c.shadowBlur = 0; c.globalAlpha = 1;
    for (const a of this.floaters) {
      c.globalAlpha = Math.min(1, a.life * 3); c.fillStyle = a.color; c.font = '700 22px "Arial", sans-serif'; c.textAlign = 'center'; c.shadowColor = '#000'; c.shadowBlur = 8; c.fillText(a.text, a.x, a.y);
    }
    c.shadowBlur = 0; c.globalAlpha = 1;
    c.restore(); // Back to virtual screen space for intro, combo, flash, and vignette.
    if (this.combo > 1 && this.mode === 'playing') {
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = 'italic 800 34px Arial'; c.fillText(`${this.combo} HITS`, 50, 110);
      c.fillStyle = '#ff5269'; c.font = '700 11px Arial'; c.fillText(this.combo > 4 ? 'RELENTLESS' : 'BLADE COMBO', 52, 131);
    }
    if (this.time < 2.5 && this.mode === 'playing') {
      c.globalAlpha = Math.min(1, this.time * 2, (2.5 - this.time) * 2); c.textAlign = 'center';
      c.font = 'italic 900 44px Arial'; c.fillStyle = '#f3f0ff'; c.shadowColor = '#6d5bcc'; c.shadowBlur = 25; c.fillText('BREAK THE SILENCE.', WIDTH / 2, 155); c.shadowBlur = 0; c.globalAlpha = 1;
    }
    if (this.flash > 0) { c.globalAlpha = this.flash * 1.8; c.fillStyle = '#ff718c'; c.fillRect(0, 0, WIDTH, HEIGHT); c.globalAlpha = 1; }
    const vignette = c.createRadialGradient(WIDTH / 2, HEIGHT * .48, 280, WIDTH / 2, HEIGHT * .48, 850);
    vignette.addColorStop(0, '#02061300'); vignette.addColorStop(1, '#020611aa'); c.fillStyle = vignette; c.fillRect(0, 0, WIDTH, HEIGHT);
    c.restore();
  }

  drawBackground(c) {
    if (this.assets.arena) {
      const parallax = (this.camera.x / WORLD_WIDTH - .5) * 38;
      c.drawImage(this.assets.arena, -24 - parallax, -12, WIDTH + 48, HEIGHT + 24); return;
    }
    const sky = c.createLinearGradient(0, 0, 0, HEIGHT); sky.addColorStop(0, '#0b152d'); sky.addColorStop(.55, '#294e70'); sky.addColorStop(1, '#101a33'); c.fillStyle = sky; c.fillRect(0, 0, WIDTH, HEIGHT);
    this.glow(c, 790, 270, 480, '#4c789e', .4);
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = ['#1c3653', '#142b48', '#101f3a'][layer];
      for (let i = 0; i < 10; i++) {
        const x = i * 176 - 60 + layer * 53, base = 560 + layer * 90, h = 180 + Math.sin(i * 7 + layer * 4) * 125;
        c.beginPath(); c.moveTo(x - 90, base + 70); c.lineTo(x - 26, base - h + 40); c.lineTo(x, base - h); c.lineTo(x + 38, base - h + 85); c.lineTo(x + 95, base + 70); c.closePath(); c.fill();
        c.fillStyle = ['#2b4864', '#1d3854', '#172b45'][layer]; c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + 38, base - h + 85); c.lineTo(x + 20, base + 30); c.closePath(); c.fill(); c.fillStyle = ['#1c3653', '#142b48', '#101f3a'][layer];
      }
    }
    const mist = c.createLinearGradient(0, 420, 0, 780); mist.addColorStop(0, '#7e9bc300'); mist.addColorStop(.5, '#7e9bc322'); mist.addColorStop(1, '#14213900'); c.fillStyle = mist; c.fillRect(0, 420, WIDTH, 360);
    for (let i = 0; i < 13; i++) {
      const x = (i * 283 + 100) % WIDTH, y = 80 + (i * 113) % 480, size = 10 + (i % 4) * 7;
      c.save(); c.translate(x, y + Math.sin(this.clock * .35 + i) * 7); c.rotate(.4 * Math.sin(i)); c.fillStyle = '#1b304b'; c.beginPath(); c.moveTo(-size, 0); c.lineTo(0, -size); c.lineTo(size * .7, -size * .4); c.lineTo(size * .3, size * 1.3); c.closePath(); c.fill(); c.strokeStyle = '#52678366'; c.stroke(); c.restore();
    }
  }

  drawPlatform(c, p) {
    const { x, y, w, depth: d, seed } = p;
    // Stable, uneven geometry gives every island a unique fractured silhouette.
    // These vertices are purely visual; the existing collision surface is y.
    if (!p.rock) {
      const noise = n => { const value = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return value - Math.floor(value); };
      const count = Math.max(5, Math.round(w / 71));
      const edge = [], bottom = [], rear = [], middle = [];
      for (let i = 0; i <= count; i++) {
        const fraction = i === 0 ? 0 : i === count ? 1 : (i + (noise(i + 2) - .5) * .65) / count;
        const xx = fraction * w;
        edge.push([xx, 7 + noise(i + 23) * 12]);
        const taper = .25 + .75 * Math.sin(fraction * Math.PI) ** .45;
        bottom.push([clamp(xx + (noise(i + 77) - .5) * 48, 0, w), d * (.35 + noise(i + 43) * .8) * taper + 15]);
        rear.push([clamp(xx + (noise(i + 121) - .5) * 34, 0, w), -5 - noise(i + 151) * 13]);
        middle.push([clamp(xx + (noise(i + 190) - .5) * 29, 0, w), -2 + noise(i + 211) * 8]);
      }
      rear[0] = [15, -2]; rear[count] = [w - 14, -3];
      bottom[0] = [19, 29]; bottom[count] = [w - 18, 28];
      const facets = [], slabs = [], cracks = [], flecks = [];
      const sideColors = ['#192238', '#252e48', '#313b55', '#1b253b', '#36405a', '#10192c', '#222b43', '#141c31'];
      const topColors = ['#75839d', '#566783', '#65738f', '#8b96ad', '#485b79', '#667691', '#7b87a0'];
      for (let i = 0; i < count; i++) {
        const a = edge[i], b = edge[i + 1], downA = bottom[i], downB = bottom[i + 1];
        const pivot = [lerp(a[0], b[0], .25 + noise(i + 250) * .5), lerp(a[1], Math.max(downA[1], downB[1]), .25 + noise(i + 270) * .35)];
        facets.push({ points: [a, b, pivot], color: sideColors[Math.floor(noise(i + 300) * sideColors.length)] });
        facets.push({ points: [a, pivot, downA], color: sideColors[Math.floor(noise(i + 320) * sideColors.length)] });
        facets.push({ points: [pivot, b, downB], color: sideColors[Math.floor(noise(i + 340) * sideColors.length)] });
        facets.push({ points: [downA, pivot, downB], color: sideColors[Math.floor(noise(i + 360) * sideColors.length)] });
        slabs.push({ points: [rear[i], rear[i + 1], middle[i + 1], middle[i]], color: topColors[Math.floor(noise(i + 400) * topColors.length)] });
        slabs.push({ points: [middle[i], middle[i + 1], b, a], color: topColors[Math.floor(noise(i + 420) * topColors.length)] });
        if (noise(i + 450) > .61) slabs.push({ points: [middle[i], [a[0] + (b[0] - a[0]) * .43, a[1] - 1], a], color: '#35465f' });
        if (i > 0 && i < count - 1 && noise(i + 480) > .42) {
          const start = [lerp(rear[i][0], rear[i + 1][0], .2), lerp(rear[i][1], rear[i + 1][1], .2)];
          const bend = [a[0] + (b[0] - a[0]) * .3, 1];
          const lip = [a[0] + (b[0] - a[0]) * .52, a[1] - 1];
          const tip = [lerp(pivot[0], downA[0], .43), lerp(pivot[1], downA[1], .74)];
          cracks.push([start, bend, lip, [pivot[0] + 5, pivot[1] * .78], [pivot[0] - 2, pivot[1] + 5], tip]);
        }
        for (let j = 0; j < 2; j++) {
          const xx = lerp(a[0], b[0], noise(i * 3 + j + 510));
          flecks.push([[xx, noise(i * 2 + j + 530) * 9 - 7], [xx + 8 + noise(i + j + 540) * 14, noise(i + j + 550) * 8 - 5]]);
        }
      }
      p.rock = { edge, bottom, rear, facets, slabs, cracks, flecks };
    }
    const r = p.rock;
    const path = points => { c.beginPath(); points.forEach(([xx, yy], i) => i ? c.lineTo(xx, yy) : c.moveTo(xx, yy)); };
    const polygon = (points, fill) => { path(points); c.closePath(); c.fillStyle = fill; c.fill(); };
    c.save(); c.translate(x, y);
    this.glow(c, w * .48, d * .5, Math.min(w * .55, 180), '#7954d3', .18);
    polygon([...r.edge, ...[...r.bottom].reverse()], '#11192b');
    for (const facet of r.facets) {
      polygon(facet.points, facet.color);
      c.strokeStyle = '#070f2090'; c.lineWidth = .8; c.stroke();
      // Thin mineral highlights follow angled fracture planes, never vertical tiles.
      path([facet.points[0], facet.points[1]]); c.strokeStyle = '#8595b526'; c.lineWidth = .8; c.stroke();
    }
    polygon([...r.rear, ...[...r.edge].reverse()], '#4a5b78');
    for (const slab of r.slabs) {
      polygon(slab.points, slab.color);
      c.lineWidth = 1.8; c.strokeStyle = '#1b2a4390'; c.stroke();
      path([slab.points[0], slab.points[1]]); c.strokeStyle = '#c3d0e27a'; c.lineWidth = 1.1; c.stroke();
    }
    for (const line of r.flecks) { path(line); c.strokeStyle = '#d2d7e560'; c.lineWidth = 1; c.stroke(); }
    for (const crack of r.cracks) {
      path(crack); c.strokeStyle = '#301552'; c.lineWidth = 7; c.stroke();
      c.shadowColor = '#9a5dff'; c.shadowBlur = 17;
      path(crack); c.strokeStyle = '#a76bff'; c.lineWidth = 3.2; c.stroke();
      c.shadowBlur = 0; path(crack); c.strokeStyle = '#e7c1ff'; c.lineWidth = 1.2; c.stroke();
      // A smaller branching fissure breaks away from the main crystal vein.
      path([crack[2], [crack[2][0] + 13, crack[2][1] + 9], [crack[2][0] + 23, crack[2][1] + 6]]);
      c.strokeStyle = '#a36bf3'; c.lineWidth = 1.4; c.stroke();
    }
    c.restore();
  }

  drawFighter(c, actor, isPlayer, ghost) {
    const x = ghost?.x ?? actor.x, y = ghost?.y ?? actor.y;
    const pose = ghost ? { ...actor, ...ghost } : actor;
    const color = isPlayer ? '#ff354f' : '#9cff53';
    const running = pose.action === 'run';
    const useAtlas = isPlayer && this.assets['x-man-atlas'];
    const bob = pose.grounded ? Math.sin((ghost?.poseTime ?? this.clock) * (running ? 19 : 3)) * (running ? 1.5 : .7) : 0;
    c.save();
    if (!ghost) {
      c.globalAlpha = .4; c.fillStyle = '#030815'; c.beginPath(); c.ellipse(x, y + 4, 42, 8, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      this.glow(c, x, y - 54, 89, color, actor.action === 'burst' ? .4 : .08);
    }
    c.translate(x, y + bob);
    const facing = ghost?.dir ?? actor.dir;
    c.scale(facing, 1);
    if (pose.action === 'defeat') { c.translate(10, -15); c.rotate(1.2); c.globalAlpha = .6; }
    if (running && !useAtlas) c.rotate(.09);
    if (pose.action === 'slash') c.rotate(Math.sin(pose.actionTime * 20) * .075);
    if (pose.action === 'hurt') c.rotate(-.1);
    if (ghost && !useAtlas) c.globalAlpha = ghost.life / ghost.max * .3;
    else if (!ghost && actor.invincible > 0 && actor.action !== 'burst') c.globalAlpha = .55 + Math.sin(this.clock * 60) * .25;
    const img = this.assets[isPlayer ? 'x-man' : 'y-man'];
    if (useAtlas) {
      drawXMan(c, this.assets['x-man-atlas'], actor, this.clock, ghost);
    } else if (img) {
      c.shadowColor = color; c.shadowBlur = actor.action === 'burst' ? 26 : 9;
      c.drawImage(img, -67, -142, 134, 145);
      c.shadowBlur = 0;
    } else this.drawFallbackFighter(c, isPlayer, actor);
    c.restore();
    if (!ghost && actor.hp > 0) {
      c.textAlign = 'center'; c.font = '700 10px Arial'; c.fillStyle = isPlayer ? '#ff9ba7' : '#c3edab'; c.globalAlpha = .92;
      const labelY = useAtlas ? y - 177 : y - 161;
      c.fillText(isPlayer ? 'YOU' : 'CPU', x, labelY);
      c.fillStyle = '#080e1b99'; c.fillRect(x - 21, labelY + 9, 42, 3); c.fillStyle = color; c.fillRect(x - 21, labelY + 9, 42 * actor.hp / 100, 3); c.globalAlpha = 1;
    }
  }

  drawFallbackFighter(c, isPlayer, actor) {
    const color = isPlayer ? '#ff374d' : '#96ff4c', metal = isPlayer ? '#bcc4d6' : '#cfb874';
    const poly = (points, fill, stroke = '#101625') => { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); };
    // Separate silhouette pieces make motion legible even if external assets fail.
    if (isPlayer) poly([[-22, -103], [-66, -76], [-54, -54], [-86, -42], [-33, -48], [-17, -77]], '#902131');
    const run = actor.action === 'run' ? Math.sin(this.clock * 18) * 10 : 0;
    c.save(); c.translate(-19, -42); c.rotate(run * .028); poly([[-11, -8], [11, -5], [8, 26], [17, 39], [-15, 39], [-10, 22]], '#273044'); poly([[-7, 6], [7, 10], [4, 28], [-10, 27]], metal); c.restore();
    c.save(); c.translate(19, -42); c.rotate(-run * .028); poly([[-10, -8], [12, -5], [7, 26], [19, 39], [-13, 39], [-9, 21]], '#273044'); poly([[-4, 4], [9, 8], [4, 26], [-9, 28]], metal); c.restore();
    poly([[-27, -101], [0, -113], [28, -99], [18, -52], [0, -42], [-18, -53]], '#1a2230');
    poly([[-24, -104], [-47, -118], [-36, -83], [-25, -78], [-16, -91]], metal);
    poly([[25, -104], [47, -118], [35, -83], [24, -78], [16, -91]], metal);
    poly([[-34, -86], [-44, -57], [-33, -40], [-23, -55], [-23, -83]], '#384258');
    poly([[34, -86], [44, -57], [34, -39], [22, -54], [23, -83]], '#384258');
    if (isPlayer) { poly([[-44, -63], [-64, -34], [-36, -44], [-28, -61]], metal); poly([[35, -67], [64, -27], [45, -35], [27, -61]], metal); }
    poly([[-18, -132], [0, -143], [18, -132], [13, -111], [0, -104], [-13, -112]], '#283247');
    poly([[-18, -130], [-27, -153], [-4, -135], [0, -128]], metal); poly([[18, -130], [27, -153], [4, -135], [0, -128]], metal);
    c.shadowColor = color; c.shadowBlur = 12;
    poly([[-13, -127], [0, -118], [13, -127], [7, -115], [0, -111], [-7, -115]], color, color);
    c.strokeStyle = color; c.lineWidth = 6; c.beginPath();
    if (isPlayer) { c.moveTo(-15, -96); c.lineTo(15, -64); c.moveTo(15, -96); c.lineTo(-15, -64); }
    else { c.moveTo(-17, -98); c.lineTo(0, -82); c.lineTo(17, -98); c.moveTo(0, -82); c.lineTo(0, -62); }
    c.stroke(); c.shadowBlur = 0;
    if (!isPlayer) {
      c.strokeStyle = '#b59b50'; c.lineWidth = 5; c.beginPath(); c.moveTo(-25, -104); c.lineTo(-46, -140); c.lineTo(-43, -163); c.moveTo(-38, -126); c.lineTo(-62, -133); c.moveTo(25, -104); c.lineTo(46, -140); c.lineTo(43, -163); c.moveTo(38, -126); c.lineTo(62, -133); c.stroke();
      for (const [x, y] of [[-43, -166], [-63, -136], [43, -166], [63, -136]]) poly([[x, y], [x - 5, y - 12], [x + 5, y - 8]], color, '#457735');
    }
  }

  drawProjectile(c, a) {
    if (drawEnemyProjectile(c, a, this.clock) || drawAttackProjectile(c, a, this.clock)) return;
    const player = a.owner === 'player', color = player ? '#ff3655' : '#a3ff57';
    c.save(); c.translate(a.x, a.y);
    this.glow(c, 0, 0, a.radius * 2.8, color, .5);
    c.rotate(a.rotation);
    c.shadowColor = color; c.shadowBlur = 16;
    c.strokeStyle = color; c.lineWidth = player ? 6 : 3;
    c.beginPath();
    if (player) { c.moveTo(-21, -21); c.lineTo(21, 21); c.moveTo(-21, 21); c.lineTo(21, -21); }
    else { c.moveTo(0, -21); c.lineTo(15, 0); c.lineTo(0, 21); c.lineTo(-15, 0); c.closePath(); c.fillStyle = '#8aff3988'; c.fill(); }
    c.stroke(); c.lineWidth = 2; c.strokeStyle = '#f5ffe4'; c.stroke(); c.restore();
  }

  drawLaser(c) {
    const beam = this.laser;
    if (!beam) return;
    const charging = beam.phase === 'charging';
    const charge = clamp(beam.elapsed / .32, 0, 1);
    const t = Math.max(0, beam.elapsed - .32);
    const envelope = charging ? charge : Math.min(1, t * 30, (.5 - t) * 12);
    c.save();
    c.translate(beam.x, beam.y);
    c.scale(beam.dir, 1);
    this.glow(c, 0, 0, 50 + charge * 55, '#ff264c', charging ? .3 + charge * .35 : .6 * envelope);
    if (charging) {
      c.strokeStyle = '#ff8799'; c.lineWidth = 2; c.shadowColor = '#ff244b'; c.shadowBlur = 15;
      c.beginPath(); c.arc(0, 0, 27 - charge * 13, this.clock * 5, this.clock * 5 + Math.PI * 1.7); c.stroke();
      c.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7 + this.clock * 2;
        const r = 21 + (1 - charge) * 45;
        c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12)); c.stroke();
      }
      c.fillStyle = '#fff0f4'; c.beginPath(); c.arc(0, 0, 3 + charge * 8, 0, Math.PI * 2); c.fill();
      c.restore(); return;
    }
    const length = beam.dir > 0 ? WORLD_WIDTH - beam.x + 40 : beam.x + 40;
    const half = (26 + Math.sin(this.clock * 80) * 2) * Math.max(.05, envelope);
    c.globalAlpha = Math.max(0, envelope);
    const halo = c.createLinearGradient(0, -half * 2.8, 0, half * 2.8);
    halo.addColorStop(0, '#ff123800'); halo.addColorStop(.3, '#ff123844'); halo.addColorStop(.5, '#ff527bd0'); halo.addColorStop(.7, '#ff123844'); halo.addColorStop(1, '#ff123800');
    c.fillStyle = halo; c.fillRect(0, -half * 2.8, length, half * 5.6);
    c.shadowColor = '#ff1747'; c.shadowBlur = 24;
    c.fillStyle = '#ff244dc9';
    c.beginPath(); c.moveTo(0, -half * .7); c.lineTo(28, -half); c.lineTo(length, -half * .74); c.lineTo(length, half * .74); c.lineTo(28, half); c.lineTo(0, half * .7); c.closePath(); c.fill();
    c.shadowBlur = 12; c.fillStyle = '#ff9aae'; c.fillRect(0, -half * .45, length, half * .9);
    c.shadowColor = '#fff3f7'; c.fillStyle = '#fff4f7'; c.fillRect(0, -half * .17, length, half * .34);
    c.shadowBlur = 0;
    c.strokeStyle = '#ffbcc9'; c.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const xx = ((i * 197 + t * 1400) % (length + 180)) - 90;
      if (xx < 10 || xx > length) continue;
      c.globalAlpha = .25 * envelope;
      c.beginPath(); c.ellipse(xx, 0, 9, half * 1.6, 0, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = envelope;
    c.strokeStyle = '#fff7fa'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, 12, half * 1.35, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff5f7'; c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  drawEffect(c, fx) {
    if (drawDefenseEffect(c, fx, this.clock) || drawClashEffect(c, fx, this.clock)) return;
    if (fx.type === 'ghost') return;
    const progress = 1 - fx.life / fx.max;
    c.save(); c.translate(fx.x, fx.y); c.globalAlpha = Math.min(1, fx.life / fx.max * 2);
    c.strokeStyle = fx.color; c.shadowColor = fx.color; c.shadowBlur = 22;
    if (fx.type === 'slash') {
      c.scale(fx.dir, 1); c.rotate(-.6 + progress * 1.5); c.lineWidth = 11 * (1 - progress) + 2;
      c.beginPath(); c.arc(-22, 0, 95, -1.25, 1.1); c.stroke(); c.lineWidth = 3; c.strokeStyle = '#fff0f1'; c.stroke();
      c.lineWidth = 1; c.strokeStyle = fx.color; c.beginPath(); c.arc(-22, 0, 111, -1.2, .7); c.stroke();
    } else if (fx.type === 'burst') {
      const r = 30 + progress * 540;
      this.glow(c, 0, 0, r, '#ff3a55', .35 * (1 - progress));
      c.lineWidth = 8 * (1 - progress) + 1; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 15 * (1 - progress) + 2; c.beginPath(); c.moveTo(-r * .65, -r * .65); c.lineTo(r * .65, r * .65); c.moveTo(r * .65, -r * .65); c.lineTo(-r * .65, r * .65); c.stroke();
      c.lineWidth = 3; c.strokeStyle = '#ffe6ef'; c.stroke();
    } else if (fx.type === 'jump' || fx.type === 'land') {
      c.scale(1, .25); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 20 + progress * 65, 0, Math.PI * 2); c.stroke();
    } else if (fx.type === 'charge-ring') {
      c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 8 + (1 - progress) * 46, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }

  glow(c, x, y, radius, color, opacity) {
    c.save(); c.globalAlpha *= opacity;
    const g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, radius)); g.addColorStop(0, color); g.addColorStop(1, `${color}00`);
    c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); c.restore();
  }

  unlockAudio() {
    if (!this.sound) return;
    try { if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)(); if (this.audio.state === 'suspended') this.audio.resume(); } catch { /* The game works when browser audio is unavailable. */ }
  }
  tone(start, end, length, type = 'sine', volume = .04) {
    if (!this.sound || !this.audio || this.audio.state !== 'running') return;
    try {
      const osc = this.audio.createOscillator(), gain = this.audio.createGain();
      osc.type = type; osc.frequency.setValueAtTime(start, this.audio.currentTime); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), this.audio.currentTime + length);
      gain.gain.setValueAtTime(volume, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.audio.currentTime + length);
      osc.connect(gain); gain.connect(this.audio.destination); osc.start(); osc.stop(this.audio.currentTime + length);
    } catch { /* Audio is an optional enhancement. */ }
  }

  destroy() {
    cancelAnimationFrame(this.raf); this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur);
    this.audio?.close();
  }
}
