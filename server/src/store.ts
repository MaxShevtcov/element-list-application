export interface Item {
  id: string;
}

export class Store {
  private maxNumericId: number = 1_000_000;

  private customIdsSet: Set<string> = new Set();

  private customIds: string[] = [];

  private selectedOrder: string[] = [];

  private selectedSet: Set<string> = new Set();

  private version: number = 0;
  private changeCallbacks: Map<number, () => void> = new Map();
  private callbackIdCounter: number = 0;

  constructor() {
  }

  private isExistingId(id: string): boolean {
    const n = Number(id);
    if (Number.isFinite(n) && String(n) === id && n >= 1 && n <= this.maxNumericId) return true;
    return this.customIdsSet.has(id);
  }

  hasItem(id: string): boolean {
    return this.isExistingId(id);
  }

  addItem(id: string): boolean {
    if (this.isExistingId(id)) return false;
    this.customIdsSet.add(id);
    this.insertCustomId(id);
    return true;
  }

  addItems(ids: string[]): number {
    let added = 0;
    for (const id of ids) {
      if (!this.isExistingId(id)) {
        this.customIdsSet.add(id);
        this.insertCustomId(id);
        added++;
      }
    }
    return added;
  }

  addItemsBatch(ids: string[]): Set<string> {
    const added = new Set<string>();
    for (const id of ids) {
      if (!this.isExistingId(id)) {
        this.customIdsSet.add(id);
        this.insertCustomId(id);
        added.add(id);
      }
    }
    if (added.size > 0) {
      this.bumpVersion();
    }
    return added;
  }

  private insertCustomId(id: string): void {
    let lo = 0, hi = this.customIds.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.compareIds(this.customIds[mid], id) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.customIds.splice(lo, 0, id);
  }

  private compareIds(a: string, b: string): number {
    const numA = Number(a);
    const numB = Number(b);
    const aIsNum = Number.isFinite(numA) && String(numA) === a;
    const bIsNum = Number.isFinite(numB) && String(numB) === b;
    if (aIsNum && bIsNum) return numA - numB;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  }

  selectItem(id: string): boolean {
    if (!this.isExistingId(id) || this.selectedSet.has(id)) return false;
    this.selectedSet.add(id);
    this.selectedOrder.push(id);
    this.bumpVersion();
    return true;
  }

  deselectItem(id: string): boolean {
    if (!this.selectedSet.has(id)) return false;
    this.selectedSet.delete(id);
    this.selectedOrder = this.selectedOrder.filter(sid => sid !== id);
    this.bumpVersion();
    return true;
  }

  isSelected(id: string): boolean {
    return this.selectedSet.has(id);
  }

  private countNumericSelected(): number {
    let count = 0;
    for (const sid of this.selectedSet) {
      const n = Number(sid);
      if (Number.isFinite(n) && String(n) === sid && n >= 1 && n <= this.maxNumericId) {
        count++;
      }
    }
    return count;
  }

  private getSelectedNumericSorted(): number[] {
    const nums: number[] = [];
    for (const sid of this.selectedSet) {
      const n = Number(sid);
      if (Number.isFinite(n) && String(n) === sid && n >= 1 && n <= this.maxNumericId) {
        nums.push(n);
      }
    }
    return nums.sort((a, b) => a - b);
  }

  async getUnselectedItems(offset: number, limit: number, filter?: string): Promise<{ items: Item[]; total: number }> {
    if (!filter) {
      return this.getUnselectedNoFilter(offset, limit);
    }
    return this.getUnselectedFiltered(offset, limit, filter);
  }

  private getUnselectedNoFilter(offset: number, limit: number): { items: Item[]; total: number } {
    const numericSelectedCount = this.countNumericSelected();
    const numericUnselected = this.maxNumericId - numericSelectedCount;

    let customUnselected = 0;
    for (const id of this.customIds) {
      if (!this.selectedSet.has(id)) customUnselected++;
    }
    const total = numericUnselected + customUnselected;

    const result: Item[] = [];

    if (offset < numericUnselected) {
      const selNums = this.getSelectedNumericSorted();

      let unselectedSeen = 0;
      let startNum = 1;
      let selPtr = 0;

      while (selPtr < selNums.length && unselectedSeen + (selNums[selPtr] - startNum) <= offset) {
        unselectedSeen += selNums[selPtr] - startNum;
        startNum = selNums[selPtr] + 1;
        selPtr++;
      }

      const remaining = offset - unselectedSeen;
      startNum += remaining;

      for (let i = startNum; i <= this.maxNumericId && result.length < limit; i++) {
        if (this.selectedSet.has(String(i))) continue;
        result.push({ id: String(i) });
      }
    }

    if (result.length < limit) {
      const customOffset = Math.max(0, offset - numericUnselected);
      let customSkipped = 0;
      for (const id of this.customIds) {
        if (this.selectedSet.has(id)) continue;
        if (customSkipped < customOffset) { customSkipped++; continue; }
        result.push({ id });
        if (result.length >= limit) break;
      }
    }

    return { items: result, total };
  }

