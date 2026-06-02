// End-to-end M3 Horde test against the live server (raw colyseus.js client).
// Verifies: bots spawn in waves, AI navigates + shoots (damages the human),
// the human can kill bots (team-filtered combat), and the wave advances once
// the wave is cleared.
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

const a = new Client(`http://localhost:${PORT}`);
const ra = await a.joinOrCreate(ROOM);
ra.onMessage("shot", () => {});
await sleep(500);

const me = () => ra.state.players.get(ra.sessionId);
const aliveBots = () => {
  let n = 0;
  ra.state.players.forEach((p) => {
    if (p.isBot && p.alive) n++;
  });
  return n;
};
const nearestBot = () => {
  const m = me();
  let best = null;
  let bd = Infinity;
  ra.state.players.forEach((p) => {
    if (!p.isBot || !p.alive) return;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  });
  return best;
};

// 1) Wave 1 spawns bots.
let botsSeen = false;
const t0 = Date.now();
while (Date.now() - t0 < 6000) {
  await sleep(100);
  if (ra.state.wave >= 1 && aliveBots() > 0) {
    botsSeen = true;
    break;
  }
}
if (!botsSeen) fail("no bots spawned for wave 1");
console.log(`wave ${ra.state.wave}, bots alive=${aliveBots()}`);

// 2) Fight: human hunts the nearest bot (move + aim + fire). Track damage, kills, wave.
let hpMin = me().hp;
let seq = 0;
const kills0 = me().kills;
const startWave = ra.state.wave;
let waveAdvanced = false;
const fightStart = Date.now();
while (Date.now() - fightStart < 30000) {
  const m = me();
  if (m.alive) {
    const b = nearestBot();
    let aim = 0;
    let left = false;
    let right = false;
    let jump = false;
    if (b) {
      aim = Math.atan2(b.y - m.y, b.x - m.x);
      left = b.x < m.x - 12;
      right = b.x > m.x + 12;
      jump = b.y < m.y - 30 && m.grounded;
    }
    seq++;
    ra.send("input", { seq, left, right, jump, aim });
    if (b) ra.send("shoot", { angle: aim });
    if (m.hp < hpMin) hpMin = m.hp;
  }
  if (ra.state.wave > startWave) {
    waveAdvanced = true;
    break;
  }
  await sleep(30);
}

const kills = me().kills - kills0;
console.log(`fight: hpMin=${hpMin} humanKills=${kills} wave ${startWave}->${ra.state.wave} advanced=${waveAdvanced}`);
if (hpMin >= 100) fail("bots never damaged the human (AI not reaching/shooting)");
if (kills < 1) fail("human could not kill any bot");
if (!waveAdvanced && kills < 3) fail("wave did not advance and fewer than 3 kills");

console.log("✅ M3 HORDE INTEGRATION TEST PASSED");
await ra.leave();
process.exit(0);
