/**
 * The one place environment variables are read.
 *
 * Supabase when BOTH vars are present, otherwise the credential-free local
 * adapter. Same spirit as Interactive Stocks' demo-data fallback: the app is
 * always fully functional, and demo mode is visibly labelled rather than silent.
 * A missing .env is a labelled demo, never a crash.
 */

import { demoBoard } from '../data/seed'
import { createLocalAdapter } from './localAdapter'
import { createSupabaseAdapter } from './supabaseAdapter'
import type { AdapterChoice, LocalAdapterOptions } from './adapter'

export function createAdapter(options?: LocalAdapterOptions): AdapterChoice {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0) {
    return {
      adapter: createSupabaseAdapter(url, anonKey),
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
