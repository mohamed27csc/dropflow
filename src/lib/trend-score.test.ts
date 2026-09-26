import { test } from "node:test";
import assert from "node:assert/strict";
import { findRising } from "./trend-score.ts";

const now = new Date("2026-09-25T12:00:00Z").getTime();
const s = (pid: string, day: string, n: number) => ({ cj_pid: pid, day, listed_num: n });

test("tendance : produit qui progresse vite détecté, stable et bruit ignorés", () => {
  const r = findRising(
    [
      s("hot", "2026-09-21", 40), s("hot", "2026-09-25", 130),
      s("flat", "2026-09-21", 400), s("flat", "2026-09-25", 405),
      s("noise", "2026-09-21", 1), s("noise", "2026-09-25", 4),
      s("single", "2026-09-25", 50),
      s("old", "2026-08-01", 10), s("old", "2026-08-20", 90),
      s("falling", "2026-09-21", 300), s("falling", "2026-09-25", 100),
    ],
    { now },
  );
  assert.deepEqual(r.map((x) => x.cj_pid), ["hot"]);
  assert.equal(r[0].growthPct, 225);
  assert.equal(r[0].days, 4);
  assert.equal(r[0].perDay, 22.5);
});

test("tendance : classement du plus rapide au plus lent", () => {
  const r = findRising([s("a", "2026-09-22", 20), s("a", "2026-09-25", 40), s("b", "2026-09-22", 20), s("b", "2026-09-25", 100)], { now });
  assert.deepEqual(r.map((x) => x.cj_pid), ["b", "a"]);
});
