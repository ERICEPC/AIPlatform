'use client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useFavicon } from 'ahooks'
import { useEffect } from 'react'
import { systemFeaturesQueryOptions } from '@/features/system-features/client'
import { formatDocumentTitle, getApplicationTitle } from '@/utils/document-title'

export default function useDocumentTitle(title: string | null) {
  const { data } = useSuspenseQuery(systemFeaturesQueryOptions())
  const branding = data.branding
  const titleStr = title === null ? null : formatDocumentTitle(title, getApplicationTitle(branding))
  const favicon = '/fde-tab.png?v=raccoon-source-20260914'
  useEffect(() => {
    if (titleStr !== null) document.title = titleStr
  }, [titleStr])
  useFavicon(favicon)
}
