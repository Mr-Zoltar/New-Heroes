import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { ArenaState, Player } from "./schema/ArenaState";
import {
  ARENA_WIDTH,
  PHYS,
  Messages,
  createEngine,
  addArena,
  createPlayerBody,
  isGrounded,
  applyInput,
  facingFromInput,
  type InputCommand,
} from "@new-heroes/shared";

const PLAYER_COLORS = [
  "#ff5555", "#55dd55", "#5599ff", "#ffcc33",
  "#ff66cc", "#33e0d0", "#ff9933", "#cc88ff",
];

/** Max inputs buffered per player before we drop the oldest (bounds latency after a stall). */
const MAX_QUEUE = 8;

const idleInput = (seq: number): InputCommand => ({ seq, left: false, right: false, jump: false });

/**
 * M1 arena room — authoritative side-view platformer on Matter.js.
 * Clients send one InputCommand per fixed tick (with a seq). The server drains
 * one input per player per tick, steps a single shared engine, and publishes
 * position + velocity + lastSeq so clients can reconcile their predicted state.
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 8;

  private engine!: Matter.Engine;
  private statics!: Matter.Body[];
  private bodies = new Map<string, Matter.Body>();
  private queues = new Map<string, InputCommand[]>();
  private colorIndex = 0;

  onCreate() {
    this.setState(new ArenaState());

    this.engine = createEngine();
    this.statics = addArena(this.engine.world);

    this.onMessage<InputCommand>(Messages.Input, (client, data) => {
      const queue = this.queues.get(client.sessionId);
      if (!queue || !data) return;
      queue.push({
        seq: data.seq >>> 0,
        left: !!data.left,
        right: !!data.right,
        jump: !!data.jump,
      });
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    });

    this.setSimulationInterval(() => this.tick(), PHYS.fixedDtMs);
    console.log(`[room] ArenaRoom created (${this.roomId})`);
  }

  private tick() {
    // 1) Apply one input per player (grounded checked BEFORE the world step).
    const processed = new Map<string, InputCommand>();
    this.state.players.forEach((player, sessionId) => {
      const body = this.bodies.get(sessionId);
      if (!body) return;
      const queue = this.queues.get(sessionId)!;
      const input = queue.length > 0 ? queue.shift()! : idleInput(player.lastSeq);
      const grounded = isGrounded(body, this.statics);
      applyInput(body, input, grounded);
      processed.set(sessionId, input);
    });

    // 2) One deterministic world step for every body.
    Matter.Engine.update(this.engine, PHYS.fixedDtMs);

    // 3) Publish authoritative snapshot.
    this.state.players.forEach((player, sessionId) => {
      const body = this.bodies.get(sessionId);
      if (!body) return;
      const input = processed.get(sessionId)!;
      player.x = body.position.x;
      player.y = body.position.y;
      player.vx = body.velocity.x;
      player.vy = body.velocity.y;
      player.grounded = isGrounded(body, this.statics);
      const facing = facingFromInput(input);
      if (facing !== 0) player.facing = facing;
      player.lastSeq = input.seq;
    });
  }

  onJoin(client: Client) {
    const spawnX = 80 + Math.random() * (ARENA_WIDTH - 160);
    const spawnY = 120;
    const body = createPlayerBody(spawnX, spawnY);
    Matter.World.add(this.engine.world, body);
    this.bodies.set(client.sessionId, body);
    this.queues.set(client.sessionId, []);

    const player = new Player();
    player.x = spawnX;
    player.y = spawnY;
    player.color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;
    this.state.players.set(client.sessionId, player);

    console.log(`[room] ${client.sessionId} joined — ${this.state.players.size} player(s)`);
  }

  onLeave(client: Client) {
    const body = this.bodies.get(client.sessionId);
    if (body) Matter.World.remove(this.engine.world, body);
    this.bodies.delete(client.sessionId);
    this.queues.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    console.log(`[room] ${client.sessionId} left — ${this.state.players.size} player(s)`);
  }
}
