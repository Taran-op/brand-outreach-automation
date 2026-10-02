/**
 * When a run that works in bursts should ask for another one.
 *
 * Shared by the console and the tests rather than written inline in the
 * click handler, because both mistakes it can make are expensive: stopping
 * early leaves approved leads unsent with no sign anything is outstanding,
 * and continuing past the point of refusal spends a request per burst
 * re-reading the Sheet to be told the day is over.
 */
export type BurstOutcome = {
  stoppedForTime?: boolean;
  stoppedForLimit?: boolean;
  dailyCapReached?: boolean;
  remaining?: number;
};

export const shouldContinueSending = (outcome: BurstOutcome | undefined): boolean => {
  if (!outcome) return false;
  if (outcome.dailyCapReached) return false;
  if ((outcome.remaining || 0) <= 0) return false;
  return Boolean(outcome.stoppedForTime || outcome.stoppedForLimit);
};
