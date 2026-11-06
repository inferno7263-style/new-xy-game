// Original, reference-guided raster poses. Source rectangles never overlap;
// each pose is registered at the pelvis and planted foot instead of its cape.
const FRAMES = [
  { x: 0, y: 0, w: 444, h: 444, ax: 226, ay: 390 },
  { x: 444, y: 0, w: 443, h: 444, ax: 276, ay: 388 },
  { x: 887, y: 0, w: 443, h: 444, ax: 270, ay: 379 },
  { x: 1330, y: 0, w: 444, h: 444, ax: 282, ay: 388 },
  { x: 0, y: 444, w: 444, h: 443, ax: 270, ay: 390 },
  { x: 444, y: 444, w: 443, h: 443, ax: 272, ay: 395 },
  { x: 887, y: 444, w: 443, h: 443, ax: 240, ay: 387 },
  { x: 1330, y: 444, w: 444, h: 443, ax: 240, ay: 391 },
];
const RUN = [1, 2, 3, 2];
const transitions = new WeakMap();

export function xManFrame(pose) {
  if (pose.action === 'laser' || pose.action === 'laser-charge' || pose.action === 'beam') return 7;
  if (['slash', 'cross', 'burst', 'orbit', 'nova'].includes(pose.action)) return 6;
  if (!pose.grounded && pose.action !== 'defeat') return pose.vy > 65 ? 5 : 4;
  if (pose.action === 'run' || (pose.grounded && Math.abs(pose.vx) > 70)) return RUN[Math.floor((pose.poseTime || 0) * 12) % RUN.length];
  return 0;
}

export function drawXMan(context, atlas, actor, clock, ghost) {
  const pose = ghost ? { ...actor, ...ghost } : actor;
  const frame = xManFrame(pose);
  const speed = Math.min(1, Math.abs(pose.vx || 0) / 365);
  const airborne = !pose.grounded;
  const landing = pose.action === 'land' ? Math.max(0, (pose.actionTime || 0) / .16) : 0;
  // Poses supply the main movement. Small additive deformation supplies impact
  // and breathing while keeping the feet attached to the collision position.
  const stretch = airborne ? Math.min(.045, Math.abs(pose.vy || 0) / 18000) : 0;
  const breath = pose.action === 'idle' ? Math.sin((ghost?.poseTime ?? clock) * 3) * .006 : 0;
  context.save();
  context.rotate((pose.vx || 0) * (pose.dir || 1) / 365 * (airborne ? .025 : .035));
  context.scale(1 - stretch * .35 + landing * .08, 1 + stretch + breath - landing * .09);
  if (ghost) {
    context.globalCompositeOperation = 'screen';
    context.globalAlpha *= Math.pow(ghost.life / ghost.max, 1.35) * .44;
    context.filter = 'brightness(1.6) saturate(.65)';
  }
  context.shadowColor = '#ff314d';
  context.shadowBlur = ghost ? 15 : pose.action === 'burst' ? 25 : 4;

  const draw = (index, opacity) => {
    const f = FRAMES[index];
    const scale = .43;
    const alpha = context.globalAlpha;
    context.globalAlpha *= opacity;
    context.drawImage(atlas, f.x, f.y, f.w, f.h, -f.ax * scale, -f.ay * scale, f.w * scale, f.h * scale);
    context.globalAlpha = alpha;
  };

  if (ghost) draw(frame, 1);
  else {
    let visual = transitions.get(actor);
    if (!visual || clock < visual.changed) {
      visual = { frame, previous: frame, changed: clock };
      transitions.set(actor, visual);
    }
    if (visual.frame !== frame) {
      visual.previous = visual.frame;
      visual.frame = frame;
      visual.changed = clock;
    }
    // Brief pose blends hide hard switches without leaving a persistent smear.
    const blend = Math.min(1, Math.max(0, (clock - visual.changed) / (speed > .4 ? .035 : .06)));
    if (blend < 1 && visual.previous !== frame) draw(visual.previous, 1 - blend);
    draw(frame, blend < 1 && visual.previous !== frame ? blend : 1);
  }
  context.restore();
}

export const xManAtlasFrames = FRAMES;
