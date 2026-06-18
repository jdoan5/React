import type { BoardState, Column, Label, Task, User } from '../types'

// A self-contained factory so "Reset board" can rebuild a fresh state (with
// fresh timestamps) at any time.

const USERS: User[] = [
  { id: 'u_alex', name: 'Alex Rivera', color: '#6366f1', online: true },
  { id: 'u_sam', name: 'Sam Chen', color: '#ec4899', online: true },
  { id: 'u_jordan', name: 'Jordan Lee', color: '#14b8a6', online: false },
  { id: 'u_priya', name: 'Priya Nair', color: '#f59e0b', online: true },
  { id: 'u_max', name: 'Max Schmidt', color: '#8b5cf6', online: false },
]

const LABELS: Label[] = [
  { id: 'l_bug', name: 'Bug', color: '#ef4444' },
  { id: 'l_feature', name: 'Feature', color: '#3b82f6' },
  { id: 'l_design', name: 'Design', color: '#a855f7' },
  { id: 'l_docs', name: 'Docs', color: '#14b8a6' },
  { id: 'l_chore', name: 'Chore', color: '#64748b' },
]

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

export function createInitialState(): BoardState {
  const now = Date.now()
  const day = 86_400_000
  const ago = (d: number) => now - d * day
  const inDays = (d: number) => new Date(now + d * day).toISOString().slice(0, 10)

  const tasks: Task[] = [
    {
      id: 't_login',
      title: 'Fix login redirect loop',
      description: 'Users with expired sessions bounce between /login and /app. Likely a stale auth cookie.',
      assigneeId: 'u_sam',
      priority: 'urgent',
      labelIds: ['l_bug'],
      dueDate: inDays(1),
      createdAt: ago(3),
      createdBy: 'u_alex',
    },
    {
      id: 't_onboarding',
      title: 'Design onboarding empty states',
      description: 'New boards should feel welcoming. Need illustrations + copy for the zero-data case.',
      assigneeId: 'u_priya',
      priority: 'medium',
      labelIds: ['l_design', 'l_feature'],
      dueDate: inDays(5),
      createdAt: ago(2),
      createdBy: 'u_priya',
    },
    {
      id: 't_darkmode',
      title: 'Dark mode polish pass',
      description: 'Audit contrast on cards, badges, and the activity feed in dark theme.',
      assigneeId: 'u_jordan',
      priority: 'low',
      labelIds: ['l_design'],
      dueDate: null,
      createdAt: ago(6),
      createdBy: 'u_max',
    },
    {
      id: 't_dnd',
      title: 'Drag-and-drop across columns',
      description: 'Cards should move between lists and reorder smoothly, with keyboard support.',
      assigneeId: 'u_alex',
      priority: 'high',
      labelIds: ['l_feature'],
      dueDate: inDays(2),
      createdAt: ago(1),
      createdBy: 'u_alex',
    },
    {
      id: 't_api',
      title: 'Document the board REST API',
      description: 'Endpoints for columns and cards. Include request/response examples.',
      assigneeId: 'u_max',
      priority: 'medium',
      labelIds: ['l_docs'],
      dueDate: inDays(7),
      createdAt: ago(4),
      createdBy: 'u_jordan',
    },
    {
      id: 't_perf',
      title: 'Profile re-render hotspots',
      description: 'Typing in the search box re-renders every card. Memoise the column lists.',
      assigneeId: 'u_sam',
      priority: 'high',
      labelIds: ['l_bug', 'l_chore'],
      dueDate: inDays(-1),
      createdAt: ago(5),
      createdBy: 'u_sam',
    },
    {
      id: 't_avatars',
      title: 'Presence avatars in the toolbar',
      description: 'Show who is online with a live-updating stack of avatars.',
      assigneeId: 'u_priya',
      priority: 'medium',
      labelIds: ['l_feature', 'l_design'],
      dueDate: null,
      createdAt: ago(2),
      createdBy: 'u_alex',
    },
    {
      id: 't_export',
      title: 'Export board as JSON',
      description: 'A simple download button so people can back up or share a board.',
      assigneeId: null,
      priority: 'low',
      labelIds: ['l_feature'],
      dueDate: null,
      createdAt: ago(7),
      createdBy: 'u_max',
    },
    {
      id: 't_filters',
      title: 'Filter cards by assignee',
      description: 'Toolbar control to focus on one person’s work across all columns.',
      assigneeId: 'u_jordan',
      priority: 'medium',
      labelIds: ['l_feature'],
      dueDate: inDays(3),
      createdAt: ago(1),
      createdBy: 'u_sam',
    },
    {
      id: 't_seed',
      title: 'Write realistic seed data',
      description: 'The demo board should look like a real team mid-sprint.',
      assigneeId: 'u_alex',
      priority: 'low',
      labelIds: ['l_chore'],
      dueDate: null,
      createdAt: ago(8),
      createdBy: 'u_alex',
    },
    {
      id: 't_keyboard',
      title: 'Keyboard shortcuts',
      description: 'N to add a card, / to focus search, Esc to close modals.',
      assigneeId: 'u_max',
      priority: 'low',
      labelIds: ['l_feature'],
      dueDate: null,
      createdAt: ago(9),
      createdBy: 'u_priya',
    },
    {
      id: 't_tests',
      title: 'Reducer unit tests',
      description: 'Cover move/reorder edge cases so drag-and-drop never corrupts state.',
      assigneeId: 'u_sam',
      priority: 'high',
      labelIds: ['l_chore'],
      dueDate: inDays(4),
      createdAt: ago(3),
      createdBy: 'u_jordan',
    },
  ]

  const columns: Column[] = [
    { id: 'c_backlog', title: 'Backlog', taskIds: ['t_export', 't_keyboard', 't_seed'], wipLimit: null },
    { id: 'c_todo', title: 'To Do', taskIds: ['t_onboarding', 't_api', 't_filters'], wipLimit: null },
    { id: 'c_doing', title: 'In Progress', taskIds: ['t_login', 't_dnd', 't_perf'], wipLimit: 4 },
    { id: 'c_review', title: 'In Review', taskIds: ['t_avatars', 't_tests'], wipLimit: 3 },
    { id: 'c_done', title: 'Done', taskIds: ['t_darkmode'], wipLimit: null },
  ]

  return {
    columnOrder: columns.map((c) => c.id),
    columns: byId(columns),
    tasks: byId(tasks),
    users: byId(USERS),
    labels: byId(LABELS),
    activity: [
      { id: 'a_seed1', userId: 'u_alex', message: 'created the board', timestamp: ago(10) },
      { id: 'a_seed2', userId: 'u_sam', message: 'moved “Dark mode polish pass” to Done', timestamp: ago(1) },
    ],
    currentUserId: 'u_alex',
  }
}
