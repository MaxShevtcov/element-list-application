import { createApp } from 'vue';
import App from './App.vue';
import { queue } from '@/composables/useApi';

window.addEventListener('beforeunload', () => queue.destroy());

createApp(App).mount('#app');
