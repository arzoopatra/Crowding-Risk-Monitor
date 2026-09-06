import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Crowding-Risk-Monitor/',
  plugins: [react()],
})