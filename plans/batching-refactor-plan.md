# План: Доработка батчинга и очереди запросов

**Создан:** 11 марта 2026  
**Статус:** Готов к выполнению Atlas

---

## Резюме

Текущая реализация имеет несколько критических проблем: `flushAdds` на клиенте отправляет **отдельный HTTP-запрос для каждого элемента** вместо одного батч-запроса, сервер возвращает неверные per-item результаты (всегда `added: true`), оптимистичный отклик UI для добавления элементов отсутствует (элемент не появляется до истечения таймера 10 сек), а дедупликация для `reorder` теряет последнюю позицию при быстрых перемещениях. Необходимо: реализовать настоящий батч-эндпоинт на сервере, переписать клиентский flush в один запрос, добавить оптимистичное отображение добавляемых элементов и исправить стратегию дедупликации для reorder (last-write-wins).

---

## Анализ текущего состояния

### Файлы и ключевые проблемы

| Файл | Роль | Проблемы |
|------|------|----------|
| `server/src/queue.ts` | Серверная очередь | `processAddBatch` всегда резолвит `{added:true}` независимо от результата `addItems`; не отслеживает per-item успех |
| `server/src/routes.ts` | API-маршруты | Нет батч-эндпоинта `POST /api/items/add-batch`; каждый `POST /api/items/add` обрабатывается отдельно |
| `client/src/composables/useApi.ts` | Клиентская очередь + API | `flushAdds` вызывает `executor()` в цикле — N отдельных HTTP-запросов вместо одного; dedup для reorder основан на `key=reorder:${id}:${newIndex}` — не работает при повторных drag на новую позицию |
| `client/src/components/LeftPanel.vue` | Левая панель | После `addItem()` элемент не появляется в списке до выполнения батча (10 сек); нет pending-состояния |
| `client/src/components/RightPanel.vue` | Правая панель | `reorderSelected` — оптимистичен ✅, но dedup в очереди может потерять позицию |
| `client/src/types/index.ts` | Типы | Нет типа `BatchAddResponse` |

### Ключевые функции/классы

- `ClientRequestQueue.flushAdds()` в `useApi.ts` — нужно переписать
- `ClientRequestQueue.enqueueOp()` в `useApi.ts` — нужно изменить стратегию dedup для reorder
- `RequestQueue.processAddBatch()` в `server/src/queue.ts` — нужно исправить per-item результаты
- `router.post('/items/add')` в `server/src/routes.ts` — добавить `/items/add-batch`
- `addItem()` в `LeftPanel.vue` — добавить оптимистичный рендер
- `api.addItem()` в `useApi.ts` — переработать для батч-отправки

### Паттерны и соглашения

- Все мутации на сервере идут через `requestQueue.enqueueOperation()` (задержка 1 сек)
- Оптимистичные обновления: компоненты мутируют `items.value` до ответа сервера, откат при ошибке
- `store.addItems(ids[])` уже правильно дедуплицирует на уровне хранилища
- Vue 3 Composition API, `ref` для реактивного состояния

---

## Фазы реализации

---

### Фаза 1: Сервер — батч-эндпоинт и исправление очереди

**Цель:** Добавить `POST /api/items/add-batch`, принимающий массив ID и возвращающий per-item результаты. Исправить баг в `processAddBatch`.

**Файлы для изменения:**
- `server/src/queue.ts` — исправить `processAddBatch`, добавить корректный per-item resolve
- `server/src/routes.ts` — добавить `POST /api/items/add-batch`

**Изменения в `server/src/queue.ts`:**

Текущий `processAddBatch` вызывает `this.addProcessor(ids)` и получает только счётчик добавленных. Нужно изменить `addProcessor` на возвращение `Map<string, boolean>` (id → добавлен ли), чтобы корректно резолвить каждый pending promise.

```typescript
// store.addItems() уже возвращает number — нужно изменить его сигнатуру
// ИЛИ изменить processor на возвращение Set<string> успешно добавленных

// Новая сигнатура setAddProcessor:
setAddProcessor(processor: (ids: string[]) => Set<string>)

// processAddBatch — исправленная версия:
private processAddBatch(): void {
  // ...
  const addedIds = this.addProcessor!(ids); // Set<string> успешно добавленных
  batch.forEach(b => {
    b.resolve({ added: addedIds.has(b.id), deduplicated: false });
  });
}
```