  private async getUnselectedFiltered(offset: number, limit: number, filter: string): Promise<{ items: Item[]; total: number }> {
    const result: Item[] = [];
    let count = 0;
    let skipped = 0;
    let collected = false; // true once we have limit items

    for (let i = 1; i <= this.maxNumericId; i++) {
      if (i % 50_000 === 0) {
        await new Promise<void>(r => setImmediate(r));
      }
      const id = String(i);
      if (this.selectedSet.has(id)) continue;
      if (!id.includes(filter)) continue;
      count++;
      if (!collected) {
        if (skipped < offset) { skipped++; }
        else {
          result.push({ id });
          if (result.length >= limit) collected = true;
        }
      }
    }

    // Custom IDs
    for (const id of this.customIds) {
      if (this.selectedSet.has(id)) continue;
      if (!id.includes(filter)) continue;
      count++;
      if (!collected) {
        if (skipped < offset) { skipped++; }
        else {
          result.push({ id });
          if (result.length >= limit) collected = true;
        }
      }
    }

    return { items: result, total: count };
  }

  getSelectedItems(offset: number, limit: number, filter?: string): { items: Item[]; total: number } {
    let filtered: string[];
    if (filter) {
      filtered = this.selectedOrder.filter(id => id.includes(filter));
    } else {
      filtered = this.selectedOrder;
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map(id => ({ id }));
    return { items, total };
  }

  reorderSelected(itemId: string, newIndex: number, filter?: string): boolean {
    if (!this.selectedSet.has(itemId)) return false;
    let changed = false;

    if (filter) {
      const filteredIds = this.selectedOrder.filter(id => id.includes(filter));
      const oldFilteredIndex = filteredIds.indexOf(itemId);
      if (oldFilteredIndex === -1) return false;
      filteredIds.splice(oldFilteredIndex, 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, filteredIds.length));
      filteredIds.splice(clampedIndex, 0, itemId);

      // Rebuild selectedOrder by replacing filtered positions
      const newOrder: string[] = [];
      let filteredPtr = 0;
      for (const id of this.selectedOrder) {
        if (id.includes(filter)) {
          newOrder.push(filteredIds[filteredPtr++]);
        } else {
          newOrder.push(id);
        }
      }
      this.selectedOrder = newOrder;
      changed = true;
    } else {
      const oldIndex = this.selectedOrder.indexOf(itemId);
      if (oldIndex === -1) return false;
      this.selectedOrder.splice(oldIndex, 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, this.selectedOrder.length));
      this.selectedOrder.splice(clampedIndex, 0, itemId);
      changed = true;
    }

    if (changed) this.bumpVersion();
    return changed;
  }

  getTotalCount(): number {
    return this.maxNumericId + this.customIdsSet.size;
  }

  getVersion(): number {
    return this.version;
  }

  async waitForChange(lastVersion: number, timeoutMs: number, signal?: AbortSignal): Promise<number | null> {
    if (this.version > lastVersion) return this.version;
    if (signal?.aborted) return null;

    return new Promise<number | null>((resolve) => {
      const id = ++this.callbackIdCounter;
      let done = false;

      const finish = (value: number | null) => {
        if (done) return;
        done = true;
        this.changeCallbacks.delete(id);
        resolve(value);
      };

      this.changeCallbacks.set(id, () => finish(this.version));
      const timer = setTimeout(() => finish(this.version), timeoutMs);

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        finish(null);
      }, { once: true });
    });
  }

  private bumpVersion(): void {
    this.version++;
    const callbacks = [...this.changeCallbacks.values()];
    this.changeCallbacks.clear();
    for (const cb of callbacks) cb();
  }

  getSelectedCount(): number {
    return this.selectedSet.size;
  }
}

export const store = new Store();
