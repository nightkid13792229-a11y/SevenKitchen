import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const adminWebPort = Number(process.env.ADMIN_WEB_PORT || 5173)
const adminApiProxyTarget = process.env.ADMIN_API_PROXY_TARGET || 'http://localhost:3001'

const getVendorChunkName = (id: string) => {
  if (id.includes('element-plus') || id.includes('@element-plus')) {
    return 'vendor-element-plus'
  }

  if (id.includes('axios')) {
    return 'vendor-network'
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
    port: adminWebPort,
    proxy: {
      '/api': {
        target: adminApiProxyTarget,
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
