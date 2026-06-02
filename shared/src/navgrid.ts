// Navigation grid + A* pathfinding for the side-view platformer.
// Nodes are standing positions on top of each surface. Edges are walk / drop /
// jump moves. Jump & drop edges are VALIDATED by simulating the real physics
// (simulateStep), so a bot can reproduce the exact input and land identically.
import Matter from "matter-js";
import {
  ARENA_PLATFORMS,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PHYS,
  createEngine,
  addArena,
  createPlayerBody,
  simulateStep,
  isGrounded,
} from "./index";

export interface NavNode {
  x: number;
  y: number;
}

export interface NavEdge {
  to: number;
  cost: number;
  jump: boolean; // requires a jump to traverse
  dir: -1 | 0 | 1; // horizontal direction to hold
}

export interface NavGrid {
  nodes: NavNode[];
  adj: NavEdge[][];
}

const NODE_STEP = 40; // horizontal spacing of nodes along a surface
const JUMP_PENALTY = 24; // bias A* toward walking when possible
const dist = (a: NavNode, b: NavNode) => Math.hypot(a.x - b.x, a.y - b.y);

/** Walkable surfaces: wide, horizontal, not the ceiling (floor + platforms). */
function surfaces() {
  return ARENA_PLATFORMS.filter((p) => p.w >= p.h && p.y > 50);
}

/** Build the navigation grid for the arena. Run once (arena is static). */
export function buildNavGrid(): NavGrid {
  const nodes: NavNode[] = [];

  for (const s of surfaces()) {
    const top = s.y - s.h / 2;
    const y = top - PLAYER_HEIGHT / 2;
    const minX = Math.max(40, s.x - s.w / 2 + PLAYER_WIDTH / 2 + 2);
    const maxX = Math.min(760, s.x + s.w / 2 - PLAYER_WIDTH / 2 - 2);
    if (maxX < minX) continue;
    const count = Math.max(1, Math.round((maxX - minX) / NODE_STEP));
    for (let i = 0; i <= count; i++) {
      nodes.push({ x: minX + ((maxX - minX) * i) / count, y });
    }
  }

  const adj: NavEdge[][] = nodes.map(() => []);
  const addEdge = (from: number, e: NavEdge) => {
    const existing = adj[from].find((x) => x.to === e.to);
    if (!existing) adj[from].push(e);
    else if (e.cost < existing.cost) Object.assign(existing, e);
  };

  // Walk edges: adjacent nodes on the same surface (same y, close x).
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (Math.abs(nodes[i].y - nodes[j].y) < 1 && Math.abs(nodes[i].x - nodes[j].x) <= NODE_STEP + 1) {
        addEdge(i, { to: j, cost: dist(nodes[i], nodes[j]), jump: false, dir: nodes[j].x > nodes[i].x ? 1 : -1 });
      }
    }
  }

  // Jump & drop edges: simulate from each node and see where it lands.
  const engine = createEngine();
  const statics = addArena(engine.world);
  const body = createPlayerBody(0, 0);
  Matter.World.add(engine.world, body);

  const nearestTo = (x: number, y: number) => {
    let best = -1;
    let bestD = 30; // landing tolerance
    for (let k = 0; k < nodes.length; k++) {
      const d = Math.hypot(nodes[k].x - x, nodes[k].y - y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  };

  for (let i = 0; i < nodes.length; i++) {
    for (const dir of [-1, 1] as const) {
      for (const doJump of [true, false]) {
        Matter.Body.setPosition(body, { x: nodes[i].x, y: nodes[i].y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        let landedStep = -1;
        for (let step = 0; step < 80; step++) {
          simulateStep(engine, body, statics, {
            seq: 0,
            left: dir < 0,
            right: dir > 0,
            jump: doJump && step === 0,
          });
          if (step >= 3 && isGrounded(body, statics) && Math.abs(body.velocity.y) < 0.6) {
            landedStep = step;
            break;
          }
        }
        if (landedStep < 0) continue;
        const j = nearestTo(body.position.x, body.position.y);
        if (j < 0 || j === i) continue;
        // skip if it's just the walk neighbour we already have
        if (Math.abs(nodes[j].y - nodes[i].y) < 1 && !doJump) continue;
        addEdge(i, {
          to: j,
          cost: dist(nodes[i], nodes[j]) + (doJump ? JUMP_PENALTY : 0),
          jump: doJump,
          dir,
        });
      }
    }
  }

  return { nodes, adj };
}

/** Index of the nav node nearest to a world position. */
export function nearestNode(grid: NavGrid, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < grid.nodes.length; i++) {
    const d = Math.hypot(grid.nodes[i].x - x, grid.nodes[i].y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The edge from a→b, if one exists. */
export function getEdge(grid: NavGrid, a: number, b: number): NavEdge | undefined {
  return grid.adj[a]?.find((e) => e.to === b);
}

/** A* over the nav grid. Returns a list of node indices (incl. start & goal), or null. */
export function astar(grid: NavGrid, start: number, goal: number): number[] | null {
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [start];

  const h = (n: number) => dist(grid.nodes[n], grid.nodes[goal]);
  const open = new Set<number>([start]);
  const cameFrom = new Map<number, number>();
  const g = new Map<number, number>([[start, 0]]);
  const f = new Map<number, number>([[start, h(start)]]);

  while (open.size > 0) {
    let current = -1;
    let bestF = Infinity;
    for (const n of open) {
      const fn = f.get(n) ?? Infinity;
      if (fn < bestF) {
        bestF = fn;
        current = n;
      }
    }
    if (current === goal) {
      const path = [current];
      while (cameFrom.has(path[0])) path.unshift(cameFrom.get(path[0])!);
      return path;
    }
    open.delete(current);
    for (const edge of grid.adj[current]) {
      const tentative = (g.get(current) ?? Infinity) + edge.cost;
      if (tentative < (g.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        g.set(edge.to, tentative);
        f.set(edge.to, tentative + h(edge.to));
        open.add(edge.to);
      }
    }
  }
  return null;
}
