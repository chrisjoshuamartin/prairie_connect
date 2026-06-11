/**
 * Aurora auto-pauses at 0 ACU; the first API call after a pause can 500
 * while the cluster resumes (~15-30s, longer than the API's own internal
 * retry budget). Retry 5xx responses a couple of times so an admin opening
 * the dashboard after idle gets a slow page instead of an error.
 */
const RETRY_DELAY_MS = 6000;

export async function fetchWithWakeRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res;
      last = res;
    } catch (err) {
      if (i === attempts - 1) throw err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return last!;
}
