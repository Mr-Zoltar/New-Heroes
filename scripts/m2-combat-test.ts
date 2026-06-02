// Pure unit test of the hitscan raycaster (ray vs axis-aligned boxes).
import {
  raycast,
  arenaRayTargets,
  ARENA_WIDTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  WEAPON,
  type RayTarget,
} from "@new-heroes/shared";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}
const playerTarget = (id: string, x: number, y: number): RayTarget => ({
  id,
  cx: x,
  cy: y,
  halfW: PLAYER_WIDTH / 2,
  halfH: PLAYER_HEIGHT / 2,
});
const RIGHT = 0;
const LEFT = Math.PI;

// 1) Direct hit on a player to the right (clear lane at y=200).
{
  const targets = [...arenaRayTargets(), playerTarget("P", 650, 200)];
  const hit = raycast(400, 200, RIGHT, WEAPON.range, targets);
  if (hit.id !== "P") fail(`expected to hit P, got ${hit.id}`);
  const expectedX = 650 - PLAYER_WIDTH / 2;
  if (Math.abs(hit.x - expectedX) > 0.5) fail(`hit point x=${hit.x} expected≈${expectedX}`);
  console.log(`✅ direct hit P at x=${hit.x.toFixed(1)} (dist=${hit.dist.toFixed(1)})`);
}

// 2) Wall blocks a target placed beyond the arena.
{
  const targets = [...arenaRayTargets(), playerTarget("P", 900, 200)];
  const hit = raycast(400, 200, RIGHT, WEAPON.range, targets);
  if (hit.id !== null) fail(`expected wall (null), got ${hit.id}`);
  const innerRightWall = ARENA_WIDTH - 32;
  if (Math.abs(hit.x - innerRightWall) > 0.5) fail(`wall hit x=${hit.x} expected≈${innerRightWall}`);
  console.log(`✅ wall blocks shot at x=${hit.x.toFixed(1)}`);
}

// 3) Nearest of two players is chosen.
{
  const targets = [...arenaRayTargets(), playerTarget("FAR", 700, 200), playerTarget("NEAR", 600, 200)];
  const hit = raycast(400, 200, RIGHT, WEAPON.range, targets);
  if (hit.id !== "NEAR") fail(`expected NEAR, got ${hit.id}`);
  console.log(`✅ nearest target chosen (${hit.id})`);
}

// 4) Shooting away from the player does not hit it.
{
  const targets = [...arenaRayTargets(), playerTarget("P", 650, 200)];
  const hit = raycast(400, 200, LEFT, WEAPON.range, targets);
  if (hit.id === "P") fail("hit P while aiming the other way");
  console.log(`✅ aiming away misses P (hit ${hit.id ?? "wall"})`);
}

// 5) Point-blank overlap (origin inside target box) registers a hit at dist 0.
{
  const targets = [playerTarget("P", 400, 200)];
  const hit = raycast(400, 200, RIGHT, WEAPON.range, targets);
  if (hit.id !== "P" || hit.dist > 0.001) fail(`point-blank failed: id=${hit.id} dist=${hit.dist}`);
  console.log(`✅ point-blank hit (dist=${hit.dist})`);
}

console.log("✅ M2 RAYCAST UNIT TEST PASSED");
process.exit(0);
