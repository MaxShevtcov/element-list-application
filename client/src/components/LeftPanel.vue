<template>
  <div class="panel left-panel">
    <div class="panel-header">
      <h2>Все элементы</h2>
      <span class="count" :class="{ 'count--pulse': countAnimating }">{{ total.toLocaleString() }} шт.</span>
    </div>

    <div class="panel-controls">
      <input
        v-model="filter"
        type="text"
        placeholder="Фильтр по ID..."
        class="filter-input"
        @input="onFilterChange"
      />
    </div>

    <div class="add-form">
      <input
        v-model="newId"
        type="text"
        placeholder="Новый ID..."
        class="add-input"
        @keyup.enter="addItem"
      />
      <button @click="addItem" class="btn btn-add" :disabled="!newId.trim()">+</button>
    </div>
    <div v-if="addMessage" class="add-message" :class="addMessageType">{{ addMessage }}</div>

    <div class="list-container" ref="listContainer">
      <!-- Pending items (optimistic, not yet confirmed by server) -->
      <div
        v-for="pending in pendingItemsList"
        :key="`pending-${pending.id}`"
        class="item-row item-row--pending"
        :class="{ 'item-row--error': pending.status === 'error' }"
      >
        <span class="item-id">{{ pending.id }}</span>
        <Loader v-if="pending.status === 'pending'" :inline="true" />
        <span v-else class="pending-badge pending-badge--error">✕</span>
      </div>

      <div
        v-for="item in items"
        :key="item.id"
        class="item-row"
        :class="{ 'item-row--arrived': highlightedId === item.id, 'departing': departingIds.has(item.id) }"
      >
        <span class="item-id">{{ item.id }}</span>
        <button @click="selectItem(item.id)" class="btn btn-select" title="Выбрать">→</button>
      </div>
      <Loader v-if="loading" />
      <div v-if="!loading && items.length === 0" class="empty">Нет элементов</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import Loader from '@/components/Loader.vue';
import { api, pendingItems } from '@/composables/useApi';
import type { Item } from '@/types';

const emit = defineEmits<{
  (e: 'item-selected', id: string): void;
}>();

const items = ref<Item[]>([]);
const total = ref(0);
const filter = ref('');
const loading = ref(false);
const hasMore = ref(true);
// ids of items currently animating/departing when selected
const departingIds = ref(new Set<string>());

const newId = ref('');
const addMessage = ref('');
const addMessageType = ref<'success' | 'error'>('success');

const listContainer = ref<HTMLElement | null>(null);

// helper for animation delays
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Pending items: those not yet confirmed by the server, not already in the loaded list
const pendingItemsList = computed(() =>
  [...pendingItems.value.entries()]
    .filter(([id]) => !items.value.some(item => item.id === id))
    .map(([id, status]) => ({ id, status }))
);

// Highlight state when an item arrives from the right panel
const highlightedId = ref<string | null>(null);
// Animate counter pulse when total changes
const countAnimating = ref(false);

// expose a helper for parent to refresh and optionally highlight
async function refreshWithHighlight(id: string) {
  // reset pagination and reload
  hasMore.value = true;
  // in case a load was in progress we let loadItems guard it
  await loadItems(true);
  if (items.value.some(item => item.id === id)) {
    highlightedId.value = id;
    setTimeout(() => { highlightedId.value = null; }, 1200);
  }
}

// watch total for pulse animation
watch(total, () => {
  countAnimating.value = true;
  setTimeout(() => { countAnimating.value = false; }, 400);
});

let filterTimeout: ReturnType<typeof setTimeout> | null = null;

async function loadItems(reset = false) {
  if (loading.value) return;
  if (!reset && !hasMore.value) return;

  loading.value = true;
  try {
    const offset = reset ? 0 : items.value.length;
    const result = await api.getItems(offset, 20, filter.value || undefined);
    
    if (reset) {
      items.value = result.items;
    } else {
      items.value.push(...result.items);
    }
    total.value = result.total;
    hasMore.value = items.value.length < result.total;
  } catch (err) {
    console.error('Failed to load items:', err);
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  if (filterTimeout) clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    hasMore.value = true;
    loadItems(true);
  }, 300);
}

async function selectItem(id: string) {
  // optimistic: count goes down immediately and we mark the item as departing
  if (!departingIds.value.has(id)) {
    total.value--;
    departingIds.value.add(id);
    emit('item-selected', id);
  }

  const request = api.selectItem(id);

  // wait for animation before removing from the list
  await sleep(300);
  items.value = items.value.filter(item => item.id !== id);
  departingIds.value.delete(id);

  try {
    await request;
    if (items.value.length < 20 && hasMore.value) {
      await loadItems();
    }
  } catch (err) {
    console.error('Failed to select item:', err);
    await loadItems(true);
  }
}

