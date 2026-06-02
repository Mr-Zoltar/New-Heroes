import Phaser from "phaser";
import { type Room, getStateCallbacks } from "colyseus.js";
import { connectToArena } from "../net/connection";
import { PredictedPlayer, type RawInput } from "../net/prediction";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  ARENA_PLATFORMS,
  PHYS,
  WEAPON,
  Messages,
  type ShotEvent,
} from "@new-heroes/shared";

/** Per-player visuals (HP bar + body + name) shared by local and remote players. */
interface View {
  state: any; // schema Player (reflection on the client)
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
}

const HP_BAR_W = PLAYER_WIDTH + 6;
const HP_BAR_H = 5;
const TRACER_MS = 90;

export class ArenaScene extends Phaser.Scene {
  private room?: Room;

  private predicted?: PredictedPlayer;
  private local?: View;
  private remotes = new Map<string, View>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE", Phaser.Input.Keyboard.Key>;

  private aimGfx!: Phaser.GameObjects.Graphics;
  private tracers: { gfx: Phaser.GameObjects.Graphics; born: number }[] = [];
  private hud!: Phaser.GameObjects.Text;
  private centerMsg!: Phaser.GameObjects.Text;

  private acc = 0;
  private aim = 0;
  private lastShotAt = 0;

  constructor() {
    super("arena");
  }

  create() {
    this.cameras.main.setBackgroundColor("#222034");
    this.input.setDefaultCursor("crosshair");

    for (const p of ARENA_PLATFORMS) {
      this.add.rectangle(p.x, p.y, p.w, p.h, 0x4a4570).setStrokeStyle(1, 0x6b66a0);
    }

    this.aimGfx = this.add.graphics().setDepth(30);
    this.hud = this.add
      .text(10, 8, "Connecting…", { fontFamily: "monospace", fontSize: "14px", color: "#9be29b" })
      .setDepth(100);
    this.add
      .text(10, ARENA_HEIGHT - 22, "Move A/D ←/→ · Jump W/↑/Space · Shoot: hold LMB", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8a86a8",
      })
      .setDepth(100);
    this.centerMsg = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#ff6b6b",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(100);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,S,D,SPACE") as typeof this.keys;

