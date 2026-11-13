'use client'

import type { FormValue } from '@/app/components/header/account-setting/model-provider-page/declarations'
import type { ModelSelectorProvider } from '@/app/components/header/account-setting/model-provider-page/model-selector/types'
import type { AgentComposerModel } from '@/features/agent-v2/agent-composer/form-state'
import { Field, FieldLabel } from '@langgenius/dify-ui/field'
import { useTranslation } from 'react-i18next'
import ModelParameterModal from '@/app/components/header/account-setting/model-provider-page/model-parameter-modal'
import { isAgentCompatibleModel, isAgentSuggestedModel } from '../../../model-compatibility'
import { useAgentOrchestrateReadOnly } from '../read-only-context'

type AgentModelFieldProps = {
  currentModel?: AgentComposerModel
  textGenerationModelList: ModelSelectorProvider[]
  onSelect: (model: AgentComposerModel) => void
}

export function AgentModelField({
  currentModel,
  textGenerationModelList,
  onSelect,
}: AgentModelFieldProps) {
  const { t } = useTranslation('agentV2')
  const readOnly = useAgentOrchestrateReadOnly()

  return (
    <>
      <Field name="model" className="gap-1 pb-4">
        <FieldLabel className="py-0 system-sm-semibold-uppercase! text-text-secondary">
          {t(($) => $['agentDetail.configure.model.label'])}
        </FieldLabel>
        {readOnly ? (
          <div className="flex h-8 w-full min-w-0 items-center rounded-lg bg-components-input-bg-disabled px-3 system-sm-regular text-components-input-text-filled">
            <span className="truncate">{currentModel?.model}</span>
          </div>
        ) : (
          <ModelParameterModal
            isAdvancedMode
            modelId={currentModel?.model ?? ''}
            provider={currentModel?.provider ?? ''}
            completionParams={(currentModel?.model_settings ?? {}) as FormValue}
            hideDebugWithMultipleModel
            modelList={textGenerationModelList}
            showModelMeta={false}
            modelPredicate={isAgentCompatibleModel}
            modelSuggestionPredicate={isAgentSuggestedModel}
            placement="bottom-end"
            setModel={({ modelId, provider, plugin_id }) => {
              onSelect({
                fallback: currentModel?.fallback,
                provider,
                model: modelId,
                plugin_id,
              })
            }}
            onCompletionParamsChange={(modelSettings) => {
              if (!currentModel) return

              onSelect({
                ...currentModel,
                model_settings: modelSettings,
              })
            }}
          />
        )}
      </Field>
      {currentModel && (
        <Field name="fallback-model" className="gap-1 pb-4">
          <FieldLabel>{t(($) => $['agentDetail.configure.model.fallbackLabel'])}</FieldLabel>
          <p className="system-xs-regular text-text-tertiary">
            {t(($) => $['agentDetail.configure.model.fallbackHelp'])}
          </p>
          {readOnly ? (
            <span>{currentModel.fallback?.model ?? '—'}</span>
          ) : (
            <>
              <ModelParameterModal
                isAdvancedMode
                modelId={currentModel.fallback?.model ?? ''}
                provider={currentModel.fallback?.model_provider ?? ''}
                completionParams={(currentModel.fallback?.model_settings ?? {}) as FormValue}
                hideDebugWithMultipleModel
                modelList={textGenerationModelList}
                showModelMeta={false}
                modelPredicate={(provider, model) =>
                  isAgentCompatibleModel(provider, model) && model.model !== currentModel.model
                }
                placement="bottom-end"
                setModel={({ modelId, provider, plugin_id }) =>
                  onSelect({
                    ...currentModel,
                    fallback: {
                      model: modelId,
                      model_provider: provider,
                      plugin_id: plugin_id ?? provider.split('/').slice(0, 2).join('/'),
                      first_chunk_timeout: 8,
                    },
                  })
                }
                onCompletionParamsChange={(settings) => {
                  if (currentModel.fallback)
                    onSelect({
                      ...currentModel,
                      fallback: { ...currentModel.fallback, model_settings: settings },
                    })
                }}
              />
              {currentModel.fallback && (
                <button
                  type="button"
                  className="self-start rounded px-2 py-1 text-text-secondary focus-visible:outline"
                  onClick={() => onSelect({ ...currentModel, fallback: null })}
                >
                  {t(($) => $['agentDetail.configure.model.fallbackRemove'])}
                </button>
              )}
            </>
          )}
        </Field>
      )}
    </>
  )
}
