// Minimal GOAP planner: A* over world states. The planner picks WHAT to do
// (an ordered list of actions); navigation (HOW) is handled by the nav grid.
export type WorldState = Record<string, boolean>;

export interface GoapAction {
  name: string;
  pre: WorldState; // required facts
  eff: WorldState; // facts after running
  cost: number;
}

const satisfies = (state: WorldState, target: WorldState) =>
  Object.keys(target).every((k) => (state[k] ?? false) === target[k]);

const apply = (state: WorldState, eff: WorldState): WorldState => ({ ...state, ...eff });

const key = (state: WorldState) =>
  Object.keys(state)
    .filter((k) => state[k])
    .sort()
    .join(",");

/** Plan an ordered list of action names that takes `start` to satisfy `goal`. Null if impossible. */
export function planGoap(actions: GoapAction[], start: WorldState, goal: WorldState): string[] | null {
  if (satisfies(start, goal)) return [];

  interface Node {
    state: WorldState;
    plan: string[];
    cost: number;
  }
  const open: Node[] = [{ state: start, plan: [], cost: 0 }];
  const seen = new Map<string, number>([[key(start), 0]]);

  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost);
    const node = open.shift()!;
    if (satisfies(node.state, goal)) return node.plan;

    for (const action of actions) {
      if (!satisfies(node.state, action.pre)) continue;
      const nextState = apply(node.state, action.eff);
      const k = key(nextState);
      const nextCost = node.cost + action.cost;
      if (seen.has(k) && seen.get(k)! <= nextCost) continue;
      seen.set(k, nextCost);
      open.push({ state: nextState, plan: [...node.plan, action.name], cost: nextCost });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bot action set + goals (shared by the server AI and tests).
// ---------------------------------------------------------------------------

export const BOT_ACTIONS: GoapAction[] = [
  { name: "MoveToTarget", pre: {}, eff: { inRange: true, hasLOS: true }, cost: 4 },
  { name: "Shoot", pre: { inRange: true, hasLOS: true, targetAlive: true }, eff: { targetDead: true }, cost: 1 },
  { name: "Retreat", pre: { hpLow: true }, eff: { safe: true }, cost: 2 },
];

export const GOAL_KILL: WorldState = { targetDead: true };
export const GOAL_SURVIVE: WorldState = { safe: true };
