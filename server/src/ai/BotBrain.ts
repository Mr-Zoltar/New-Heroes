import {
  raycast,
  arenaRayTargets,
  WEAPON,
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

const ENGAGE_RANGE = 380;
const REPATH_INTERVAL = 12; // ticks
const STUCK_TICKS = 22;

/**
 * Per-bot AI: GOAP decides WHAT (move / shoot / retreat), the A* nav-grid decides
 * HOW to move (walk / jump-link / drop), reproduced with simple reactive control.
 */
export class BotBrain {
  private path: number[] | null = null;
  private pathStep = 0;
  private repathIn = 0;
  private lastX = 0;
  private stuck = 0;

  think(ctx: ThinkCtx): BotDecision {
    const { self, target, nav, grounded } = ctx;
    if (!target) {
      this.path = null;
      return { dir: 0, jump: false, aim: 0, shoot: false };
    }

    const aim = Math.atan2(target.y - self.y, target.x - self.x);
    const distance = Math.hypot(target.x - self.x, target.y - self.y);

    // Line of sight via the same hitscan the weapons use.
    const losTargets = [
      ...arenaRayTargets(),
      { id: target.id, cx: target.x, cy: target.y, halfW: PLAYER_WIDTH / 2, halfH: PLAYER_HEIGHT / 2 },
    ];
    const hasLOS = raycast(self.x, self.y, aim, WEAPON.range, losTargets).id === target.id;
    const inRange = distance < ENGAGE_RANGE;
    const hpLow = self.hp < self.maxHp * 0.3;

    const world = { targetAlive: true, hasLOS, inRange, hpLow };
    const goal = hpLow ? GOAL_SURVIVE : GOAL_KILL;
    const action = planGoap(BOT_ACTIONS, world, goal)?.[0] ?? "MoveToTarget";

    const shoot = hasLOS && inRange && !hpLow;

    let dir: -1 | 0 | 1 = 0;
    let jump = false;

    if (action === "Shoot") {
      // Hold position and fire.
      dir = 0;
    } else if (action === "Retreat") {
      // Move away from the target; hop if pinned against geometry.
      dir = self.x < target.x ? -1 : 1;
      jump = grounded && this.checkStuck(self.x);
    } else {
      // MoveToTarget — navigate via the nav grid.
      ({ dir, jump } = this.navigate(self, target, nav, grounded));
    }

    return { dir, jump, aim, shoot };
  }

  private navigate(
    self: { x: number; y: number },
    target: { x: number; y: number },
    nav: NavGrid,
    grounded: boolean,
  ): { dir: -1 | 0 | 1; jump: boolean } {
    this.repathIn--;
    if (!this.path || this.repathIn <= 0) {
      this.path = astar(nav, nearestNode(nav, self.x, self.y), nearestNode(nav, target.x, target.y));
      this.pathStep = 0;
      this.repathIn = REPATH_INTERVAL;
    }

    // Direct chase fallback when there is no usable path.
    if (!this.path || this.path.length < 2) {
      const dir = this.dirTo(self.x, target.x);
      const jump = grounded && (target.y < self.y - 16 || this.checkStuck(self.x));
      return { dir, jump };
    }

    // Advance along the path.
    let next = this.path[this.pathStep + 1];
    while (next !== undefined) {
      const node = nav.nodes[next];
      if (Math.abs(self.x - node.x) < 16 && Math.abs(self.y - node.y) < 34) {
        this.pathStep++;
        next = this.path[this.pathStep + 1];
      } else break;
    }

    if (next === undefined) {
      // Reached the end of the path; close on the target directly.
      const dir = this.dirTo(self.x, target.x);
      const jump = grounded && (target.y < self.y - 16);
      return { dir, jump };
    }

    const node = nav.nodes[next];
    const edge = getEdge(nav, this.path[this.pathStep], next);
    const dir = this.dirTo(self.x, node.x);
    const needsClimb = node.y < self.y - 14;
    const jump = grounded && (!!edge?.jump || needsClimb || this.checkStuck(self.x));
    return { dir, jump };
  }

  private dirTo(fromX: number, toX: number): -1 | 0 | 1 {
    if (toX > fromX + 4) return 1;
    if (toX < fromX - 4) return -1;
    return 0;
  }

  /** Returns true when the bot has stopped making horizontal progress (likely blocked). */
  private checkStuck(x: number): boolean {
    if (Math.abs(x - this.lastX) < 0.5) this.stuck++;
    else this.stuck = 0;
    this.lastX = x;
    if (this.stuck >= STUCK_TICKS) {
      this.stuck = 0;
      this.repathIn = 0;
      return true;
    }
    return false;
  }
}
