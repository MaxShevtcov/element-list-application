# Plan: Позитивное UI-обновление при переносе элемента из правой колонки в левую

**Создан:** 11 марта 2026  
**Статус:** Готов к исполнению Atlas

## Краткое описание

Сейчас при нажатии кнопки `←` в правой панели элемент просто исчезает без обратной связи, а левая панель не обновляется. Цель — добавить анимации выхода в правой панели, анимацию появления (highlight) в левой панели и связать оба события через App.vue с передачей ID элемента.

## Контекст и анализ

**Ключевые файлы:**
- [client/src/components/RightPanel.vue](../client/src/components/RightPanel.vue): кнопка `←`, функция `deselectItem`, emit `item-deselected`
- [client/src/components/LeftPanel.vue](../client/src/components/LeftPanel.vue): список элементов, функция `loadItems`, стили `.item-row`
- [client/src/App.vue](../client/src/App.vue): связка панелей, `onItemDeselected` (сейчас пуста), `rightPanelRef`
- [client/src/styles/_variables.scss](../client/src/styles/_variables.scss): переменные темы, `$success`, `$accent`, `$danger`

**Ключевые функции:**
- `deselectItem(id)` в RightPanel — оптимистично удаляет элемент и emit-ит событие
- `onItemDeselected()` в App.vue — сейчас пустой обработчик
- `refresh()` в RightPanel — уже публичен через `defineExpose`
- `loadItems(reset)` в LeftPanel — перезагружает список

**Текущий поток:**
1. Клик `←` → `deselectItem` немедленно удаляет из массива → `emit('item-deselected')`
2. API вызов `api.deselectItem(id)` (асинхронно)
3. `App.vue` получает событие, но ничего не делает
4. Левая панель НЕ обновляется, нет никакой анимации

**Ограничения:**
- Оптимистичное удаление должно остаться (UX-приоритет), но нужно задержать удаление из DOM на время CSS-анимации (~300 мс)
- Левая панель может быть отфильтрована — элемент может не появиться в видимом списке; highlight нужно применять только если элемент присутствует
- Передача ID через событие требует обновления типа emit в RightPanel и сигнатуры обработчика в App.vue

---

## Фазы реализации

### Фаза 1: Анимация выхода в RightPanel

**Цель:** Элемент не исчезает мгновенно, а уезжает влево с fade-out за ~300 мс перед удалением из массива.

**Файлы для изменения:**
- `client/src/components/RightPanel.vue`

**Шаги:**

1. Добавить реактивный `Set` для отслеживания IDs в состоянии "отбытия":
   ```ts
   const departingIds = ref<Set<string>>(new Set());
   ```

2. Изменить `deselectItem(id)`:
   - Вместо немедленного `items.value = items.value.filter(...)` — добавить ID в `departingIds`
   - Подождать 300 мс (`await sleep(300)`) перед фактическим удалением из массива
   - `total.value--` можно уменьшить сразу (оптимистично)
   - После задержки — удалить из массива и из `departingIds`
   - Оставить emit и API-вызов как есть

3. Добавить вспомогательную функцию:
   ```ts
   const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
   ```

4. Добавить класс `:class="{ departing: departingIds.has(item.id) }"` на `.item-row` в шаблоне

5. Добавить CSS в `<style scoped>`:
   ```scss
   @keyframes slide-out-left {
     from { opacity: 1; transform: translateX(0); }
     to   { opacity: 0; transform: translateX(-60px); }
   }
   
   .item-row.departing {
     animation: slide-out-left 0.3s ease-in forwards;
     pointer-events: none;
   }
   ```

**Критерии приёмки:**
- [ ] Элемент плавно уезжает влево за 300 мс
- [ ] Кнопка не реагирует на повторный клик во время анимации (`pointer-events: none`)
- [ ] Счётчик уменьшается сразу (не ждёт анимации)
- [ ] Логика отмены при ошибке сервера не ломается

---

### Фаза 2: Передача ID через событие

**Цель:** App.vue должен знать ID отбывшего элемента, чтобы передать его LeftPanel для подсветки.

**Файлы для изменения:**
- `client/src/components/RightPanel.vue` — обновить тип emit
- `client/src/App.vue` — обновить обработчик и добавить ref на LeftPanel

**Шаги:**

1. В RightPanel изменить определение emit:
   ```ts
   // было:
   const emit = defineEmits<{ (e: 'item-deselected'): void }>();
   // стало:
   const emit = defineEmits<{ (e: 'item-deselected', id: string): void }>();
   ```

2. В `deselectItem` передавать ID при emit:
   ```ts
   emit('item-deselected', id);
   ```

