import { Room, Client } from "colyseus";
import { ArenaState, Player } from "./schema/ArenaState";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SIZE,
  PLAYER_SPEED,
  Messages,
  type InputState,
} from "@new-heroes/shared";

const PLAYER_COLORS = [
  "#ff5555", "#55dd55", "#5599ff", "#ffcc33",
  "#ff66cc", "#33e0d0", "#ff9933", "#cc88ff",
];

const HALF = PLAYER_SIZE / 2;

/**
 * M0 arena room — authoritative movement.
 * Clients send held-direction input; the server simulates at a fixed step and
 * synchronizes player positions to everyone. (Matter.js physics arrives in M1.)
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 8;

  /** Latest input per client (server-side only — not part of synced state). */
  private inputs = new Map<string, InputState>();
  private colorIndex = 0;

  onCreate() {
    this.setState(new ArenaState());

    this.onMessage<InputState>(Messages.Input, (client, data) => {
      this.inputs.set(client.sessionId, {
        up: !!data?.up,
        down: !!data?.down,
        left: !!data?.left,
        right: !!data?.right,
      });
    });

    // Fixed 60 Hz authoritative simulation. State patches are sent on the
    // default patch rate (~20 Hz); clients interpolate between them.
    this.setSimulationInterval((dt) => this.update(dt), 1000 / 60);

    console.log(`[room] ArenaRoom created (${this.roomId})`);
  }

  private update(dt: number) {
    const seconds = dt / 1000;
    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      if (!input) return;

      let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx === 0 && dy === 0) return;

      // Normalize diagonal movement so it isn't faster.
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      player.x = clamp(player.x + dx * PLAYER_SPEED * seconds, HALF, ARENA_WIDTH - HALF);
      player.y = clamp(player.y + dy * PLAYER_SPEED * seconds, HALF, ARENA_HEIGHT - HALF);
    });
  }

  onJoin(client: Client) {
    const player = new Player();
    player.x = HALF + Math.random() * (ARENA_WIDTH - PLAYER_SIZE);
    player.y = HALF + Math.random() * (ARENA_HEIGHT - PLAYER_SIZE);
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    this.inputs.set(client.sessionId, { up: false, down: false, left: false, right: false });
    this.state.players.set(client.sessionId, player);

    console.log(`[room] ${client.sessionId} joined — ${this.state.players.size} player(s)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    console.log(`[room] ${client.sessionId} left — ${this.state.players.size} player(s)`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
