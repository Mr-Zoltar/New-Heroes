import {
  raycast,
  arenaRayTargets,
  WEAPON,
  PHYS,
  BOT_AI,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  planGoap,
  BOT_ACTIONS,
  GOAL_KILL,
  GOAL_SURVIVE,
  astar,
  nearestNode,
  getEdge,
  type NavGrid,
} from "@new-heroes/shared";

export interface ThinkCtx {
  self: { x: number; y: number; hp: number; maxHp: number };
  grounded: boolean;
  target: { id: string; x: number; y: number } | null;
  nav: NavGrid;
}

export interface BotDecision {
  dir: -1 | 0 | 1;
  jump: boolean;
  aim: number;
  shoot: boolean;
}

const REPATH_INTERVAL = 14; // ticks between path recomputes (only while grounded)
const STUCK_TICKS = 40; // no horizontal progress => force a repath (never a blind jump)
const JUMP_CD_TICKS = 16; // min ticks between jumps (kills the jump-spam loop)
const REACTION_TICKS = Math.round(BOT_AI.reactionMs / PHYS.fixedDtMs);
const FIRE_TICKS = Math.round(BOT_AI.fireIntervalMs / PHYS.fixedDtMs);

/**
 * Per-bot AI: GOAP decides WHAT (move / shoot / retreat); the A* nav-grid decides
 * HOW to move. Deliberately dumb & slow combat (reaction delay + slow cadence;
 * aim error & damage scaling applied server-side).
 */
export class BotBrain {
  private path: number[] | null = null;
  private pathStep = 0;
  private repathIn = 0;
  private lastX = 0;
  private stuck = 0;
  private jumpCd = 0;
  private losHeld = 0;
  private lastShoot = -FIRE_TICKS;
  private tick = 0;

  think(ctx: ThinkCtx): BotDecision {
    this.tick++;
    const { self, target, nav, grounded } = ctx;
    if (!target) {
      this.path = null;
      this.losHeld = 0;
      return { dir: 0, jump: false, aim: 0, shoot: false };
    }

    const aim = Math.atan2(target.y - self.y, target.x - self.x);
    const distance = Math.hypot(target.x - self.x, target.y - self.y);

    const losTargets = [
      ...arenaRayTargets(),
      { id: target.id, cx: target.x, cy: target.y, halfW: PLAYER_WIDTH / 2, halfH: PLAYER_HEIGHT / 2 },
    ];
    const hasLOS = raycast(self.x, self.y, aim, WEAPON.range, losTargets).id === target.id;
    const inRange = distance < BOT_AI.engageRange;
    const hpLow = self.hp < self.maxHp * 0.3;
    this.losHeld = hasLOS ? this.losHeld + 1 : 0;

    const world = { targetAlive: true, hasLOS, inRange, hpLow };
    const goal = hpLow ? GOAL_SURVIVE : GOAL_KILL;
    const action = planGoap(BOT_ACTIONS, world, goal)?.[0] ?? "MoveToTarget";

    // Shooting: only after holding LOS (reaction) and on a slow cadence.
    let shoot = false;
    if (
      action !== "Retreat" &&
      hasLOS &&
      inRange &&
      !hpLow &&
      this.losHeld >= REACTION_TICKS &&
      this.tick - this.lastShoot >= FIRE_TICKS
    ) {
      shoot = true;
      this.lastShoot = this.tick;
    }

    // Movement.
    let dir: -1 | 0 | 1 = 0;
    let jump = false;
    if (action === "Shoot" && hasLOS && inRange) {
      dir = 0; // hold and fire
    } else if (action === "Retreat") {
      dir = self.x < target.x ? -1 : 1; // back away, never jump
    } else {
      ({ dir, jump } = this.navigate(self, target, nav, grounded));
    }

    // Jump cooldown — the single biggest fix for the "jump in circles" loop.
    if (jump && this.jumpCd > 0) jump = false;
    if (jump) this.jumpCd = JUMP_CD_TICKS;
    else if (this.jumpCd > 0) this.jumpCd--;

    return { dir, jump, aim, shoot };
  }

  private navigate(
    self: { x: number; y: number },
    target: { x: number; y: number },
    nav: NavGrid,
    grounded: boolean,
  ): { dir: -1 | 0 | 1; jump: boolean } {
    // Only repath while grounded — mid-air positions make nearestNode jump around
    // and produce climb-back-up paths (the orbit bug).
    if (grounded) {
      if (Math.abs(self.x - this.lastX) < 0.5) this.stuck++;
      else this.stuck = 0;
      this.lastX = self.x;

      this.repathIn--;
      if (!this.path || this.repathIn <= 0 || this.stuck > STUCK_TICKS) {
        this.path = astar(nav, nearestNode(nav, self.x, self.y), nearestNode(nav, target.x, target.y));
        this.pathStep = 0;
        this.repathIn = REPATH_INTERVAL;
        this.stuck = 0;
      }
    }

    // Descend shortcut: target clearly below => just walk toward it and fall off
    // ledges. Never jump (jumping up is what caused the loop).
    if (target.y > self.y + BOT_AI.descendDrop) {
      return { dir: this.dirTo(self.x, target.x), jump: false };
    }

    // No usable path: chase directly, jump only to climb when clearly above.
    if (!this.path || this.path.length < 2) {
      return { dir: this.dirTo(self.x, target.x), jump: grounded && target.y < self.y - 40 };
    }

    // Advance along the path.
    let next = this.path[this.pathStep + 1];
    while (next !== undefined) {
      const node = nav.nodes[next];
      if (Math.abs(self.x - node.x) < 18 && Math.abs(self.y - node.y) < 40) {
        this.pathStep++;
        next = this.path[this.pathStep + 1];
      } else break;
    }
    if (next === undefined) {
      return { dir: this.dirTo(self.x, target.x), jump: grounded && target.y < self.y - 40 };
    }

    const node = nav.nodes[next];
    const edge = getEdge(nav, this.path[this.pathStep], next);
    const dir = this.dirTo(self.x, node.x);
    // Jump only to go UP (real jump-link or higher node), grounded, roughly aligned.
    const goingUp = node.y < self.y - 20;
    const aligned = Math.abs(self.x - node.x) < 70;
    const jump = grounded && !!(edge?.jump || goingUp) && aligned;
    return { dir, jump };
  }

  private dirTo(fromX: number, toX: number): -1 | 0 | 1 {
    if (toX > fromX + 6) return 1;
    if (toX < fromX - 6) return -1;
    return 0;
  }
}
