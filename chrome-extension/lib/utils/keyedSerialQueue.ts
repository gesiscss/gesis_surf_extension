/**
 * Runs async tasks one at a time per key. Tasks with different keys run in parallel.
 *
 * A task waits for the previous task with the same key for at most `maxWaitMs`.
 * API requests have no timeout, so this bound keeps one hung request from
 * blocking every later task for that key.
 */
export class KeyedSerialQueue<K> {
  private readonly tails = new Map<K, Promise<void>>();

  constructor(private readonly maxWaitMs: number = 15000) {}

  run<T>(key: K, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);

    const result = (async () => {
      if (previous) {
        await this.waitAtMost(previous);
      }
      return task();
    })();

    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) {
        this.tails.delete(key);
      }
    });

    return result;
  }

  private async waitAtMost(previous: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, this.maxWaitMs);
    });
    try {
      await Promise.race([previous, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
