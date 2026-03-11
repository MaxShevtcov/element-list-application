export interface Item {
  id: string;
}

/**
 * In-memory data store for 1,000,000 elements.
 * Uses numeric range [1..maxNumericId] for original items.
 * Custom (user-added) IDs stored separately in a sorted array.
 * Tracks which items are selected and their drag&drop sort order.
 */
export class Store {
  /** Upper bound of the numeric range (inclusive). Starts at 1_000_000. */
  private maxNumericId: number = 1_000_000;

  /** Set of ALL existing IDs (both numeric-as-string and custom) for dedup */
  private allIdsSet: Set<string> = new Set();

  /** Custom (non-original-range) IDs, kept sorted for stable iteration */
  private customIds: string[] = [];

  /** Ordered array of selected item IDs (maintains drag&drop order) */
  private selectedOrder: string[] = [];

  /** Set for O(1) lookup of selected IDs */
  private selectedSet: Set<string> = new Set();

  private version: number = 0;
  private changeCallbacks: Array<() => void> = [];

  constructor() {
    // Pre-populate the allIdsSet with stringified 1..1_000_000
    for (let i = 1; i <= this.maxNumericId; i++) {
      this.allIdsSet.add(String(i));
    }
  }

  /** Check if an item ID exists */
  hasItem(id: string): boolean {
    return this.allIdsSet.has(id);
  }

  /** Add a new item. Returns false if ID already exists. */
  addItem(id: string): boolean {
    if (this.allIdsSet.has(id)) return false;
    this.allIdsSet.add(id);
    // Insert into customIds in sorted order
    this.insertCustomId(id);
    return true;
  }

  /** Add multiple items at once. Returns count of actually added. */
  addItems(ids: string[]): number {
    let added = 0;
    for (const id of ids) {
      if (!this.allIdsSet.has(id)) {
        this.allIdsSet.add(id);
        this.insertCustomId(id);
        added++;
      }
    }
    return added;
  }

  /** Add multiple items at once. Returns Set of IDs that were actually added (did not exist before). */
  addItemsBatch(ids: string[]): Set<string> {
    const added = new Set<string>();
    for (const id of ids) {
      if (!this.allIdsSet.has(id)) {
        this.allIdsSet.add(id);
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
    // Binary search to keep customIds sorted
    let lo = 0, hi = this.customIds.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.compareIds(this.customIds[mid], id) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.customIds.splice(lo, 0, id);
  }

  /** Compare two IDs: numeric first (ascending), then lexicographic */
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

  /** Select an item (move to right panel). */
  selectItem(id: string): boolean {
    if (!this.allIdsSet.has(id) || this.selectedSet.has(id)) return false;
    this.selectedSet.add(id);
    this.selectedOrder.push(id);
    this.bumpVersion();
    return true;
  }

  /** Deselect an item (move to left panel). */
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

  /**
   * Count how many selected IDs fall in the numeric range [1..maxNumericId].
   */
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

  /**
   * Build a sorted array of selected numeric IDs for efficient skip-ahead.
   */
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

  /**
   * Get unselected items with pagination and optional filter.
   *
   * NO FILTER: total is computed mathematically. Items are yielded by
   * iterating only the numeric range around [offset..offset+limit], using
   * a sorted list of selected-numeric-IDs to skip gaps efficiently.
   *
   * WITH FILTER: linear scan is necessary, but we early-exit once we have
   * enough items and still count total.
   */
  getUnselectedItems(offset: number, limit: number, filter?: string): { items: Item[]; total: number } {
    if (!filter) {
      return this.getUnselectedNoFilter(offset, limit);
    }
    return this.getUnselectedFiltered(offset, limit, filter);
  }

  private getUnselectedNoFilter(offset: number, limit: number): { items: Item[]; total: number } {
    const numericSelectedCount = this.countNumericSelected();
    const numericUnselected = this.maxNumericId - numericSelectedCount;

    // Count custom unselected
    let customUnselected = 0;
    for (const id of this.customIds) {
      if (!this.selectedSet.has(id)) customUnselected++;
    }
    const total = numericUnselected + customUnselected;

    const result: Item[] = [];

    if (offset < numericUnselected) {
      // Need some items from the numeric range
      // Use sorted selected list to skip efficiently
      const selNums = this.getSelectedNumericSorted();

      // Find the starting numeric value for `offset` unselected items
      // Use the selected-sorted array to jump:
      // Between selNums[k-1]+1 and selNums[k]-1 there are (selNums[k]-selNums[k-1]-1) unselected
      let unselectedSeen = 0;
      let startNum = 1;
      let selPtr = 0;

      // Skip ahead in chunks between selected numbers
      while (selPtr < selNums.length && unselectedSeen + (selNums[selPtr] - startNum) <= offset) {
        unselectedSeen += selNums[selPtr] - startNum; // unselected items before selNums[selPtr]
        startNum = selNums[selPtr] + 1;
        selPtr++;
      }

      // Now startNum..maxNumericId has remaining unselected, need to skip (offset - unselectedSeen) more
      const remaining = offset - unselectedSeen;
      startNum += remaining;

      // Collect items from startNum, skipping selected
      for (let i = startNum; i <= this.maxNumericId && result.length < limit; i++) {
        if (this.selectedSet.has(String(i))) continue;
        result.push({ id: String(i) });
      }
    }

    // If we still need more items, get from custom IDs
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

  private getUnselectedFiltered(offset: number, limit: number, filter: string): { items: Item[]; total: number } {
    const result: Item[] = [];
    let count = 0;
    let skipped = 0;
    let collected = false; // true once we have limit items

    // Numeric range
    for (let i = 1; i <= this.maxNumericId; i++) {
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

  /**
   * Get selected items with pagination and optional filter.
   * Maintains the drag&drop sort order.
   */
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

  /**
   * Reorder selected items via drag&drop.
   * Works with filtered list positions — maps back to the full order.
   */
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
    return this.allIdsSet.size;
  }

  getVersion(): number {
    return this.version;
  }

  async waitForChange(lastVersion: number, timeoutMs: number): Promise<number> {
    if (this.version > lastVersion) {
      return this.version;
    }
    return new Promise<number>((resolve) => {
      let settled = false;
      const notify = () => {
        if (settled) return;
        settled = true;
        resolve(this.version);
      };
      this.changeCallbacks.push(notify);
      setTimeout(notify, timeoutMs);
    });
  }

  private bumpVersion(): void {
    this.version++;
    const callbacks = this.changeCallbacks;
    this.changeCallbacks = [];
    for (const cb of callbacks) cb();
  }

  getSelectedCount(): number {
    return this.selectedSet.size;
  }
}

// Singleton
export const store = new Store();
