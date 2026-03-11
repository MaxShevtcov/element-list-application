import { ref, onMounted, onUnmounted, type Ref } from 'vue';

export function useInfiniteScroll(
  containerRef: Ref<HTMLElement | null>,
  loadMore: () => Promise<void>,
  threshold: number = 100
) {
  const loading = ref(false);

  async function onScroll() {
    const container = containerRef.value;
    if (!container || loading.value) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      loading.value = true;
      try {
        await loadMore();
      } finally {
        loading.value = false;
      }
    }
  }

  onMounted(() => {
    const container = containerRef.value;
    if (container) {
      container.addEventListener('scroll', onScroll, { passive: true });
    }
  });

  onUnmounted(() => {
    const container = containerRef.value;
    if (container) {
      container.removeEventListener('scroll', onScroll);
    }
  });

  return { loading };
}
