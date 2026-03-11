<template>
  <div class="app">
    <h1 class="app-title">Element List Manager</h1>
    <div class="panels">
      <LeftPanel @item-selected="onItemSelected" />
      <RightPanel @item-deselected="onItemDeselected" ref="rightPanelRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LeftPanel from '@/components/LeftPanel.vue';
import RightPanel from '@/components/RightPanel.vue';

const rightPanelRef = ref<InstanceType<typeof RightPanel> | null>(null);

function onItemSelected() {
  // Trigger refresh on the right panel when an item is selected
  rightPanelRef.value?.refresh();
}

function onItemDeselected() {
  // Could trigger refresh on the left panel if needed
}
</script>

<style lang="scss">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
  background: $bg-root;
  color: $text-primary;
}

.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-title {
  text-align: center;
  margin-bottom: 20px;
  color: $text-primary;
  font-size: 24px;
}

.panels {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

@media (max-width: 768px) {
  .panels {
    flex-direction: column;
  }
}
</style>
