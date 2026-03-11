# Plan: Dark UI Redesign — SCSS + Единая чёрная цветовая схема

**Created:** 2026-03-11
**Status:** Ready for Atlas Execution

## Summary

Переработать визуальный дизайн под единую тёмную цветовую схему с чёрным фоном, используя SCSS. Все цветовые константы и переменные выносятся в `client/src/styles/_variables.scss`. Левая колонка — серые карточки, правая — синяя подсветка. Все компонентные стили переводятся на `lang="scss"` с использованием переменных из общего файла.

## Context & Analysis

**Relevant Files:**
- `client/src/App.vue`: глобальные стили body, `.app`, `.app-title`
- `client/src/components/LeftPanel.vue`: `<style scoped>` → `<style scoped lang="scss">`
- `client/src/components/RightPanel.vue`: `<style scoped>` → `<style scoped lang="scss">`
- `client/src/components/Loader.vue`: `<style scoped>` → `<style scoped lang="scss">`
- `client/vite.config.ts`: добавить `css.preprocessorOptions` для авто-импорта переменных
- `client/package.json`: добавить `sass` в devDependencies
- **Новый файл:** `client/src/styles/_variables.scss`

**Dependencies:**
- `sass` (пакет): Vite поддерживает SCSS из коробки при наличии `sass` в node_modules — конфигурировать плагины не нужно

**Цветовая палитра → SCSS-переменные:**

| SCSS-переменная | Значение | Роль |
|---|---|---|
| `$bg-root` | `#0a0f1a` | фон body |
| `$bg-panel` | `#0f1723` | фон панелей |
| `$bg-controls` | `#141e2e` | шапки панелей, зона inputs |
| `$bg-card-left` | `#161f30` | карточки левой колонки |
| `$bg-card-left-hover` | `#1c2840` | hover карточки левой колонки |
| `$bg-card-right` | `rgba(43, 124, 238, 0.07)` | карточки правой колонки |
| `$bg-card-right-hover` | `rgba(43, 124, 238, 0.14)` | hover карточек правой колонки |
| `$bg-input` | `#161f30` | фон инпутов |
| `$border-subtle` | `#1a2840` | разделители, внутренние границы |
| `$border-card-left` | `#1e2d42` | граница карточки левой колонки |
| `$border-card-right` | `rgba(43, 124, 238, 0.22)` | граница карточки правой колонки |
| `$text-primary` | `#e2e8f0` | основной текст |
| `$text-secondary` | `#94a3b8` | вторичный текст кнопок |
| `$text-muted` | `#4a6080` | placeholder, empty state, иконки |
| `$text-drag-handle` | `#2b4a6a` | drag handle |
| `$accent` | `#2b7cee` | синий акцент |
| `$accent-hover` | `#1e6dd9` | hover синего акцента |
| `$danger` | `#e74c3c` | деструктивное действие |
| `$danger-hover` | `#c0392b` | hover деструктивного действия |
| `$success` | `#2ecc71` | успешное сообщение |
| `$warning` | `#f39c12` | pending state |
| `$border-radius-card` | `8px` | радиус карточки |
| `$border-radius-btn` | `6px` | радиус кнопки |
| `$border-radius-panel` | `12px` | радиус панели |

**Patterns & Conventions (новые после рефакторинга):**
- Все hex-значения и `rgba()` — только в `_variables.scss`, никаких магических чисел в компонентах
- Все компоненты: `<style scoped lang="scss">` — используют SCSS-переменные через `@use`
- Vite настроен на `additionalData`, чтобы `@use "@/styles/variables" as *` автоматически добавлялся в начало каждого SCSS-файла — компонентам не нужно дублировать импорт вручную
- Глобальные стили `body` в `App.vue` также переводятся на `lang="scss"`
- JavaScript и шаблоны компонентов не трогаем

## Implementation Phases

### Phase 1: Установка sass и создание файла переменных

**Objective:** Добавить SCSS в проект и создать единственный источник истины для всех цветовых токенов.

**Files to Modify/Create:**
- `client/package.json`: добавить `"sass": "^1.70.0"` в `devDependencies`
- `client/vite.config.ts`: добавить секцию `css.preprocessorOptions`
- `client/src/styles/_variables.scss`: создать новый файл

