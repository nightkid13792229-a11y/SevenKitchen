import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// vitest 仅用于运行 src 下的纯函数 spec（如食谱设计器移植引擎的对比测试）。
// tests/ 目录下的遗留测试使用 node:test，仍通过 `node --test tests/` 运行。
export default defineConfig({
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
