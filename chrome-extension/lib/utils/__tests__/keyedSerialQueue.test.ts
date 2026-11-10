import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyedSerialQueue } from '../keyedSerialQueue';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('KeyedSerialQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs tasks with the same key one after another', async () => {
    const queue = new KeyedSerialQueue<number>();
    const first = deferred();
    const order: string[] = [];

    const a = queue.run(1, async () => {
      order.push('a:start');
      await first.promise;
      order.push('a:end');
    });
    const b = queue.run(1, async () => {
      order.push('b:start');
    });

    await flush();
    expect(order).toEqual(['a:start']);

    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('runs tasks with different keys in parallel', async () => {
    const queue = new KeyedSerialQueue<number>();
    const first = deferred();
    const order: string[] = [];

    const a = queue.run(1, async () => {
      order.push('a:start');
      await first.promise;
    });
    const b = queue.run(2, async () => {
      order.push('b:start');
    });

    await b;
    expect(order).toEqual(['a:start', 'b:start']);

    first.resolve();
    await a;
  });

  it('continues with the next task after a failure and returns results', async () => {
    const queue = new KeyedSerialQueue<string>();

    const failing = queue.run('k', async () => {
      throw new Error('boom');
    });
    const next = queue.run('k', async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('times out callers without releasing the barrier or permitting late writes after a successor', async () => {
    vi.useFakeTimers();
    const queue = new KeyedSerialQueue<number>(1000);
    const hung = deferred();
    const order: string[] = [];
    const first = queue.run(1, async () => {
      await hung.promise;
      order.push('first:write');
    });
    const second = queue.run(1, async () => {
      order.push('second:write');
    });
    const outcomes = Promise.allSettled([first, second]);

    await vi.advanceTimersByTimeAsync(1500);
    expect(order).toEqual([]);
    expect((await outcomes).every(result => result.status === 'rejected')).toBe(true);

    hung.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['first:write', 'second:write']);
  });

  it('waits for a slow task instead of abandoning it, and preserves the order', async () => {
    vi.useFakeTimers();
    const queue = new KeyedSerialQueue<number>(1000);
    const slow = deferred();
    const order: string[] = [];

    void queue.run(1, async () => {
      order.push('slow:start');
      await slow.promise;
      order.push('slow:end');
    });
    void queue.run(1, async () => {
      order.push('second');
    });

    await vi.advanceTimersByTimeAsync(900);
    expect(order).toEqual(['slow:start']);

    slow.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['slow:start', 'slow:end', 'second']);
  });

  it('keeps sequential bounded operations serialized when their total exceeds the caller deadline', async () => {
    vi.useFakeTimers();
    const queue = new KeyedSerialQueue<string>(1000);
    const order: string[] = [];
    const first = queue.run('k', async () => {
      for (let i = 0; i < 2; i++) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      order.push('first:write');
    });
    const second = queue.run('k', async () => {
      order.push('second:write');
    });
    const outcomes = Promise.allSettled([first, second]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(order).toEqual([]);
    await outcomes;
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual(['first:write', 'second:write']);
  });
});
