import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const getVendorChunkName = (id: string) => {
  if (id.includes('element-plus') || id.includes('@element-plus')) {
    return 'vendor-element-plus'
  }

  if (
    id.includes('/vue/') ||
    id.includes('/@vue/') ||
    id.includes('vue-router') ||
    id.includes('pinia')
  ) {
    return 'vendor-vue'
  }

  if (id.includes('axios')) {
    return 'vendor-network'
  }

  if (id.includes('sortablejs') || id.includes('vuedraggable')) {
    return 'vendor-drag'
  }

  if (id.includes('cos-nodejs-sdk-v5')) {
    return 'vendor-cos'
  }

  return 'vendor-misc'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',  // 本地后端 API
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          return getVendorChunkName(id)
        }
      }
    }
  }
})
