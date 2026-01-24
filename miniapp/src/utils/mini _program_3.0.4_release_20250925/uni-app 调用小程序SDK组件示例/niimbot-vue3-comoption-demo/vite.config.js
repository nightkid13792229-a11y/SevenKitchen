import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from "path";
export default defineConfig({
  plugins: [
    uni(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  optimizeDeps: ["@dcloudio/uni-ui"],
  build: {
    target: "modules",
    commonjsOptions: {
      ignoreDynamicRequires: true,
      include: /static|JCAPI/
    },
    sourcemap: false
  },
  css: {
    preprocessorOptions: {
      scss: {
        math: "always",
      },
    },
  },
})
