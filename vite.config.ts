import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` matches the GitHub Pages project path
// (https://hazel0519.github.io/crowding-risk-monitor/). Set to '/' for any host
// that serves the app from a domain root.
export default defineConfig({
  base: '/Crowding-Risk-Monitor/',
  plugins: [react()],
})
