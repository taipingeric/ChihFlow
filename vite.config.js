import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'node:async_hooks': fileURLToPath(new URL('./src/shims/async_hooks.js', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }
          if (
            id.includes('/@langchain/') ||
            id.includes('/langchain/') ||
            id.includes('/@openai/')
          ) {
            return 'langchain-runtime';
          }
          if (id.includes('/reactflow/')) {
            return 'reactflow';
          }
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
});
