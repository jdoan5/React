/** Tunables, in one place so none of them is a magic number buried in a hook. */

export const STORAGE_KEYS = {
  /** The local adapter's board rows. Demo mode's "database". */
  board: 'realtime-board:board:v1',
  /** Unsent commands, so a refresh mid-flight does not lose work. */
  queue: 'realtime-board:queue:v1',
  /** This browser's guest identity, so you keep your name and colour across reloads. */
  identity: 'realtime-board:identity:v1',
}

/** BroadcastChannel name for demo-mode cross-tab sync. */
export const DEMO_CHANNEL = 'realtime-board:demo'

/** Cursors older than this are dropped — a peer that closed its tab stops being drawn. */
export const CURSOR_TTL_MS = 5_000

/** Cursor send interval. 20Hz is smooth; faster just burns messages. */
export const CURSOR_THROTTLE_MS = 50

/**
 * Keys grow about one character per six repeated drags into the identical slot.
 * Past this length a column is worth rebalancing — which rewrites every row in
 * it, so it stays a deliberate action rather than something automatic.
 */
export const REBALANCE_KEY_LENGTH = 12

export const PRIORITY_META = {
  urgent: { label: 'Urgent', color: '#e5484d' },
  high: { label: 'High', color: '#f2831f' },
  medium: { label: 'Medium', color: '#3b6ef5' },
  low: { label: 'Low', color: '#8695a5' },
} as const
