<template>
  <div class="loader-wrap" :class="{ 'loader-wrap--inline': inline }">
    <div class="loader-ring"></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  inline?: boolean;
}>();
</script>

<style scoped lang="scss">
.loader-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.loader-wrap--inline {
  padding: 0;
  display: inline-flex;
  vertical-align: middle;
}

.loader-ring {
  width: 24px;
  height: 24px;
  border: 3px solid $border-btn-default;
  border-top-color: $accent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