**Содержимое `client/src/styles/_variables.scss`:**

```scss
// =============================================================
// Dark Theme — Color Tokens
// =============================================================

// Backgrounds
$bg-root:             #0a0f1a;
$bg-panel:            #0f1723;
$bg-controls:         #141e2e;
$bg-card-left:        #161f30;
$bg-card-left-hover:  #1c2840;
$bg-card-right:       rgba(43, 124, 238, 0.07);
$bg-card-right-hover: rgba(43, 124, 238, 0.14);
$bg-card-right-drag:  rgba(43, 124, 238, 0.04);
$bg-card-right-drop:  rgba(43, 124, 238, 0.18);
$bg-input:            #161f30;

// Borders
$border-subtle:       #1a2840;
$border-card-left:    #1e2d42;
$border-btn-default:  #1e2d42;
$border-card-right:   rgba(43, 124, 238, 0.22);

// Typography
$text-primary:        #e2e8f0;
$text-secondary:      #94a3b8;
$text-muted:          #4a6080;
$text-drag-handle:    #2b4a6a;

// Accent (blue)
$accent:              #2b7cee;
$accent-hover:        #1e6dd9;

// Semantic
$danger:              #e74c3c;
$danger-hover:        #c0392b;
$success:             #2ecc71;
$warning:             #f39c12;

// Shape
$radius-card:         8px;
$radius-btn:          6px;
$radius-panel:        12px;
```

**Изменения в `client/vite.config.ts`:**

```ts
// Добавить в defineConfig:
css: {
  preprocessorOptions: {
    scss: {
      // Автоматически добавляет @use в начало каждого .scss/.vue<style lang="scss"> блока
      additionalData: `@use "@/styles/variables" as *;\n`,
    },
  },
},
```

**Изменения в `client/package.json`:**

```json
"devDependencies": {
  ...
  "sass": "^1.70.0"
}
```

**Steps:**
1. Добавить `"sass": "^1.70.0"` в `devDependencies` в `client/package.json`
2. Создать директорию `client/src/styles/`
3. Создать файл `client/src/styles/_variables.scss` с содержимым выше
4. Обновить `client/vite.config.ts`: добавить объект `css: { preprocessorOptions: { scss: { additionalData: ... } } }` внутрь `defineConfig`
5. Запустить `npm install` в папке `client`

**Acceptance Criteria:**
- [ ] `sass` присутствует в `node_modules` клиента
- [ ] `_variables.scss` содержит все токены из таблицы выше
- [ ] `vite.config.ts` содержит `css.preprocessorOptions.scss.additionalData`
- [ ] Vite не падает с ошибкой при старте

---

### Phase 2: App.vue — Глобальный фон, перевод на SCSS

**Objective:** Переключить фон страницы и заголовок на тёмную тему, используя SCSS-переменные.

**Files to Modify:**
- `client/src/App.vue`: `<style>` → `<style lang="scss">`

**Конкретные изменения:**

```scss
/* БЫЛО (CSS) */
body {
  background: #f0f2f5;
  color: #333;
}
.app-title {
  color: #1a1a2e;
}

/* СТАЛО (SCSS с переменными) */
body {
  background: $bg-root;
  color: $text-primary;
}
.app-title {
  color: $text-primary;
  letter-spacing: -0.01em;
}
```

**Steps:**
1. Сменить `<style>` → `<style lang="scss">` в App.vue
2. Заменить все литеральные цвета на SCSS-переменные

