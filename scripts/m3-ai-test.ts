// Unit tests for the M3 AI foundation: nav-grid build + jump-links, A* paths,
// and the GOAP planner.
import {
  buildNavGrid,
  nearestNode,
  astar,
  getEdge,
  planGoap,
  BOT_ACTIONS,
  GOAL_KILL,
  GOAL_SURVIVE,
  ARENA_HEIGHT,
  ARENA_WIDTH,
} from "@new-heroes/shared";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

// --- Nav grid ---
const grid = buildNavGrid();
const jumpEdges = grid.adj.flat().filter((e) => e.jump).length;
const walkEdges = grid.adj.flat().filter((e) => !e.jump).length;
console.log(`nav grid: ${grid.nodes.length} nodes, ${walkEdges} walk edges, ${jumpEdges} jump/drop edges`);
if (grid.nodes.length < 10) fail(`too few nodes (${grid.nodes.length})`);
if (jumpEdges < 1) fail("no jump/drop edges generated");

// Path from a floor position up to the center platform (y≈300 top) must exist and use a jump.
const floorNode = nearestNode(grid, ARENA_WIDTH / 2, ARENA_HEIGHT - 60);
const centerNode = nearestNode(grid, ARENA_WIDTH / 2, 300 - 12 - 22);
const path = astar(grid, floorNode, centerNode);
if (!path) fail("no path from floor to center platform");
let usedJump = false;
for (let i = 0; i < path.length - 1; i++) {
  if (getEdge(grid, path[i], path[i + 1])?.jump) usedJump = true;
}
console.log(`A* floor→center: ${path.length} nodes, usesJump=${usedJump}`);
if (path.length < 2) fail("degenerate path");
if (!usedJump) fail("path to a higher platform should use a jump-link");

// Reverse path (center → floor) should also exist (drop/jump down).
if (!astar(grid, centerNode, floorNode)) fail("no path back down from center platform");
console.log("✅ nav-grid + jump-links + A* OK");

// --- GOAP ---
const noLOS = { targetAlive: true, hasLOS: false, inRange: false, hpLow: false };
const plan1 = planGoap(BOT_ACTIONS, noLOS, GOAL_KILL);
console.log("plan (no LOS, kill):", plan1);
if (!plan1 || plan1[0] !== "MoveToTarget" || plan1[plan1.length - 1] !== "Shoot") {
  fail(`expected [MoveToTarget,...,Shoot], got ${JSON.stringify(plan1)}`);
}

const inFight = { targetAlive: true, hasLOS: true, inRange: true, hpLow: false };
const plan2 = planGoap(BOT_ACTIONS, inFight, GOAL_KILL);
console.log("plan (has LOS+range, kill):", plan2);
if (!plan2 || plan2.join() !== "Shoot") fail(`expected [Shoot], got ${JSON.stringify(plan2)}`);

const hurt = { hpLow: true };
const plan3 = planGoap(BOT_ACTIONS, hurt, GOAL_SURVIVE);
console.log("plan (hpLow, survive):", plan3);
if (!plan3 || plan3.join() !== "Retreat") fail(`expected [Retreat], got ${JSON.stringify(plan3)}`);

console.log("✅ GOAP planner OK");
console.log("✅ M3 AI UNIT TEST PASSED");
process.exit(0);
