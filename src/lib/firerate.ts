// Matching rapid fire to a gun's fire-rate limit.
//
// Why clicking at exactly the limit is uneven: a game only sees a click on
// its next frame, so each click registers 0 to one frame late, by a
// different amount each time. Two clicks exactly one cooldown apart can
// register up to a frame closer together than that, the gun is not ready
// yet, and (in games that do not queue an early click) that click is
// simply lost. The rule that never loses one:
//   gap >= cooldown + one frame (plus a little for uneven frame times)
// `simulate` models exactly this, so the rule and the warning in the editor
// are checked against it (firerate.test.ts).

/** Frame times vary; allow for frames up to this much longer than average. */
export const FRAME_JITTER = 0.1;

export function cooldownMs(rpm: number): number {
  return 60_000 / rpm;
}

/** The fastest clicks per second that never land before the gun is ready. */
export function safeRate(rpm: number, fps: number): number | null {
  if (!(rpm > 0) || !(fps > 0)) return null;
  const frame = 1000 / fps;
  return 1000 / (cooldownMs(rpm) + frame * (1 + FRAME_JITTER));
}

export interface SimResult {
  clicks: number;
  fired: number;
  dropped: number;
  /** Shots that actually came out, per second. */
  shotsPerSec: number;
}

/** Small deterministic PRNG so results are repeatable. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** How long each press is held: MacroForge's rule (runner::rapid_hold). */
export function holdFor(rate: number, holdMs = 0): number {
  const gap = 1000 / rate;
  return holdMs > 0 ? Math.min(holdMs, gap * 0.75) : gap / 2;
}

/**
 * Click at `rate` per second (each press held `holdMs`, 0 = Auto: half the
 * gap) against a gun limited to `rpm`, in a game running at `fps` with
 * uneven frames. A press counts when the first frame after it sees it held
 * and the gun is ready; otherwise it is lost.
 */
export function simulate(rate: number, rpm: number, fps: number, { clicks = 600, seed = 7, holdMs = 0 } = {}): SimResult {
  const rand = rng(seed);
  const gap = 1000 / rate;
  const hold = holdFor(rate, holdMs);
  const cooldown = cooldownMs(rpm);
  const frame = 1000 / fps;
  let frameAt = rand() * frame;
  const nextFrame = () => (frameAt += frame * (1 + (rand() * 2 - 1) * FRAME_JITTER));
  let lastShot = -Infinity;
  let fired = 0;
  for (let i = 0; i < clicks; i++) {
    const press = i * gap;
    while (frameAt < press) nextFrame();
    if (frameAt > press + hold) continue; // released before any frame saw it
    if (frameAt - lastShot >= cooldown - 1e-9) {
      lastShot = frameAt;
      fired++;
    }
  }
  const seconds = (clicks * gap) / 1000;
  return { clicks, fired, dropped: clicks - fired, shotsPerSec: fired / seconds };
}

/** Lost clicks at a rate, averaged over a few frame alignments. */
export function dropShare(rate: number, rpm: number, fps: number, holdMs = 0): number {
  let dropped = 0;
  let clicks = 0;
  for (const seed of [3, 7, 11, 19, 23]) {
    const r = simulate(rate, rpm, fps, { seed, holdMs });
    dropped += r.dropped;
    clicks += r.clicks;
  }
  return dropped / clicks;
}
