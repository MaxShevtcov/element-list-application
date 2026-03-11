<template>
  <div class="panel right-panel">
    <div class="panel-header">
      <h2>Выбранные</h2>
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

    <div class="list-container" ref="listContainer">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="item-row"
        :data-id="item.id"
        :class="{
          'drag-over': dragOverIndex === index,
          'dragging': draggedIndex === index,
          'departing': departingIds.has(item.id),
          'item-row--arrived': highlightedId === item.id,
        }"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="onDragOver($event, index)"
        @dragenter.prevent="onDragEnter(index)"
        @dragleave="onDragLeave(index)"
        @drop.prevent="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <span class="drag-handle" title="Перетащите для сортировки">⠿</span>
        <span class="item-id">{{ item.id }}</span>
        <button @click="deselectItem(item.id)" :disabled="departingIds.has(item.id)" class="btn btn-deselect" title="Убрать">←</button>
      </div>
      <Loader v-if="loading" />
      <div v-if="!loading && items.length === 0" class="empty">Нет выбранных элементов</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import Loader from '@/components/Loader.vue';
import { api } from '@/composables/useApi';
import type { Item } from '@/types';

const emit = defineEmits<{
  (e: 'item-deselected', id: string): void;
}>();

const items = ref<Item[]>([]);
const total = ref(0);
const filter = ref('');
const loading = ref(false);
const hasMore = ref(true);
// ids of items currently animating/departing
const departingIds = ref(new Set<string>());
// highlight state for incoming item
const highlightedId = ref<string | null>(null);
// counter pulse state
const countAnimating = ref(false);

// helper for artificial delay used during animation
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const listContainer = ref<HTMLElement | null>(null);

// Drag & Drop state
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const draggedItemId = ref<string | null>(null);

let filterTimeout: ReturnType<typeof setTimeout> | null = null;