    void this.connect();
  }

  private async connect() {
    try {
      const room = await connectToArena();
      this.room = room;
      const $ = getStateCallbacks(room);
      const state = room.state as any;

      $(state).players.onAdd((player: any, sessionId: string) => {
        if (sessionId === room.sessionId) this.spawnLocal(player);
        else this.spawnRemote(player, sessionId);
      });
      $(state).players.onRemove((_p: any, sessionId: string) => {
        this.destroyView(this.remotes.get(sessionId));
        this.remotes.delete(sessionId);
      });

      room.onMessage(Messages.Shot, (e: ShotEvent) => this.drawTracer(e));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.hud.setText(`Connection failed: ${message}`).setColor("#ff6b6b");
      console.error("[client] connection failed:", err);
    }
  }

  private makeView(player: any, isLocal: boolean): View {
    const color = Phaser.Display.Color.HexStringToColor(player.color ?? "#ffffff").color;
    const rect = this.add
      .rectangle(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT, color)
      .setStrokeStyle(isLocal ? 3 : 1, isLocal ? 0xffffff : 0x000000)
      .setDepth(isLocal ? 20 : 10);
    const label = this.add
      .text(player.x, player.y - PLAYER_HEIGHT, isLocal ? "YOU" : "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1)
      .setDepth(isLocal ? 20 : 10);
    const hpBg = this.add.rectangle(player.x, player.y, HP_BAR_W, HP_BAR_H, 0x000000, 0.6).setDepth(25);
    const hpFg = this.add.rectangle(player.x, player.y, HP_BAR_W, HP_BAR_H, 0x44dd44).setDepth(26);
    return { state: player, rect, label, hpBg, hpFg, targetX: player.x, targetY: player.y };
  }

  private spawnLocal(player: any) {
    const $ = getStateCallbacks(this.room!);
    this.predicted = new PredictedPlayer(player.x, player.y);
    this.local = this.makeView(player, true);

    $(player).onChange(() => {
      this.predicted?.reconcile({
        x: player.x, y: player.y, vx: player.vx, vy: player.vy, lastSeq: player.lastSeq,
      });
    });
  }

  private spawnRemote(player: any, sessionId: string) {
    const $ = getStateCallbacks(this.room!);
    const view = this.makeView(player, false);
    view.label.setText(sessionId.slice(0, 4));
    this.remotes.set(sessionId, view);
    $(player).onChange(() => {
      view.targetX = player.x;
      view.targetY = player.y;
    });
  }

  private destroyView(view?: View) {
    if (!view) return;
    view.rect.destroy();
    view.label.destroy();
    view.hpBg.destroy();
    view.hpFg.destroy();
  }

  private drawTracer(e: ShotEvent) {
    const gfx = this.add.graphics().setDepth(15);
    gfx.lineStyle(2, 0xfff2a8, 1).lineBetween(e.sx, e.sy, e.hx, e.hy);
    gfx.fillStyle(e.hitId ? 0xff5555 : 0xffd166, 1).fillCircle(e.hx, e.hy, e.hitId ? 5 : 3);
    this.tracers.push({ gfx, born: this.time.now });
  }

  private sampleInput(): RawInput {
    return {
      left: this.cursors.left.isDown || this.keys.A.isDown,
      right: this.cursors.right.isDown || this.keys.D.isDown,
      jump: this.cursors.up.isDown || this.keys.W.isDown || this.keys.SPACE.isDown,
    };
  }

  private positionView(view: View, x: number, y: number) {
    view.rect.x = x;
    view.rect.y = y;
    view.label.x = x;
    view.label.y = y - PLAYER_HEIGHT;

    const hp = Math.max(0, Math.min(1, view.state.hp / view.state.maxHp));
    const barY = y - PLAYER_HEIGHT / 2 - 9;
    view.hpBg.x = x;
    view.hpBg.y = barY;
    view.hpFg.x = x - HP_BAR_W / 2 + (HP_BAR_W * hp) / 2;
    view.hpFg.y = barY;
    view.hpFg.width = HP_BAR_W * hp;
    view.hpFg.fillColor = hp > 0.5 ? 0x44dd44 : hp > 0.25 ? 0xffcc33 : 0xff5555;

    const alive = view.state.alive;
    const a = alive ? 1 : 0.12;
    view.rect.setAlpha(a);
    view.hpBg.setAlpha(alive ? 0.6 : 0.05);
    view.hpFg.setAlpha(alive ? 1 : 0.05);
  }

  update(_time: number, delta: number) {
    const now = this.time.now;

    // Aim toward the mouse from the local player's predicted position.
    if (this.predicted) {
      const p = this.input.activePointer;
      this.aim = Math.atan2(p.worldY - this.predicted.y, p.worldX - this.predicted.x);
    }

    // Fixed-timestep prediction + input send (movement + aim).
    if (this.room && this.predicted) {
      this.acc += delta;
      let steps = 0;
      while (this.acc >= PHYS.fixedDtMs && steps < 5) {
        const input = this.predicted.step(this.sampleInput());
        this.room.send(Messages.Input, { ...input, aim: this.aim });
        this.acc -= PHYS.fixedDtMs;
        steps++;
      }

      // Auto-fire while LMB held (client cooldown for feel; server is authoritative).
      const alive = this.local?.state.alive ?? false;
      if (alive && this.input.activePointer.isDown && now - this.lastShotAt >= WEAPON.fireCooldownMs) {
        this.room.send(Messages.Shoot, { angle: this.aim });
        this.lastShotAt = now;
      }
    }

    // Render local player from predicted body; snap to server while dead (no prediction).
    if (this.predicted && this.local) {
      const alive = this.local.state.alive;
      const x = alive ? this.predicted.x : this.local.state.x;
      const y = alive ? this.predicted.y : this.local.state.y;
      this.positionView(this.local, x, y);

      // Aim line.
      this.aimGfx.clear();
      if (alive) {
        this.aimGfx.lineStyle(2, 0xffffff, 0.5);
        this.aimGfx.lineBetween(x, y, x + Math.cos(this.aim) * 26, y + Math.sin(this.aim) * 26);
      }

      const s = this.local.state;
      this.hud.setText(`HP ${s.hp}/${s.maxHp}   K ${s.kills}  D ${s.deaths}   ·   room ${this.room?.roomId ?? "?"}`);
      this.centerMsg.setText(alive ? "" : "ELIMINATED\nrespawning…");
    }

    // Interpolate remote players.
    this.remotes.forEach((view) => {
      view.rect.x = Phaser.Math.Linear(view.rect.x, view.targetX, 0.25);
      view.rect.y = Phaser.Math.Linear(view.rect.y, view.targetY, 0.25);
      this.positionView(view, view.rect.x, view.rect.y);
    });

    // Fade + retire tracers.
    this.tracers = this.tracers.filter(({ gfx, born }) => {
      const t = (now - born) / TRACER_MS;
      if (t >= 1) {
        gfx.destroy();
        return false;
      }
      gfx.setAlpha(1 - t);
      return true;
    });

    this.exposeDebugState();
  }

  private exposeDebugState() {
    (window as any).__NH__ = {
      sessionId: this.room?.sessionId ?? null,
      connected: !!this.room,
      remotes: this.remotes.size,
      hp: this.local?.state.hp ?? null,
      alive: this.local?.state.alive ?? null,
      local: this.predicted ? { x: Math.round(this.predicted.x), y: Math.round(this.predicted.y) } : null,
    };
  }
}
