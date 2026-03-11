import { onMounted, onUnmounted } from 'vue';
import { BASE_URL } from '@/composables/useApi';

export interface UseLongPollingOptions {
  immediate?: boolean;
}

export function useLongPolling(
  callback: () => void | Promise<void>,
  options: UseLongPollingOptions = {}
): { start: () => void; stop: () => void } {
  const { immediate = true } = options;

  let active = false;
  let controller: AbortController | null = null;
  let lastVersion = 0;

  async function pollLoop() {
    while (active) {
      controller = new AbortController();
      try {
        const res = await fetch(`${BASE_URL}/events?version=${lastVersion}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: { version: number } = await res.json();
        lastVersion = data.version;

        await callback();
      } catch (err: any) {
        if (!active) break;

        if (err.name === 'AbortError') {
          break;
        }

        await new Promise((r) => setTimeout(r, 2000));
      } finally {
        controller = null;
      }
    }
  }

  function start() {
    if (active) return;
    active = true;
    pollLoop();
  }

  function stop() {
    active = false;
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  onMounted(() => {
    if (immediate) start();
  });

  onUnmounted(() => {
    stop();
  });

  return { start, stop };
}
