import { useMemo, useState } from 'react'
import type { ID } from '../types'
import { EMPTY_FILTERS, filtersActive, type Filters } from '../utils/filter'

/** Toolbar filter state: free-text search plus assignee and label facets. */
export function useFilters() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  return useMemo(
    () => ({
      filters,
      active: filtersActive(filters),
      setSearch: (search: string) => setFilters((f) => ({ ...f, search })),
      setAssignee: (assigneeId: ID | null) => setFilters((f) => ({ ...f, assigneeId })),
      setLabel: (labelId: ID | null) => setFilters((f) => ({ ...f, labelId })),
      reset: () => setFilters(EMPTY_FILTERS),
    }),
    [filters],
  )
}
