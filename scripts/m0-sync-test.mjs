// Headless M0 acceptance test.
// Connects TWO colyseus.js clients (same protocol the browser uses), verifies:
//   1) both clients join one room and each sees 2 players
//   2) server-authoritative movement: sending "right" input moves the player
//   3) cross-client sync: client B sees client A's moved position (matching)
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

const a = new Client(`http://localhost:${PORT}`);
const b = new Client(`http://localhost:${PORT}`);

const roomA = await a.joinOrCreate(ROOM);
const roomB = await b.joinOrCreate(ROOM);
console.log(`joined: A=${roomA.sessionId}  B=${roomB.sessionId}`);

// Let initial state replicate to both clients.
await sleep(700);

const sizeA = roomA.state.players.size;
const sizeB = roomB.state.players.size;
console.log(`players seen — A:${sizeA}  B:${sizeB}`);
if (sizeA !== 2) fail(`client A sees ${sizeA} players, expected 2`);
if (sizeB !== 2) fail(`client B sees ${sizeB} players, expected 2`);

const startX = roomA.state.players.get(roomA.sessionId).x;
const startY = roomA.state.players.get(roomA.sessionId).y;
console.log(`A start pos: x=${startX.toFixed(1)} y=${startY.toFixed(1)}`);

// Move A to the right for ~800ms via the authoritative server.
roomA.send("input", { up: false, down: false, left: false, right: true });
await sleep(800);
roomA.send("input", { up: false, down: false, left: false, right: false });
await sleep(300); // let final patch replicate

const aSelfX = roomA.state.players.get(roomA.sessionId).x;          // A's view of itself
const bViewOfAX = roomB.state.players.get(roomA.sessionId).x;       // B's view of A
console.log(`after move — A sees self x=${aSelfX.toFixed(1)}  |  B sees A x=${bViewOfAX.toFixed(1)}`);

const moved = aSelfX - startX;
if (moved < 50) fail(`player barely moved (Δx=${moved.toFixed(1)}), expected >50`);
const drift = Math.abs(aSelfX - bViewOfAX);
if (drift > 2) fail(`positions out of sync between clients (drift=${drift.toFixed(2)}px)`);

console.log(`✅ moved Δx=${moved.toFixed(1)}px, cross-client drift=${drift.toFixed(2)}px`);
console.log("✅ M0 SYNC TEST PASSED");

await roomA.leave();
await roomB.leave();
process.exit(0);
