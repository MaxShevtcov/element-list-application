import { ref } from 'vue';
import type { PaginatedResponse, AddResponse, SelectResponse, ReorderResponse, BatchAddResponse } from '@/types';

const BASE_URL = '/api';

/**
 * Reactive map of pending add operations: id → 'pending' | 'error'
 * Exported so LeftPanel can display optimistic rows while the batch is in flight.
 */
export const pendingItems = ref(new Map<string, 'pending' | 'error'>());

/**
 * Client-side request queue with deduplication and batching.
 * - Add operations batched every 10 seconds (one HTTP request for the whole batch)
 * - Get/modify operations batched every 1 second
 */

type PendingRequest<T> = {
  key: string;
  executor: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
};

class ClientRequestQueue {
  private addQueue: PendingRequest<AddResponse>[] = [];
  private addKeys: Set<string> = new Set();
  private addTimer: ReturnType<typeof setTimeout> | null = null;

  private opQueue: PendingRequest<any>[] = [];
  private opKeys: Set<string> = new Set();
  private opTimer: ReturnType<typeof setTimeout> | null = null;

  enqueueAdd(key: string, executor: () => Promise<AddResponse>): Promise<AddResponse> {
    return new Promise((resolve, reject) => {
      // Deduplication: skip if same key is already queued
      if (this.addKeys.has(key)) {
        resolve({ added: false, deduplicated: true });
        return;
      }
      this.addKeys.add(key);
      this.addQueue.push({ key, executor, resolve, reject });

      // Optimistic pending state
      const id = key.replace('add:', '');
      pendingItems.value.set(id, 'pending');

      if (!this.addTimer) {
        this.addTimer = setTimeout(() => this.flushAdds(), 10_000);
      }
    });
  }

  enqueueOp<T>(key: string, executor: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // Deduplication for identical operations
      if (this.opKeys.has(key)) {
        // Find existing and share the result
        const existing = this.opQueue.find(q => q.key === key);
        if (existing) {
          const originalResolve = existing.resolve;
          existing.resolve = (value: any) => {
            originalResolve(value);
            resolve(value);
          };
          return;
        }
      }
      this.opKeys.add(key);
      this.opQueue.push({ key, executor, resolve, reject });

      if (!this.opTimer) {
        this.opTimer = setTimeout(() => this.flushOps(), 1_000);
      }
    });
  }

  /**
   * Last-write-wins reorder: if a reorder for the same itemId is already
   * queued, the old entry is superseded (its promise is rejected with
   * Error('superseded')) and replaced with the new one.
   */
  enqueueReorder<T>(itemId: string, executor: () => Promise<T>): Promise<T> {
    const key = `reorder:${itemId}`;
    return new Promise((resolve, reject) => {
      const existingIndex = this.opQueue.findIndex(q => q.key === key);
      if (existingIndex !== -1) {
        // Supersede old entry
        const old = this.opQueue[existingIndex];
        old.reject(new Error('superseded'));
        this.opQueue[existingIndex] = {
          key,
          executor: executor as any,
          resolve: resolve as any,
          reject,
        };
      } else {
        this.opKeys.add(key);
        this.opQueue.push({ key, executor: executor as any, resolve: resolve as any, reject });
      }

      if (!this.opTimer) {
        this.opTimer = setTimeout(() => this.flushOps(), 1_000);
      }
    });
  }

  private async flushAdds() {
    this.addTimer = null;
    if (this.addQueue.length === 0) return;

    const batch = [...this.addQueue];
    this.addQueue = [];
    this.addKeys.clear();

    // Single HTTP request for the whole batch
    const ids = batch.map(req => req.key.replace('add:', ''));
    try {
      const response = await fetchJson<BatchAddResponse>(`${BASE_URL}/items/add-batch`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      const resultMap = new Map(response.results.map(r => [r.id, r]));
      batch.forEach(req => {
        const id = req.key.replace('add:', '');
        const itemResult = resultMap.get(id);
        if (itemResult?.added) {
          pendingItems.value.delete(id);
        } else {
          pendingItems.value.set(id, 'error');
        }
        req.resolve({
          added: itemResult?.added ?? false,
          deduplicated: false,
        });
      });
    } catch (err) {
      batch.forEach(req => {
        const id = req.key.replace('add:', '');
        pendingItems.value.set(id, 'error');
        req.reject(err);
      });
    }
  }

  private async flushOps() {
    this.opTimer = null;
    const batch = [...this.opQueue];
    this.opQueue = [];
    this.opKeys.clear();

    // Execute all pending operations
    await Promise.all(
      batch.map(async (req) => {
        try {
          const result = await req.executor();
          req.resolve(result);
        } catch (err) {
          req.reject(err);
        }
      })
    );
  }

  /**
   * Cancel all pending timers and reject all queued promises.
   * Call this on page unload to avoid orphaned state.
   */
  destroy(): void {
    if (this.addTimer) { clearTimeout(this.addTimer); this.addTimer = null; }
    if (this.opTimer) { clearTimeout(this.opTimer); this.opTimer = null; }

    this.addQueue.forEach(req => req.reject(new Error('queue destroyed')));
    this.addQueue = [];
    this.addKeys.clear();

    this.opQueue.forEach(req => req.reject(new Error('queue destroyed')));
    this.opQueue = [];
    this.opKeys.clear();
  }
}

export const queue = new ClientRequestQueue();

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  /**
   * Get unselected items (left panel) — fires immediately, no queue delay
   */
  getItems(offset: number, limit: number = 20, filter?: string): Promise<PaginatedResponse> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (filter) params.set('filter', filter);
    return fetchJson<PaginatedResponse>(`${BASE_URL}/items?${params}`);
  },

  /**
   * Get selected items (right panel) — fires immediately, no queue delay
   */
  getSelected(offset: number, limit: number = 20, filter?: string): Promise<PaginatedResponse> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });  
    if (filter) params.set('filter', filter);
    return fetchJson<PaginatedResponse>(`${BASE_URL}/selected?${params}`);
  },

  /**
   * Select an item (move to right panel) — fires immediately, no queue delay
   */
  selectItem(id: string): Promise<SelectResponse> {
    return fetchJson<SelectResponse>(`${BASE_URL}/items/select`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * Deselect an item (move to left panel) — fires immediately, no queue delay
   */
  deselectItem(id: string): Promise<SelectResponse> {
    return fetchJson<SelectResponse>(`${BASE_URL}/items/deselect`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * Add a new item with custom ID.
   * Batched every 10 sec — a single HTTP request is sent for all accumulated IDs.
   */
  addItem(id: string): Promise<AddResponse> {
    const key = `add:${id}`;
    return queue.enqueueAdd(key, () =>
      // executor is kept for interface compatibility but flushAdds bypasses it
      fetchJson<AddResponse>(`${BASE_URL}/items/add-batch`, {
        method: 'POST',
        body: JSON.stringify({ ids: [id] }),
      })
    );
  },

  /**
   * Reorder selected items (drag&drop).
   * Uses last-write-wins deduplication per itemId.
   */
  reorderSelected(itemId: string, newIndex: number, filter?: string): Promise<ReorderResponse> {
    return queue.enqueueReorder(itemId, () =>
      fetchJson<ReorderResponse>(`${BASE_URL}/selected/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ itemId, newIndex, filter }),
      })
    );
  },
};

