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
} as const;

/** Tunable platformer physics (in matter-js units: velocity is px per fixed step). */
export const PHYS = {
  fixedDtMs: 1000 / 60,
  gravityScale: 0.0019,
  moveSpeed: 4.6, // horizontal px/step  (~276 px/s)
  jumpVelocity: 11.5, // upward px/step at lift-off
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

/** Apply an input frame to a player body: kinematic horizontal + jump impulse when grounded. */
export function applyInput(body: Matter.Body, input: InputCommand, grounded: boolean): void {
  let vx = 0;
  if (input.left) vx -= PHYS.moveSpeed;
  if (input.right) vx += PHYS.moveSpeed;
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
): boolean {
  const grounded = isGrounded(body, statics);
  applyInput(body, input, grounded);
  Matter.Engine.update(engine, PHYS.fixedDtMs);
  return grounded;
}

/** Facing direction from an input frame: -1 left, 1 right, 0 idle. */
export function facingFromInput(input: InputCommand): number {
  if (input.left && !input.right) return -1;
  if (input.right && !input.left) return 1;
  return 0;
}
