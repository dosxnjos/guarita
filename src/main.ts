import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });

// Service worker para todos (tela offline em public/sw.js); o push reaproveita o mesmo registro (src/lib/push.ts).
// Só em https (o site publicado): no Vite local (http) ele atrapalharia o recarregamento.
if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
