// Thin client for our own /api/massive proxy (which holds the API key).

export class MassiveError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`massive ${status} ${code}`)
    this.status = status
    this.code = code
  }
}

export async function massiveGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/massive?path=${encodeURIComponent(path)}`, { signal })
  if (!res.ok) {
    let code = 'request_failed'
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) code = body.error
    } catch {
      // non-JSON error body
    }
    throw new MassiveError(res.status, code)
  }
  return (await res.json()) as T
}
