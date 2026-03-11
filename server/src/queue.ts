/**
 * Lightweight operation queue.
 * Operations are batched and executed together every 1 second.
 * Errors in handlers are properly rejected (not swallowed as resolved values).
 */
class RequestQueue {
  private opQueue: Array<{ handler: () => any; resolve: (result: any) => void; reject: (err: any) => void }> = [];
  private opTimer: NodeJS.Timeout | null = null;

  /**
   * Enqueue a synchronous operation.
   * All operations queued within the same 1-second window are executed together.
   */
  enqueueOperation<T>(handler: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.opQueue.push({ handler, resolve, reject });

      if (!this.opTimer) {
        this.opTimer = setTimeout(() => this.processOpBatch(), 1_000);
      }
    });
  }

  private processOpBatch(): void {
    this.opTimer = null;

    if (this.opQueue.length === 0) return;

    const batch = [...this.opQueue];
    this.opQueue = [];

    for (const op of batch) {
      try {
        const result = op.handler();
        op.resolve(result);
      } catch (err) {
        op.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /** Flush operation queue immediately (for testing) */
  flushOps(): void {
    if (this.opTimer) {
      clearTimeout(this.opTimer);
      this.opTimer = null;
    }
    this.processOpBatch();
  }
}

export const requestQueue = new RequestQueue();
