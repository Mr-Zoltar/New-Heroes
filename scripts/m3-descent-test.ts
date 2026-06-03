// Hard regression for "bots can't get down to a player on a lower level".
// Simulate a bot (real Matter body + BotBrain) starting on the center platform
// with a stationary target on the floor below; it must descend and reach it.
import Matter from "matter-js";
import {
  buildNavGrid,
  createEngine,
  addArena,
  createPlayerBody,
  applyInput,
  isGrounded,
  PHYS,
} from "@new-heroes/shared";
import { BotBrain } from "../server/src/ai/BotBrain";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

const nav = buildNavGrid();
const engine = createEngine();
const statics = addArena(engine.world);
const body = createPlayerBody(400, 266); // on top of the center platform
Matter.World.add(engine.world, body);

const target = { id: "P", x: 150, y: 546 }; // stationary, on the floor, off to the side
const brain = new BotBrain();

const startY = body.position.y;
let maxY = startY;
let minDist = Infinity;
let descended = false;

for (let t = 0; t < 360; t++) {
  const grounded = isGrounded(body, statics);
  const d = brain.think({
    self: { x: body.position.x, y: body.position.y, hp: 100, maxHp: 100 },
    grounded,
    target,
    nav,
  });
  applyInput(body, { seq: 0, left: d.dir < 0, right: d.dir > 0, jump: d.jump }, grounded);
  Matter.Engine.update(engine, PHYS.fixedDtMs);

  maxY = Math.max(maxY, body.position.y);
  if (body.position.y > 500) descended = true; // got down to floor level
  minDist = Math.min(minDist, Math.hypot(body.position.x - target.x, body.position.y - target.y));
}

console.log(
  `descent: startY=${startY.toFixed(0)} maxY=${maxY.toFixed(0)} minDist=${minDist.toFixed(0)} finalPos=(${body.position.x.toFixed(0)},${body.position.y.toFixed(0)})`,
);
if (!descended) fail(`bot never reached floor level (maxY=${maxY.toFixed(0)}) — stuck up top`);
if (minDist > 200) fail(`bot got down but never near the target (minDist=${minDist.toFixed(0)})`);

console.log("✅ M3 DESCENT TEST PASSED");
process.exit(0);
