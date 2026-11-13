type ListItem = {
  id: string
  name: string
  published_id: string | null
  created_by: string
  created_at: number
  updated_at: number
}
type Filters = {
  filter: 'all' | 'published' | 'drafts'
  keyword: string
  createdByMe: boolean
  sortBy: 'last_modified' | 'recently_created' | 'earliest_created'
  userId?: string
}
export function selectTeams<T extends ListItem>(teams: T[], filters: Filters): T[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase()
  return teams
    .filter(
      (team) =>
        (filters.filter === 'all' ||
          (filters.filter === 'published' ? !!team.published_id : !team.published_id)) &&
        (!keyword || team.name.toLocaleLowerCase().includes(keyword)) &&
        (!filters.createdByMe || (!!filters.userId && team.created_by === filters.userId)),
    )
    .sort((a, b) => {
      const difference =
        filters.sortBy === 'last_modified'
          ? b.updated_at - a.updated_at
          : filters.sortBy === 'recently_created'
            ? b.created_at - a.created_at
            : a.created_at - b.created_at
      return difference || a.id.localeCompare(b.id)
    })
}