async function loadItems(reset = false) {
  if (loading.value) return;
  if (!reset && !hasMore.value) return;

  loading.value = true;
  try {
    const offset = reset ? 0 : items.value.length;
    const result = await api.getSelected(offset, 20, filter.value || undefined);

    if (reset) {
      items.value = result.items;
    } else {
      items.value.push(...result.items);
    }
    total.value = result.total;
    hasMore.value = items.value.length < result.total;
  } catch (err) {
    console.error('Failed to load selected items:', err);
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

// watch total to trigger pulse animation
watch(total, () => {
  countAnimating.value = true;
  setTimeout(() => { countAnimating.value = false; }, 400);
});

async function deselectItem(id: string) {
  if (departingIds.value.has(id)) return;
  total.value--;
  departingIds.value.add(id);

  const request = api.deselectItem(id);

  await sleep(300);
  items.value = items.value.filter(item => item.id !== id);
  departingIds.value.delete(id);

  try {
    await request;
    emit('item-deselected', id);
    if (items.value.length < 20 && hasMore.value) {
      await loadItems();
    }
  } catch (err) {
    console.error('Failed to deselect item:', err);
    total.value++;
    await loadItems(true);
  }
}

function onDragStart(event: DragEvent, index: number) {
  draggedIndex.value = index;
  draggedItemId.value = items.value[index].id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDragEnter(index: number) {
  dragOverIndex.value = index;
}

function onDragLeave(index: number) {
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null;
  }
}

async function onDrop(event: DragEvent, targetIndex: number) {
  dragOverIndex.value = null;

  if (draggedIndex.value === null || draggedItemId.value === null) return;
  if (draggedIndex.value === targetIndex) return;

  const sourceIndex = draggedIndex.value;
  const itemId = draggedItemId.value;

  const [movedItem] = items.value.splice(sourceIndex, 1);
  items.value.splice(targetIndex, 0, movedItem);

  draggedIndex.value = null;
  draggedItemId.value = null;

  try {
    await api.reorderSelected(itemId, targetIndex, filter.value || undefined);
  } catch (err: any) {
    if (err?.message === 'superseded') return; // normal — a newer reorder is queued
    console.error('Failed to reorder:', err);
    await loadItems(true);
  }
}

function onDragEnd() {
  draggedIndex.value = null;
  dragOverIndex.value = null;
  draggedItemId.value = null;
}

function onScroll() {
  const container = listContainer.value;
  if (!container || loading.value || !hasMore.value) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollTop + clientHeight >= scrollHeight - 100) {
    loadItems();
  }
}

function refresh() {
  hasMore.value = true;
  loadItems(true);
}

let lastHighlightRefreshAt = 0;

async function refreshWithHighlight(id: string) {
  if (!items.value.some(item => item.id === id)) {
    items.value.unshift({ id });
    total.value++;
  }

  highlightedId.value = id;
  setTimeout(() => { highlightedId.value = null; }, 1200);

  lastHighlightRefreshAt = Date.now();

  try {
    const fetchLimit = Math.min(Math.max(items.value.length, 20), 100);
    const result = await api.getSelected(0, fetchLimit, filter.value || undefined);

    total.value = result.total;
    hasMore.value = items.value.length < result.total;

    if (items.value.length <= fetchLimit) {
      items.value = result.items;
      if (result.items.some(item => item.id === id)) {
        highlightedId.value = id;
        setTimeout(() => { highlightedId.value = null; }, 1200);
      }
    }
  } catch (err) {
    console.error('Failed to reconcile selected items after highlight:', err);
  }
}

async function silentRefresh(): Promise<void> {
  if (loading.value || draggedIndex.value !== null || departingIds.value.size > 0) return;

  if (Date.now() - lastHighlightRefreshAt < 1000) return;

  try {
    const currentLength = items.value.length;
    const fetchLimit = Math.min(Math.max(currentLength, 20), 100);
    const result = await api.getSelected(0, fetchLimit, filter.value || undefined);

    total.value = result.total;

    if (currentLength <= 100) {
      items.value = result.items;
      hasMore.value = items.value.length < result.total;
    }
  } catch {
    /* ignore polling errors */
  }
}

defineExpose({ refresh, refreshWithHighlight, silentRefresh });

onMounted(() => {
  loadItems(true);
  nextTick(() => {
    listContainer.value?.addEventListener('scroll', onScroll, { passive: true });
  });
});

onUnmounted(() => {
  listContainer.value?.removeEventListener('scroll', onScroll);
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

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.item-row {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid $border-card-right;
  border-radius: $radius-card;
  background: $bg-card-right;
  transition: background 0.15s, transform 0.15s;
  cursor: grab;
  user-select: none;
  margin: 4px 8px;
}

.item-row:hover {
  background: $bg-card-right-hover;
}

.item-row.dragging {
  opacity: 0.5;
  background: $bg-card-right-drag;
}

.item-row.drag-over {
  border-top: 2px solid $accent;
  background: $bg-card-right-drop;
}

/* animate rows that are being removed */
@keyframes slide-out-left {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

.item-row.departing {
  animation: slide-out-left 0.3s forwards;
}

.drag-handle {
  margin-right: 12px;
  color: $text-drag-handle;
  font-size: 16px;
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.item-id {
  flex: 1;
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
}

.btn-deselect {
  background: $border-btn-default;
  color: $text-muted;
}

.btn-deselect:hover {
  background: $success;
  color: #0a0f1a;
}

.btn-deselect:active {
  transform: scale(0.92);
  background: darken($success, 8%);
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

/* arrival highlight animation */
@keyframes arrival-flash {
  0%   { background: rgba($success, 0.35); border-color: $success; box-shadow: 0 0 12px rgba($success, 0.4); }
  60%  { background: rgba($success, 0.15); border-color: rgba($success, 0.5); }
  100% { background: $bg-card-right; border-color: $border-card-right; box-shadow: none; }
}

.item-row--arrived {
  animation: arrival-flash 1.2s ease-out forwards;
}

.loading,
.empty {
  text-align: center;
  padding: 20px;
  color: $text-muted;
  font-size: 14px;
}
</style>
