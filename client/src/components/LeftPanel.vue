<template>
  <div class="panel left-panel">
    <div class="panel-header">
      <h2>Все элементы</h2>
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

    <div class="add-form">
      <input
        v-model="newId"
        type="text"
        placeholder="Новый ID..."
        class="add-input"
        @keyup.enter="addItem"
      />
      <button @click="addItem" class="btn btn-add" :disabled="!newId.trim() || addingItem">
        {{ addingItem ? '...' : '+' }}
      </button>
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
  (e: 'item-selected'): void;
}>();

const items = ref<Item[]>([]);
const total = ref(0);
const filter = ref('');
const loading = ref(false);
const hasMore = ref(true);

const newId = ref('');
const addingItem = ref(false);
const addMessage = ref('');
const addMessageType = ref<'success' | 'error'>('success');

const listContainer = ref<HTMLElement | null>(null);

// Pending items: those not yet confirmed by the server, not already in the loaded list
const pendingItemsList = computed(() =>
  [...pendingItems.value.entries()]
    .filter(([id]) => !items.value.some(item => item.id === id))
    .map(([id, status]) => ({ id, status }))
);

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
  try {
    await api.selectItem(id);
    // Remove from local list
    items.value = items.value.filter(item => item.id !== id);
    total.value--;
    emit('item-selected');
    
    // Load more if needed
    if (items.value.length < 20 && hasMore.value) {
      await loadItems();
    }
  } catch (err) {
    console.error('Failed to select item:', err);
  }
}

async function addItem() {
  const id = newId.value.trim();
  if (!id) return;

  addingItem.value = true;
  addMessage.value = '';
  try {
    const result = await api.addItem(id);
    if (result.deduplicated) {
      addMessage.value = `ID "${id}" уже в очереди добавления`;
      addMessageType.value = 'error';
      setTimeout(() => { addMessage.value = ''; }, 3000);
    } else if (!result.added) {
      // Server said it already exists
      addMessage.value = `ID "${id}" уже существует`;
      addMessageType.value = 'error';
      setTimeout(() => { addMessage.value = ''; }, 3000);
    }
    // On success the item is already visible via pendingItemsList and will
    // be removed from pending once the server confirms (flushAdds handles it).
  } catch (err) {
    addMessage.value = 'Ошибка при добавлении';
    addMessageType.value = 'error';
    setTimeout(() => { addMessage.value = ''; }, 5000);
  } finally {
    addingItem.value = false;
    newId.value = '';
  }
}

function onScroll() {
  const container = listContainer.value;
  if (!container || loading.value || !hasMore.value) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollTop + clientHeight >= scrollHeight - 100) {
    loadItems();
  }
}

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
  background: #4a90d9;
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
  border-color: #4a90d9;
}

.add-form {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #eee;
}

.add-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.add-input:focus {
  border-color: #4a90d9;
}

.add-message {
  padding: 4px 16px 8px;
  font-size: 12px;
}

.add-message.success {
  color: #27ae60;
}

.add-message.error {
  color: #e74c3c;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.15s;
}

.item-row:hover {
  background: #f8f9fa;
}

.item-id {
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-select {
  background: #4a90d9;
  color: white;
}

.btn-select:hover:not(:disabled) {
  background: #357abd;
}

.btn-add {
  background: #27ae60;
  color: white;
  font-weight: bold;
  font-size: 18px;
  padding: 6px 14px;
}

.btn-add:hover:not(:disabled) {
  background: #219a52;
}

.loading,
.empty {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 14px;
}

.item-row--pending {
  opacity: 0.65;
  background: #fff9e6;
  border-left: 3px solid #f39c12;
}

.item-row--error {
  opacity: 0.65;
  background: #fef0f0;
  border-left: 3px solid #e74c3c;
}

.pending-badge--error {
  font-size: 12px;
  color: #e74c3c;
  padding: 6px 12px;
}
</style>
