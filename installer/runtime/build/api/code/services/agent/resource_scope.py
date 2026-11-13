"""Tenant-scoped Agent references. No secrets or foreign resource names in errors."""
from uuid import UUID
from sqlalchemy import select
from models.provider import ProviderCredential, ProviderModelCredential
from models.tools import ApiToolProvider, WorkflowToolProvider, MCPToolProvider, BuiltinToolProvider, ToolFile
from models import UploadFile
from models.dataset import Dataset


def validate_resources(*, session, tenant_id, agent_soul):
    if agent_soul is None:
        return
    def fail():
        raise ValueError('resource_out_of_scope: resource unavailable in authorized workspace')
    def owned(cls, ident):
        try: ident=str(UUID(ident))
        except (ValueError,TypeError,AttributeError): fail()
        row=session.scalar(select(cls).where(cls.id==ident,cls.tenant_id==tenant_id))
        if row is None: fail()
        return row
    def model(config, kind='llm'):
        if not config: return
        provider=config.get('model_provider') or config.get('provider')
        name=config.get('model') or config.get('model_name') or config.get('name')
        if not provider or not name: fail()
        ref=config.get('credential_ref')
        if ref:
            if ref.get('provider') and ref['provider']!=provider: fail()
            typ=ref.get('type')
            cls={'model':ProviderModelCredential,'provider':ProviderCredential}.get(typ)
            if cls is None or not ref.get('id'): fail()
            row=owned(cls,ref['id'])
            if row.provider_name!=provider: fail()
            if cls is ProviderModelCredential and (row.model_name!=name or str(row.model_type)!=kind): fail()
        # Provider catalog identities are public; availability/credentials are tenant-bound.
        from services.model_provider_service import ModelProviderService
        from graphon.model_runtime.entities.model_entities import ModelType
        try:
            cfg=ModelProviderService()._get_provider_configuration(tenant_id,provider)
            setting=cfg.get_provider_model_setting(ModelType(kind),name)
            if setting and not setting.enabled: fail()
            credentials=cfg.get_current_credentials(ModelType(kind),name)
            if credentials is None: fail()
            if cfg.get_model_schema(model_type=ModelType(kind),model=name,credentials=credentials) is None: fail()
        except Exception: fail()
        if config.get('fallback'): model(config['fallback'],kind)
    soul=agent_soul.model_dump(mode='json',exclude_none=True)
    model(soul.get('model'))
    for key in ('app_features','misc_legacy'):
        features=soul.get(key,{})
        followup=features.get('suggested_questions_after_answer') or {}
        if followup.get('model'): model(followup['model'])
        moderation=(features.get('sensitive_word_avoidance') or {}).get('config') or {}
        if moderation.get('api_based_extension_id'):
            from models.api_based_extension import APIBasedExtension
            owned(APIBasedExtension,moderation['api_based_extension_id'])
    for config in soul.get('knowledge',{}).get('sets',[]):
        for dataset in config.get('datasets',[]): owned(Dataset,dataset.get('id'))
        retrieval=config.get('retrieval',{})
        if retrieval.get('model'): model(retrieval['model'])
        if retrieval.get('reranking_model'): model(retrieval['reranking_model'],'rerank')
        vector=(retrieval.get('weights') or {}).get('vector_setting') or {}
        if vector.get('embedding_model_name') or vector.get('embedding_provider_name'):
            model({'provider':vector.get('embedding_provider_name'),'model':vector.get('embedding_model_name')},'text-embedding')
        metadata=config.get('metadata_filtering',{})
        if metadata.get('metadata_model_config'): model(metadata['metadata_model_config'])
    for item in soul.get('config_files',[])+soul.get('config_skills',[]):
        if item.get('is_missing'): continue
        owned(UploadFile if item['file_kind']=='upload_file' else ToolFile,item['file_id'])
    for tool in agent_soul.tools.dify_tools:
        # Check even disabled references so enabling later cannot bypass ownership.
        from core.workflow.nodes.agent_v2.dify_tools_builder import WorkflowAgentDifyToolsBuilder, _list_provider_tool_names
        provider=WorkflowAgentDifyToolsBuilder._provider_id(tool)
        kind=tool.provider_type.value
        if kind in ('api','workflow'): owned(ApiToolProvider if kind=='api' else WorkflowToolProvider,provider)
        elif kind=='mcp':
            from services.tools.mcp_tools_manage_service import MCPToolManageService
            try:
                row=MCPToolManageService(session).get_provider(provider_id=provider,tenant_id=tenant_id)
                provider=row.server_identifier
            except Exception: fail()
        elif kind not in ('builtin','plugin'): fail()
        if tool.credential_ref and tool.credential_ref.id:
            if kind in ('builtin','plugin'):
                row=owned(BuiltinToolProvider,tool.credential_ref.id)
                if row.provider!=provider: fail()
            else:
                # Core providers own their credentials; no unrelated credential override.
                if tool.credential_ref.id!=provider: fail()
        try:
            names=_list_provider_tool_names(tenant_id=tenant_id,provider_type=tool.provider_type,provider_id=provider)
            if tool.tool_name and tool.tool_name not in names: fail()
        except Exception: fail()
