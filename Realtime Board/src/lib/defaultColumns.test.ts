import { describe, expect, it } from 'vitest'
// `?raw` is Vite's string import: the migration is read as text at test time,
// with no Node `fs` and no Node types in the app's tsconfig.
import sql from '../../supabase/migrations/0005_front_door.sql?raw'
import { COLUMN_TITLES } from '../data/seed'
import { keysBetween, isValidKey } from './fracIndex'

/** The `(gen_random_uuid(), v_board.id, '<title>', '<key>')` rows in create_board(). */
const rows = [...sql.matchAll(/\(gen_random_uuid\(\),\s*v_board\.id,\s*'([^']+)',\s*'([^']+)'\)/g)].map(
  (m) => ({ title: m[1]!, key: m[2]! }),
)

describe('0005 default columns', () => {
  it('creates exactly the demo board\'s columns, in order', () => {
    expect(rows.map((r) => r.title)).toEqual([...COLUMN_TITLES])
  })

  it('uses the keys the ordering library would mint for an empty board', () => {
    expect(rows.map((r) => r.key)).toEqual(keysBetween(null, null, COLUMN_TITLES.length))
  })

  it('every key is a valid fractional index', () => {
    for (const { key } of rows) expect(isValidKey(key)).toBe(true)
  })

  it('every title fits the 1–60 character check on public.columns', () => {
    for (const { title } of rows) {
      expect(title.length).toBeGreaterThanOrEqual(1)
      expect(title.length).toBeLessThanOrEqual(60)
    }
  })

  it('keeps create_board callable by signed-in users only', () => {
    expect(sql).toMatch(/revoke execute on function public\.create_board\(text, text, text\) from public, anon/)
    expect(sql).toMatch(/grant\s+execute on function public\.create_board\(text, text, text\) to authenticated/)
  })
})

describe('0005 join_board', () => {
  it('joins with ON CONFLICT, so two concurrent joins cannot collide on the primary key', () => {
    expect(sql).toMatch(/on conflict \(board_id, user_id\) do nothing/)
  })

  it('still validates the share token before inserting anything', () => {
    const check = sql.indexOf("raise exception 'invalid share link'")
    const insert = sql.indexOf('insert into public.board_members', sql.indexOf('function public.join_board'))
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(insert)
  })

  it('keeps join_board callable by signed-in users only', () => {
    expect(sql).toMatch(/revoke execute on function public\.join_board\(uuid, uuid, text, text\) from public, anon/)
  })
})
