import { onMounted, onUnmounted } from 'vue';

export interface UsePollingOptions {
  interval?: number;
  immediate?: boolean;
  pauseWhenHidden?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  options: UsePollingOptions = {}
): { start: () => void; stop: () => void } {
  const {
    interval = 1_000,
    immediate = true,
    pauseWhenHidden = true,
  } = options;

  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    if (pauseWhenHidden && document.visibilityState === 'hidden') return;
    callback();
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, interval);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
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
