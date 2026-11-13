import { useEffect, useSyncExternalStore } from 'react'
import { forgetBoard, recentLabels, rememberBoard, type RecentBoard } from '../lib/recentBoards'
import { loadRecents, saveRecents, subscribeRecents } from '../utils/recentsStore'
import { useBoard } from './useBoard'

/** This browser's boards, newest first. Updates on our writes and other tabs'. */
export function useRecentBoards(): readonly RecentBoard[] {
  return useSyncExternalStore(subscribeRecents, loadRecents, () => [])
}

/**
 * Records the open board once it has really loaded — not when the link was
 * merely parsed, or a board this visitor cannot open would become their
 * default. Forgets a board only on a TERMINAL failure (no access, dead link);
 * a server that did not answer this once says nothing about the board.
 */
export function useRememberBoard(): void {
  const { mode, boardId, board, loaded, failure } = useBoard()
  const title = board.title

  useEffect(() => {
    if (mode !== 'supabase') return
    if (failure?.terminal) {
      saveRecents(forgetBoard(loadRecents(), boardId))
    } else if (loaded) {
      saveRecents(rememberBoard(loadRecents(), { id: boardId, title }, Date.now()))
    }
  }, [mode, boardId, title, loaded, failure])
}

/**
 * The open board's name as the board list shows it. One guest's boards all
 * share a title, so the heading and the "Opened …" announcement carry the same
 * id suffix the list does — otherwise switching between two of them would
 * change nothing a screen reader, or anyone, could notice.
 */
export function useBoardLabel(): string {
  const { board, boardId, mode } = useBoard()
  const recents = useRecentBoards()
  const title = board.title || 'Realtime Board'
  if (mode !== 'supabase') return title
  return recentLabels(recents).get(boardId) ?? title
}
