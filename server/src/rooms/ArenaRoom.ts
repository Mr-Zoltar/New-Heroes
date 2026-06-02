import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { ArenaState, Player } from "./schema/ArenaState";
import {
  ARENA_WIDTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PHYS,
  WEAPON,
  RESPAWN_DELAY_MS,
  Messages,
  createEngine,
  addArena,
  createPlayerBody,
  isGrounded,
  applyInput,
  facingFromInput,
  arenaRayTargets,
  raycast,
  type InputCommand,
  type ShootCommand,
} from "@new-heroes/shared";

const PLAYER_COLORS = [
  "#ff5555", "#55dd55", "#5599ff", "#ffcc33",
  "#ff66cc", "#33e0d0", "#ff9933", "#cc88ff",
];

/** Max inputs buffered per player before we drop the oldest (bounds latency after a stall). */
const MAX_QUEUE = 8;
const COOLDOWN_TICKS = Math.max(1, Math.round(WEAPON.fireCooldownMs / PHYS.fixedDtMs));
const RESPAWN_TICKS = Math.round(RESPAWN_DELAY_MS / PHYS.fixedDtMs);

const idleInput = (seq: number): InputCommand => ({ seq, left: false, right: false, jump: false });

/**
 * M2 arena room — authoritative side-view platformer + hitscan combat.
 * Movement: client prediction + server authority (M1). Combat: server-side
 * raycast, damage, death & respawn; shots broadcast for tracer rendering.
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 8;

  private engine!: Matter.Engine;
  private statics!: Matter.Body[];
  private bodies = new Map<string, Matter.Body>();
  private queues = new Map<string, InputCommand[]>();
  private aims = new Map<string, number>();
  private lastShotTick = new Map<string, number>();
  private respawnAt = new Map<string, number>();
  private tickCount = 0;
  private colorIndex = 0;

  onCreate() {
    this.setState(new ArenaState());
    this.engine = createEngine();
    this.statics = addArena(this.engine.world);

    this.onMessage<InputCommand & { aim?: number }>(Messages.Input, (client, data) => {
      const queue = this.queues.get(client.sessionId);
      if (!queue || !data) return;
      queue.push({
        seq: data.seq >>> 0,
        left: !!data.left,
        right: !!data.right,
        jump: !!data.jump,
      });
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      if (typeof data.aim === "number") this.aims.set(client.sessionId, data.aim);
    });

    this.onMessage<ShootCommand>(Messages.Shoot, (client, data) => this.handleShoot(client.sessionId, data));

    this.setSimulationInterval(() => this.tick(), PHYS.fixedDtMs);
    console.log(`[room] ArenaRoom created (${this.roomId})`);
  }

  private tick() {
    this.tickCount++;
    const processed = new Map<string, InputCommand>();

    // 1) Apply input for alive players; run respawn timers for dead ones.
    this.state.players.forEach((player, sessionId) => {
      const body = this.bodies.get(sessionId);
      if (!body) return;

      const aim = this.aims.get(sessionId);
      if (aim !== undefined) player.aim = aim;

      if (!player.alive) {
        const at = this.respawnAt.get(sessionId);
        if (at !== undefined && this.tickCount >= at) this.respawn(sessionId, player, body);
        return;
      }

      const queue = this.queues.get(sessionId)!;
      const input = queue.length > 0 ? queue.shift()! : idleInput(player.lastSeq);
      const grounded = isGrounded(body, this.statics);
      applyInput(body, input, grounded);
      processed.set(sessionId, input);
    });

    // 2) One deterministic world step.
    Matter.Engine.update(this.engine, PHYS.fixedDtMs);

    // 3) Publish snapshot for alive players.
    this.state.players.forEach((player, sessionId) => {
      if (!player.alive) return;
      const body = this.bodies.get(sessionId);
      if (!body) return;
      const input = processed.get(sessionId);
      player.x = body.position.x;
      player.y = body.position.y;
      player.vx = body.velocity.x;
      player.vy = body.velocity.y;
      player.grounded = isGrounded(body, this.statics);
      if (input) {
        const facing = facingFromInput(input);
        if (facing !== 0) player.facing = facing;
        player.lastSeq = input.seq;
      }
    });
  }

  private handleShoot(shooterId: string, data: ShootCommand) {
    const shooter = this.state.players.get(shooterId);
    if (!shooter || !shooter.alive || !data) return;

    const last = this.lastShotTick.get(shooterId) ?? -COOLDOWN_TICKS;
    if (this.tickCount - last < COOLDOWN_TICKS) return; // fire-rate gate
    this.lastShotTick.set(shooterId, this.tickCount);

    const angle = Number(data.angle) || 0;
    const ox = shooter.x;
    const oy = shooter.y;

    // Targets: static geometry + every other ALIVE player.
    const targets = arenaRayTargets();
    this.state.players.forEach((p, pid) => {
      if (pid !== shooterId && p.alive) {
        targets.push({ id: pid, cx: p.x, cy: p.y, halfW: PLAYER_WIDTH / 2, halfH: PLAYER_HEIGHT / 2 });
      }
    });

    const hit = raycast(ox, oy, angle, WEAPON.range, targets);

    if (hit.id) {
      const victim = this.state.players.get(hit.id);
      if (victim && victim.alive) {
        victim.hp = Math.max(0, victim.hp - WEAPON.damage);
        if (victim.hp <= 0) this.killPlayer(hit.id, shooterId);
      }
    }

    this.broadcast(Messages.Shot, {
      shooterId,
      sx: ox,
      sy: oy,
      hx: hit.x,
      hy: hit.y,
      hitId: hit.id,
    });
  }

  private killPlayer(victimId: string, shooterId: string) {
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) return;
    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;

    // Body stays in the world (falls harmlessly, hidden client-side, excluded from
    // raycasts via the `alive` check) — respawn just teleports it back.
    this.respawnAt.set(victimId, this.tickCount + RESPAWN_TICKS);

    if (shooterId !== victimId) {
      const shooter = this.state.players.get(shooterId);
      if (shooter) shooter.kills++;
    }
  }

  private respawn(sessionId: string, player: Player, body: Matter.Body) {
    const pos = this.spawnPosition();
    Matter.Body.setPosition(body, pos);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });

    player.x = pos.x;
    player.y = pos.y;
    player.vx = 0;
    player.vy = 0;
    player.hp = player.maxHp;
    player.alive = true;
    this.respawnAt.delete(sessionId);
  }

  private spawnPosition() {
    return { x: 80 + Math.random() * (ARENA_WIDTH - 160), y: 120 };
  }

  onJoin(client: Client) {
    const pos = this.spawnPosition();
    const body = createPlayerBody(pos.x, pos.y);
    Matter.World.add(this.engine.world, body);
    this.bodies.set(client.sessionId, body);
    this.queues.set(client.sessionId, []);
    this.aims.set(client.sessionId, 0);

    const player = new Player();
    player.x = pos.x;
    player.y = pos.y;
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
    this.aims.delete(client.sessionId);
    this.lastShotTick.delete(client.sessionId);
    this.respawnAt.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    console.log(`[room] ${client.sessionId} left — ${this.state.players.size} player(s)`);
  }
}
