/** File d'attente qui espace les appels d'au moins `minGapMs`, même lancés en parallèle (Promise.all). */
export function createThrottle(minGapMs: number) {
  let queue: Promise<void> = Promise.resolve();
  let lastAt = 0;
  return function wait(): Promise<void> {
    const next = queue.then(async () => {
      const gap = Math.max(0, lastAt + minGapMs - Date.now());
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      lastAt = Date.now();
    });
    queue = next.catch(() => {});
    return next;
  };
}