**Изменения в `server/src/store.ts`:**

Добавить метод `addItemsBatch(ids: string[]): Set<string>` — возвращает Set ID, которые были реально добавлены (не существовали ранее).

**Изменения в `server/src/routes.ts`:**

```typescript
// POST /api/items/add-batch
// Body: { ids: string[] }
// Response: { results: Array<{ id: string; added: boolean; alreadyExists: boolean }> }
router.post('/items/add-batch', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required' });
    return;
  }
  const cleanIds = ids.map(id => String(id).trim()).filter(Boolean);
  // Дедупликация внутри самого запроса
  const uniqueIds = [...new Set(cleanIds)];
  
  try {
    const result = await requestQueue.enqueueOperation(() => {
      const addedSet = store.addItemsBatch(uniqueIds);
      return {
        results: uniqueIds.map(id => ({
          id,
          added: addedSet.has(id),
          alreadyExists: !addedSet.has(id),
        }))
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Тесты:**
- `POST /api/items/add-batch` с несуществующими ID → `added: true` для каждого
- `POST /api/items/add-batch` с уже существующими ID → `added: false, alreadyExists: true`
- `POST /api/items/add-batch` с дублирующимися ID в массиве → каждый обрабатывается один раз
- `POST /api/items/add-batch` с пустым массивом → 400

**Шаги:**
1. Написать тест на `POST /api/items/add-batch`
2. Добавить `addItemsBatch` в `store.ts`
3. Добавить маршрут в `routes.ts`
4. Исправить `processAddBatch` в `queue.ts` и `setAddProcessor`
5. Запустить тесты

**Критерии приёмки:**
- [ ] `POST /api/items/add-batch` принимает `string[]`, возвращает per-item результаты
- [ ] `store.addItemsBatch` возвращает `Set<string>` реально добавленных ID
- [ ] `processAddBatch` корректно резолвит каждый pending promise с правильным `added`

---

### Фаза 2: Клиент — переход на истинный батч-запрос

**Цель:** Переписать `flushAdds` в `useApi.ts` так, чтобы отправлялся один HTTP-запрос с массивом всех накопленных ID, а не цикл из N запросов.

**Файлы для изменения:**
- `client/src/types/index.ts` — добавить `BatchAddResponse`
- `client/src/composables/useApi.ts` — рефакторинг `flushAdds`, добавить `api.addItemBatch`

**Новые типы в `types/index.ts`:**

```typescript
export interface BatchAddResult {
  id: string;
  added: boolean;
  alreadyExists: boolean;
}

