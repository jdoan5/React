import { proxyMassive } from './_handler.js'

// Vercel Edge Function: the only place the massive.com API key is used. The
// browser calls /api/massive?path=/v2/... and never sees the key.
export const config = { runtime: 'edge' }

// `process.env` is provided by the Vercel Edge runtime; declared here because the
// function's type-check doesn't include Node's type definitions.
declare const process: { env: Record<string, string | undefined> }

export default async function handler(req: Request): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path') ?? ''
  const result = await proxyMassive(
    path,
    process.env.MASSIVE_API_KEY,
    process.env.MASSIVE_BASE_URL ?? 'https://api.massive.com',
  )
  return new Response(result.body, {
    status: result.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 's-maxage=60, stale-while-revalidate=300',
    },
  })
}
