import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiBase = env.VITE_API_BASE_URL;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // automatically inject variables into every scss block
          additionalData: `@use "@/styles/variables" as *;\n`,
        },
      },
    },
    server: {
      port: 5173,
      // if a custom API base URL is specified we don't need the local
      // proxy; the frontend will hit the external address directly.
      proxy: apiBase
        ? {}
        : {
            '/api': {
              target: 'http://localhost:3000',
              changeOrigin: true,
            },
          },
    },
  };
});
