// Wall time validates GPS timestamps; monotonic time controls request pacing.
export function createLocationWebClock() {
  let wall = 0, fix = 0, tried = -Infinity, published = -Infinity;
  return {
    observe(now: number) {
      const rewound = !!wall && now < wall - 5_000;
      if (rewound) fix = 0;
      wall = now;
      return rewound;
    },
    isNew(timestamp: number) { return timestamp > fix; },
    attempted(now: number) { tried = now; },
    accepted(timestamp: number, now: number) { fix = timestamp; published = now; },
    sinceAttempt(now: number) { return now - tried; },
    sincePublished(now: number) { return now - published; },
  };
}
