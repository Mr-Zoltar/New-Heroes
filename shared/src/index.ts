// Shared constants, types, and DETERMINISTIC physics used by BOTH the client
// (Phaser render + client-side prediction) and the authoritative server.
// Keeping the simulation here is what makes prediction/reconciliation line up:
// both sides run the exact same matter-js step in the exact same order.
import Matter from "matter-js";

/** Colyseus server port (also the matchmaking HTTP port). */
export const SERVER_PORT = 2567;

/** Registered Colyseus room name. */
export const ROOM_NAME = "arena";

/** Arena dimensions in pixels (also the Phaser canvas size). */
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;

/** Player body size (a tall rectangle — side-view platformer character). */
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 44;

/** Message channel names exchanged over the Colyseus room. */
export const Messages = {
  Input: "input",
  Shoot: "shoot",
  Shot: "shot",
  SetClass: "setClass",
} as const;

/** Player health. */
export const PLAYER_MAX_HP = 100;

/** Respawn delay after death (ms). */
export const RESPAWN_DELAY_MS = 2500;

/** M2 single weapon (hitscan rifle). Damage/cooldown/range tuned per weapon later (M6). */
export const WEAPON = {
  damage: 18,
  fireCooldownMs: 120,
  range: 1000,
} as const;

/** A "shoot" request from the client: just the aim angle (server uses authoritative origin). */
export interface ShootCommand {
  angle: number;
}

/** Broadcast describing a fired shot, for rendering tracers / hit sparks on every client. */
export interface ShotEvent {
  shooterId: string;
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  hitId: string | null; // sessionId of the player hit, or null (wall / nothing)
}

// ---------------------------------------------------------------------------
// Classes + loadout (M4). Movement speed varies per class; jump strength is
// constant across classes so the bot nav-grid (built once) stays valid.
// ---------------------------------------------------------------------------

export type ClassId = "mercenary" | "juggernaut" | "sniper";
export const CLASS_IDS: ClassId[] = ["mercenary", "juggernaut", "sniper"];

export interface WeaponDef {
  name: string;
  damage: number; // per pellet
  fireCooldownMs: number;
  range: number;
  pellets: number; // rays per shot (shotgun > 1)
  spread: number; // total angular spread in radians (for multi-pellet)
}

export interface ClassDef {
  id: ClassId;
  name: string;
  color: string;
  maxHp: number;
  moveSpeed: number;
  weapon: WeaponDef;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  mercenary: {
    id: "mercenary",
    name: "Mercenary",
    color: "#5599ff",
    maxHp: 100,
    moveSpeed: 4.6,
    weapon: { name: "Rifle", damage: 16, fireCooldownMs: 110, range: 1000, pellets: 1, spread: 0 },
  },
  juggernaut: {
    id: "juggernaut",
    name: "Juggernaut",
    color: "#ffcc33",
    maxHp: 180,
    moveSpeed: 3.4,
    weapon: { name: "Shotgun", damage: 9, fireCooldownMs: 620, range: 340, pellets: 6, spread: 0.42 },
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    color: "#55dd55",
    maxHp: 75,
    moveSpeed: 4.2,
    weapon: { name: "Sniper", damage: 60, fireCooldownMs: 950, range: 1200, pellets: 1, spread: 0 },
  },
};

/** Resolve a (possibly untrusted) class id, defaulting to Mercenary. */
export function resolveClass(id: unknown): ClassDef {
  return CLASSES[(id as ClassId)] ?? CLASSES.mercenary;
}

/** Message: pick/change class (applies on (re)spawn). */
export interface SetClassCommand {
  className: ClassId;
}

/** Tunable platformer physics (in matter-js units: velocity is px per fixed step). */
export const PHYS = {
  fixedDtMs: 1000 / 60,
  gravityScale: 0.0019,
  moveSpeed: 4.6, // horizontal px/step  (~276 px/s)
  jumpVelocity: 13.8, // upward px/step at lift-off (clears the ~140px platform gaps)
} as const;

/**
 * One input frame from the client. `seq` increments every fixed tick so the
 * server can report the last processed seq and the client can reconcile.
 */
export interface InputCommand {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
}

/** Static arena geometry (centers + sizes). Single source of truth for collision + render. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ARENA_PLATFORMS: ReadonlyArray<Rect> = [
  { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 16, w: ARENA_WIDTH, h: 32 }, // floor
  { x: ARENA_WIDTH / 2, y: 16, w: ARENA_WIDTH, h: 32 }, // ceiling
  { x: 16, y: ARENA_HEIGHT / 2, w: 32, h: ARENA_HEIGHT }, // left wall
  { x: ARENA_WIDTH - 16, y: ARENA_HEIGHT / 2, w: 32, h: ARENA_HEIGHT }, // right wall
  { x: 200, y: 440, w: 190, h: 24 }, // low-left platform
  { x: 600, y: 440, w: 190, h: 24 }, // low-right platform
  { x: 400, y: 300, w: 220, h: 24 }, // center platform
];

/** Create a fresh physics engine configured for the arena. */
export function createEngine(): Matter.Engine {
  const engine = Matter.Engine.create();
  engine.gravity.y = 1;
  engine.gravity.scale = PHYS.gravityScale;
  return engine;
}

