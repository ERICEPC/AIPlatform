(() => {
  'use strict';
  const params=new URLSearchParams(location.search),isTeam=!!params.get('team_id'),agentId=params.get('team_id')||params.get('agent_id')||'';
  const validAgent=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId);
  const embedded=params.get('embedded')==='1'&&window.parent!==window;
  const endpoint='/console/api/message-channels/'+(isTeam?'teams/':'agents/')+encodeURIComponent(agentId);
  const accessPath=isTeam?'/agent-teams/'+encodeURIComponent(agentId)+'?tab=access':'/agents/'+encodeURIComponent(agentId)+'/access';
  document.body.classList.toggle('embedded',embedded);
  if(validAgent)document.querySelectorAll('header a').forEach(a=>{a.href=accessPath;a.setAttribute('aria-label','返回当前智能体访问点');if(!a.classList.contains('brand'))a.textContent='返回访问点';});
  if(isTeam)document.querySelectorAll('h2,h3,p,label,small').forEach(n=>{if(!n.children.length)n.textContent=n.textContent.replaceAll('智能体','团队').replaceAll('Agent','Agent Team');});
  const kinds={
    feishu:{name:'飞书机器人',desc:'通过飞书应用接收提问，并在单聊或指定群聊中回复。',fields:[['app_id','App ID'],['app_secret','App Secret']],guide:'创建企业自建应用并开启机器人。事件订阅选择长连接，添加 im.message.receive_v1；开通读取单聊、接收群聊 @ 消息与发送消息权限，发布应用。',url:'https://open.feishu.cn/document/server-docs/im-v1/message/events/receive'},
    dingtalk:{name:'钉钉机器人',desc:'使用企业内部应用，通过 Stream 连接接收和回复消息。',fields:[['client_id','Client ID / AppKey'],['client_secret','Client Secret / AppSecret']],guide:'创建企业内部应用，添加机器人能力，消息接收模式选择 Stream；完成应用发布，并设置可见范围。',url:'https://open-dingtalk.github.io/developerpedia/docs/explore/tutorials/stream/overview/'},
    wecom:{name:'企业微信机器人',desc:'扫码创建或绑定 AI 机器人，也支持填写 Bot ID 与 Secret。',fields:[['bot_id','Bot ID'],['secret','Secret']],guide:'可以扫码授权，也可以在企业微信创建 API 模式智能机器人，连接方式选择“使用长连接”，再填入 Bot ID 与 Secret。同一机器人请只连接一套平台。',url:'https://github.com/WecomTeam/aibot-node-sdk'},
    wechat:{name:'微信 ClawBot',desc:'用微信扫码授权，在微信单聊中与指定 Agent 对话。',fields:[],guide:'使用微信扫描二维码，并在手机上确认。绑定后默认仅扫码人可以使用。授权是否可用取决于微信账号的 ClawBot 开通情况；失效后可重新扫码。',url:'https://github.com/Tencent/openclaw-weixin'}
  };
  const $=s=>document.querySelector(s), dialog=$('#editor'),form=$('#config');
  let data={agent:null,channels:[]},current=null,qrGeneration=0,popup=null,popupCleanup=null;
  const wording=text=>isTeam?String(text).replaceAll('智能体','团队').replace(/\bAgent\b(?! Team)/g,'Agent Team'):text;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=wording(text);return n;};
  function channelIcon(kind){
    // Local line icons use the same size and treatment as native access cards.
    const paths={feishu:['M22 2 9 15','m22 2-8 20-5-7-7-5Z'],dingtalk:['m13 2-9 12h7l-1 8 10-12h-7Z'],wecom:['M3 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16','M7 7h2m2 0h2M7 11h2m2 0h2M7 15h2m2 0h2M9 21v-3h4v3M17 9h2a2 2 0 0 1 2 2v10H3'],wechat:['M13 14a7 7 0 1 1 4-7','M4 13l-1 3 4-1','M21 19l1 3-4-1a6 6 0 1 1 3-2']};
    const span=el('span','kind-icon '+kind),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');span.setAttribute('aria-hidden','true');
    paths[kind].forEach(d=>{const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);});span.append(svg);return span;
  }
  const button=(text,fn,cls)=>{const b=el('button',cls,text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};return b;};
  function notice(text,error=false){$('#notice').textContent=wording(text);$('#notice').className=error?'error':'success';}
  function csrf(){const c=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-csrf_token=')||v.startsWith('csrf_token='));return c?decodeURIComponent(c.slice(c.indexOf('=')+1)):'';}
  let refreshing=null;
  async function api(path='',method='GET',body,retried=false){
    const r=await fetch(endpoint+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:body===undefined?undefined:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){
      if(!retried){
        if(!refreshing)refreshing=fetch('/console/api/refresh-token',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}}).finally(()=>{refreshing=null;});
        const refresh=await refreshing;
        if(refresh.ok)return api(path,method,body,true);
      }
      if(embedded){notice('登录已过期，请刷新当前访问点页面后重试。',true);throw new Error('请刷新当前页面以重新登录');}
      location.assign('/signin?redirect_url='+encodeURIComponent(accessPath));throw new Error('请先登录平台');
    }
    if(!r.ok)throw new Error(d.error||d.message||'操作失败，请刷新后重试');return d;
  }
  async function load(){if(!validAgent)return;data=await api();render();}
  function render(){
    $('#agent-name').textContent=data.agent.name;
    if(!embedded)document.title='消息渠道 · '+data.agent.name+' - 商汤销售小浣熊';
    $('#publish-state').textContent=data.agent.published?'已发布':'尚未发布';
    $('#publish-state').className='status '+(data.agent.published?'connected':'');
    $('#publish-hint').textContent=wording(!data.agent.published?'请先在「配置」中发布当前智能体，再配置和启用消息渠道。':!data.agent.api_enabled?'请先在上方「后端服务 API」中开启服务，再启用机器人。':'');
    $('#kinds').querySelectorAll('button').forEach(b=>{b.disabled=!data.agent.published;});
    const area=$('#channels');area.replaceChildren();
    if(!data.channels.length){area.append(el('div','empty','还没有接入机器人。从上方选择一个渠道开始配置。'));return;}
    data.channels.forEach(c=>{
      const row=el('article','channel'),icon=channelIcon(c.kind),info=el('div','channel-info'),summary=el('div','channel-summary');
      summary.append(el('strong','',c.name),el('span','status '+c.status,c.status_label));info.append(summary);
      if(c.name!==kinds[c.kind].name)info.append(el('p','',kinds[c.kind].name));
      if(c.error)info.append(el('p','error',c.error));
      const actions=el('div','channel-actions');
      const toggle=button(c.enabled?'暂停':'启用并自动回复',async()=>{await api('/'+c.id+'/enabled','POST',{revision:c.revision,enabled:!c.enabled});notice(c.enabled?'渠道已暂停。':'渠道已启用，正在连接机器人。');await load();},c.enabled?'':'primary');
      toggle.disabled=!c.enabled&&(!data.agent.published||!data.agent.api_enabled);actions.append(toggle);
      actions.append(button('配置',()=>edit(c)),button('消息状态',()=>showEvents(c)));
      if(!c.enabled)actions.append(button('删除',async()=>{if(!window.confirm('删除这个渠道配置？Agent 和原有对话不会删除。'))return;await api('/'+c.id,'DELETE',{revision:c.revision});await load();}));
      row.append(icon,info,actions);area.append(row);
    });
  }
  function scope(){const restricted=form.elements.access.value==='restricted';$('#users-label').hidden=!restricted;$('#groups-label').hidden=!form.elements.groups.checked;}
  function edit(c){
    if(c.agent_id&&c.agent_id!==agentId)throw new Error('此渠道不属于当前智能体');
    stopQr();current={...c};form.reset();$('#form-error').textContent='';$('#qr').replaceChildren();
    const k=kinds[c.kind];$('#kind-name').textContent=k.name;form.elements.name.value=c.name||k.name;
    $('#bound-agent-name').textContent=data.agent.name;
    const credentials=$('#credentials');credentials.replaceChildren();
    k.fields.forEach(([name,label])=>{const lab=el('label','',label),input=el('input');input.name='credential_'+name;input.autocomplete='new-password';input.setAttribute('data-1p-ignore','true');input.setAttribute('data-lpignore','true');input.type=/secret/.test(name)?'password':'text';input.maxLength=8192;
      if(c.credential_fields?.includes(name))input.placeholder=/secret/.test(name)?'已保存，留空保留原值':c.account_id+'（留空保留）';lab.append(input);credentials.append(lab);});
    const s=c.settings||{};form.elements.access.value=s.access||'restricted';form.elements.allowed_users.value=(s.allowed_users||[]).join('\n');form.elements.groups.checked=s.groups||false;form.elements.allowed_groups.value=(s.allowed_groups||[]).join('\n');
    form.elements.access.querySelector('[value=app_members]').disabled=c.kind==='wechat';$('#group-label').hidden=c.kind==='wechat';
    $('#qr-section').hidden=!['wechat','wecom'].includes(c.kind);$('#scan').textContent=c.kind==='wecom'?'企业微信扫码绑定':'微信扫码绑定';
    $('#guide').replaceChildren(el('div','',k.guide));const a=el('a','','查看官方接入说明 ↗');a.href=k.url;a.target='_blank';a.rel='noopener noreferrer';$('#guide').append(a);
    [...form.querySelectorAll('input,textarea,select,button')].forEach(n=>{if(n.id!=='close')n.disabled=!!c.enabled;});
    $('#scan').disabled=!!c.enabled||!data.agent.published;
    $('#save-hint').textContent=c.enabled?'请先关闭窗口并暂停渠道，再修改配置。':'保存后仍为暂停状态。';scope();dialog.showModal();
  }
  function ids(value){return value.split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);}
  async function ensureCreated(){if(!current.id){if(!data.agent?.published)throw new Error('请先发布当前智能体');current=(await api('','POST',{kind:current.kind})).channel;}}
  async function save(){
    await ensureCreated();const credentials={};kinds[current.kind].fields.forEach(([k])=>{const v=form.elements['credential_'+k].value.trim();if(v)credentials[k]=v;});
    const settings={access:form.elements.access.value,allowed_users:ids(form.elements.allowed_users.value),groups:form.elements.groups.checked,allowed_groups:ids(form.elements.allowed_groups.value)};
    current=(await api('/'+current.id,'POST',{revision:current.revision,name:form.elements.name.value,credentials,settings})).channel;
    return current;
  }
  function stopQr(){qrGeneration++;if(popupCleanup)popupCleanup();popupCleanup=null;if(popup&&!popup.closed)popup.close();popup=null;}
  window.addEventListener('pagehide',stopQr);
  $('#close').onclick=()=>dialog.close();dialog.addEventListener('close',stopQr);form.elements.access.onchange=scope;form.elements.groups.onchange=scope;
  form.onsubmit=async e=>{e.preventDefault();const b=$('#save');b.disabled=true;$('#form-error').textContent='';try{await save();dialog.close();notice('配置已保存。点击“启用并自动回复”即可开始连接。');await load();}catch(e){$('#form-error').textContent=wording(e.message);}finally{b.disabled=false;}};
  async function wecomScan(){
    const state=crypto.randomUUID(),name='raccoon_wecom_'+state.replaceAll('-','');
    popup=window.open('about:blank',name,'width=950,height=640');if(!popup)throw new Error('弹窗被拦截，请允许本站弹窗后重试。');
    const target=popup;await ensureCreated();if(target.closed)return;
    $('#qr').textContent='请在企业微信官方授权窗口扫码。完成后，再保存配置。';
    const timer=setTimeout(()=>{cleanup();$('#qr').textContent='授权超时，请重新扫码。';},300000);
    const handler=event=>{
      if(event.origin!=='https://work.weixin.qq.com'||event.source!==target)return;
      const msg=event.data;if(!msg||typeof msg!=='object'||(msg.state&&msg.state!==state))return;
      if(msg.type==='AUTH_SUCCESS'){
        const b=msg.payload;if(!b||typeof b.botid!=='string'||typeof b.secret!=='string'||b.botid.length>200||b.secret.length>8192)return;
        form.elements.credential_bot_id.value=b.botid;form.elements.credential_secret.value=b.secret;$('#qr').textContent='企业微信已授权。请选择使用范围，保存后再启用。';cleanup();
      }else if(msg.type==='AUTH_ERROR'||msg.type==='AUTH_CANCEL'){$('#qr').textContent='授权未完成。可以重试，或手动填写 Bot ID 与 Secret。';cleanup();}
    };
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',handler);if(!target.closed)target.close();};popupCleanup=cleanup;
    window.addEventListener('message',handler);
    target.location.href='https://work.weixin.qq.com/ai/qc/gen?'+new URLSearchParams({source:'raccoon-salesbuddy',state,timestamp:String(Date.now())});
  }
  async function wechatScan(){
    await ensureCreated();const generation=++qrGeneration;$('#qr').textContent='正在生成二维码…';
    const d=await api('/'+current.id+'/qr','POST',{});if(generation!==qrGeneration)return;
    const q=$('#qr');q.replaceChildren();const label=el('p','','请用微信扫码，并在手机上确认。');q.append(label);
    // Server generates this SVG locally from QR data. Render as an image, never as executable markup.
    const img=el('img');img.alt='微信绑定二维码';img.width=240;img.height=240;img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(d.svg)));img.style.background='white';q.append(img);
    const verification=el('input');verification.placeholder='手机显示的验证码';verification.autocomplete='one-time-code';verification.maxLength=16;verification.hidden=true;q.append(verification);
    const deadline=Date.now()+d.expires_in*1000;
    while(generation===qrGeneration&&dialog.open&&Date.now()<deadline){
      await new Promise(r=>setTimeout(r,2000));if(generation!==qrGeneration)return;
      const result=await api('/'+current.id+'/qr/poll','POST',{ticket:d.ticket,verify_code:verification.value});
      if(generation!==qrGeneration)return;
      if(result.status==='confirmed'){await load();const c=data.channels.find(x=>x.id===current.id);current=c;form.elements.allowed_users.value=c.settings.allowed_users.join('\n');form.elements.access.value='restricted';q.replaceChildren(el('p','success','微信已绑定。默认仅扫码人可使用；保存配置后再启用。'));scope();return;}
      if(['expired','verify_code_blocked','binded_redirect'].includes(result.status)){q.replaceChildren(el('p','','二维码已失效或绑定状态已变化，请重新扫码。'));return;}
      if(result.status==='need_verifycode'){verification.hidden=false;label.textContent='请填写手机上显示的验证码。';}
      else label.textContent=result.status==='scaned'?'已扫码，请在手机上确认。':'请用微信扫码，并在手机上确认。';
    }
    if(generation===qrGeneration)q.replaceChildren(el('p','','二维码已过期，请重新扫码。'));
  }
  $('#scan').onclick=async()=>{stopQr();$('#form-error').textContent='';try{if(!data.agent?.published)throw new Error('请先发布当前智能体');if(current.kind==='wecom')await wecomScan();else await wechatScan();}catch(e){$('#form-error').textContent=wording(e.message);}};
  async function showEvents(c){
    const d=await api('/'+c.id+'/events'),area=$('#events');area.replaceChildren();
    const labels={pending:'等待处理',running:'正在回答',sent:'回复已发送',failed:'调用失败',uncertain:'送达未确认',rejected:'未转交智能体',cancelled:'已取消'};
    if(!d.events.length)area.append(el('p','muted','暂无消息。启用并完成连接后，向机器人发送一条文字来测试。'));
    d.events.forEach(e=>{const row=el('div','event');row.append(el('span','',new Date(e.created_at*1000).toLocaleString('zh-CN')),el('span','state',labels[e.state]||e.state));if(e.description)row.append(el('small','',e.description));if(e.sender_id)row.append(el('small','', '用户 ID：'+e.sender_id));if(e.chat_id&&e.chat_id!==e.sender_id)row.append(el('small','', '会话 / 群 ID：'+e.chat_id));if(e.duration!=null)row.append(el('small','',e.duration.toFixed(1)+' 秒'));area.append(row);});$('#events-dialog').showModal();
  }
  $('#events-close').onclick=()=>$('#events-dialog').close();$('#refresh').onclick=()=>load().catch(e=>notice(e.message,true));
  Object.entries(kinds).forEach(([kind,k])=>{
    const card=el('article','kind-card'),content=el('div','kind-content'),heading=el('div','kind-heading');heading.append(channelIcon(kind),el('h3','',k.name));content.append(heading,el('p','',k.desc));
    const actions=el('div','kind-actions'),b=button('添加渠道',()=>{if(!data.agent?.published)throw new Error('请先发布当前智能体');edit({kind,name:k.name,agent_id:agentId,settings:{}});});b.setAttribute('aria-label','添加'+k.name+'渠道');b.disabled=true;const plus=el('span','plus','+');plus.setAttribute('aria-hidden','true');b.prepend(plus);actions.append(b);card.append(content,actions);$('#kinds').append(card);
  });
  let dark=localStorage.getItem('raccoon-channel-theme');document.body.classList.toggle('dark',dark?dark==='dark':matchMedia('(prefers-color-scheme:dark)').matches);
  $('#theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('raccoon-channel-theme',document.body.classList.contains('dark')?'dark':'light');};
  if(embedded){
    // Copy only visual tokens from our same-origin host; forms and credentials stay here.
    function syncNativeTheme(){
      const host=window.parent.document,style=window.parent.getComputedStyle(host.documentElement);
      const tokens=['text-primary','text-secondary','text-tertiary','text-accent','components-panel-bg','components-panel-border','components-panel-on-panel-item-bg-hover','divider-subtle','components-button-secondary-bg','components-button-secondary-bg-hover','components-button-secondary-border','components-button-secondary-text','components-button-primary-bg','components-button-primary-bg-hover','components-button-primary-text','components-input-bg-normal','components-input-border-active','components-modal-bg','state-accent-solid','util-colors-green-green-700','text-destructive'];
      tokens.forEach(t=>{const name='--color-'+t,value=style.getPropertyValue(name).trim();if(value)document.documentElement.style.setProperty(name,value);});
      document.body.style.fontFamily=window.parent.getComputedStyle(host.body).fontFamily;
      document.body.classList.toggle('dark',host.documentElement.dataset.theme==='dark');
      // Embedded Team pages have a body-colored host. Match the iframe canvas
      // as well as its cards; a light root color-scheme otherwise paints white.
      if(isTeam){document.documentElement.style.colorScheme=style.colorScheme;document.documentElement.style.backgroundColor=style.getPropertyValue('--color-background-body').trim();}
    }
    syncNativeTheme();
    window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='raccoon-channel-theme')return;syncNativeTheme();reportHeight(true);});
    let lastHeight=0;
    function reportHeight(force=false){const formOpen=dialog.open||$('#events-dialog').open;const height=Math.max(formOpen?Math.min(760,Math.max(420,window.parent.innerHeight-120)):120,Math.ceil(document.querySelector('main').getBoundingClientRect().height));if(force||height!==lastHeight){lastHeight=height;window.parent.postMessage({type:'raccoon-channel-height',agentId,height},location.origin);}}
    new ResizeObserver(()=>reportHeight()).observe(document.querySelector('main'));
    [dialog,$('#events-dialog')].forEach(d=>d.addEventListener('toggle',reportHeight));
    window.addEventListener('resize',reportHeight);
  }
  if(!validAgent){$('#agent-context').hidden=true;$('#kinds').hidden=true;$('.bindings').hidden=true;$('.help').hidden=true;notice('请先打开一个智能体，再从它的「访问点」配置消息渠道。');}
  else load().catch(e=>{notice(e.message,true);$('#agent-name').textContent='暂时无法读取';$('#channels').replaceChildren(el('p','muted','请确认当前工作空间与权限，或点击刷新状态重试。'));}).finally(()=>document.body.classList.add('ready'));
  if(!validAgent)document.body.classList.add('ready');
  setInterval(()=>{if(document.visibilityState==='visible'&&!dialog.open&&!$('#events-dialog').open)load().catch(()=>{});},15000);
})();
