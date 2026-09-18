import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Port 3000 keeps parity with the lab instructions ("open http://localhost:3000").
  server: { port: 3000 },
})
