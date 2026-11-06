import { ArenaGame } from './game.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const ready = $('ready-overlay');
const overlay = $('match-overlay');
const help = $('controls-dialog');
let lastState = { mode: 'ready', energy: 40, time: 0 };
let sound = false;
let helpWasPlaying = false;
let toastTimer;
let lastClashStamp = null;
const timeLabel = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

const game = new ArenaGame(canvas, {
  onUpdate: updateHUD,
  onPause(paused) {
    if (paused) showPause();
    else overlay.hidden = true;
  },
  onEnd: showResult,
});
game.setSound(false);

function updateHUD(state) {
  lastState = state;
  $('player-hp').textContent = Math.ceil(state.playerHealth);
  $('enemy-hp').textContent = Math.ceil(state.enemyHealth);
  $('player-health').style.width = `${state.playerHealth}%`;
  $('enemy-health').style.width = `${state.enemyHealth}%`;
  const stamina = Math.max(0, Math.min(100, state.playerStamina ?? 100));
  const enemyStamina = Math.max(0, Math.min(100, state.enemyStamina ?? 100));
  $('player-stamina').style.width = `${stamina}%`;
  $('enemy-stamina').style.width = `${enemyStamina}%`;
  $('player-stamina-value').textContent = Math.ceil(stamina);
  $('enemy-stamina-value').textContent = Math.ceil(enemyStamina);
  $('stamina-label').textContent = `${Math.ceil(stamina)} / 100`;
  $('defense-stamina-fill').style.width = `${stamina}%`;
  const playerDefense = state.defense?.player;
  const enemyDefense = state.defense?.enemy;
  $('player-guard-status').textContent = playerDefense?.guardBroken > 0 ? 'BROKEN' : state.guardActive ? 'BLOCKING' : playerDefense?.evadeTime > 0 ? 'EVADING' : 'GUARD';
  $('enemy-guard-status').textContent = enemyDefense?.guardBroken > 0 ? 'BROKEN' : state.enemyGuard ? 'BLOCKING' : enemyDefense?.evadeTime > 0 ? 'EVADING' : 'GUARD';
  $('guard-description').textContent = playerDefense?.guardBroken > 0 ? 'Guard broken · recovering' : state.guardActive ? 'Guard raised · release to recover' : 'Hold to block · time a parry';
  $('evade-description').textContent = state.cooldowns?.evade > 0 ? `Recovering · ${state.cooldowns.evade.toFixed(1)}s` : 'Reposition · 20 stamina';
  document.querySelectorAll('[data-guard]').forEach(button => {
    button.classList.toggle('guard-raised', !!state.guardActive);
    button.setAttribute('aria-pressed', String(!!state.guardActive));
  });
  document.body.classList.toggle('battle-active', state.mode === 'playing');
  const zoom = state.camera?.zoom ?? 1;
  $('camera-zoom').textContent = `${zoom.toFixed(2)}×`;
  const worldWidth = state.world?.width || 3200;
  $('world-span').textContent = worldWidth.toLocaleString('en-US');
  if (state.positions) {
    $('map-player').style.left = `${state.positions.player.x / worldWidth * 100}%`;
    $('map-enemy').style.left = `${state.positions.enemy.x / worldWidth * 100}%`;
  }
  const visibleWidth = (state.camera?.viewWidth || 1440) / zoom;
  const mapLeft = Math.max(0, (state.camera?.x ?? worldWidth / 2) - visibleWidth / 2) / worldWidth * 100;
  $('map-camera').style.left = `${mapLeft}%`;
  $('map-camera').style.width = `${Math.min(100 - mapLeft, visibleWidth / worldWidth * 100)}%`;
  const moves = { crescent: 'VERDANT CRESCENT', flame: 'SPIRIT FLAME', volley: 'THORN VOLLEY', heavy: 'HEAVY BLAST', blast: 'ENERGY BLAST', guard: 'BRANCH GUARD', evade: 'EVASIVE STEP', hunting: 'HUNTING' };
  $('enemy-move').textContent = state.enemyGuard ? 'BRANCH GUARD' : enemyDefense?.evadeTime > 0 ? 'EVASIVE STEP' : moves[state.enemyMove] || state.enemyMove || 'HUNTING';
  $('enemy-intent').classList.toggle('intent-defending', !!state.enemyGuard || enemyDefense?.evadeTime > 0);
  $('energy-value').textContent = Math.floor(state.energy);
  $('battle-time').textContent = timeLabel(state.time);
  $('burst-charge').style.width = `${state.energy}%`;
  const burst = document.querySelector('[data-ability="burst"]');
  burst.classList.toggle('charged', state.energy >= 100);
  $('burst-description').textContent = state.energy >= 100 ? 'READY TO UNLEASH' : `Energy ${Math.floor(state.energy)}%`;
  $('combo-display').textContent = state.combo >= 2 ? `${state.combo} HIT COMBO` : '';
  const labels = { ready: 'AWAITING CHALLENGER', playing: 'BATTLE IN PROGRESS', paused: 'BATTLE PAUSED', ended: 'BATTLE COMPLETE' };
  $('session-status').textContent = labels[state.mode] || '';
  $('pause-button').hidden = state.mode !== 'playing';
  $('battle-hint').textContent = state.mode === 'ready' ? 'YOUR FIGHT. YOUR RULES.' : state.energy >= 100 ? 'X–BURST CHARGED · PRESS L' : 'STAY SHARP. STAY MOVING.';
  const max = { slash: .38, cross: 1.25, orbit: 3.2, laser: 4, nova: 5.5, dash: 1.45, evade: 2.2 };
  const laser = state.laser;
  $('laser-description').textContent = laser?.phase === 'charging' ? 'Charging…' : laser?.phase === 'firing' ? 'BEAM ACTIVE' : state.cooldowns?.laser > 0 ? `${state.cooldowns.laser.toFixed(1)}s cooldown` : 'Piercing beam';
  document.querySelector('[data-ability="laser"]').classList.toggle('firing', !!laser);
  for (const [key, seconds] of Object.entries(state.cooldowns || {})) {
    const button = document.querySelector(`[data-ability="${key}"]`);
    if (!button) continue;
    button.classList.toggle('on-cooldown', seconds > 0);
    if (key !== 'burst') button.querySelector('.cooldown-bar').style.width = `${Math.min(100, seconds / max[key] * 100)}%`;
  }
  const clash = state.clash;
  const recent = clash && state.time - clash.time < 1.1 && state.mode === 'playing';
  $('clash-banner').hidden = !recent;
  const clashStamp = recent ? `${clash.time}:${clash.outcome}:${clash.winner}` : null;
  if (recent && clashStamp !== lastClashStamp) {
    const cancel = clash.outcome === 'cancel';
    $('clash-banner').dataset.outcome = cancel ? 'cancel' : clash.winner === 'enemy' ? 'enemy-break' : 'player-break';
    $('clash-banner-label').textContent = cancel ? 'ATTACKS COLLIDED' : clash.winner === 'enemy' ? 'Y–MAN OVERPOWERS' : 'X–MAN OVERPOWERS';
    $('clash-banner-title').textContent = cancel ? 'CANCELLED' : 'BREAKTHROUGH';
    $('clash-banner-detail').textContent = cancel ? 'EQUAL POWER · NO DAMAGE' : 'STRONGER ATTACK CONTINUES';
  }
  lastClashStamp = clashStamp;
  const counts = state.clashes;
  const total = counts ? counts.cancels + counts.breakthroughs : 0;
  $('clash-total').textContent = total > 0 ? `${total} CLASH${total === 1 ? '' : 'ES'} THIS ROUND` : 'TIME YOUR COUNTER.';
}