**Acceptance Criteria:**
- [ ] Фон страницы — `$bg-root` (#0a0f1a)
- [ ] Заголовок читаем — `$text-primary` (#e2e8f0)
- [ ] Нет литеральных hex-значений в блоке стилей

---

### Phase 3: LeftPanel.vue — Серые карточки, SCSS

**Objective:** Перевести левую панель на тёмный SCSS. Шапка тёмная, инпуты тёмные, карточки — серые с `$border-card-left`.

**Files to Modify:**
- `client/src/components/LeftPanel.vue`: `<style scoped>` → `<style scoped lang="scss">`

**Маппинг переменных:**

| Селектор / свойство | SCSS-переменная |
|---|---|
| `.panel` background | `$bg-panel` |
| `.panel-header` background | `$bg-controls` |
| `.panel-header` border-bottom | `$border-subtle` |
| `.panel-controls`, `.add-form` border-bottom | `$border-subtle` |
| `.panel-controls`, `.add-form` background | `$bg-panel` |
| `.filter-input`, `.add-input` background | `$bg-input` |
| `.filter-input`, `.add-input` border | `$border-card-left` |
| `.filter-input`, `.add-input` color | `$text-primary` |
| `::placeholder` color | `$text-muted` |
| `input:focus` border-color | `$accent` |
| `.item-row` background | `$bg-card-left` |
| `.item-row` border | `$border-card-left` |
| `.item-row` border-radius | `$radius-card` |
| `.item-row:hover` background | `$bg-card-left-hover` |
| `.item-id` color | `$text-primary` |
| `.btn-select` default background | `$border-btn-default` |
| `.btn-select` default color | `$text-secondary` |
| `.btn-select:hover` background | `$accent` |
| `.btn-add` background | `$accent` |
| `.btn-add:hover` background | `$accent-hover` |
| `.btn` border-radius | `$radius-btn` |
| `.empty` color | `$text-muted` |
| `.item-row--pending` background | `rgba($warning, 0.08)` |
| `.item-row--pending` border-left | `$warning` |
| `.item-row--error` background | `rgba($danger, 0.08)` |
| `.item-row--error` border-left | `$danger` |
| `.add-message.success` color | `$success` |
| `.add-message.error` color | `$danger` |

> **Важно:** `.item-row` переходит с `border-bottom` на полный `border` + `border-radius` + `margin: 4px 8px` (карточечный вид). `rgba($warning, 0.08)` использует SCSS-функцию `rgba()` с переменной.

**Steps:**
1. Сменить `<style scoped>` → `<style scoped lang="scss">`
2. Заменить все литеральные цвета переменными из таблицы
3. Обновить `.item-row`: убрать `border-bottom`, добавить `border`, `border-radius: $radius-card`, `margin: 4px 8px`

**Acceptance Criteria:**
- [ ] Панель — тёмный фон, нет белых/светлых областей
- [ ] Карточки — серые (`$bg-card-left` + `$border-card-left`)
- [ ] Кнопка `→` серая в покое, синяя при hover
- [ ] Pending/error состояния различимы
- [ ] Нет литеральных hex-значений в блоке стилей

---

### Phase 4: RightPanel.vue — Синяя подсветка, SCSS

**Objective:** Перевести правую панель на тёмный SCSS. Карточки — с синим полупрозрачным фоном.

**Files to Modify:**
- `client/src/components/RightPanel.vue`: `<style scoped>` → `<style scoped lang="scss">`

**Маппинг переменных:**

| Селектор / свойство | SCSS-переменная |
|---|---|
| `.panel` background | `$bg-panel` |
| `.panel-header` background | `$bg-controls` |
| `.panel-header` border-bottom | `$border-subtle` |
| `.panel-controls` border-bottom | `$border-subtle` |
| `.panel-controls` background | `$bg-panel` |
| `.filter-input` background | `$bg-input` |
| `.filter-input` border | `$border-card-left` |
| `.filter-input` color | `$text-primary` |
| `::placeholder` color | `$text-muted` |
| `.filter-input:focus` border-color | `$accent` |
| `.item-row` background | `$bg-card-right` |
| `.item-row` border | `$border-card-right` |
| `.item-row` border-radius | `$radius-card` |
| `.item-row:hover` background | `$bg-card-right-hover` |
| `.item-row.dragging` background | `$bg-card-right-drag` |
| `.item-row.drag-over` border-top | `2px solid $accent` |
| `.item-row.drag-over` background | `$bg-card-right-drop` |
| `.drag-handle` color | `$text-drag-handle` |
| `.item-id` color | `$text-primary` |
| `.btn-deselect` default background | `$border-btn-default` |
| `.btn-deselect` default color | `$text-muted` |
| `.btn-deselect:hover` background | `$danger` |
| `.btn-deselect:hover` color | `$text-primary` |
| `.btn` border-radius | `$radius-btn` |
| `.empty` color | `$text-muted` |

**Steps:**
1. Сменить `<style scoped>` → `<style scoped lang="scss">`
2. Заменить все литеральные цвета переменными
3. Обновить `.item-row`: карточечный вид (`border`, `border-radius: $radius-card`, `margin: 4px 8px`)

**Acceptance Criteria:**
- [ ] Карточки — синий полупрозрачный фон с синей границей
- [ ] Drag & drop: синяя линия сверху при drag-over
- [ ] Кнопка `←` серая в покое, красная при hover
- [ ] Нет литеральных hex-значений в блоке стилей

---

### Phase 5: Loader.vue — Адаптация спиннера, SCSS

**Objective:** Обновить спиннер для тёмного фона, используя SCSS-переменные.

**Files to Modify:**
- `client/src/components/Loader.vue`: `<style scoped>` → `<style scoped lang="scss">`

**Конкретные изменения:**

```scss
/* БЫЛО */
.loader-ring {
  border: 3px solid #e0e0e0;
  border-top-color: #4a90d9;
}

/* СТАЛО */
.loader-ring {
  border: 3px solid $border-btn-default;  // тёмный трек
  border-top-color: $accent;              // синий спиннер
}
```

**Steps:**
1. Сменить `<style scoped>` → `<style scoped lang="scss">`
2. Заменить `#e0e0e0` → `$border-btn-default`
3. Заменить `#4a90d9` → `$accent`

**Acceptance Criteria:**
- [ ] Спиннер виден на тёмном фоне
- [ ] Цвет совпадает с акцентным `$accent`
- [ ] Нет литеральных hex-значений

---

## Open Questions

1. **`additionalData` с `@use` vs `@import` в каждом компоненте вручную?**
   - **Option A:** `additionalData: '@use "@/styles/variables" as *;\n'` в vite.config — переменные доступны везде без явного импорта в каждом компоненте
   - **Option B:** Каждый компонент пишет `@use "@/styles/variables" as *;` в начале блока стилей вручную
   - **Recommendation:** Option A — меньше boilerplate, централизованно. Vite корректно обрабатывает `additionalData` для Vue SFC style blocks

2. **Нужна ли светлая тема?**
   - **Recommendation:** Нет — одна схема, как просил пользователь. `_variables.scss` достаточно легко дополнить позже

## Risks & Mitigation

- **Risk:** `@use ... as *` в `additionalData` может конфликтовать, если компонент сам делает `@use` того же модуля
  - **Mitigation:** Не добавлять `@use "@/styles/variables"` вручную в компонентах — только через `additionalData`

- **Risk:** SCSS `rgba($variable, 0.08)` требует, чтобы `$variable` был именно цветом (не строкой)
  - **Mitigation:** `$warning` и `$danger` объявлены как hex-литералы, SCSS правильно преобразует их через `rgba()`

- **Risk:** `sass` не установлен — Vite не компилирует SCSS до его установки
  - **Mitigation:** Phase 1 явно включает установку пакета перед любыми изменениями компонентов

## Success Criteria

- [ ] `sass` установлен, `_variables.scss` создан с полной палитрой
- [ ] `vite.config.ts` настроен на авто-импорт переменных
- [ ] Все 4 компонента используют `lang="scss"` и SCSS-переменные
- [ ] Нет ни одного литерального hex или rgba в компонентных стилях
- [ ] Фон страницы — `$bg-root` (#0a0f1a)
- [ ] Левая колонка: серые карточки (`$bg-card-left` + `$border-card-left`)
- [ ] Правая колонка: синяя подсветка (`$bg-card-right` + `$border-card-right`)
- [ ] Функционал (фильтрация, добавление, DnD) не нарушен

## Notes for Atlas

- **Порядок фаз критичен:** Phase 1 (установка sass + variables + vite config) должна быть выполнена до правки компонентов (Phase 2–5)
- После изменения `vite.config.ts` нужен перезапуск dev-сервера
- `npm install` запускать в директории `client/`, а не в корне проекта
- JavaScript и шаблоны Vue — не трогать, только блоки `<style>`
- При обновлении `.item-row` убрать `border-bottom: 1px solid ...` и заменить на `border: 1px solid $border-card-*` + `border-radius: $radius-card` + `margin: 4px 8px`
- `rgba()` в SCSS принимает переменную-цвет напрямую: `rgba($warning, 0.08)` — валидный SCSS
