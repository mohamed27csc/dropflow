import { test } from "node:test";
import assert from "node:assert/strict";
import { createThrottle } from "./throttle.ts";

test("throttle : espace des appels lancés en parallèle (Promise.all)", async () => {
  const wait = createThrottle(60);
  const times: number[] = [];
  const t0 = Date.now();
  await Promise.all(
    [1, 2, 3, 4].map(async () => {
      await wait();
      times.push(Date.now() - t0);
    }),
  );
  times.sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 55, `écart trop court entre appels ${i - 1} et ${i} : ${times[i] - times[i - 1]} ms`);
});

test("throttle : n'attend pas si les appels sont déjà espacés naturellement", async () => {
  const wait = createThrottle(30);
  const t0 = Date.now();
  await wait();
  await new Promise((r) => setTimeout(r, 50));
  await wait();
  assert.ok(Date.now() - t0 < 90, "ne doit pas ajouter d'attente inutile");
});