function start() {
  ready.hidden = true;
  overlay.hidden = true;
  game.start();
  canvas.focus({ preventScroll: true });
}
function restart() {
  ready.hidden = true;
  overlay.hidden = true;
  game.restart();
  canvas.focus({ preventScroll: true });
}
function showPause() {
  $('match-eyebrow').textContent = 'BATTLE PAUSED';
  $('match-title').textContent = 'CATCH YOUR BREATH.';
  $('match-description').textContent = 'The battlefield can wait. Your opponent won’t.';
  $('match-stats').hidden = true;
  $('resume-button').innerHTML = 'BACK TO BATTLE <svg class="icon"><use href="#i-play"/></svg>';
  $('resume-button').dataset.action = 'resume';
  overlay.hidden = false;
  if (!help.open) $('resume-button').focus({ preventScroll: true });
}
function showResult(result) {
  ready.hidden = true;
  $('match-eyebrow').textContent = result.victory ? 'THE BLADE PREVAILS' : 'THE BRANCH STRIKES BACK';
  $('match-title').textContent = result.victory ? 'VICTORY IS YOURS.' : 'BENT. NOT BROKEN.';
  $('match-description').textContent = result.victory ? 'Y-Man has fallen. The shattered sky belongs to you.' : 'Y-Man won this round. Come back with a sharper edge.';
  $('match-stats').hidden = false;
  $('match-stats').replaceChildren(...[
    [timeLabel(result.time), 'BATTLE TIME'],
    [`${result.bestCombo} HIT`, 'BEST COMBO'],
    [String(Math.ceil(result.playerHealth)), 'HEALTH LEFT'],
  ].map(([value, label]) => {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    strong.textContent = value; span.textContent = label;
    div.append(strong, span); return div;
  }));
  $('resume-button').innerHTML = 'FIGHT AGAIN <svg class="icon"><use href="#i-arrow"/></svg>';
  $('resume-button').dataset.action = 'restart';
  overlay.hidden = false;
  $('resume-button').focus({ preventScroll: true });
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}
function openHelp() {
  if (help.open) return;
  helpWasPlaying = lastState.mode === 'playing';
  if (helpWasPlaying) game.pause();
  help.showModal();
}
function closeHelp() {
  if (help.open) help.close();
}
help.addEventListener('close', () => {
  if (helpWasPlaying) { game.resume(); canvas.focus({ preventScroll: true }); }
  helpWasPlaying = false;
});
help.addEventListener('cancel', (event) => { event.preventDefault(); closeHelp(); });
help.addEventListener('click', (event) => {
  if (event.target === help) {
    const bounds = help.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeHelp();
  }
});
$('nav-controls').addEventListener('click', openHelp);
$('controls-button').addEventListener('click', openHelp);
document.querySelector('.dialog-close').addEventListener('click', closeHelp);
document.querySelector('.dialog-done').addEventListener('click', closeHelp);
$('start-button').addEventListener('click', start);
$('restart-button').addEventListener('click', restart);
$('resume-button').addEventListener('click', () => {
  if ($('resume-button').dataset.action === 'restart') restart();
  else { game.resume(); canvas.focus({ preventScroll: true }); }
});
$('pause-button').addEventListener('click', () => game.pause());
$('sound-button').addEventListener('click', () => {
  sound = !sound;
  game.setSound(sound);
  if (sound && lastState.mode === 'playing') game.unlockAudio();
  $('sound-button').querySelector('use').setAttribute('href', sound ? '#i-sound' : '#i-mute');
  $('sound-button').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound');
  $('sound-button').title = sound ? 'Mute sound' : 'Enable sound';
  toast(sound ? 'Battle audio enabled' : 'Battle audio muted');
});
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.game-shell').requestFullscreen();
  } catch { toast('Fullscreen is unavailable in this browser.'); }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Toggle fullscreen');
});
document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
  const hard = button.dataset.difficulty === 'hard';
  game.setDifficulty(button.dataset.difficulty);
  document.querySelectorAll('[data-difficulty]').forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  $('enemy-difficulty').textContent = hard ? 'RELENTLESS COMBAT' : 'ADAPTIVE COMBAT';
  toast(hard ? 'Relentless mode · faster pursuit, heavier blasts' : 'Normal mode · the hunt is on');
}));
function useAbility(type) {
  if (lastState.mode !== 'playing') {
    if (lastState.mode === 'ready') toast('Enter the arena to use your abilities.');
    return;
  }
  if (type === 'burst' && lastState.energy < 100) toast('X-Burst needs 100% energy. Land attacks to charge it.');
  if (type === 'evade') {
    if (lastState.playerStamina < 20) toast('Evading needs 20 stamina. Release guard to recover.');
    game.evade();
  } else if (type === 'dash') game.dash();
  else game.attack(type);
  canvas.focus({ preventScroll: true });
}
document.querySelectorAll('[data-ability]').forEach(button => button.addEventListener('click', () => useAbility(button.dataset.ability)));
document.querySelectorAll('[data-touch-attack]').forEach(button => button.addEventListener('pointerdown', event => { event.preventDefault(); useAbility(button.dataset.touchAttack); }));
document.querySelectorAll('[data-move]').forEach(button => {
  const direction = button.dataset.move === 'left' ? -1 : 1;
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); game.move(direction, true); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => game.move(direction, false));
});
$('touch-jump').addEventListener('pointerdown', event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); game.jump(); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-jump').addEventListener(name, () => game.releaseJump());
document.querySelectorAll('[data-guard]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (lastState.mode === 'playing') game.guard(true);
    else if (lastState.mode === 'ready') toast('Enter the arena to raise your guard.');
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => game.guard(false));
  button.addEventListener('keydown', event => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) game.guard(true);
    }
  });
  button.addEventListener('keyup', event => {
    if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); event.stopPropagation(); game.guard(false); }
  });
  button.addEventListener('blur', () => game.guard(false));
});
// Capture modal keys before they reach the arena's global controls.
document.addEventListener('keydown', event => {
  if (help.open) {
    if (event.code === 'Escape') { event.preventDefault(); closeHelp(); }
    if (event.code !== 'Tab') event.stopPropagation();
    return;
  }
  if (event.code === 'Enter' && lastState.mode === 'ready' && event.target.tagName !== 'BUTTON') { event.preventDefault(); start(); }
  if (event.code === 'KeyH' || (event.code === 'Slash' && event.shiftKey)) { event.preventDefault(); openHelp(); }
}, true);
document.addEventListener('visibilitychange', () => { if (document.hidden && lastState.mode === 'playing') game.pause(); });
