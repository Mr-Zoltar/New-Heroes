import Phaser from "phaser";
import { type Room, getStateCallbacks } from "colyseus.js";
import { connectToArena } from "../net/connection";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SIZE,
  Messages,
  type InputState,
} from "@new-heroes/shared";

/** Visual + interpolation target for one synced player. */
interface Entity {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

export class ArenaScene extends Phaser.Scene {
  private room?: Room;
  private entities = new Map<string, Entity>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastInput: InputState = { up: false, down: false, left: false, right: false };
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("arena");
  }

  create() {
    // Grid background so movement is readable.
    this.add.grid(
      ARENA_WIDTH / 2,
      ARENA_HEIGHT / 2,
      ARENA_WIDTH,
      ARENA_HEIGHT,
      32,
      32,
      0x222034,
      1,
      0x2f2b50,
    );

    this.statusText = this.add
      .text(8, 8, "Connecting…", { fontFamily: "monospace", fontSize: "14px", color: "#9be29b" })
      .setDepth(100);
    this.add
      .text(8, ARENA_HEIGHT - 22, "Move: WASD / Arrows", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8a86a8",
      })
      .setDepth(100);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,S,D") as typeof this.keys;

    void this.connect();
  }

  private async connect() {
    try {
      const room = await connectToArena();
      this.room = room;
      const $ = getStateCallbacks(room);
      const state = room.state as any;

      $(state).players.onAdd((player: any, sessionId: string) => {
        const isLocal = sessionId === room.sessionId;
        const color = Phaser.Display.Color.HexStringToColor(player.color ?? "#ffffff").color;

        const rect = this.add
          .rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, color)
          .setStrokeStyle(isLocal ? 3 : 1, isLocal ? 0xffffff : 0x000000);
        const label = this.add
          .text(player.x, player.y - PLAYER_SIZE, isLocal ? "YOU" : sessionId.slice(0, 4), {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#ffffff",
          })
          .setOrigin(0.5, 1)
          .setDepth(50);

        const entity: Entity = { rect, label, targetX: player.x, targetY: player.y };
        this.entities.set(sessionId, entity);

        $(player).onChange(() => {
          entity.targetX = player.x;
          entity.targetY = player.y;
        });
      });

      $(state).players.onRemove((_player: any, sessionId: string) => {
        const entity = this.entities.get(sessionId);
        entity?.rect.destroy();
        entity?.label.destroy();
        this.entities.delete(sessionId);
      });

      // Test/debug hook: send a raw input frame over the network without relying
      // on synthetic keyboard events. Used by automated sync verification.
      (window as any).__NH_SEND__ = (input: Partial<InputState>) => {
        room.send(Messages.Input, { up: false, down: false, left: false, right: false, ...input });
      };

      this.statusText.setText(`Connected • room ${room.roomId} • you=${room.sessionId.slice(0, 4)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.statusText.setText(`Connection failed: ${message}`).setColor("#ff6b6b");
      console.error("[client] connection failed:", err);
    }
  }

  update() {
    if (this.room) {
      const input: InputState = {
        left: this.cursors.left.isDown || this.keys.A.isDown,
        right: this.cursors.right.isDown || this.keys.D.isDown,
        up: this.cursors.up.isDown || this.keys.W.isDown,
        down: this.cursors.down.isDown || this.keys.S.isDown,
      };

      // Only send when the input actually changes (edge-triggered).
      if (
        input.left !== this.lastInput.left ||
        input.right !== this.lastInput.right ||
        input.up !== this.lastInput.up ||
        input.down !== this.lastInput.down
      ) {
        this.room.send(Messages.Input, input);
        this.lastInput = input;
      }
    }

    // Smoothly interpolate every rectangle toward its latest server position.
    this.entities.forEach((entity) => {
      entity.rect.x = Phaser.Math.Linear(entity.rect.x, entity.targetX, 0.25);
      entity.rect.y = Phaser.Math.Linear(entity.rect.y, entity.targetY, 0.25);
      entity.label.x = entity.rect.x;
      entity.label.y = entity.rect.y - PLAYER_SIZE;
    });

    this.exposeDebugState();
  }

  /** Exposes synced state on window so automated tests can verify cross-client sync. */
  private exposeDebugState() {
    const players: Record<string, { x: number; y: number }> = {};
    this.entities.forEach((entity, sessionId) => {
      players[sessionId] = { x: Math.round(entity.targetX), y: Math.round(entity.targetY) };
    });
    (window as any).__NH__ = {
      sessionId: this.room?.sessionId ?? null,
      connected: !!this.room,
      count: this.entities.size,
      players,
    };
  }
}
