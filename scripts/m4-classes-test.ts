// Unit test for M4 classes: distinct stats + per-class movement speed.
import Matter from "matter-js";
import {
  CLASSES,
  CLASS_IDS,
  resolveClass,
  createEngine,
  addArena,
  createPlayerBody,
  applyInput,
} from "@new-heroes/shared";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

// 1) Three distinct, sensible classes.
if (CLASS_IDS.length !== 3) fail(`expected 3 classes, got ${CLASS_IDS.length}`);
if (new Set(CLASS_IDS.map((id) => CLASSES[id].maxHp)).size !== 3) fail("class HP not distinct");
if (CLASSES.juggernaut.maxHp <= CLASSES.mercenary.maxHp) fail("juggernaut should be tankier");
if (CLASSES.sniper.maxHp >= CLASSES.mercenary.maxHp) fail("sniper should be squishier");
if (CLASSES.sniper.weapon.damage <= CLASSES.mercenary.weapon.damage) fail("sniper should hit harder");
if (CLASSES.juggernaut.weapon.pellets < 2) fail("shotgun should fire multiple pellets");
if (CLASSES.juggernaut.moveSpeed >= CLASSES.mercenary.moveSpeed) fail("juggernaut should be slower");
if (resolveClass("bogus").id !== "mercenary") fail("resolveClass should default to mercenary");
console.log(
  `✅ class defs: ${CLASS_IDS.map((id) => `${CLASSES[id].name}(hp${CLASSES[id].maxHp})`).join(" ")}`,
);

// 2) Per-class movement speed flows through applyInput.
const engine = createEngine();
addArena(engine.world);
const body = createPlayerBody(400, 200);
Matter.World.add(engine.world, body);

applyInput(body, { seq: 0, left: false, right: true, jump: false }, false, CLASSES.mercenary.moveSpeed);
if (Math.abs(body.velocity.x - CLASSES.mercenary.moveSpeed) > 1e-9) fail(`merc speed wrong: ${body.velocity.x}`);

applyInput(body, { seq: 0, left: false, right: true, jump: false }, false, CLASSES.juggernaut.moveSpeed);
if (Math.abs(body.velocity.x - CLASSES.juggernaut.moveSpeed) > 1e-9) fail(`jugg speed wrong: ${body.velocity.x}`);
console.log(`✅ per-class moveSpeed applied (merc ${CLASSES.mercenary.moveSpeed}, jugg ${CLASSES.juggernaut.moveSpeed})`);

console.log("✅ M4 CLASSES UNIT TEST PASSED");
process.exit(0);
