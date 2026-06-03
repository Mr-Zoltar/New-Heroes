// Regression for the climb-up bug: a bot on the floor must climb onto a platform
// to reach a target standing above it (was: jumps under the overhang, head-butts
// the slab, loops on the floor).
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

interface Case {
  name: string;
  tx: number;
  ty: number;
  tier: number; // must climb at least to this y (lower = higher)
  reach: number | null; // must get within this distance, or null to skip
}

const cases: Case[] = [
  { name: "LOW-LEFT", tx: 200, ty: 406, tier: 430, reach: 130 },
  { name: "LOW-RIGHT", tx: 600, ty: 406, tier: 430, reach: 130 },
  { name: "CENTER (two-hop)", tx: 400, ty: 266, tier: 430, reach: null }, // may engage from a low platform
];

for (const c of cases) {
  const engine = createEngine();
  const statics = addArena(engine.world);
  const body = createPlayerBody(400, 546); // on the floor
  Matter.World.add(engine.world, body);
  const brain = new BotBrain();
  const target = { id: "P", x: c.tx, y: c.ty };

  let minY = body.position.y;
  let minDist = Infinity;
  for (let t = 0; t < 460; t++) {
    const grounded = isGrounded(body, statics);
    const d = brain.think({
      self: { x: body.position.x, y: body.position.y, hp: 100, maxHp: 100 },
      grounded,
      target,
      nav,
    });
    applyInput(body, { seq: 0, left: d.dir < 0, right: d.dir > 0, jump: d.jump }, grounded);
    Matter.Engine.update(engine, PHYS.fixedDtMs);
    minY = Math.min(minY, body.position.y);
    minDist = Math.min(minDist, Math.hypot(body.position.x - c.tx, body.position.y - c.ty));
  }

  console.log(`${c.name}: minY=${minY.toFixed(0)} (need <=${c.tier}) minDist=${minDist.toFixed(0)} final=(${body.position.x.toFixed(0)},${body.position.y.toFixed(0)})`);
  if (minY > c.tier) fail(`${c.name}: bot never climbed up (minY=${minY.toFixed(0)}, stuck below)`);
  if (c.reach !== null && minDist > c.reach) fail(`${c.name}: climbed but never reached target (minDist=${minDist.toFixed(0)})`);
}

console.log("✅ M3 CLIMB TEST PASSED");
process.exit(0);
