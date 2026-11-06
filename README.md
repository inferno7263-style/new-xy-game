# Alphabet War — The Shattered Sky

A dependency-free browser platform fighter. Control X-Man against Y-Man’s pursuing, energy-blasting AI across a floating crystal-rock arena. X-Man uses detailed, reference-guided raster artwork with eight separate combat and movement poses. The arena and Y-Man use original SVG artwork.

## Run

Requires Node.js 20 or newer. No package installation or credentials are needed.

```sh
cd new-xy-game
npm run dev
```

The server listens on port 3000 on all interfaces. Override with `PORT=8080 npm run dev` or `npm run dev -- --port 8080`.

## Play

- Move: A / D or arrow keys
- Double jump: Space, W, or Up (press twice; hold for a high jump, release for a short hop)
- Drop through a platform: S / Down
- Blade Slash: J (hold for successive strikes)
- Cross Strike: K (ranged projectile)
- Inferno Orbit: O (power II spinning fire slash, 3.2-second cooldown)
- High Laser: U (0.32-second charge, piercing beam, four-second cooldown)
- Nova Breaker: I (power III explosive projectile, 5.5-second cooldown)
- X-Burst: L (requires 100% energy; hits charge it)
- Phase Dash: Shift (brief invulnerability)
- Blade Guard: hold F (blocks frontal damage; timed raises can parry)
- Evasive Step: E (costs 20 stamina; move in your input direction or step backward)
- Pause: Esc / P. Field manual: H / ?

Click the ability bar or use the touch controls on smaller screens. Use the field manual to select Normal or Relentless AI. Sound starts muted; enable it with the speaker button. Leaving the browser window pauses the game.

Movement uses a 120 Hz fixed simulation, smooth acceleration and braking, coyote time, and buffered jumps. Airborne afterimages freeze the exact movement pose and fade over 0.32 seconds. The laser fires in the direction you were facing when charging began and can cut through hostile blasts; opponents on other platforms can evade it.

## Expanded arena and defenses

The battlefield spans 3,200 world units, with a continuous 3,040-unit main island and seven raised islands. A tracking camera smoothly pulls back when fighters separate and moves closer as they meet, keeping both fighters visible. The HUD remains fixed, and the small arena map shows each fighter’s position.

Both fighters have stamina-based guarding and evasive steps. Guarding reduces frontal damage by 80%; raising guard just before contact allows a perfect parry. Back attacks bypass guard. Holding guard and blocking consume stamina, while releasing guard allows it to regenerate. Exhaustion breaks guard briefly. Evading costs 20 stamina and grants a short window of invulnerability. The AI guards and dodges when threatened rather than keeping its shield up permanently.

Y-Man also uses Verdant Crescent, a curved green projectile; Thorn Volley, a fan of three darts; and Spirit Flame, a ground eruption with a visible warning before it becomes active. These attacks follow the same power and clash rules as X-Man’s moves.

## Attack clashes

Opposing attacks collide before they can damage a fighter. Equal power cancels both attacks; neither canceled attack can cause damage. Higher power destroys the weaker attack and continues with its original power and damage. Attacks from the same fighter do not clash. Crossings between frames are checked, and a later clash cannot undo a hit that already reached a fighter.

| Power | X-Man | Y-Man |
| --- | --- | --- |
| I | Blade Slash, Cross Strike | Normal blast, branch slash, Thorn Volley |
| II | Inferno Orbit | Charged heavy blast, Verdant Crescent, Spirit Flame |
| III | High Laser, Nova Breaker | — |
| IV | Fully charged X-Burst | — |

Power determines clashes; damage is a separate value. For example, Cross Strike and a normal blast cancel because both are power I. A Nova Breaker breaks through that blast and can continue to hit Y-Man. Canceled persistent attacks, including a laser or orbit, stay canceled for their remaining duration. Watch for the `CANCELLED` or `BREAKTHROUGH` arena banner and the bright collision effects.

The two new specials use animated, procedural effects inspired by the supplied examples: an elliptical gold/white-hot spinning blade ribbon and a red/black slash that explodes into a sharp orange impact flare.

## Build

```sh
npm run build
```

Serve the generated `dist/` folder with any static HTTP server. No build dependencies, CDN, API keys, or backend services are required.

Run `npm test` for the combat and physics tests. Browser validation also covers keyboard controls, actual AI damage, modal pause/resume, restart, and the mobile layout.

## Structure

- `game.js`: canvas renderer, fixed world coordinates, platform physics, combat, AI, particles, synthesized audio
- `combat.js`: attack strengths, swept collision geometry, clash and hit ordering
- `combat-effects.js`: animated fiery specials, heavy projectiles, cancellation and breakthrough effects
- `enemy-effects.js`: jade flames, green crescents, guarding, parries, and evasion effects
- `world.js` / `camera.js`: expanded platform layout and dynamic camera framing
- `app.js`: HUD, menus, accessibility, touch controls
- `fighter-sprites.js`: registered atlas frames, running/jump/attack animation, and pose transitions
- `assets/`: reference-guided X-Man sprite atlas, vector arena and Y-Man, and bundled font
- `scripts/`: small Node.js development server and static build

The X-Man atlas was generated from the supplied character reference, with individual idle, running, rising, falling, slash, and laser poses. It is bundled locally and requires no image service at runtime. The earlier vector X-Man remains as a loading fallback.
