import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { ArenaState, Player } from "./schema/ArenaState";
import { BotBrain } from "../ai/BotBrain";
import {
  ARENA_WIDTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PHYS,
  CLASSES,
  resolveClass,
  BOT_AI,
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
  buildNavGrid,
  type NavGrid,
  type ClassId,
  type InputCommand,
  type ShootCommand,
  type SetClassCommand,
} from "@new-heroes/shared";

const BOT_COLOR = "#d23b3b";

const MAX_QUEUE = 8;
const RESPAWN_TICKS = Math.round(RESPAWN_DELAY_MS / PHYS.fixedDtMs);
const BOT_REMOVE_TICKS = 30; // corpse lingers ~0.5s before removal
const INTERMISSION_TICKS = 120; // ~2s between waves
const SPAWN_SPACING_TICKS = 25; // stagger bot spawns within a wave

const idleInput = (seq: number): InputCommand => ({ seq, left: false, right: false, jump: false });

/**
 * M3 arena room — co-op Horde. Authoritative platformer + hitscan combat (M1/M2)
 * plus AI bots (GOAP decisions + A* nav-grid navigation) and a wave spawner.
 * Humans vs bots: humans damage bots, bots damage humans.
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 4;

  private engine!: Matter.Engine;
  private statics!: Matter.Body[];
  private nav!: NavGrid;
  private bodies = new Map<string, Matter.Body>();
  private brains = new Map<string, BotBrain>();
  private queues = new Map<string, InputCommand[]>();
  private aims = new Map<string, number>();
  private lastShotTick = new Map<string, number>();
  private respawnAt = new Map<string, number>();
  private removeAt = new Map<string, number>();

  private tickCount = 0;
  private botCounter = 0;
  private botsRemaining = 0;
  private waveActive = false;
  private spawnQueue: number[] = [];
  private intermissionUntil = 0;
  private botsEnabled = true;

  onCreate(options?: { noBots?: boolean }) {
    this.botsEnabled = !options?.noBots;
    this.setState(new ArenaState());
    this.engine = createEngine();
    this.statics = addArena(this.engine.world);
    this.nav = buildNavGrid();

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

    this.onMessage<SetClassCommand>(Messages.SetClass, (client, data) => {
      const player = this.state.players.get(client.sessionId);
      const body = this.bodies.get(client.sessionId);
      if (!player || player.isBot || !body || !data) return;
      this.applyClass(player, resolveClass(data.className).id);
      this.respawn(client.sessionId, player, body); // re-deploy with the new loadout
    });

    this.setSimulationInterval(() => this.tick(), PHYS.fixedDtMs);
    console.log(`[room] ArenaRoom created (${this.roomId}) — nav nodes: ${this.nav.nodes.length}`);
  }

  private tick() {
    this.tickCount++;
    this.updateWaves();

    const processed = new Map<string, InputCommand>();

    // 1) Per-player control.
    this.state.players.forEach((player, id) => {
      const body = this.bodies.get(id);
      if (!body) return;

      if (player.isBot) {
        if (!player.alive) return; // awaiting removal
        const grounded = isGrounded(body, this.statics);
        const target = this.nearestHuman(body.position.x, body.position.y);
        const decision = this.brains.get(id)!.think({
          self: { x: body.position.x, y: body.position.y, hp: player.hp, maxHp: player.maxHp },
          grounded,
          target,
          nav: this.nav,
        });
        player.aim = decision.aim;
        const input: InputCommand = { seq: 0, left: decision.dir < 0, right: decision.dir > 0, jump: decision.jump };
        applyInput(body, input, grounded, CLASSES[player.classId as ClassId]?.moveSpeed);
        processed.set(id, input);
        if (decision.shoot) this.handleShoot(id, { angle: decision.aim });
        return;
      }

      // Human.
      const aim = this.aims.get(id);
      if (aim !== undefined) player.aim = aim;
      if (!player.alive) {
        const at = this.respawnAt.get(id);
        if (at !== undefined && this.tickCount >= at) this.respawn(id, player, body);
        return;
      }
      const queue = this.queues.get(id)!;
      const input = queue.length > 0 ? queue.shift()! : idleInput(player.lastSeq);
      const grounded = isGrounded(body, this.statics);
      applyInput(body, input, grounded, resolveClass(player.classId).moveSpeed);
      processed.set(id, input);
    });

    // 2) One deterministic world step.
    Matter.Engine.update(this.engine, PHYS.fixedDtMs);

    // 3) Publish snapshot for alive players (humans + bots).
    this.state.players.forEach((player, id) => {
      if (!player.alive) return;
      const body = this.bodies.get(id);
      if (!body) return;
      const input = processed.get(id);
      player.x = body.position.x;
      player.y = body.position.y;
      player.vx = body.velocity.x;
      player.vy = body.velocity.y;
      player.grounded = isGrounded(body, this.statics);
      if (input) {
        const facing = facingFromInput(input);
        if (facing !== 0) player.facing = facing;
        if (!player.isBot) player.lastSeq = input.seq;
      }
    });
  }

  // ---- Waves --------------------------------------------------------------

  private updateWaves() {
    // Remove corpses whose timer elapsed.
    const due: string[] = [];
    this.removeAt.forEach((at, id) => {
      if (this.tickCount >= at) due.push(id);
    });
    for (const id of due) this.removeBot(id);

    if (this.waveActive) {
      while (this.spawnQueue.length > 0 && this.spawnQueue[0] <= this.tickCount) {
        this.spawnQueue.shift();
        this.spawnBot();
      }
      if (this.spawnQueue.length === 0 && this.botsRemaining === 0) {
        this.waveActive = false;
        this.intermissionUntil = this.tickCount + INTERMISSION_TICKS;
      }
    } else if (this.botsEnabled && this.state.wave > 0 && this.humansPresent() && this.tickCount >= this.intermissionUntil) {
      this.startWave(this.state.wave + 1);
    }

    this.state.botsAlive = this.countAliveBots();
  }

  private startWave(n: number) {
    this.state.wave = n;
    const count = 2 + n;
    this.spawnQueue = [];
    for (let i = 0; i < count; i++) this.spawnQueue.push(this.tickCount + i * SPAWN_SPACING_TICKS);
    this.waveActive = true;
    console.log(`[room] wave ${n} starting — ${count} bots`);
  }

  private spawnBot() {
    const id = `bot_${++this.botCounter}`;
    const pos = this.spawnPosition();
    const body = createPlayerBody(pos.x, pos.y);
    Matter.World.add(this.engine.world, body);
    this.bodies.set(id, body);
    this.brains.set(id, new BotBrain());

    const player = new Player();
    player.isBot = true;
    player.x = pos.x;
    player.y = pos.y;
    this.applyClass(player, "mercenary"); // bots use baseline movement (nav-grid is built for it)
    this.state.players.set(id, player);
    this.botsRemaining++;
  }

  private removeBot(id: string) {
    const body = this.bodies.get(id);
    if (body) Matter.World.remove(this.engine.world, body);
    this.bodies.delete(id);
    this.brains.delete(id);
    this.removeAt.delete(id);
    if (this.state.players.has(id)) {
      this.state.players.delete(id);
      this.botsRemaining = Math.max(0, this.botsRemaining - 1);
    }
  }

  private humansPresent(): boolean {
    let present = false;
    this.state.players.forEach((p) => {
      if (!p.isBot) present = true;
    });
    return present;
  }

  private countAliveBots(): number {
    let n = 0;
    this.state.players.forEach((p) => {
      if (p.isBot && p.alive) n++;
    });
    return n;
  }

  private nearestHuman(fromX: number, fromY: number): { id: string; x: number; y: number } | null {
    let best: { id: string; x: number; y: number } | null = null;
    let bestD = Infinity;
    this.state.players.forEach((p, id) => {
      if (p.isBot || !p.alive) return;
      const body = this.bodies.get(id);
      if (!body) return;
      const d = Math.hypot(body.position.x - fromX, body.position.y - fromY);
      if (d < bestD) {
        bestD = d;
        best = { id, x: body.position.x, y: body.position.y };
      }
    });
    return best;
  }

  // ---- Combat -------------------------------------------------------------

  private handleShoot(shooterId: string, data: ShootCommand) {
    const shooter = this.state.players.get(shooterId);
    if (!shooter || !shooter.alive || !data) return;

    const weapon = resolveClass(shooter.classId).weapon;
    const cooldownTicks = Math.max(1, Math.round(weapon.fireCooldownMs / PHYS.fixedDtMs));
    const last = this.lastShotTick.get(shooterId) ?? -cooldownTicks;
    if (this.tickCount - last < cooldownTicks) return;
    this.lastShotTick.set(shooterId, this.tickCount);

    const baseAngle = Number(data.angle) || 0;
    const ox = shooter.x;
    const oy = shooter.y;

    // Targets: static geometry + every ALIVE enemy (bots ↔ humans only).
    const targets = arenaRayTargets();
    this.state.players.forEach((p, pid) => {
      if (pid === shooterId || !p.alive) return;
      const isEnemy = shooter.isBot ? !p.isBot : p.isBot;
      if (isEnemy) targets.push({ id: pid, cx: p.x, cy: p.y, halfW: PLAYER_WIDTH / 2, halfH: PLAYER_HEIGHT / 2 });
    });

    // Bots are nerfed: random aim error + reduced damage so they're survivable.
    const aimError = shooter.isBot ? (Math.random() - 0.5) * 2 * BOT_AI.aimErrorRad : 0;
    const damage = shooter.isBot ? Math.max(1, Math.round(weapon.damage * BOT_AI.damageScale)) : weapon.damage;

    // Fire one ray per pellet (shotgun = several with spread).
    for (let i = 0; i < weapon.pellets; i++) {
      const offset = weapon.pellets > 1 ? (Math.random() - 0.5) * weapon.spread : 0;
      const hit = raycast(ox, oy, baseAngle + aimError + offset, weapon.range, targets);
      if (hit.id) {
        const victim = this.state.players.get(hit.id);
        if (victim && victim.alive) {
          victim.hp = Math.max(0, victim.hp - damage);
          if (victim.hp <= 0) this.killPlayer(hit.id, shooterId);
        }
      }
      this.broadcast(Messages.Shot, { shooterId, sx: ox, sy: oy, hx: hit.x, hy: hit.y, hitId: hit.id });
    }
  }

  private killPlayer(victimId: string, shooterId: string) {
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) return;
    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;

    if (victim.isBot) {
      this.removeAt.set(victimId, this.tickCount + BOT_REMOVE_TICKS); // bots don't respawn
    } else {
      this.respawnAt.set(victimId, this.tickCount + RESPAWN_TICKS);
    }

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

  // ---- Lifecycle ----------------------------------------------------------

  onJoin(client: Client, options?: { className?: ClassId }) {
    const pos = this.spawnPosition();
    const body = createPlayerBody(pos.x, pos.y);
    Matter.World.add(this.engine.world, body);
    this.bodies.set(client.sessionId, body);
    this.queues.set(client.sessionId, []);
    this.aims.set(client.sessionId, 0);

    const player = new Player();
    player.x = pos.x;
    player.y = pos.y;
    this.applyClass(player, resolveClass(options?.className).id);
    this.state.players.set(client.sessionId, player);

    if (this.botsEnabled && !this.waveActive && this.state.wave === 0) this.startWave(1);

    console.log(`[room] ${client.sessionId} joined as ${player.classId} — ${this.state.players.size} entit(ies)`);
  }

  /** Apply a class's stats to a player (used on join, class switch, and keeps on respawn). */
  private applyClass(player: Player, classId: ClassId) {
    const def = CLASSES[classId] ?? CLASSES.mercenary;
    player.classId = def.id;
    player.maxHp = def.maxHp;
    player.hp = def.maxHp;
    player.color = player.isBot ? BOT_COLOR : def.color;
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
    console.log(`[room] ${client.sessionId} left`);
  }
}
