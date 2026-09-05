// Locks contain only session identifiers, never program data.
export async function acquirePlayerLock(
  key: string,
): Promise<(() => void) | null> {
  if (navigator.locks) {
    // Briefly queue so React's development remount can release its old lock.
    // A genuinely active player still causes a bounded read-only result.
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300);
      void navigator.locks
        .request(key, { signal: controller.signal }, async () => {
          clearTimeout(timer);
          await new Promise<void>((release) => resolve(release));
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  }
  // Without a reliable device lock, keep the second-writer guarantee by
  // declining to run. Current target browsers support the Web Locks API.
  return null;
}
