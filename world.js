// Gameplay coordinates are deliberately separate from the 1440×780 viewport.
// The broad continuous island gives running, dodging, and retreating real room.
export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 900;
export const PLAYER_SPAWN = Object.freeze({ x: 1100, y: 660 });
export const ENEMY_SPAWN = Object.freeze({ x: 2100, y: 660 });

export function createPlatforms() {
  // Return fresh objects because the renderer caches each platform's rock mesh.
  return [
    { x: 80, y: 660, w: 3040, depth: 188, seed: 3 },
    { x: 220, y: 440, w: 360, depth: 102, seed: 4 },
    { x: 700, y: 510, w: 300, depth: 78, seed: 2 },
    { x: 1150, y: 330, w: 400, depth: 110, seed: 5 },
    { x: 1430, y: 210, w: 340, depth: 95, seed: 12 },
    { x: 1650, y: 495, w: 300, depth: 82, seed: 9 },
    { x: 2090, y: 350, w: 380, depth: 108, seed: 7 },
    { x: 2600, y: 460, w: 380, depth: 106, seed: 14 },
  ];
}
