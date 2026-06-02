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
  Messages,
} from "@new-heroes/shared";

/** Visual + interpolation target for a REMOTE player. */
interface RemoteEntity {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

export class ArenaScene extends Phaser.Scene {
  private room?: Room;

  private predicted?: PredictedPlayer;
  private localRect?: Phaser.GameObjects.Rectangle;
  private localLabel?: Phaser.GameObjects.Text;

  private remotes = new Map<string, RemoteEntity>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE", Phaser.Input.Keyboard.Key>;
  private statusText!: Phaser.GameObjects.Text;

  private acc = 0;

  constructor() {
    super("arena");
  }

  create() {
    this.cameras.main.setBackgroundColor("#222034");

    // Static arena geometry (identical to the server's collision world).
    for (const p of ARENA_PLATFORMS) {
      this.add.rectangle(p.x, p.y, p.w, p.h, 0x4a4570).setStrokeStyle(1, 0x6b66a0);
    }

    this.statusText = this.add
      .text(10, 8, "Connecting…", { fontFamily: "monospace", fontSize: "14px", color: "#9be29b" })
      .setDepth(100);
    this.add
      .text(10, ARENA_HEIGHT - 22, "Move: A/D or ←/→   ·   Jump: W / ↑ / Space", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8a86a8",
      })
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
        if (sessionId === room.sessionId) {
          this.spawnLocal(player);
        } else {
          this.spawnRemote(player, sessionId);
        }
      });

      $(state).players.onRemove((_player: any, sessionId: string) => {
        const remote = this.remotes.get(sessionId);
        remote?.rect.destroy();
        remote?.label.destroy();
        this.remotes.delete(sessionId);
      });

      this.statusText.setText(`Connected • room ${room.roomId} • you=${room.sessionId.slice(0, 4)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.statusText.setText(`Connection failed: ${message}`).setColor("#ff6b6b");
      console.error("[client] connection failed:", err);
    }
  }

  private spawnLocal(player: any) {
    const $ = getStateCallbacks(this.room!);
    this.predicted = new PredictedPlayer(player.x, player.y);

    const color = Phaser.Display.Color.HexStringToColor(player.color ?? "#ffffff").color;
    this.localRect = this.add
      .rectangle(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT, color)
      .setStrokeStyle(3, 0xffffff)
      .setDepth(20);
    this.localLabel = this.add
      .text(player.x, player.y - PLAYER_HEIGHT, "YOU", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Reconcile predicted body whenever the authoritative snapshot updates.
    $(player).onChange(() => {
      this.predicted?.reconcile({
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        lastSeq: player.lastSeq,
      });
    });
  }

  private spawnRemote(player: any, sessionId: string) {
    const $ = getStateCallbacks(this.room!);
    const color = Phaser.Display.Color.HexStringToColor(player.color ?? "#ffffff").color;

    const rect = this.add
      .rectangle(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT, color)
      .setStrokeStyle(1, 0x000000)
      .setDepth(10);
    const label = this.add
      .text(player.x, player.y - PLAYER_HEIGHT, sessionId.slice(0, 4), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1)
      .setDepth(10);

    const entity: RemoteEntity = { rect, label, targetX: player.x, targetY: player.y };
    this.remotes.set(sessionId, entity);

    $(player).onChange(() => {
      entity.targetX = player.x;
      entity.targetY = player.y;
    });
  }

  private sampleInput(): RawInput {
    return {
      left: this.cursors.left.isDown || this.keys.A.isDown,
      right: this.cursors.right.isDown || this.keys.D.isDown,
      jump: this.cursors.up.isDown || this.keys.W.isDown || this.keys.SPACE.isDown,
    };
  }

  update(_time: number, delta: number) {
    // Fixed-timestep prediction loop (decoupled from render framerate).
    if (this.room && this.predicted) {
      this.acc += delta;
      let steps = 0;
      while (this.acc >= PHYS.fixedDtMs && steps < 5) {
        const input = this.predicted.step(this.sampleInput());
        this.room.send(Messages.Input, input);
        this.acc -= PHYS.fixedDtMs;
        steps++;
      }
    }

    // Render local player straight from the predicted body (no lerp — it's authoritative-ish).
    if (this.predicted && this.localRect && this.localLabel) {
      this.localRect.x = this.predicted.x;
      this.localRect.y = this.predicted.y;
      this.localLabel.x = this.predicted.x;
      this.localLabel.y = this.predicted.y - PLAYER_HEIGHT;
    }

    // Interpolate remote players toward their latest authoritative position.
    this.remotes.forEach((entity) => {
      entity.rect.x = Phaser.Math.Linear(entity.rect.x, entity.targetX, 0.25);
      entity.rect.y = Phaser.Math.Linear(entity.rect.y, entity.targetY, 0.25);
      entity.label.x = entity.rect.x;
      entity.label.y = entity.rect.y - PLAYER_HEIGHT;
    });

    this.exposeDebugState();
  }

  private exposeDebugState() {
    (window as any).__NH__ = {
      sessionId: this.room?.sessionId ?? null,
      connected: !!this.room,
      remotes: this.remotes.size,
      local: this.predicted ? { x: Math.round(this.predicted.x), y: Math.round(this.predicted.y) } : null,
    };
  }
}
