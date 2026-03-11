import { onMounted, onUnmounted } from 'vue';

export interface UsePollingOptions {
  /** Интервал в мс (по умолчанию 1000) */
  interval?: number;
  /** Запускать ли немедленно при монтировании (по умолчанию true) */
  immediate?: boolean;
  /** Пропускать ли итерацию, если вкладка скрыта (по умолчанию true) */
  pauseWhenHidden?: boolean;
}

/**
 * Периодически вызывает `callback` с заданным интервалом.
 * Автоматически останавливается при уничтожении компонента.
 * Пропускает итерацию, если вкладка неактивна (опционально).
 */
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
