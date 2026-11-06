import { WORLD_WIDTH, WORLD_HEIGHT } from './world.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (from, to, factor) => from + (to - from) * factor;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export class ArenaCamera {
  constructor({ viewWidth = 1440, viewHeight = 780, worldWidth = WORLD_WIDTH, worldHeight = WORLD_HEIGHT, minZoom = .4, maxZoom = 1.08 } = {}) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.x = worldWidth / 2;
    this.y = worldHeight / 2;
    this.zoom = minZoom;
    this.targetZoom = minZoom;
    this.topInset = Math.min(105, viewHeight * .15);
    this.bottomInset = Math.min(48, viewHeight * .08);
  }

  fighterBounds(player, enemy, lookAhead = false) {
    const fighters = [player, enemy];
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const fighter of fighters) {
      const x = finite(fighter?.x, this.worldWidth / 2);
      const y = finite(fighter?.y, 660);
      // Anticipation starts the pull-back before a running fighter reaches the
      // edge. Actual silhouettes remain the final safety constraint below.
      const aheadX = lookAhead ? clamp(x + finite(fighter?.vx, 0) * .27, 0, this.worldWidth) : x;
      const aheadY = lookAhead ? y + finite(fighter?.vy, 0) * .08 : y;
      left = Math.min(left, x - 90, aheadX - 90);
      right = Math.max(right, x + 90, aheadX + 90);
      top = Math.min(top, y - 200, aheadY - 200);
      bottom = Math.max(bottom, y + 50, aheadY + 50);
    }
    return { left, right, top, bottom };
  }

  targetFor(player, enemy) {
    const bounds = this.fighterBounds(player, enemy, true);
    const safeHeight = this.viewHeight - this.topInset - this.bottomInset;
    const zoom = clamp(Math.min(
      this.viewWidth / (bounds.right - bounds.left + 220),
      safeHeight / (bounds.bottom - bounds.top + 70),
      this.maxZoom,
    ), this.minZoom, this.maxZoom);
    const safeCenter = (this.topInset + this.viewHeight - this.bottomInset) / 2;
    return {
      zoom,
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2 - (safeCenter - this.viewHeight / 2) / zoom,
    };
  }

  reset(player, enemy) {
    const target = this.targetFor(player, enemy);
    this.zoom = target.zoom;
    this.targetZoom = target.zoom;
    this.x = target.x;
    this.y = target.y;
    this.constrain(player, enemy);
    return this.getState();
  }

  update(dt, player, enemy) {
    if (!Number.isFinite(dt) || dt <= 0) return this.getState();
    const target = this.targetFor(player, enemy);
    this.targetZoom = target.zoom;
    // Zooming in is deliberately gentler; separation gets a faster response.
    const response = target.zoom < this.zoom ? 5.4 : 2.8;
    this.zoom = mix(this.zoom, target.zoom, 1 - Math.exp(-Math.min(dt, .1) * response));
    const pan = 1 - Math.exp(-Math.min(dt, .1) * 5.5);
    this.x = mix(this.x, target.x, pan);
    this.y = mix(this.y, target.y, pan);
    this.constrain(player, enemy);
    return this.getState();
  }

  constrain(player, enemy) {
    const bounds = this.fighterBounds(player, enemy);
    const safeHeight = this.viewHeight - this.topInset - this.bottomInset;
    // Smoothness must never strand either fighter offscreen after a fast dash
    // or sudden vertical separation. Normal movement anticipates this limit.
    const visibleFit = Math.min(this.viewWidth / (bounds.right - bounds.left), safeHeight / (bounds.bottom - bounds.top));
    this.zoom = Math.min(this.zoom, visibleFit);
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    const halfWidth = this.viewWidth / (2 * this.zoom);
    const halfHeight = this.viewHeight / (2 * this.zoom);
    this.x = halfWidth * 2 >= this.worldWidth ? this.worldWidth / 2 : clamp(this.x, halfWidth, this.worldWidth - halfWidth);
    this.y = halfHeight * 2 >= this.worldHeight ? this.worldHeight / 2 : clamp(this.y, halfHeight, this.worldHeight - halfHeight);
    // Framing takes priority over the arena edge by just the silhouette margin:
    // a shoulder blade at x=0 or a high jump may extend into the background sky.
    const safeLeft = bounds.right - halfWidth;
    const safeRight = bounds.left + halfWidth;
    this.x = safeLeft <= safeRight ? clamp(this.x, safeLeft, safeRight) : (safeLeft + safeRight) / 2;
    const safeTop = bounds.bottom - (this.viewHeight / 2 - this.bottomInset) / this.zoom;
    const safeBottom = bounds.top + (this.viewHeight / 2 - this.topInset) / this.zoom;
    this.y = safeTop <= safeBottom ? clamp(this.y, safeTop, safeBottom) : (safeTop + safeBottom) / 2;
  }

  apply(context) {
    context.translate(this.viewWidth / 2, this.viewHeight / 2);
    context.scale(this.zoom, this.zoom);
    context.translate(-this.x, -this.y);
  }

  worldToScreen(x, y) {
    return { x: (x - this.x) * this.zoom + this.viewWidth / 2, y: (y - this.y) * this.zoom + this.viewHeight / 2 };
  }

  getState() {
    return { x: this.x, y: this.y, zoom: this.zoom, targetZoom: this.targetZoom, viewWidth: this.viewWidth, viewHeight: this.viewHeight, worldWidth: this.worldWidth, worldHeight: this.worldHeight };
  }
}