3. В App.vue добавить `leftPanelRef` и обновить обработчик:
   ```ts
   const leftPanelRef = ref<InstanceType<typeof LeftPanel> | null>(null);
   
   function onItemDeselected(id: string) {
     leftPanelRef.value?.refreshWithHighlight(id);
   }
   ```

4. В шаблоне App.vue:
   ```html
   <LeftPanel ref="leftPanelRef" @item-selected="onItemSelected" />
   <RightPanel @item-deselected="onItemDeselected" ref="rightPanelRef" />
   ```

**Критерии приёмки:**
- [ ] TypeScript не выдаёт ошибок по типам emit и обработчика
- [ ] ID корректно передаётся от RightPanel через App.vue к LeftPanel

---

### Фаза 3: Обновление и подсветка в LeftPanel

**Цель:** После деселекта LeftPanel обновляется, а вернувшийся элемент кратко подсвечивается зелёным.

**Файлы для изменения:**
- `client/src/components/LeftPanel.vue`

**Шаги:**

1. Добавить реактивный ref для подсвечиваемого ID:
   ```ts
   const highlightedId = ref<string | null>(null);
   ```

2. Добавить публичный метод `refreshWithHighlight(id: string)`:
   ```ts
   async function refreshWithHighlight(id: string) {
     hasMore.value = true;
     await loadItems(true);
     // Проверить, появился ли элемент в загруженном списке
     if (items.value.some(item => item.id === id)) {
       highlightedId.value = id;
       setTimeout(() => { highlightedId.value = null; }, 1200);
     }
   }
   defineExpose({ refreshWithHighlight });
   ```

3. Добавить класс в шаблон к элементам списка:
   ```html
   :class="{ 'item-row--arrived': highlightedId === item.id }"
   ```

4. Добавить CSS-анимацию в `<style scoped>`:
   ```scss
   @keyframes arrival-flash {
     0%   { background: rgba($success, 0.35); border-color: $success; box-shadow: 0 0 12px rgba($success, 0.4); }
     60%  { background: rgba($success, 0.15); border-color: rgba($success, 0.5); }
     100% { background: $bg-card-left; border-color: $border-card-left; box-shadow: none; }
   }
   
   .item-row--arrived {
     animation: arrival-flash 1.2s ease-out forwards;
   }
   ```

**Критерии приёмки:**
- [ ] Вернувшийся элемент мигает зелёным ~1.2 с после появления в списке
- [ ] Если элемент не попал в видимый список (из-за फिल्тра или пагинации) — подсветки нет, нет ошибок
- [ ] При быстром повторном деселекте другого элемента — предыдущая подсветка сбрасывается корректно

---

### Фаза 4: Подсветка кнопки деселекта при hover

**Цель:** Кнопка `←` даёт позитивный сигнал уже при наведении — намекает, что действие успешно.

**Файлы для изменения:**
- `client/src/components/RightPanel.vue` — стили

**Шаги:**

1. Изменить hover-стиль `.btn-deselect:hover` — вместо красного использовать зелёный:
   ```scss
   // было:
   .btn-deselect:hover {
     background: $danger;
     color: $text-primary;
   }
   // стало:
   .btn-deselect:hover {
     background: $success;
     color: #0a0f1a; // тёмный текст на светлом фоне
   }
   ```

2. Добавить анимацию нажатия (active state):
   ```scss
   .btn-deselect:active {
     transform: scale(0.92);
     background: darken($success, 8%); // или rgba($success, 0.8)
   }
   ```

**Критерии приёмки:**
- [ ] Кнопка при hover зелёная (не красная)
- [ ] Краткий scale-эффект при нажатии
- [ ] Переход стилей плавный (уже есть `transition: all 0.15s` в `.btn`)

---

### Фаза 5: Анимация счётчика при изменении

### Фаза 6: Зеленая подсветка при переносе с левого списка в правый

**Цель:** При выборе элемента в левой панели он появляется в правой и подсвечивается так же, как при обратном движении.

**Файлы для изменения:**
- `client/src/components/LeftPanel.vue` (emit с ID)
- `client/src/components/RightPanel.vue` (highlight + refreshWithHighlight)
- `client/src/App.vue` (обработчик onItemSelected принимает id)

**Шаги:**

1. Скорректировать определение emit в LeftPanel, чтобы вторым аргументом передавался ID.
2. Обновить `selectItem` в LeftPanel, чтобы он делал `emit('item-selected', id)`.
3. В `App.vue` изменить `onItemSelected` на приём `id: string` и передавать его в `rightPanelRef.refreshWithHighlight(id)`.
4. В RightPanel добавить состояние `highlightedId`, метод `refreshWithHighlight(id)` (как в LeftPanel), и класс `item-row--arrived` к строкам.
5. Определить CSS-анимацию `arrival-flash` для правой панели, переиспользующую `$success`.
6. Написать тесты:
   - в `LeftPanel.spec.ts` проверка emit с ID;
   - в `RightPanel.spec.ts` тест для `refreshWithHighlight`;
   - в `App.spec.ts` подтверждение, что событие слева проксируется направо.

