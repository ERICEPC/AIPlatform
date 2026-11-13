/* 模型供应商分区（集成 → 模型供应商）。内嵌到个人设置的版本见 ./panel.tsx，两者共用 ./body.tsx。 */
import { RiErrorWarningLine, RiSettings4Line } from '@remixicon/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { SearchBox, SectionFrame, useIntegrations } from '../kit'
import { ModelProviderBody, NoDefaultBanner, useNoDefaultModel } from './body'
import { DefaultModelDialog } from './default-model'

export default function ModelProviderSection() {
  const { version } = useIntegrations()
  const [q, setQ] = useState('')
  const [defOpen, setDefOpen] = useState(false)
  const noDefault = useNoDefaultModel(version, defOpen)

  return (
    <SectionFrame
      title="模型供应商"
      desc="接入大模型服务商，Agent 和知识库从这里选用模型。"
      actions={(
        <>
          <SearchBox value={q} onChange={setQ} placeholder="搜索供应商" className="w-[200px]" />
          <Button variant="secondary" onClick={() => setDefOpen(true)}>
            <RiSettings4Line className="size-4" />默认模型
            {noDefault && <Badge tone="amber" className="-mr-1.5 h-5 px-2 text-[11px]"><RiErrorWarningLine className="size-3" />未设置</Badge>}
          </Button>
        </>
      )}
    >
      {noDefault && <NoDefaultBanner onClick={() => setDefOpen(true)} />}
      <ModelProviderBody q={q} version={version} />
      <DefaultModelDialog open={defOpen} onOpenChange={setDefOpen} />
    </SectionFrame>
  )
}

export { ModelProviderPanel } from './panel'
export { DefaultModelPanel } from './default-model'
