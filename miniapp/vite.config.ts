import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// https://vitejs.dev/config/
// Uni-app plugin automatically handles entry points via main.ts and pages.json
// Use 'uni build -p mp-weixin' or 'uni -p mp-weixin' commands instead of 'vite build'
// The plugin will configure the entry point automatically based on the platform
export default defineConfig({
  plugins: [uni()],
  assetsInclude: ['**/*.png'],
})



