/**
 * The one place environment variables are read.
 *
 * Supabase when BOTH vars are present, otherwise the credential-free local
 * adapter. Same spirit as Interactive Stocks' demo-data fallback: the app is
 * always fully functional, and demo mode is visibly labelled rather than silent.
 * A missing .env is a labelled demo, never a crash.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { demoBoard } from '../data/seed'
import { createLocalAdapter } from './localAdapter'
import { createSupabaseAdapter, createSupabaseDirectory } from './supabaseAdapter'
import type { AdapterChoice, BoardDirectory, LocalAdapterOptions, SyncMode } from './adapter'

let client: SupabaseClient | null | undefined

/**
 * One client for the whole page, created on first use.
 *
 * The front door creates boards before any provider exists, and a provider is
 * remounted for every board switched to — if each made its own client, two
 * auth clients would share one storage key and race each other's token
 * refresh. A module-level singleton is the boring fix.
 */
export function supabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  client =
    typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0
      ? createClient(url, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // This app never does an OAuth redirect, and the URL fragment is
            // where the invite link lives. Without this, supabase-js inspects
            // the fragment on load looking for an auth callback.
            detectSessionInUrl: false,
          },
          // The cursor stream is the only high-rate producer, and it is lossy
          // by design, so there is no reason to let it queue without bound.
          realtime: { params: { eventsPerSecond: 30 } },
        })
      : null
  return client
}

export function syncMode(): SyncMode {
  return supabaseClient() ? 'supabase' : 'local'
}

export function createAdapter(options?: LocalAdapterOptions): AdapterChoice {
  const supabase = supabaseClient()
  if (supabase) {
    return {
      adapter: createSupabaseAdapter(supabase),
      mode: 'supabase',
      reason: 'Connected to Supabase',
    }
  }

  return {
    adapter: createLocalAdapter(demoBoard, options),
    mode: 'local',
    reason: 'No Supabase credentials — syncing between tabs of this browser instead',
  }
}

/** Null in demo mode, which has one seeded board and nothing to create. */
export function createDirectory(): BoardDirectory | null {
  const supabase = supabaseClient()
  return supabase ? createSupabaseDirectory(supabase) : null
}
