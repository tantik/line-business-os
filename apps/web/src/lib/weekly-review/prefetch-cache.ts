import { getWeeklyReviewAction } from './weekly-review-actions';

type WeeklyReviewResult = Awaited<ReturnType<typeof getWeeklyReviewAction>>;

/**
 * Founder Acceptance QA3 2026-10-06: the Weekly Review popup's own server
 * action measured ~1.1s round-trip (real Network timing, not assumed --
 * Cloud DEV connection/cold-start, not an expensive query -- see the mission
 * record). Rather than explain the wait away, this starts the SAME request
 * the moment the Manager hovers/focuses the "週次レビュー" entry button --
 * mirroring the Recipes popup's own hover-prefetch pattern (Mission 8) --
 * so by the time they actually click, some or all of that 1.1s has already
 * elapsed in the background.
 *
 * Deliberately NOT a result cache: a hover that is never consumed by an
 * actual open is dropped after 5s, and a consumed one is removed
 * immediately (`consume`), so this can never hand back a stale summary --
 * every real open either reuses an in-flight request from moments ago or
 * starts a brand new one, never a previously-resolved value sitting around.
 */
const inFlight = new Map<number, Promise<WeeklyReviewResult>>();

export function prefetchWeeklyReview(weekOffset: number): void {
  if (inFlight.has(weekOffset)) return;
  const promise = getWeeklyReviewAction(weekOffset);
  inFlight.set(weekOffset, promise);
  promise.finally(() => {
    setTimeout(() => {
      if (inFlight.get(weekOffset) === promise) inFlight.delete(weekOffset);
    }, 5000);
  });
}

/** Takes and removes a pending prefetch, if one is still in flight for this exact week offset -- a consumed entry is never reused by a later open. */
export function consumeWeeklyReviewPrefetch(weekOffset: number): Promise<WeeklyReviewResult> | null {
  const promise = inFlight.get(weekOffset);
  if (!promise) return null;
  inFlight.delete(weekOffset);
  return promise;
}
