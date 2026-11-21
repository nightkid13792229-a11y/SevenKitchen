import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// vitest 用于运行 src 下的 spec：纯函数沿用 node 环境；
// 组件 spec 在文件头用 `// @vitest-environment jsdom` 单独声明，
// 因为 jsdom 初始化比 node 慢很多，不要让所有测试都替它买单。
// tests/ 目录下的遗留测试使用 node:test，仍通过 `node --test tests/` 运行。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node'
  }
})
