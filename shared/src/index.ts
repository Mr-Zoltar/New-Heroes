// Shared constants and types used by BOTH client (Phaser) and server (Colyseus).
// Single source of truth for the simulation so client prediction (M1+) stays in sync.

/** Colyseus server port (also the matchmaking HTTP port). */
export const SERVER_PORT = 2567;

/** Registered Colyseus room name. */
export const ROOM_NAME = "arena";

/** Arena dimensions in pixels (also the Phaser canvas size for M0). */
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;

/** Player square side length in pixels. */
export const PLAYER_SIZE = 32;

/** Player movement speed in pixels per second (applied server-side). */
export const PLAYER_SPEED = 220;

/**
 * Input the client sends to the authoritative server.
 * M0: simple held-direction booleans. Aiming / actions come in later milestones.
 */
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Message channel names exchanged over the Colyseus room. */
export const Messages = {
  Input: "input",
} as const;