function addItem() {
  const id = newId.value.trim();
  if (!id) return;

  addMessage.value = '';

  // If the same ID is already pending, just show a message and don't re-enqueue
  if (pendingItems.value.has(id)) {
    addMessage.value = `ID "${id}" уже в очереди добавления`;
    addMessageType.value = 'error';
    setTimeout(() => { addMessage.value = ''; }, 3000);
    return;
  }

  // Clear input immediately so the user can type the next ID right away
  newId.value = '';
  total.value++; // Optimistic increment

  // Fire-and-forget: the pending badge appears immediately via pendingItemsList
  api.addItem(id).then(result => {
    if (result.deduplicated) {
      // Already in queue (race condition) — don't double-count
      total.value--;
    } else if (!result.added) {
      // Server confirmed it already exists
      total.value--;
      addMessage.value = `ID "${id}" уже существует`;
      addMessageType.value = 'error';
      setTimeout(() => { addMessage.value = ''; }, 3000);
    }
    // On success: pending badge disappears after flushAdds confirms
  }).catch(() => {
    total.value--;
    addMessage.value = 'Ошибка при добавлении';
    addMessageType.value = 'error';
    setTimeout(() => { addMessage.value = ''; }, 5000);
  });
}

function onScroll() {
  const container = listContainer.value;
  if (!container || loading.value || !hasMore.value) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollTop + clientHeight >= scrollHeight - 100) {
    loadItems();
  }
}

// expose highlight-capable refresh to parent

// silently update counter and first page without resetting scroll/firing loader
async function silentRefresh(): Promise<void> {
  if (loading.value) return; // don't interrupt normal loading

  try {
    // Fetch as many rows as we have already loaded (covers infinite scroll)
    const fetchLimit = Math.max(items.value.length, 20);
    const result = await api.getItems(0, fetchLimit, filter.value || undefined);

    // server is the source of truth: replace the list rather than merge
    total.value = result.total;
    items.value = result.items;
    hasMore.value = result.items.length < result.total;
  } catch {
    /* ignore polling errors silently */
  }
}

defineExpose({ refreshWithHighlight, silentRefresh });

onMounted(() => {
  loadItems(true);
  nextTick(() => {
    listContainer.value?.addEventListener('scroll', onScroll, { passive: true });
  });
});
</script>

<style scoped lang="scss">
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border-radius: $radius-panel;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: $bg-controls;
  color: $text-primary;
}

.panel-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.count {
  font-size: 14px;
  opacity: 0.9;
}

.panel-controls {
  padding: 12px 16px;
  border-bottom: 1px solid $border-subtle;
  background: $bg-panel;
}

.filter-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-card-left;
  border-radius: $radius-btn;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: $bg-input;
  color: $text-primary;

  &::placeholder {
    color: $text-muted;
  }
}

.filter-input:focus {
  border-color: $accent;
}

.add-form {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid $border-subtle;
  background: $bg-panel;
}

.add-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid $border-card-left;
  border-radius: $radius-btn;
  font-size: 14px;
  outline: none;
  background: $bg-input;
  color: $text-primary;

  &::placeholder {
    color: $text-muted;
  }
}

.add-input:focus {
  border-color: $accent;
}

.add-message {
  padding: 4px 16px 8px;
  font-size: 12px;
}

.add-message.success {
  color: $success;
}

.add-message.error {
  color: $danger;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* depart animation (slide-out-right) */
@keyframes slide-out-right {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(60px); }
}
.item-row.departing {
  animation: slide-out-right 0.3s ease-in forwards;
  pointer-events: none;
}

/* highlight arrival animation */
@keyframes arrival-flash {
  0%   { background: rgba($success, 0.35); border-color: $success; box-shadow: 0 0 12px rgba($success, 0.4); }
  60%  { background: rgba($success, 0.15); border-color: rgba($success, 0.5); }
  100% { background: $bg-card-left; border-color: $border-card-left; box-shadow: none; }
}

.item-row--arrived {
  animation: arrival-flash 1.2s ease-out forwards;
}

/* counter pulse */
@keyframes count-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); color: $success; }
  100% { transform: scale(1); }
}
.count--pulse {
  animation: count-pulse 0.4s ease-out;
  display: inline-block;
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid $border-card-left;
  border-radius: $radius-card;
  background: $bg-card-left;
  margin: 4px 8px;
  transition: background 0.15s;
}

.item-row:hover {
  background: $bg-card-left-hover;
}

.item-id {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
}

.btn {
  border: none;
  border-radius: $radius-btn;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 12px;
  transition: all 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-select {
  background: $border-btn-default;
  color: $text-secondary;
}

.btn-select:hover:not(:disabled) {
  background: $accent;
  color: $text-primary;
}

.btn-add {
  background: $accent;
  color: white;
  font-weight: bold;
  font-size: 18px;
  padding: 6px 14px;
}

.btn-add:hover:not(:disabled) {
  background: $accent-hover;
}

.loading,
.empty {
  text-align: center;
  padding: 20px;
  color: $text-muted;
  font-size: 14px;
}

.item-row--pending {
  opacity: 0.65;
  background: rgba($warning, 0.08);
  border-left: 3px solid $warning;
}

.item-row--error {
  opacity: 0.65;
  background: rgba($danger, 0.08);
  border-left: 3px solid $danger;
}

.pending-badge--error {
  font-size: 12px;
  color: $danger;
  padding: 6px 12px;
}
</style>
