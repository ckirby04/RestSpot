// React Query wrappers around the API. Query keys:
//   ['search', origin, filters]  ['restroom', id]  ['reviews', id]  ['history', id]
//   ['favorites']  ['contributions']  ['profile', userId]  ['admin', ...]
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Coordinates, SearchFilters } from '@restspot/shared'
import { useApi } from './ApiProvider.tsx'

/** Refetch listing data whenever any listing changes (realtime on Supabase). */
export function useLiveRestroomUpdates() {
  const api = useApi()
  const queryClient = useQueryClient()
  useEffect(
    () =>
      api.onRestroomsChanged(() => {
        void queryClient.invalidateQueries({ queryKey: ['search'] })
        void queryClient.invalidateQueries({ queryKey: ['restroom'] })
        void queryClient.invalidateQueries({ queryKey: ['history'] })
      }),
    [api, queryClient],
  )
}

export function useSearch(origin: Coordinates | null, filters: SearchFilters) {
  const api = useApi()
  return useQuery({
    queryKey: ['search', origin, filters],
    queryFn: () => api.searchRestrooms(origin!, filters),
    enabled: origin !== null,
    placeholderData: (prev) => prev,
  })
}

export function useRestroom(id: string | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['restroom', id],
    queryFn: () => api.getRestroom(id!),
    enabled: Boolean(id),
  })
}

export function useReviews(id: string | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['reviews', id],
    queryFn: () => api.getReviews(id!),
    enabled: Boolean(id),
  })
}

export function useHistory(id: string | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: ['history', id],
    queryFn: () => api.getHistory(id!),
    enabled: Boolean(id) && enabled,
  })
}

export function useFavorites(enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites(), enabled })
}

export function useContributions(enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: ['contributions'], queryFn: () => api.getMyContributions(), enabled })
}

/** Invalidate everything that shows a listing after it (or its reviews) changed. */
export function useInvalidateRestroom() {
  const queryClient = useQueryClient()
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['search'] })
    void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    void queryClient.invalidateQueries({ queryKey: ['contributions'] })
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
    if (id) {
      void queryClient.invalidateQueries({ queryKey: ['restroom', id] })
      void queryClient.invalidateQueries({ queryKey: ['reviews', id] })
      void queryClient.invalidateQueries({ queryKey: ['history', id] })
    } else {
      void queryClient.invalidateQueries({ queryKey: ['restroom'] })
      void queryClient.invalidateQueries({ queryKey: ['reviews'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    }
  }
}

/** A mutation that refreshes listing data for `id` when it succeeds. */
export function useRestroomMutation<TArgs>(id: string | undefined, fn: (args: TArgs) => Promise<unknown>) {
  const invalidate = useInvalidateRestroom()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(id) })
}
