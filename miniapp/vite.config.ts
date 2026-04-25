import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// https://vitejs.dev/config/
// Uni-app plugin automatically handles entry points via main.ts and pages.json
// Use 'uni build -p mp-weixin' or 'uni -p mp-weixin' commands instead of 'vite build'
// The plugin will configure the entry point automatically based on the platform
export default defineConfig({
  plugins: [uni()],
  assetsInclude: ['**/*.png'],
  // 明确指定输出目录配置，确保编译输出稳定
  build: {
    outDir: 'dist/build',
    emptyOutDir: false, // 保留 project.config.json 等配置文件
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['legacy-js-api'],
      },
      sass: {
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  define: {
    VITE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
  },
})



