import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Only expose specific safe environment variables to avoid leaking the whole process.env
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
})