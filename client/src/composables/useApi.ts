import type { PaginatedResponse, AddResponse, SelectResponse, ReorderResponse } from '@/types';

const BASE_URL = '/api';

/**
 * Client-side request queue with deduplication and batching.
 * - Add operations batched every 10 seconds
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

  private async flushAdds() {
    this.addTimer = null;
    const batch = [...this.addQueue];
    this.addQueue = [];
    this.addKeys.clear();

    for (const req of batch) {
      try {
        const result = await req.executor();
        req.resolve(result);
      } catch (err) {
        req.reject(err);
      }
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
}

const queue = new ClientRequestQueue();

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
   * Get unselected items (left panel)
   */
  getItems(offset: number, limit: number = 20, filter?: string): Promise<PaginatedResponse> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (filter) params.set('filter', filter);
    const key = `items:${offset}:${limit}:${filter || ''}`;
    return queue.enqueueOp(key, () =>
      fetchJson<PaginatedResponse>(`${BASE_URL}/items?${params}`)
    );
  },

  /**
   * Get selected items (right panel)
   */
  getSelected(offset: number, limit: number = 20, filter?: string): Promise<PaginatedResponse> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (filter) params.set('filter', filter);
    const key = `selected:${offset}:${limit}:${filter || ''}`;
    return queue.enqueueOp(key, () =>
      fetchJson<PaginatedResponse>(`${BASE_URL}/selected?${params}`)
    );
  },

  /**
   * Select an item (move to right panel)
   */
  selectItem(id: string): Promise<SelectResponse> {
    const key = `select:${id}`;
    return queue.enqueueOp(key, () =>
      fetchJson<SelectResponse>(`${BASE_URL}/items/select`, {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
    );
  },

  /**
   * Deselect an item (move to left panel)
   */
  deselectItem(id: string): Promise<SelectResponse> {
    const key = `deselect:${id}`;
    return queue.enqueueOp(key, () =>
      fetchJson<SelectResponse>(`${BASE_URL}/items/deselect`, {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
    );
  },

  /**
   * Add a new item with custom ID (batched every 10 sec)
   */
  addItem(id: string): Promise<AddResponse> {
    const key = `add:${id}`;
    return queue.enqueueAdd(key, () =>
      fetchJson<AddResponse>(`${BASE_URL}/items/add`, {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
    );
  },

  /**
   * Reorder selected items (drag&drop)
   */
  reorderSelected(itemId: string, newIndex: number, filter?: string): Promise<ReorderResponse> {
    const key = `reorder:${itemId}:${newIndex}`;
    return queue.enqueueOp(key, () =>
      fetchJson<ReorderResponse>(`${BASE_URL}/selected/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ itemId, newIndex, filter }),
      })
    );
  },
};
