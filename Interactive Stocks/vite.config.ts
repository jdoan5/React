import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { proxyMassive } from './api/_handler'

/**
 * Dev-only middleware mirroring the Vercel `/api/massive` function, so the app's
 * data calls work identically in `npm run dev` and in production.
 */
function massiveDevProxy(env: Record<string, string>): PluginOption {
  return {
    name: 'massive-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/massive', async (req, res) => {
        const path = new URL(req.url ?? '', 'http://localhost').searchParams.get('path') ?? ''
        const result = await proxyMassive(
          path,
          env.MASSIVE_API_KEY,
          env.MASSIVE_BASE_URL || 'https://api.massive.com',
        )
        res.statusCode = result.status
        res.setHeader('content-type', 'application/json')
        res.end(result.body)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), massiveDevProxy(env)],
    server: { port: 5176 },
  }
})
