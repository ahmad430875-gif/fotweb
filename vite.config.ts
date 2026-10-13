import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: '/fotweb/', // <-- Add this line so it knows your repository path
  server: { 
    port: 3000, 
    strictPort: true 
  },
})
