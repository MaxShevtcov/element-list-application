<template>
  <div class="app">
    <h1 class="app-title">Element List Manager</h1>
    <div class="panels">
      <LeftPanel ref="leftPanelRef" @item-selected="onItemSelected" />
      <RightPanel @item-deselected="onItemDeselected" ref="rightPanelRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import LeftPanel from '@/components/LeftPanel.vue';
import RightPanel from '@/components/RightPanel.vue';
import { usePolling } from '@/composables/usePolling';

const leftPanelRef = ref<InstanceType<typeof LeftPanel> | null>(null);
const rightPanelRef = ref<InstanceType<typeof RightPanel> | null>(null);

function onItemSelected(id: string) {
  // Trigger refresh on the right panel and highlight the incoming id
  rightPanelRef.value?.refreshWithHighlight(id);
}

function onItemDeselected(id: string) {
  // Refresh left panel and highlight the returned ID
  leftPanelRef.value?.refreshWithHighlight(id);
}

// background polling for both panels; interval may be overridden via env
const POLL_INTERVAL = Number(import.meta.env.VITE_POLL_INTERVAL) || 1_000;
usePolling(
  () => {
    leftPanelRef.value?.silentRefresh();
    rightPanelRef.value?.silentRefresh();
  },
  { interval: POLL_INTERVAL, pauseWhenHidden: true }
);

// when tab becomes visible again, force immediate refresh
function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    leftPanelRef.value?.silentRefresh();
    rightPanelRef.value?.silentRefresh();
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
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
