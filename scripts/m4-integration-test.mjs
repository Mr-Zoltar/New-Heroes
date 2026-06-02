// End-to-end M4 test: loadout selection applies per-class stats, and per-class
// weapons differ (HP on join, fire rate, shotgun pellets). Uses a noBots room.
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

const client = new Client(`http://localhost:${PORT}`);
const merc = await client.joinOrCreate(ROOM, { className: "mercenary", noBots: true });
const jug = await client.joinOrCreate(ROOM, { className: "juggernaut", noBots: true });
const sni = await client.joinOrCreate(ROOM, { className: "sniper", noBots: true });
await sleep(500);

// Tally shot broadcasts per shooter (one client sees everyone's shots).
const counts = {};
merc.onMessage("shot", (e) => {
  counts[e.shooterId] = (counts[e.shooterId] || 0) + 1;
});
jug.onMessage("shot", () => {});
sni.onMessage("shot", () => {});

const stat = (room) => room.state.players.get(room.sessionId);
console.log(
  `joined: merc(${stat(merc).classId} hp${stat(merc).maxHp}) jug(${stat(jug).classId} hp${stat(jug).maxHp}) sni(${stat(sni).classId} hp${stat(sni).maxHp})`,
);

// 1) Loadout applied: per-class maxHp + classId.
if (stat(merc).classId !== "mercenary" || stat(merc).maxHp !== 100) fail("mercenary stats wrong");
if (stat(jug).classId !== "juggernaut" || stat(jug).maxHp !== 180) fail("juggernaut stats wrong");
if (stat(sni).classId !== "sniper" || stat(sni).maxHp !== 75) fail("sniper stats wrong");
console.log("✅ loadout selection applies per-class HP/classId");

// 2) Per-class weapons: fire all for ~1.5s, compare broadcast counts.
const fire = async (room, ms) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    room.send("shoot", { angle: 0 });
    await sleep(40);
  }
};
await Promise.all([fire(merc, 1500), fire(jug, 1500), fire(sni, 1500)]);
await sleep(300);

const mercShots = counts[merc.sessionId] || 0;
const jugShots = counts[jug.sessionId] || 0;
const sniShots = counts[sni.sessionId] || 0;
console.log(`shots over 1.5s — mercenary=${mercShots} juggernaut=${jugShots} sniper=${sniShots}`);

if (mercShots < 6) fail(`rifle fire rate too low (${mercShots})`);
if (sniShots > 3) fail(`sniper fire rate too high (${sniShots})`);
if (mercShots <= sniShots) fail("rifle should out-fire the sniper");
if (jugShots < 6) fail(`shotgun should emit multiple pellets (${jugShots})`);
console.log("✅ per-class weapon fire rate + shotgun pellets differ");

console.log("✅ M4 CLASSES INTEGRATION TEST PASSED");
await merc.leave();
await jug.leave();
await sni.leave();
process.exit(0);
