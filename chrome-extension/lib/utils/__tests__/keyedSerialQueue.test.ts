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

  it('stops waiting for a hung task after maxWaitMs', async () => {
    vi.useFakeTimers();
    const queue = new KeyedSerialQueue<number>(1000);
    const hung = deferred();
    let secondStarted = false;

    void queue.run(1, () => hung.promise);
    const second = queue.run(1, async () => {
      secondStarted = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(secondStarted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(secondStarted).toBe(true);
  });
});
