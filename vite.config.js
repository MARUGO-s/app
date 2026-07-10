import { defineConfig } from 'vite'
// trigger reload
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    target: ['es2020', 'safari14'],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 3000,
  },
})
