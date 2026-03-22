import { defineConfig } from 'vite'
// trigger reload
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
})
