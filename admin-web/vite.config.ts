import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

const DEFAULT_API_PROXY_TARGET = 'http://localhost:3011'
const DEFAULT_API_BASE_URL = `${DEFAULT_API_PROXY_TARGET}/api/v1`

function resolveApiProxyTarget(apiBaseUrl = DEFAULT_API_BASE_URL) {
  if (/^https?:\/\//.test(apiBaseUrl)) {
    return new URL(apiBaseUrl).origin
  }

  return DEFAULT_API_PROXY_TARGET
}

const apiProxyTarget = resolveApiProxyTarget(process.env.VITE_API_BASE_URL)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      dts: false,
      resolvers: [
        ElementPlusResolver({
          importStyle: false
        })
      ]
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
})
