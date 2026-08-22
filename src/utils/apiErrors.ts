/** Shown when `fetch` itself throws (backend down, Vite proxy ECONNREFUSED, CORS). */
export const API_UNREACHABLE_MESSAGE =
  'Cannot reach the API. Start the backend with npm run server (port 3001), or start both servers with npm run run.';

export function isNetworkFetchError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource)$/i.test(err.message)
  );
}

export function describeError(err: unknown, fallback: string): string {
  if (isNetworkFetchError(err)) return API_UNREACHABLE_MESSAGE;
  return err instanceof Error ? err.message : fallback;
}
