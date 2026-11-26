/**
 * Runs async tasks one at a time per key. Tasks with different keys run in parallel.
 *
 * Serialization is never relaxed: a successor starts only after the previous task
 * for the same key has fully settled. Only the CALLER'S result is bounded by
 * `maxWaitMs` — the awaiting promise rejects early so listeners are not blocked,
 * while the task itself (and every successor behind it) continues to run and
 * settle in order. Tasks are expected to bound their own requests (AbortSignal
 * timeouts) so a hung network call cannot stall the chain indefinitely.
 */
export class KeyedSerialQueue<K> {
  private readonly tails = new Map<K, Promise<void>>();

  constructor(
    private readonly maxWaitMs: number = 15000,
    private readonly onTimeout?: (key: K, error: Error) => void,
  ) {}

  run<T>(key: K, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);

    // The task chain waits for actual settlement of the previous task, always.
    const taskChain = (previous ?? Promise.resolve()).then(task);

    // The barrier tracks the task chain itself, so successors can never
    // start while this task is still running.
    const settled = taskChain.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) {
        this.tails.delete(key);
      }
    });

    // The caller may stop waiting after maxWaitMs, but that never releases
    // the serialization barrier for other tasks.
    return this.boundCaller(key, taskChain);
  }

  private async boundCaller<T>(key: K, taskChain: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Task for key ${String(key)} exceeded ${this.maxWaitMs}ms; caller stopped waiting`);
        this.onTimeout?.(key, error);
        reject(error);
      }, this.maxWaitMs);
    });
    try {
      return await Promise.race([taskChain, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
