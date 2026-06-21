// Thin client for our own /api/massive proxy (which holds the API key), with a
// short-lived response cache. The cache matters because the API is rate-limited
// per minute: re-selecting a symbol, switching ranges back, or re-rendering all
// reuse cached data instead of spending the request budget.

export class MassiveError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`massive ${status} ${code}`)
    this.status = status
    this.code = code
  }
}

const TTL_MS = 120_000
interface Entry {
  ts: number
  data: unknown
}
const memory = new Map<string, Entry>()

function fromSession(key: string): Entry | undefined {
  try {
    const raw = sessionStorage.getItem(`mq:${key}`)
    return raw ? (JSON.parse(raw) as Entry) : undefined
  } catch {
    return undefined
  }
}

function toSession(key: string, entry: Entry): void {
  try {
    sessionStorage.setItem(`mq:${key}`, JSON.stringify(entry))
  } catch {
    // storage full / unavailable — memory cache still applies
  }
}

export async function massiveGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const now = Date.now()
  let hit = memory.get(path) ?? fromSession(path)
  if (hit) memory.set(path, hit)
  if (hit && now - hit.ts < TTL_MS) return hit.data as T

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

  const data = (await res.json()) as T
  const entry: Entry = { ts: Date.now(), data }
  memory.set(path, entry)
  toSession(path, entry)
  return data
}
