// Shared proxy logic used by BOTH the Vercel Edge function (api/massive.ts) and
// the Vite dev middleware (vite.config.ts), so local and production behave the
// same. Framework-agnostic — just the Web `fetch`/`URL` globals.

const ALLOWED_PATH = /^\/v[23]\/[A-Za-z0-9/_.-]/

export interface ProxyResult {
  status: number
  body: string
}

function json(status: number, data: unknown): ProxyResult {
  return { status, body: JSON.stringify(data) }
}

/**
 * Forward an allow-listed massive.com path, attaching the server-side API key.
 * Returns 503 `no_api_key` when unconfigured so the client can fall back to demo
 * data, keeping the app usable without a key.
 */
export async function proxyMassive(
  path: string,
  apiKey: string | undefined,
  baseUrl: string,
): Promise<ProxyResult> {
  if (!path || !ALLOWED_PATH.test(path)) return json(400, { error: 'invalid_path' })
  if (!apiKey) return json(503, { error: 'no_api_key' })

  let target: URL
  try {
    target = new URL(baseUrl.replace(/\/+$/, '') + path)
  } catch {
    return json(400, { error: 'invalid_path' })
  }
  target.searchParams.set('apiKey', apiKey)

  try {
    const upstream = await fetch(target.toString(), { headers: { Accept: 'application/json' } })
    return { status: upstream.status, body: await upstream.text() }
  } catch {
    return json(502, { error: 'upstream_unreachable' })
  }
}
