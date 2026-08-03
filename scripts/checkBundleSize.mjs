import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard the download.
 *
 * The world is meant to open on a phone over a mediocre connection, and the
 * thing that quietly ruins that is not a slow frame but a large bundle. A
 * frame drop is felt by whoever is already there; a bundle regression is felt
 * by everyone who never arrives, which is the audience nobody measures.
 *
 * Three decisions worth stating:
 *
 * **Measured gzipped.** That is what is actually transferred, and raw bytes
 * would flag a change in a compressible chunk that costs a visitor nothing.
 *
 * **Budgeted per group rather than in total.** A total tells you something
 * grew; a group tells you what, which is the difference between a number
 * somebody raises and a number somebody investigates. The groups are the ones
 * the bundler is configured to emit, so a chunk that escapes its group shows
 * up as an unexpected entry rather than hiding inside a sum.
 *
 * **Headroom is small and deliberate.** A budget set far above the current
 * size never fires; one set exactly at it fires on every rounding change. The
 * allowance below is enough to absorb a dependency patch and not enough to
 * absorb a new dependency.
 */

const BUDGETS = [
  // three.js dominates and is the thing most worth watching: it is the
  // difference between opening on a phone and not.
  { name: "three", maxKb: 200 },
  // Raised from 60 when the world stopped being procedural: a world made of
  // files needs a glTF loader, and that is about 20 kB gzipped. Recorded here
  // rather than absorbed quietly, because the difference between a budget
  // that moves for a reason and one that moves because it was in the way is
  // the whole value of having one.
  { name: "r3f", maxKb: 80 },
  { name: "index", maxKb: 70 },
];

/** Anything not matched by a budget must still not be large on its own. */
const UNGROUPED_MAX_KB = 40;

const dir = join(process.cwd(), "dist", "assets");

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`no build found at ${dir} — run the build first`);
  process.exit(1);
}

if (files.length === 0) {
  console.error("the build produced no javascript, which cannot be right");
  process.exit(1);
}

const measured = files.map((file) => {
  const raw = readFileSync(join(dir, file));
  return { file, kb: gzipSync(raw).length / 1024 };
});

const problems = [];
const rows = [];

for (const budget of BUDGETS) {
  // Chunk names carry a content hash, so match the group prefix.
  const group = measured.filter((m) => m.file.startsWith(`${budget.name}-`));
  if (group.length === 0) {
    problems.push(
      `no chunk named "${budget.name}" was emitted; the bundler's chunk groups ` +
        `have changed and this budget is no longer measuring anything`,
    );
    continue;
  }
  const kb = group.reduce((sum, m) => sum + m.kb, 0);
  rows.push({ name: budget.name, kb, maxKb: budget.maxKb });
  if (kb > budget.maxKb) {
    problems.push(`${budget.name} is ${kb.toFixed(1)} kB gzipped, over its ${budget.maxKb} kB budget`);
  }
}

const grouped = new Set(
  BUDGETS.flatMap((b) => measured.filter((m) => m.file.startsWith(`${b.name}-`)).map((m) => m.file)),
);
for (const entry of measured) {
  if (grouped.has(entry.file)) continue;
  rows.push({ name: entry.file, kb: entry.kb, maxKb: UNGROUPED_MAX_KB });
  if (entry.kb > UNGROUPED_MAX_KB) {
    problems.push(
      `${entry.file} is ${entry.kb.toFixed(1)} kB gzipped, over the ${UNGROUPED_MAX_KB} kB ` +
        `allowed for a chunk outside a named group`,
    );
  }
}

const total = measured.reduce((sum, m) => sum + m.kb, 0);
for (const row of rows.sort((a, b) => b.kb - a.kb)) {
  const share = ((row.kb / row.maxKb) * 100).toFixed(0);
  console.log(`${row.name.padEnd(34)} ${row.kb.toFixed(1).padStart(7)} kB  (${share}% of budget)`);
}
console.log(`${"total".padEnd(34)} ${total.toFixed(1).padStart(7)} kB gzipped`);

if (problems.length > 0) {
  console.error("\nbundle budget exceeded:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