export interface BatchAddResponse {
  results: BatchAddResult[];
}
```

**Рефакторинг `ClientRequestQueue.flushAdds`:**

```typescript
private async flushAdds() {
  this.addTimer = null;
  if (this.addQueue.length === 0) return;
  
  const batch = [...this.addQueue];
  this.addQueue = [];
  this.addKeys.clear();

  // Один HTTP-запрос для всего батча
  const ids = batch.map(req => req.key.replace('add:', ''));
  try {
    const response = await fetchJson<BatchAddResponse>(`${BASE_URL}/items/add-batch`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    // Резолвим каждый pending promise с per-item результатом
    const resultMap = new Map(response.results.map(r => [r.id, r]));
    batch.forEach(req => {
      const id = req.key.replace('add:', '');
      const itemResult = resultMap.get(id);
      req.resolve({
        added: itemResult?.added ?? false,
        deduplicated: false,
      });
    });
  } catch (err) {
    batch.forEach(req => req.reject(err));
  }
}
```

**Шаги:**
1. Добавить типы `BatchAddResult`, `BatchAddResponse` в `types/index.ts`
2. Переписать `flushAdds` в `useApi.ts`
3. Убедиться что `api.addItem(id)` по-прежнему возвращает `Promise<AddResponse>`

**Критерии приёмки:**
- [ ] При добавлении 5 элементов за 10 сек уходит 1 HTTP-запрос, а не 5
- [ ] Каждый `api.addItem(id)` promise резолвится с корректным `{ added, deduplicated }`
- [ ] При сетевой ошибке все pending promises реджектятся

---

### Фаза 3: Клиент — оптимистичное добавление (pending state)

**Цель:** Элемент появляется в левой панели сразу после нажатия "+" с визуальным индикатором "ожидает", без ожидания 10-секундного цикла батча.

**Файлы для изменения:**
- `client/src/composables/useApi.ts` — экспортировать `pendingItems` reactive map
- `client/src/components/LeftPanel.vue` — отображать pending элементы + визуальный стиль

**Архитектура pending state:**

Добавить в `useApi.ts` реактивный `pendingItems` — это `ref(new Map<string, 'pending' | 'error'>())`:

```typescript
import { ref } from 'vue';

// Экспортируется из useApi.ts наружу
export const pendingItems = ref(new Map<string, 'pending' | 'error'>());

// В ClientRequestQueue.enqueueAdd — добавить callback для статуса:
enqueueAdd(key: string, executor: () => Promise<AddResponse>): Promise<AddResponse> {
  return new Promise((resolve, reject) => {
    if (this.addKeys.has(key)) {
      resolve({ added: false, deduplicated: true });
      return;
    }
    this.addKeys.add(key);
    this.addQueue.push({ key, executor, resolve, reject });
    // Помечаем в pendingItems
    const id = key.replace('add:', '');
    pendingItems.value.set(id, 'pending');

    if (!this.addTimer) {
      this.addTimer = setTimeout(() => this.flushAdds(), 10_000);
    }
  });
}
```

После `flushAdds` — обновлять `pendingItems`:

```typescript
// После резолва каждого элемента:
if (itemResult?.added) {
  pendingItems.value.delete(id); // убрать из pending — элемент подтверждён
} else {
  pendingItems.value.set(id, 'error'); // сигналить ошибку
}
```

**Изменения в `LeftPanel.vue`:**

В `<script setup>`:
```typescript
import { pendingItems } from '@/composables/useApi';

// Computed для пендинг элементов (не входящих в уже загруженный список)
const pendingItemsList = computed(() =>
  [...pendingItems.value.entries()]
    .filter(([id]) => !items.value.some(item => item.id === id))
    .map(([id, status]) => ({ id, status }))
);
```

В шаблоне — добавить pending items **в начало** списка:
```html
<!-- Pending items -->
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
```

CSS для стилей:
```css
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
}
```

> Импорт `Loader` в `<script setup>`: `import Loader from '@/components/Loader.vue'`

**При нажатии "+":**
- Убрать сообщение "добавлен в очередь" из `addMessage`
- Элемент сразу виден в списке через `pendingItemsList`
- `total` инкрементируется оптимистично +1
- После batch: если `added: true` — элемент подтверждён, удалить из pending, данные уже в сторе и придут при следующей прокрутке
- Если `added: false` (уже существует) — пометить `error`

**Шаги:**
1. Добавить `export const pendingItems = ref(...)` в `useApi.ts`
2. Обновить `enqueueAdd` — устанавливать pending статус
3. Обновить `flushAdds` — снимать/обновлять pending статус после ответа
4. Добавить `pendingItemsList` computed в `LeftPanel.vue`
5. Отрендерить pending items в шаблоне с визуальным стилем
6. Обновить `addItem()` — убрать `addMessage`, инкрементировать `total`

**Критерии приёмки:**
- [ ] Элемент мгновенно появляется в списке после нажатия "+"
- [ ] Иконка ⏳ видна до выполнения батча, исчезает после подтверждения
- [ ] При дубликате (уже существует) — ✕ + элемент помечен ошибкой
- [ ] Pending элементы нельзя выбрать (кнопка → отключена)
- [ ] `total` корректно показывает +1 для pending элементов

---

### Фаза 4: Клиент — last-write-wins для reorder

**Цель:** Исправить потерю позиции при быстрых перетаскиваниях одного элемента. Заменить `key=reorder:${id}:${newIndex}` на `key=reorder:${id}` со стратегией замены executor.

**Файл для изменения:**
- `client/src/composables/useApi.ts` — рефакторинг `enqueueOp` для reorder-операций

**Проблема текущей реализации:**

```typescript
// Текущий enqueueOp deduplicate:
if (this.opKeys.has(key)) {
  // Find existing and share the result — НЕВЕРНО для reorder
  // Если key="reorder:5:3" и потом "reorder:5:7" — это разные ключи, dedup не работает
  // Если key="reorder:5" для обоих — то первый executor будет использован для обоих
}
```

**Правильная архитектура — отдельный метод для reorder:**

```typescript
// В ClientRequestQueue — новый метод:
enqueueReorder<T>(itemId: string, executor: () => Promise<T>): Promise<T> {
  const key = `reorder:${itemId}`;
  return new Promise((resolve, reject) => {
    const existing = this.opQueue.findIndex(q => q.key === key);
    if (existing !== -1) {
      // Last-write-wins: заменить executor и resolver
      const old = this.opQueue[existing];
      // Отклонить старый promise (или зарезолвить с sentinel значением)
      old.reject(new Error('superseded'));
      // Заменить на новый
      this.opQueue[existing] = { key, executor: executor as any, resolve: resolve as any, reject };
    } else {
      this.opKeys.add(key);
      this.opQueue.push({ key, executor: executor as any, resolve: resolve as any, reject });
    }
    if (!this.opTimer) {
      this.opTimer = setTimeout(() => this.flushOps(), 1_000);
    }
  });
}
```

**Изменения в `api.reorderSelected`:**

```typescript
reorderSelected(itemId: string, newIndex: number, filter?: string): Promise<ReorderResponse> {
  return queue.enqueueReorder(itemId, () =>
    fetchJson<ReorderResponse>(`${BASE_URL}/selected/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ itemId, newIndex, filter }),
    })
  );
}
```

**Изменения в `RightPanel.vue`:**

В `onDrop` нужно обработать rejection "superseded" как не-ошибку:

```typescript
try {
  await api.reorderSelected(itemId, targetIndex, filter.value || undefined);
} catch (err: any) {
  if (err?.message === 'superseded') return; // нормально — будет новый запрос
  console.error('Failed to reorder:', err);
  await loadItems(true); // откат только на реальных ошибках
}
```

**Шаги:**
1. Добавить `enqueueReorder` в `ClientRequestQueue`
2. Изменить `api.reorderSelected` для использования нового метода
3. Обновить обработку ошибок в `RightPanel.vue`

**Критерии приёмки:**
- [ ] При быстром перетаскивании элемента 3 раза — на сервер уходит 1 запрос с последней позицией
- [ ] `superseded` rejection не приводит к откату UI
- [ ] Реальные ошибки сервера по-прежнему откатывают состояние

---

### Фаза 5: Клиент — корректная деинициализация таймеров

**Цель:** Предотвратить утечки памяти и зависшие таймеры при горячей перезагрузке Vite или unmount компонентов.

**Файл для изменения:**
- `client/src/composables/useApi.ts`

**Изменения:**

Добавить метод `destroy()` в `ClientRequestQueue`:

```typescript
destroy(): void {
  if (this.addTimer) { clearTimeout(this.addTimer); this.addTimer = null; }
  if (this.opTimer) { clearTimeout(this.opTimer); this.opTimer = null; }
  // Сбросить все pending promises с ошибкой
  this.addQueue.forEach(req => req.reject(new Error('queue destroyed')));
  this.addQueue = [];
  this.addKeys.clear();
  this.opQueue.forEach(req => req.reject(new Error('queue destroyed')));
  this.opQueue = [];
  this.opKeys.clear();
}
```

Добавить `beforeUnload` listener в `main.ts` или через Vue plugin:

```typescript
// В main.ts перед mount:
import { queue } from '@/composables/useApi'; // экспортировать queue
window.addEventListener('beforeunload', () => queue.destroy());
```

**Критерии приёмки:**
- [ ] Нет утечек таймеров при hot-reload в dev режиме
- [ ] `destroy()` корректно чистит все очереди

---

### Фаза 6: Сервер — защита от гонок в очереди

**Цель:** Гарантировать, что параллельные batches для add не создают race condition с `pendingAddIds`.

**Файл для изменения:**
- `server/src/queue.ts`

**Анализ:**

Текущий код `pendingAddIds.clear()` происходит в `processAddBatch` до вызова `addProcessor`. Если `addProcessor` асинхронный (в будущем), то новые элементы, добавленные во время обработки, будут потеряны. Хотя сейчас `addProcessor` синхронный — нужно документировать и защитить:

```typescript
private processAddBatch(): void {
  this.addTimer = null;
  if (this.addQueue.length === 0) return;

  // Снимаем снапшот ДО очистки
  const batch = [...this.addQueue];
  this.addQueue = [];
  // Очищаем set ПОСЛЕ снапшота — новые enqueue могут начаться сразу
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
```

**Критерии приёмки:**
- [ ] Элементы, добавленные во время обработки батча, корректно попадают в следующий батч
- [ ] Дедупликация не теряет элементы из-за преждевременной очистки `pendingAddIds`

---

## Открытые вопросы

### 1. Нужен ли `POST /api/items/add` после добавления батч-эндпоинта?

- **Вариант A:** Оставить оба маршрута для обратной совместимости
- **Вариант B:** Удалить `/items/add`, оставить только `/items/add-batch`
- **Рекомендация:** Вариант B — один эндпоинт проще поддерживать; клиентская очередь всегда батчует

### 2. Нужно ли хранить pending-state на сервере?

- **Вариант A:** Нет — сервер принимает только подтверждённые записи, pending существует только на клиенте
- **Вариант B:** Да — server-sent events или WebSocket для синхронизации подтверждений
- **Рекомендация:** Вариант A достаточен для текущих требований; SSE/WS — отдельная фича

### 3. Стратегия отката для оптимистичного select/deselect при ошибке сервера?

- **Текущее состояние:** `selectItem` удаляет элемент из LeftPanel сразу, но если сервер вернёт ошибку — нет отката
- **Вариант A:** Добавить try/catch + reload при ошибке (как уже есть в reorder)
- **Вариант B:** Хранить снапшот состояния до мутации
- **Рекомендация:** Вариант A — минимальные изменения, достаточная надёжность

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| При добавлении batch за 10 сек UI показывает pending, но данные в сторе появятся только после flush — конфликт с фильтром | Pending items фильтруются отдельно в `pendingItemsList computed` с проверкой на совпадение с активным фильтром |
| `superseded` rejection в reorder может bubble-up как необработанное отклонение Promise | Явная проверка `err.message === 'superseded'` в `onDrop`, Promise rejection нужно всегда обрабатывать |
| Клиентская очередь теряет несохранённые данные при закрытии вкладки | `beforeunload` + informational toast "Есть несохранённые изменения" |
| Параллельные вызовы `enqueueReorder` из разных компонентов для одного itemId | Глобальный singleton `queue` в `useApi.ts` — все вызовы идут через один экземпляр |

---

## Критерии успеха

- [ ] При добавлении N элементов уходит **ровно 1** HTTP-запрос на `/api/items/add-batch`
- [ ] Элементы отображаются мгновенно после нажатия "+" с индикатором ⏳
- [ ] Дублирующееся добавление одного ID → видимое предупреждение, не дублируется в списке
- [ ] При быстром перетаскивании одного элемента 5 раз → 1 запрос с последней позицией
- [ ] Все существующие функции (filter, infinite scroll, select/deselect, drag-and-drop) продолжают работать
- [ ] `store.addItemsBatch()` корректно возвращает Set реально добавленных ID
- [ ] Нет утечек таймеров

---

## Заметки для Atlas

1. **Порядок фаз важен**: Фаза 1 (сервер) должна быть реализована до Фаз 2 и 3 (клиент), так как клиент зависит от нового эндпоинта. Фазы 4 и 5 независимы.

2. **Синтаксическая ошибка в store.ts**: В методе `getSelectedItems` есть `the items = ...` — это опечатка, нужно исправить на `const items = ...` (строка ~230).

3. **`pendingItems` экспортируется как `ref`** — это предпочтительнее, чем глобальный store, так как компоненты могут импортировать его напрямую без Pinia/Vuex.

4. **Ключ `add:${id}`** — `enqueueAdd` принимает `key` как `add:${id}`, поэтому в `flushAdds` нужно делать `key.replace('add:', '')` или хранить чистый `id` отдельно в объекте очереди.

5. **CSS-классы pending** добавляются scoped в `LeftPanel.vue` — не нужны глобальные стили.

6. **`store.addItems`** уже возвращает `number` — нужно добавить **отдельный метод** `addItemsBatch`, возвращающий `Set<string>`, чтобы не ломать существующий код.
