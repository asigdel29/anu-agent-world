/**
 * Drive the relay with many sockets at once and report where it bends.
 *
 * The number this is looking for is not "how many connections can be opened"
 * — that is easy and meaningless. It is **how many people can be in one room
 * before the room stops feeling live**, and those are different questions
 * because the relay's cost is quadratic: every frame one client sends is
 * forwarded to every other client, so doubling the occupants roughly
 * quadruples the work.
 *
 * So the measurement is round-trip latency under load, not throughput. A room
 * that accepts two hundred sockets and answers each of them a second later is
 * a room nobody wants to be in.
 *
 *   node scripts/loadRelay.mjs ws://localhost:8787 25 50 100
 */

const HOST = process.argv[2] ?? "ws://localhost:8787";
const STEPS = process.argv.slice(3).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const LEVELS = STEPS.length > 0 ? STEPS : [10, 25, 50, 100];

/** How long each level runs for once everybody is connected. */
const HOLD_MS = 5000;
/** The cadence real clients send at. */
const SEND_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[at];
}

async function runLevel(count) {
  const sockets = [];
  const rtts = [];
  let closedEarly = 0;
  let failedToOpen = 0;
  let framesIn = 0;
  let framesOut = 0;

  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(`${HOST}/party/world?pid=load${String(i).padStart(5, "0")}`);
        } catch {
          failedToOpen += 1;
          resolve();
          return;
        }
        const pending = new Map();
        ws.pending = pending;
        ws.onopen = () => {
          sockets.push(ws);
          resolve();
        };
        ws.onerror = () => {
          failedToOpen += 1;
          resolve();
        };
        ws.onclose = () => {
          if (sockets.includes(ws)) closedEarly += 1;
        };
        ws.onmessage = (event) => {
          framesIn += 1;
          let frame;
          try {
            frame = JSON.parse(event.data);
          } catch {
            return;
          }
          if (frame.type === "pong" && pending.has(frame.t)) {
            rtts.push(performance.now() - pending.get(frame.t));
            pending.delete(frame.t);
          }
        };
      }),
    ),
  );

  // Everybody moves at the cadence a real client uses, and every tenth frame
  // is a ping so latency is measured under the load rather than beside it.
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    for (const ws of sockets) {
      if (ws.readyState !== 1) continue;
      const t = performance.now();
      if (tick % 10 === 0) {
        ws.pending.set(Math.floor(t), t);
        ws.send(JSON.stringify({ type: "ping", t: Math.floor(t) }));
      } else {
        ws.send(
          JSON.stringify({
            type: "state",
            pos: [Math.sin(tick / 20) * 8, 24, Math.cos(tick / 20) * 8],
            yaw: (tick % 63) / 10,
            action: "walk",
            character: "a",
          }),
        );
      }
      framesOut += 1;
    }
  }, SEND_MS);

  await sleep(HOLD_MS);
  clearInterval(timer);

  for (const ws of sockets) {
    try {
      ws.close(1000, "done");
    } catch {
      /* already gone */
    }
  }
  await sleep(500);

  return {
    asked: count,
    connected: sockets.length,
    failedToOpen,
    closedEarly,
    framesOut,
    framesIn,
    // Frames in per frame out is the amplification the room is paying for.
    amplification: framesOut === 0 ? 0 : framesIn / framesOut,
    p50: percentile(rtts, 50),
    p95: percentile(rtts, 95),
    p99: percentile(rtts, 99),
    samples: rtts.length,
  };
}

console.log(`relay under load: ${HOST}\n`);
console.log(
  "level  connected  failed  closed   out      in       amp    p50ms   p95ms   p99ms",
);

for (const level of LEVELS) {
  const r = await runLevel(level);
  console.log(
    `${String(r.asked).padStart(5)}  ${String(r.connected).padStart(9)}  ` +
      `${String(r.failedToOpen).padStart(6)}  ${String(r.closedEarly).padStart(6)}  ` +
      `${String(r.framesOut).padStart(7)}  ${String(r.framesIn).padStart(7)}  ` +
      `${r.amplification.toFixed(1).padStart(5)}  ${r.p50.toFixed(1).padStart(6)}  ` +
      `${r.p95.toFixed(1).padStart(6)}  ${r.p99.toFixed(1).padStart(6)}`,
  );
  // Let the room empty before the next level, or each one inherits the last.
  await sleep(2000);
}