**Критерии приёмки:**
- [ ] Событие `item-selected` выходит с ID
- [ ] `App.vue` правильно передаёт ID правой панели
- [ ] При обновлении правой панели возвращённый элемент мигает зелёным (1.2 с)
- [ ] Всё это сопровождается предыдущими эффектами (анимация выхода, pulse счётчика и т.д.)


**Цель:** Число в `.count` в шапке каждой панели реагирует на изменение — краткий pulse.

**Файлы для изменения:**
- `client/src/components/RightPanel.vue`
- `client/src/components/LeftPanel.vue`

**Шаги:**

1. Добавить `watch` на `total` в обоих компонентах:
   ```ts
   import { watch } from 'vue';
   const countAnimating = ref(false);
   watch(total, () => {
     countAnimating.value = true;
     setTimeout(() => { countAnimating.value = false; }, 400);
   });
   ```

2. Добавить класс на `.count` в шаблоне:
   ```html
   <span class="count" :class="{ 'count--pulse': countAnimating }">
   ```

3. Добавить CSS в каждом компоненте:
   ```scss
   @keyframes count-pulse {
     0%   { transform: scale(1); }
     50%  { transform: scale(1.25); color: $success; }
     100% { transform: scale(1); }
   }
   .count--pulse {
     animation: count-pulse 0.4s ease-out;
     display: inline-block;
   }
   ```

**Критерии приёмки:**
- [ ] Число пульсирует при каждом изменении `total`
- [ ] В правой панели — pulse при деселекте (уменьшение)
- [ ] В левой панели — pulse при появлении элемента (увеличение через loadItems)

---

## Открытые вопросы

1. **Нужно ли подсвечивать элемент в левой панели, если он не в видимой области (ниже прокрутки)?**
   - **Вариант A:** Только если элемент в DOM — проще, меньше кода
   - **Вариант B:** Автоскролл к элементу + подсветка — более полное UX, но сложнее
   - **Рекомендация:** Вариант A для первой итерации; если нужен скролл — отдельная задача

2. **Цвет кнопки при hover (Фаза 4):**
   - **Вариант A:** Зелёный (позитивный сигнал "вернуть") — рекомендуется
   - **Вариант B:** Оставить красный (предупреждение "убрать") — текущее поведение
   - **Рекомендация:** Зелёный соответствует концепции "позитивного обновления"

3. **Задержка анимации выхода vs. оптимистичное обновление:**
   - Оптимистичное уменьшение `total` происходит немедленно
   - Элемент исчезает через 300 мс (после анимации)
   - Это может выглядеть как кратковременное несоответствие (total уменьшился, но элемент ещё виден)
   - **Рекомендация:** Принять как норму — 300 мс почти незаметны

---

## Риски и митигация

- **Риск:** При быстрых повторных кликах `departingIds` может содержать несколько ID одновременно
  - **Митигация:** `departingIds` — `Set`, поддерживает несколько значений; каждый элемент удаляется независимо

- **Риск:** `refreshWithHighlight` вызывает `loadItems(true)`, что может перекрыть уже идущую загрузку
  - **Митигация:** `loadItems` уже имеет guard `if (loading.value) return`; перезапуск через `loading.value = false` не нужен — добавить сброс `loading` перед вызовом

- **Риск:** Левая панель отфильтрована — элемент не появится в списке
  - **Митигация:** Проверка `items.value.some(item => item.id === id)` перед установкой `highlightedId` предотвращает ложный highlight

---

## Критерии успеха всего обновления

- [ ] Элемент плавно уезжает из правой панели влево
- [ ] Левая панель обновляется автоматически после деселекта
- [ ] Вернувшийся элемент подсвечивается зелёным в левой панели
- [ ] Кнопка `←` при hover — зелёная, при нажатии — scale-эффект
- [ ] Счётчики в шапках пульсируют при изменении
- [ ] Все анимации согласованы с тёмной темой (`_variables.scss`)
- [ ] TypeScript не имеет ошибок типов
- [ ] Оптимистичная логика отмены при ошибке сервера работает корректно

---

## Заметки для Atlas

- Все изменения изолированы в трёх файлах: `RightPanel.vue`, `LeftPanel.vue`, `App.vue`
- `_variables.scss` НЕ требует изменений — `$success` (#2ecc71) уже объявлен
- Фазы 1 и 2 взаимозависимы (нужны оба, чтобы связать события); фазы 3–5 независимы
- Для `darken($success, 8%)` используется встроенная функция SCSS — уже подключен sass через vite
- После каждой фазы запускай `get_errors` для проверки TypeScript
