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
          
          additionalData: `@use "@/styles/variables" as *;\n`,
        },
      },
    },
    server: {
      port: 5173,
      
      
      proxy: apiBase
        ? {}
        : {
            '/api': {
              target: 'http:
              changeOrigin: true,
            },
          },
    },
  };
});
