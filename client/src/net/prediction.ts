import Matter from "matter-js";
import {
  createEngine,
  addArena,
  createPlayerBody,
  simulateStep,
  type InputCommand,
} from "@new-heroes/shared";

/** Raw input (no seq) sampled from the keyboard each fixed tick. */
export interface RawInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/** Authoritative snapshot of the local player received from the server. */
export interface ServerSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastSeq: number;
}

/**
 * Client-side prediction for the LOCAL player only.
 *
 * Runs an identical matter-js world (own body + the same static arena) as the
 * server. Each fixed tick it predicts locally and buffers the input; when an
 * authoritative snapshot arrives it snaps to it and replays the inputs the
 * server hasn't acknowledged yet — so the local player stays responsive while
 * remaining consistent with the server.
 */
export class PredictedPlayer {
  private engine: Matter.Engine;
  private statics: Matter.Body[];
  readonly body: Matter.Body;
  private pending: InputCommand[] = [];
  private seq = 0;

  constructor(spawnX: number, spawnY: number) {
    this.engine = createEngine();
    this.statics = addArena(this.engine.world);
    this.body = createPlayerBody(spawnX, spawnY);
    Matter.World.add(this.engine.world, this.body);
  }

  /** Advance prediction by one fixed step. Returns the seq-stamped command to send. */
  step(raw: RawInput): InputCommand {
    const input: InputCommand = { seq: ++this.seq, left: raw.left, right: raw.right, jump: raw.jump };
    simulateStep(this.engine, this.body, this.statics, input);
    this.pending.push(input);
    return input;
  }

  /** Reconcile against an authoritative snapshot: snap to server, replay unacked inputs. */
  reconcile(server: ServerSnapshot): void {
    Matter.Body.setPosition(this.body, { x: server.x, y: server.y });
    Matter.Body.setVelocity(this.body, { x: server.vx, y: server.vy });

    // Drop inputs the server has already processed, replay the rest.
    this.pending = this.pending.filter((i) => i.seq > server.lastSeq);
    for (const input of this.pending) {
      simulateStep(this.engine, this.body, this.statics, input);
    }
  }

  get x(): number {
    return this.body.position.x;
  }
  get y(): number {
    return this.body.position.y;
  }
}