/** Build the static arena bodies and add them to the world. Returns them for grounding queries. */
export function addArena(world: Matter.World): Matter.Body[] {
  const bodies = ARENA_PLATFORMS.map((p) =>
    Matter.Bodies.rectangle(p.x, p.y, p.w, p.h, {
      isStatic: true,
      label: "platform",
      friction: 0,
    }),
  );
  Matter.World.add(world, bodies);
  return bodies;
}

/** Collision categories: players collide with the arena but pass through each other. */
export const COLLISION = { STATIC: 0x0001, PLAYER: 0x0002 } as const;

/** Create a player body (no rotation, kinematic horizontal control, dynamic vertical). */
export function createPlayerBody(x: number, y: number): Matter.Body {
  return Matter.Bodies.rectangle(x, y, PLAYER_WIDTH, PLAYER_HEIGHT, {
    label: "player",
    friction: 0,
    frictionAir: 0,
    restitution: 0,
    inertia: Infinity, // prevent tipping over
    collisionFilter: { category: COLLISION.PLAYER, mask: COLLISION.STATIC, group: 0 },
  });
}

/** True if the player is resting on a static body (used to gate jumping). */
export function isGrounded(body: Matter.Body, statics: Matter.Body[]): boolean {
  if (body.velocity.y < -0.05) return false; // moving upward => airborne
  const b = body.bounds;
  const region = {
    min: { x: b.min.x + 3, y: b.max.y + 0.5 },
    max: { x: b.max.x - 3, y: b.max.y + 5 },
  };
  return Matter.Query.region(statics, region as Matter.Bounds).length > 0;
}

/**
 * Apply an input frame to a player body: kinematic horizontal + jump impulse when grounded.
 * `moveSpeed` is per-class (jump strength stays constant so the bot nav-grid stays valid).
 */
export function applyInput(
  body: Matter.Body,
  input: InputCommand,
  grounded: boolean,
  moveSpeed: number = PHYS.moveSpeed,
): void {
  let vx = 0;
  if (input.left) vx -= moveSpeed;
  if (input.right) vx += moveSpeed;
  const vy = input.jump && grounded ? -PHYS.jumpVelocity : body.velocity.y;
  Matter.Body.setVelocity(body, { x: vx, y: vy });
}

/**
 * Canonical single simulation step. MUST be called identically on server and
 * client so prediction matches authority. Returns whether the player was grounded.
 */
export function simulateStep(
  engine: Matter.Engine,
  body: Matter.Body,
  statics: Matter.Body[],
  input: InputCommand,
  moveSpeed: number = PHYS.moveSpeed,
): boolean {
  const grounded = isGrounded(body, statics);
  applyInput(body, input, grounded, moveSpeed);
  Matter.Engine.update(engine, PHYS.fixedDtMs);
  return grounded;
}

/** Facing direction from an input frame: -1 left, 1 right, 0 idle. */
export function facingFromInput(input: InputCommand): number {
  if (input.left && !input.right) return -1;
  if (input.right && !input.left) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Hitscan raycasting (axis-aligned boxes only — all bodies are AABBs here).
// ---------------------------------------------------------------------------

/** A box the ray can hit. id = player sessionId, or null for static geometry. */
export interface RayTarget {
  id: string | null;
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

/** Result of a raycast: the hit/endpoint, distance, and which target (if any) was hit. */
export interface RayHit {
  x: number;
  y: number;
  dist: number;
  id: string | null;
}

/** Ray vs axis-aligned box (slab method). Returns entry distance t≥0, or null if no hit. */
function rayAABB(
  ox: number, oy: number, dx: number, dy: number,
  minX: number, minY: number, maxX: number, maxY: number,
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }

  if (Math.abs(dy) < 1e-9) {
    if (oy < minY || oy > maxY) return null;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }

  if (tmax < tmin || tmax < 0) return null;
  return tmin >= 0 ? tmin : 0; // 0 => origin is inside the box
}

/** Returns AABB targets for the static arena geometry. */
export function arenaRayTargets(): RayTarget[] {
  return ARENA_PLATFORMS.map((p) => ({
    id: null,
    cx: p.x,
    cy: p.y,
    halfW: p.w / 2,
    halfH: p.h / 2,
  }));
}

/** Cast a ray from (ox,oy) at `angle` up to `range`, returning the nearest hit (or the endpoint). */
export function raycast(
  ox: number, oy: number, angle: number, range: number, targets: RayTarget[],
): RayHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = range;
  let bestId: string | null = null;

  for (const t of targets) {
    const hit = rayAABB(ox, oy, dx, dy, t.cx - t.halfW, t.cy - t.halfH, t.cx + t.halfW, t.cy + t.halfH);
    if (hit !== null && hit < best) {
      best = hit;
      bestId = t.id;
    }
  }

  return { x: ox + dx * best, y: oy + dy * best, dist: best, id: bestId };
}

// Navigation (A* nav-grid + jump-links) and GOAP planning.
export * from "./navgrid";
export * from "./goap";
