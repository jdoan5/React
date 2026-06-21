import { proxyMassive } from './_handler'

// Vercel Edge Function: the only place the massive.com API key is used. The
// browser calls /api/massive?path=/v2/... and never sees the key.
export const config = { runtime: 'edge' }

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
      'cache-control': 's-maxage=30, stale-while-revalidate=60',
    },
  })
}
