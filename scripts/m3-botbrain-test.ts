// Unit test for the BotBrain fixes: no jump while descending (the "orbit" bug),
// flat-ground chase doesn't jump, and the combat nerf (reaction delay + cadence).
import { buildNavGrid, BOT_AI, PHYS } from "@new-heroes/shared";
import { BotBrain } from "../server/src/ai/BotBrain";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

const nav = buildNavGrid();

// 1) Target clearly below + out of range => walk toward it, NEVER jump (was the loop).
{
  const bot = new BotBrain();
  const d = bot.think({
    self: { x: 400, y: 266, hp: 100, maxHp: 100 },
    grounded: true,
    target: { id: "P", x: 120, y: 546 },
    nav,
  });
  if (d.jump) fail("bot jumps while descending toward a target below (orbit bug)");
  if (d.dir !== -1) fail(`expected dir -1 toward target, got ${d.dir}`);
  console.log("✅ descends without jumping (no orbit)");
}

// 2) Flat-ground chase => move toward, no jump.
{
  const bot = new BotBrain();
  const d = bot.think({
    self: { x: 120, y: 546, hp: 100, maxHp: 100 },
    grounded: true,
    target: { id: "P", x: 700, y: 546 },
    nav,
  });
  if (d.jump) fail("bot jumps on flat-ground chase");
  if (d.dir !== 1) fail(`expected dir 1, got ${d.dir}`);
  console.log("✅ flat chase moves without jumping");
}

// 3) Combat nerf: reaction delay before first shot + slow cadence.
{
  const bot = new BotBrain();
  const ctx = {
    self: { x: 400, y: 546, hp: 100, maxHp: 100 },
    grounded: true,
    target: { id: "P", x: 470, y: 546 }, // close, clear LOS
    nav,
  };
  const shootTicks: number[] = [];
  for (let t = 1; t <= 120; t++) {
    if (bot.think(ctx).shoot) shootTicks.push(t);
  }
  const expReact = Math.round(BOT_AI.reactionMs / PHYS.fixedDtMs);
  const expFire = Math.round(BOT_AI.fireIntervalMs / PHYS.fixedDtMs);
  if (shootTicks.length < 2) fail(`bot barely shot (${shootTicks.length})`);
  if (shootTicks[0] < expReact || shootTicks[0] > expReact + 3) {
    fail(`first shot at tick ${shootTicks[0]}, expected ~${expReact} (reaction delay)`);
  }
  const gap = shootTicks[1] - shootTicks[0];
  if (Math.abs(gap - expFire) > 2) fail(`fire interval ${gap} ticks, expected ~${expFire}`);
  console.log(`✅ nerf: first shot @${shootTicks[0]} (~${expReact}), interval ${gap} (~${expFire})`);
}

console.log("✅ M3 BOTBRAIN UNIT TEST PASSED");
process.exit(0);
