'use client'

import type { AppListCreationDialog } from '@/app/components/apps/app-list-creation-modals'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { CreateAppDropdown } from '@/app/components/app/create-app-dropdown'
import { AppListCreationModals } from '@/app/components/apps/app-list-creation-modals'
import { workspacePermissionKeysAtom } from '@/context/permission-state'
import { hasPermission } from '@/utils/permission'

export function WorkbenchCreate() {
  const permissions = useAtomValue(workspacePermissionKeysAtom)
  const canCreate = hasPermission(permissions, 'app.create_and_management')
  const [dialog, setDialog] = useState<AppListCreationDialog>(null)

  if (!canCreate) return null

  return (
    <>
      <CreateAppDropdown
        onCreateBlank={() => setDialog({ type: 'blank' })}
        onCreateTemplate={() => setDialog({ type: 'template' })}
        onImportDSL={() => setDialog({ type: 'dsl' })}
      />
      <AppListCreationModals
        canCreateApp={canCreate}
        category="all"
        dialog={dialog}
        onClose={() => setDialog(null)}
        onOpenBlank={() => setDialog({ type: 'blank' })}
        onOpenTemplate={() => setDialog({ type: 'template' })}
      />
    </>
  )
}
