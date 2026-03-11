import { Request, Response } from 'express';

type QueuedOperation = {
  type: 'add';
  ids: string[];
  resolve: (result: any) => void;
} | {
  type: 'get' | 'modify';
  handler: () => any;
  resolve: (result: any) => void;
};

/**
 * Request queue with deduplication and batching.
 * - Add operations are batched every 10 seconds
 * - Get/modify operations are batched every 1 second
 */
class RequestQueue {
  private addQueue: Array<{ id: string; resolve: (result: any) => void }> = [];
  private pendingAddIds: Set<string> = new Set();
  
  private opQueue: Array<{ handler: () => any; resolve: (result: any) => void }> = [];
  
  private addTimer: NodeJS.Timeout | null = null;
  private opTimer: NodeJS.Timeout | null = null;

  private addProcessor: ((ids: string[]) => Set<string>) | null = null;

  constructor() {}

  setAddProcessor(processor: (ids: string[]) => Set<string>) {
    this.addProcessor = processor;
  }

  /**
   * Enqueue an add-item operation with deduplication.
   * IDs already in the add queue are deduplicated.
   */
  enqueueAdd(id: string): Promise<{ added: boolean; deduplicated: boolean }> {
    return new Promise((resolve) => {
      if (this.pendingAddIds.has(id)) {
        // Deduplicated — same ID already in queue
        resolve({ added: false, deduplicated: true });
        return;
      }
      
      this.pendingAddIds.add(id);
      this.addQueue.push({ id, resolve });
      
      if (!this.addTimer) {
        this.addTimer = setTimeout(() => this.processAddBatch(), 10_000);
      }
    });
  }

  /**
   * Flush add queue immediately (for testing/shutdown)
   */
  flushAdds(): void {
    if (this.addTimer) {
      clearTimeout(this.addTimer);
      this.addTimer = null;
    }
    this.processAddBatch();
  }

  private processAddBatch(): void {
    this.addTimer = null;
    
    if (this.addQueue.length === 0) return;
    
    // Snapshot BEFORE clearing — new enqueues that arrive during processing
    // will land in the next batch rather than being lost.
    const batch = [...this.addQueue];
    this.addQueue = [];
    // Remove only the IDs we snapshotted, so any enqueue that raced in stays.
    for (const b of batch) {
      this.pendingAddIds.delete(b.id);
    }

    const ids = batch.map(b => b.id);
    
    if (this.addProcessor) {
      const addedSet = this.addProcessor(ids);
      batch.forEach(b => {
        b.resolve({ added: addedSet.has(b.id), deduplicated: false });
      });
    }
  }

  /**
   * Enqueue a get/modify operation. 
   * Batched and processed every 1 second.
   */
  enqueueOperation<T>(handler: () => T): Promise<T> {
    return new Promise((resolve) => {
      this.opQueue.push({ handler, resolve });
      
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
        op.resolve({ error: String(err) });
      }
    }
  }

  /** Flush operation queue immediately */
  flushOps(): void {
    if (this.opTimer) {
      clearTimeout(this.opTimer);
      this.opTimer = null;
    }
    this.processOpBatch();
  }
}

export const requestQueue = new RequestQueue();
