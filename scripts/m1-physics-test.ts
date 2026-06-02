// Pure unit test of the shared deterministic physics + the netcode reconciliation
// math. No network — validates the foundation client prediction relies on.
import Matter from "matter-js";
import {
  createEngine,
  addArena,
  createPlayerBody,
  simulateStep,
  isGrounded,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_HEIGHT,
  type InputCommand,
} from "@new-heroes/shared";

function makeWorld(x: number, y: number) {
  const engine = createEngine();
  const statics = addArena(engine.world);
  const body = createPlayerBody(x, y);
  Matter.World.add(engine.world, body);
  return { engine, statics, body };
}
const cmd = (seq: number, o: Partial<InputCommand> = {}): InputCommand => ({
  seq,
  left: false,
  right: false,
  jump: false,
  ...o,
});
function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

// 1) Determinism — identical worlds + identical inputs => identical state.
{
  const A = makeWorld(400, 120);
  const B = makeWorld(400, 120);
  for (let i = 1; i <= 120; i++) {
    const inp = cmd(i, { right: i % 3 !== 0, jump: i === 30 });
    simulateStep(A.engine, A.body, A.statics, inp);
    simulateStep(B.engine, B.body, B.statics, inp);
  }
  const dx = Math.abs(A.body.position.x - B.body.position.x);
  const dy = Math.abs(A.body.position.y - B.body.position.y);
  if (dx > 1e-6 || dy > 1e-6) fail(`nondeterministic: dx=${dx} dy=${dy}`);
  console.log(`✅ deterministic (dx=${dx.toExponential(1)}, dy=${dy.toExponential(1)})`);
}

// 2) Reconciliation convergence — predict 10, snap to authority@5, replay 6..10 == authority@10.
{
  const AUTH = makeWorld(400, 120);
  const CLI = makeWorld(400, 120);
  const inputs = Array.from({ length: 10 }, (_, i) => cmd(i + 1, { right: true, jump: i === 0 }));

  for (const inp of inputs) simulateStep(CLI.engine, CLI.body, CLI.statics, inp); // client predicts all
  for (let i = 0; i < 5; i++) simulateStep(AUTH.engine, AUTH.body, AUTH.statics, inputs[i]); // authority @5

  Matter.Body.setPosition(CLI.body, { x: AUTH.body.position.x, y: AUTH.body.position.y });
  Matter.Body.setVelocity(CLI.body, { x: AUTH.body.velocity.x, y: AUTH.body.velocity.y });
  for (let i = 5; i < 10; i++) simulateStep(CLI.engine, CLI.body, CLI.statics, inputs[i]); // client replays
  for (let i = 5; i < 10; i++) simulateStep(AUTH.engine, AUTH.body, AUTH.statics, inputs[i]); // authority @10

  const dx = Math.abs(CLI.body.position.x - AUTH.body.position.x);
  const dy = Math.abs(CLI.body.position.y - AUTH.body.position.y);
  if (dx > 1e-6 || dy > 1e-6) fail(`reconcile mismatch: dx=${dx} dy=${dy}`);
  console.log(`✅ reconciliation converges (dx=${dx.toExponential(1)})`);
}

// 3) Gravity — player falls and rests on the floor (x=60: clear of all platforms).
{
  const W = makeWorld(60, 120);
  for (let i = 1; i <= 240; i++) simulateStep(W.engine, W.body, W.statics, cmd(i));
  const expected = ARENA_HEIGHT - 32 - PLAYER_HEIGHT / 2; // floor top minus half player
  if (Math.abs(W.body.position.y - expected) > 2) {
    fail(`not resting on floor: y=${W.body.position.y.toFixed(1)} expected≈${expected}`);
  }
  if (!isGrounded(W.body, W.statics)) fail("isGrounded() false while resting on floor");
  console.log(`✅ gravity rests on floor (y=${W.body.position.y.toFixed(1)} ≈ ${expected})`);
}

// 4) Jump — goes up then returns to rest.
{
  const W = makeWorld(400, 120);
  for (let i = 1; i <= 240; i++) simulateStep(W.engine, W.body, W.statics, cmd(i));
  const restY = W.body.position.y;
  simulateStep(W.engine, W.body, W.statics, cmd(1000, { jump: true }));
  let minY = W.body.position.y;
  for (let i = 1; i <= 160; i++) {
    simulateStep(W.engine, W.body, W.statics, cmd(2000 + i));
    minY = Math.min(minY, W.body.position.y);
  }
  const apex = restY - minY;
  if (apex < 30) fail(`jump too small: apex=${apex.toFixed(1)}`);
  if (Math.abs(W.body.position.y - restY) > 3) {
    fail(`did not return to rest after jump: y=${W.body.position.y.toFixed(1)} rest=${restY.toFixed(1)}`);
  }
  console.log(`✅ jump arc apex=${apex.toFixed(1)}px, returned to rest`);
}

// 5) Walls — pushing right forever cannot leave the arena.
{
  const W = makeWorld(100, 150);
  for (let i = 1; i <= 400; i++) simulateStep(W.engine, W.body, W.statics, cmd(i, { right: true }));
  const innerRight = ARENA_WIDTH - 32; // right wall inner edge
  if (W.body.position.x > innerRight) {
    fail(`passed through right wall: x=${W.body.position.x.toFixed(1)} > ${innerRight}`);
  }
  console.log(`✅ wall clamps player (x=${W.body.position.x.toFixed(1)} ≤ ${innerRight})`);
}

console.log("✅ M1 PHYSICS + NETCODE UNIT TEST PASSED");
process.exit(0);
