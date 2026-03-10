<template>
  <div class="panel right-panel">
    <div class="panel-header">
      <h2>Выбранные</h2>
      <span class="count">{{ total.toLocaleString() }} шт.</span>
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
        :class="{ 'drag-over': dragOverIndex === index, 'dragging': draggedIndex === index }"
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
        <button @click="deselectItem(item.id)" class="btn btn-deselect" title="Убрать">←</button>
      </div>
      <div v-if="loading" class="loading">Загрузка...</div>
      <div v-if="!loading && items.length === 0" class="empty">Нет выбранных элементов</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { api } from '@/composables/useApi';
import type { Item } from '@/types';

const emit = defineEmits<{
  (e: 'item-deselected'): void;
}>();

const items = ref<Item[]>([]);
const total = ref(0);
const filter = ref('');
const loading = ref(false);
const hasMore = ref(true);

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

async function deselectItem(id: string) {
  try {
    await api.deselectItem(id);
    items.value = items.value.filter(item => item.id !== id);
    total.value--;
    emit('item-deselected');

    if (items.value.length < 20 && hasMore.value) {
      await loadItems();
    }
  } catch (err) {
    console.error('Failed to deselect item:', err);
  }
}

// Drag & Drop handlers
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

  // Optimistic local reorder
  const [movedItem] = items.value.splice(sourceIndex, 1);
  items.value.splice(targetIndex, 0, movedItem);

  draggedIndex.value = null;
  draggedItemId.value = null;

  // Calculate the actual server-side index considering the offset of loaded items
  // The items array starts at offset 0 from the currently visible set
  // We need to account for any pagination offset
  try {
    await api.reorderSelected(itemId, targetIndex, filter.value || undefined);
  } catch (err) {
    console.error('Failed to reorder:', err);
    // Revert on failure
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

// Public method for parent to trigger refresh
function refresh() {
  hasMore.value = true;
  loadItems(true);
}

defineExpose({ refresh });

onMounted(() => {
  loadItems(true);
  nextTick(() => {
    listContainer.value?.addEventListener('scroll', onScroll, { passive: true });
  });
});
</script>

<style scoped>
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #27ae60;
  color: white;
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
  border-bottom: 1px solid #eee;
}

.filter-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.filter-input:focus {
  border-color: #27ae60;
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
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.15s, transform 0.15s;
  cursor: grab;
  user-select: none;
}

.item-row:hover {
  background: #f8f9fa;
}

.item-row.dragging {
  opacity: 0.5;
  background: #e8f5e9;
}

.item-row.drag-over {
  border-top: 2px solid #27ae60;
  background: #f1f8e9;
}

.drag-handle {
  margin-right: 12px;
  color: #bbb;
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
}

.btn {
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 12px;
  transition: all 0.15s;
}

.btn-deselect {
  background: #e74c3c;
  color: white;
}

.btn-deselect:hover {
  background: #c0392b;
}

.loading,
.empty {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 14px;
}
</style>
