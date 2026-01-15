import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This allows process.env.API_KEY to work in the browser environment provided by Vite
    'process.env': process.env
  }
})