/**
 * Aurora Serverless v2 (minCapacity 0) auto-pauses when idle. The first query
 * after a pause throws one of a small set of errors while the cluster
 * resumes (~10-30s). Detection lives here as the single source of truth.
 */
export function isAuroraWakingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "DatabaseResumingException") return true;
  // The Data API surfaces "Communications link failure" as BadRequestException
  // for a few seconds while the cluster is mid-resume. Match on message so we
  // don't false-positive on actual bad queries.
  if (
    e.name === "BadRequestException" &&
    typeof e.message === "string" &&
    e.message.includes("Communications link failure")
  ) {
    return true;
  }
  if (
    typeof e.message === "string" &&
    (e.message.includes("resuming after being auto-paused") ||
      e.message.includes("is resuming"))
  ) {
    return true;
  }
  return false;
}
