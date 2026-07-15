declare module 'unplugin-vue-components/vite' {
  import type { Plugin } from 'vite'
  const Components: (options?: Record<string, unknown>) => Plugin
  export default Components
}