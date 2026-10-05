import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// 앱 버전의 정본은 루트 package.json (bin/stellacode.js -v 와 같은 값). client/package.json 은
// private 워크스페이스라 버전 owner 가 아니다. 빌드 시 인라인되므로 화면에 사본을 두지 않는다.
export const APP_VERSION: string = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
).version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
