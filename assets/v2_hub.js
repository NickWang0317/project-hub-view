'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const themeToggle = $('#theme-toggle');
  function syncTheme(){themeToggle.textContent=document.documentElement.dataset.theme==='light'?'🌙 深色':'☀️ 日光';}
  syncTheme();
  themeToggle.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('pih_v2_theme',theme);}catch{}syncTheme();});
  window.addEventListener('storage',e=>{if(e.key==='pih_v2_theme'){document.documentElement.dataset.theme=e.newValue==='light'?'light':'dark';syncTheme();}});
  const mobile = () => matchMedia('(max-width:640px)').matches;
  function syncSheet(){const drawer=$('#drawer'),active=mobile()&&drawer.classList.contains('open')&&!drawer.classList.contains('auto-synced');$('#drawer-backdrop').hidden=!active;document.body.classList.toggle('sheet-open',active);drawer.setAttribute('aria-modal',String(active));if(active)drawer.setAttribute('role','dialog');else drawer.removeAttribute('role');document.querySelectorAll('.workspace>header,.workspace>nav,.context,#stats,.graph-panel,#logic-panel,#evolution-panel,#progress-panel,#thumb-bar,#step-picker,#mobile-search').forEach(e=>e.inert=active);}
  new MutationObserver(syncSheet).observe($('#drawer'),{attributes:true,attributeFilter:['class']});
  $('#drawer-backdrop').addEventListener('click',()=>close());
  window.addEventListener('resize',syncSheet);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt = v => typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  let viewName = 'architecture', logicId = null, logicIndex = 0, logicAll = false;
  let data, expanded = false, listMode = matchMedia('(max-width:900px)').matches;
  let selected = null, origin = null, request = 0, nodes = [], edges = [], camera = [0,0,1100,650], bounds = [1100,650];
  const stateBadge = s => `<span class="pill ${s.tone}">${esc(s.label)}</span>${s.issue==='open'?'<span class="pill red">未解問題</span>':''}`;
  const entity = id => data?.entities?.find(e => e.id === id);
  const matched = e => !$('#search').value || `${e.title} ${e.plain_summary.purpose} ${e.responsibility.role_type}`.toLowerCase().includes($('#search').value.toLowerCase());
  const scopeLabel = e => ({action:'MVP 行動型',history:'歷史調查型',shared:'雙 Agent 共用',unknown:'共用 / 待確認範圍'}[e.agent_scope]);
  const openGroups = new Set();
  function mobileNeighbors(id, relations){
    const incoming=new Set(),outgoing=new Set();
    for(const r of relations||[]){if(r.target===id&&r.source!==id)incoming.add(r.source);if(r.source===id&&r.target!==id)outgoing.add(r.target);}
    return {incoming:[...incoming],outgoing:[...outgoing]};
  }
  function mobileGroups(groups){return `<div class="group-actions"><button data-groups="open">全部展開</button><button data-groups="close">全部收合</button></div>`+groups.map(g=>{const achieved=g.members.filter(id=>entity(id)?.state.core_outcome==='achieved').length;return `<details class="mobile-group" data-group-id="${esc(g.id)}" ${query()||openGroups.has(g.id)?'open':''}><summary><span><b>${esc(g.title)}</b><small>${esc(g.summary||'依來源整理的知識分群')}</small></span><span class="group-count"><i class="dot ${achieved?'green':'amber'}"></i>${g.members.length} 項</span></summary><p class="scope">${achieved} 項核心成果 · 分群非執行順序</p>${g.members.map(id=>{const e=entity(id);return `<button class="list-item" data-node="${esc(id)}"><b>${esc(e.title)}</b>${stateBadge(e.state)}<small>${esc(scopeLabel(e))} · ${esc(e.responsibility.role_type)}</small></button>`;}).join('')}</details>`;}).join('');}
  // Pure layout: stable ordering, bounded group columns, dynamic member heights.
  // Navigation grouping is not execution order. All dependency edges come from DTO.
  function layout(groups, full) {
    const result = [], boxes = []; let y = 24;
    for(let start=0;start<groups.length;start+=3){
      const row=groups.slice(start,start+3);
      const height=full?Math.max(...row.map(g=>64+g.members.length*116)):86;
      row.forEach((g,col)=>{
        const x=24+col*(full?370:300);
        boxes.push({...g,x,y,w:330,h:height});
        if(full)g.members.forEach((id,i)=>{const e=entity(id);result.push({id,title:e.title,x:x+12,y:y+48+i*116,w:306,h:104,group:g.id,entity:e});});
        else result.push({id:'group:'+g.id,title:g.title,x,y,w:270,h:86,group:g.id,members:g.members});
      });y+=height+(full?70:30);
    }
    return {nodes:result,boxes,width:full?1120:920,height:Math.max(y,400)};
  }
  function wrap(title, max=19){const chars=Array.from(title);return [chars.slice(0,max).join(''),chars.slice(max,max*2-1).join('')+(chars.length>max*2-1?'…':'')].filter(Boolean);}
  function graphEdges(){
    if(expanded)return data.relationships;
    const map=new Map();
    for(const e of data.relationships){const a=entity(e.source),b=entity(e.target);if(!a||!b||a.group_id===b.group_id)continue;
      const key=[a.group_id,b.group_id,e.confidence].join(':');
      if(!map.has(key))map.set(key,{id:'aggregate:'+key,source:'group:'+a.group_id,target:'group:'+b.group_id,confidence:e.confidence,label:'',members:[],events:[]});
      const item=map.get(key);item.members.push(e.id);item.events.push(...e.events);item.label=`${item.members.length} 項來源關係`;
    }return [...map.values()];
  }
  function renderGraph(){
    const groups=data.groups.map(g=>({...g,members:g.members.filter(id=>matched(entity(id)))})).filter(g=>g.members.length);
    const l=layout(groups,expanded);nodes=l.nodes;bounds=[l.width,l.height];edges=graphEdges().filter(e=>nodes.some(n=>n.id===e.source)&&nodes.some(n=>n.id===e.target));
    let svg='<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--blue)"/></marker></defs>';
    if(expanded)svg+=l.boxes.map(g=>`<rect class="group-bg" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12"/><text x="${g.x+14}" y="${g.y+28}" fill="var(--green)" font-size="14">${esc(g.title)} · ${g.members.length}</text>`).join('');
    svg+=edges.map((e,i)=>{
      const a=nodes.find(n=>n.id===e.source),b=nodes.find(n=>n.id===e.target);
      const ax=a.x+a.w/2,ay=a.y+a.h,bx=b.x+b.w/2,by=b.y;
      // Route returns through a side gutter; keep arrow direction even in cycles.
      const mid=ay+18+(i%4)*8;
      const d=by>ay?`M${ax} ${ay} V${mid} H${bx} V${by}`:`M${a.x+a.w} ${a.y+a.h/2} H${a.x+a.w+16+(i%3)*5} V${b.y-14} H${bx} V${by}`;
      return `<g class="edge ${e.confidence==='inferred'?'inferred':''}" tabindex="0" role="button" data-edge="${esc(e.id)}" aria-label="關係：${esc(a.title)} → ${esc(b.title)}"><title>${esc(e.label)}；${e.confidence==='inferred'?'推論／規劃':'有來源紀錄，非獨立驗證'}</title><path class="hit" d="${d}"/><path class="line" d="${d}" marker-end="url(#arrow)"/></g>`;
    }).join('');
    svg+=nodes.map(n=>{
      const lines=wrap(n.title);let caption,state;
      if(n.entity){caption=scopeLabel(n.entity);state=n.entity.state.label;}
      else{const members=n.members.map(entity);const achieved=members.filter(e=>e.state.core_outcome==='achieved').length;caption=`${members.length} 個模組 · ${achieved} 項核心成果`;state='探索分群 →';}
      return `<g class="node" tabindex="0" role="button" data-node="${esc(n.id)}" aria-label="${esc(n.title)}"><title>${esc(n.title)}</title><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>${lines.map((s,i)=>`<text x="${n.x+14}" y="${n.y+24+i*19}">${esc(s)}</text>`).join('')}<text class="caption" x="${n.x+14}" y="${n.y+n.h-28}">${esc(caption)}</text><text class="${n.entity?n.entity.state.tone:'caption'}" x="${n.x+14}" y="${n.y+n.h-10}" font-size="12">${esc(state)}</text>${n.entity?.state.issue==='open'?`<text class="red" x="${n.x+n.w-80}" y="${n.y+n.h-10}">未解問題</text>`:''}</g>`;
    }).join('');
    $('#graph').innerHTML=svg;
    $('#group-list').innerHTML=(mobile()?mobileGroups(groups):groups.map(g=>`<section class="list-group"><h3>${esc(g.title)} <small>${g.members.length}</small></h3>${g.members.map(id=>{const e=entity(id);return `<button class="list-item" data-node="${esc(id)}">${stateBadge(e.state)}<b>${esc(e.title)}</b><small>${esc(scopeLabel(e))} · ${esc(e.responsibility.role_type)}</small></button>`;}).join('')}</section>`).join(''))||'<p>沒有符合的模組，請調整搜尋。</p>';
    $('#count').textContent=`${groups.length} 個概念群 · ${groups.reduce((n,g)=>n+g.members.length,0)} 項知識／模組`;
    $('#match-count').textContent=$('#search').value?' · 搜尋已篩選':'';
    $('#canvas').hidden=listMode;$('#group-list').hidden=!listMode;
    $('#list-mode').textContent=listMode?'圖形畫布':'分群清單';$('#list-mode').setAttribute('aria-pressed',listMode);
    $('#mode').textContent=expanded?'簡化分群':'展開模組';$('#mode').setAttribute('aria-pressed',expanded);
    fit();highlight();
  }
  function setCamera(){ $('#graph').setAttribute('viewBox',camera.join(' ')); }
  function fit(){const r=$('#canvas').getBoundingClientRect();const aspect=(r.width||900)/(r.height||420);let w=bounds[0],h=bounds[1];if(w/h>aspect)h=w/aspect;else w=h*aspect;const maxW=(r.width||900)/.8;if(w>maxW){w=maxW;h=w/aspect;}camera=[Math.max(0,(bounds[0]-w)/2),0,w,h];setCamera();}
  function zoom(f){const [x,y,w,h]=camera;camera=[x+w*(1-f)/2,y+h*(1-f)/2,Math.max(200,w*f),Math.max(160,h*f)];setCamera();}
  function highlight(){
    const related=new Set();const relatedEdges=new Set();
    const target=!expanded&&entity(selected)?'group:'+entity(selected).group_id:selected;
    if(selected){related.add(target);for(const e of edges)if(e.source===target||e.target===target||e.id===target){related.add(e.source);related.add(e.target);relatedEdges.add(e.id);}}
    document.querySelectorAll('[data-node]').forEach(el=>{el.classList.toggle('selected',el.dataset.node===target||el.dataset.node===selected);el.classList.toggle('dim',!!selected&&!related.has(el.dataset.node)&&!listMode);});
    document.querySelectorAll('[data-edge]').forEach(el=>{el.classList.toggle('selected',el.dataset.edge===selected);el.classList.toggle('dim',!!selected&&!relatedEdges.has(el.dataset.edge));});
  }
  const step=(n,title,body,open=false)=>`<details ${open?'open':''}><summary>Step ${n} · ${title}</summary>${body}</details>`;
  const pair=(k,v)=>`<dt>${esc(k)}</dt><dd>${esc(txt(v))}</dd>`;
  function evidence(records){const unique=[...new Map(records.map(e=>[e.event_id,e])).values()];return unique.map(e=>`<article class="event"><small>${esc(e.display_date||e.occurred_at||'日期未知')} · ${esc(e.evidence_type)}</small><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p><code>${esc(e.event_id)}</code><p>對話來源：${esc(e.source_status)}${e.gaps.length?' · '+esc(e.gaps.join('；')):''}</p>${e.conversation_id?`<a href="https://chatgpt.com/c/${encodeURIComponent(e.conversation_id)}" target="_blank" rel="noopener noreferrer">開啟來源對話 ↗</a>`:''}</article>`).join('')||'<p>尚無直接來源紀錄；不以畫面關係當成驗證。</p>';}
  function highlightLogicChips(jumpId=null, stepId=null, srcIdx=null){
    document.querySelectorAll('#logic-panel .logic-chip').forEach(c=>{
      const on=(jumpId&&c.dataset.jump===jumpId)||(stepId!==null&&c.dataset.logicSourceStep===stepId&&Number(c.dataset.logicSource)===srcIdx);
      c.classList.toggle('active-chip',Boolean(on));
    });
  }
  function highlightEvolutionChips(jumpId=null, srcKey=null){
    document.querySelectorAll('#evolution-panel .logic-chip').forEach(c=>{
      const on=(jumpId&&c.dataset.jump===jumpId)||(srcKey&&c.dataset.evolutionSource===srcKey);
      c.classList.toggle('active-chip',Boolean(on));
    });
  }
  let currentAsOf=new URLSearchParams(location.search).get('as_of')||'',asOfNotice='';
  function enhanceMobileDrawer(id){
    if(!mobile())return;
    const d=$('#drawer'),head=d.querySelector('.drawer-head');if(!head)return;
    const content=document.createElement('div');content.className='sheet-content';
    [...d.children].filter(e=>e!==head).forEach(e=>content.append(e));d.append(content);
    head.insertAdjacentHTML('beforebegin','<button class="sheet-grab" aria-label="拖曳或點擊切換抽屜高度"><span></span></button>');
    head.insertAdjacentHTML('afterbegin','<button class="sheet-resize" aria-label="切換抽屜高度">展開全屏</button>');
    const sections=[...content.querySelectorAll(':scope > details')];
    sections.forEach((s,i)=>s.dataset.sheetSection=i);
    head.insertAdjacentHTML('afterend',`<nav class="sheet-jumps" aria-label="詳情章節">${['白話','運作','狀態','技術','證據'].map((s,i)=>`<button data-sheet-jump="${i}">${s}</button>`).join('')}</nav>`);
    if(id){const ns=mobileNeighbors(id,data.relationships);content.insertAdjacentHTML('afterbegin',`<section class="one-hop" aria-label="一階鄰接探索"><b>${esc(entity(id)?.title)}</b>${[['incoming','⬅ 上游輸入來源'],['outgoing','➡ 下游呼叫／輸出']].map(([dir,label])=>`<div><h3>${label}</h3>${ns[dir].filter(x=>entity(x)).map(x=>`<button class="logic-chip" data-jump="${esc(x)}">${esc(entity(x).title)}</button>`).join('')||'<p>來源未記載關係</p>'}</div>`).join('')}<small>來源關係，非即時呼叫紀錄</small></section>`);}
    const handle=d.querySelector('.sheet-grab');let start=null,swipe=false;
    handle.addEventListener('pointerdown',e=>{swipe=false;start=e.clientY;handle.setPointerCapture(e.pointerId);});
    handle.addEventListener('pointerup',e=>{if(start!==null){const delta=e.clientY-start;swipe=Math.abs(delta)>40;if(delta>70)close();else if(delta < -40)d.classList.add('sheet-full');}start=null;syncSheetSize();});
    handle.addEventListener('pointercancel',()=>start=null);
    handle.addEventListener('click',e=>{if(swipe){e.preventDefault();e.stopPropagation();swipe=false;}});
    syncSheetSize();
  }
  function syncSheetSize(){const b=$('#drawer .sheet-resize');if(b){b.textContent=$('#drawer').classList.contains('sheet-full')?'收合半屏':'展開全屏';b.setAttribute('aria-expanded',String($('#drawer').classList.contains('sheet-full')));}}
  function syncMobileLogic(steps){
    $('#thumb-bar').hidden=!mobile()||viewName!=='logic';
    $('#thumb-prev').disabled=!steps.length||logicIndex===0;
    $('#thumb-next').disabled=!steps.length||logicIndex>=steps.length-1;
    $('#thumb-detail').disabled=!steps.length;
    $('#thumb-position').textContent=steps.length?`${logicIndex+1} / ${steps.length}`:'無步驟';
    $('#step-picker').innerHTML=steps.map((s,i)=>`<button data-logic-step="${i}" ${i===logicIndex?'aria-current="step"':''}>${i+1} · ${esc(s.title)}</button>`).join('');
    if(mobile()&&viewName==='logic')$('#logic-rail [aria-current]')?.scrollIntoView({inline:'center',block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }
  function openDetail(id, focus=true, autoSync=false){
    selected=id;const e=entity(id),g=data?.groups?.find(g=>'group:'+g.id===id),edge=edges.find(e=>e.id===id)||data?.relationships?.find(e=>e.id===id);let title,body;
    if(e){title=e.title;const h=e.evidence_and_history,s=e.state;
      body=`<div class="scope">${esc(scopeLabel(e))} · ${esc(e.scope_basis)}</div>${stateBadge(s)}`+
        step(1,'白話理解',`<p>${esc(e.plain_summary.purpose)}</p><p>邊界：${esc(e.plain_summary.limits)}</p>`,true)+
        step(2,'角色與運作',`<dl>${Object.entries(e.responsibility).map(([k,v])=>pair(({role_type:'角色',input:'輸入',process:'處理',output:'輸出'})[k],v)).join('')}</dl>${e.relationships.map(r=>`<button class="jump" data-jump="${esc(r.entity_id)}">${r.direction==='incoming'?'← 來自':'→ 前往'} ${esc(entity(r.entity_id)?.title||r.entity_id)}</button>`).join('')||'<p>尚無明確模組關係紀錄。</p>'}`)+
        step(3,'狀態與驗收缺口',`<dl>${[['實作',s.implementation],['核心成果',s.label],['驗證',s.validation],['尚缺驗收',s.remaining_validation],['問題',s.issue],['批准',s.approval],['證據分類',s.evidence_type]].map(([k,v])=>pair(k,v)).join('')}</dl>`)+
        step(4,'技術細節與限制',`<dl>${Object.entries(e.technical_details).map(([k,v])=>pair(k,v)).join('')}</dl>`)+
        step(5,'原始對話證據',evidence(h.events)+`<h3>知識修訂</h3>${h.versions.map(v=>`<p>#${v.sequence} · 收錄 ${esc(v.recorded_at)}<br>${esc(v.change_reason)}</p>`).join('')||(e.id.startsWith('projection:')?'<p>唯讀來源投影；未新增或改寫正式知識版本。</p>':'<p>此節點來自架構快照。</p>')}`);
    }else if(g){title=g.title;body=step(1,'白話理解',`<p>${esc(g.summary)}</p><p>${esc(g.basis)}；不將分群標記為整體完成。</p>`,true)+step(2,'探索模組',g.members.filter(id=>matched(entity(id))).map(id=>{const e=entity(id);return `<button class="jump" data-jump="${esc(id)}">${esc(e.title)} ${stateBadge(e.state)}</button>`;}).join(''),true)+step(3,'狀態與驗收缺口','<p>各模組分別保留核心成果、驗收與問題。請選取模組查看。</p>')+step(4,'技術細節與限制','<p>這是知識導覽分類，不代表實際部署服務或執行順序。</p>')+step(5,'原始對話證據','<p>來源依各模組分別保存，請點擊模組追溯。</p>');
    }else if(edge){title='模組之間的關係';const raw=edge.members?data.relationships.filter(e=>edge.members.includes(e.id)):[edge];body=step(1,'白話理解',`<p>${esc(edge.label)}</p><p>${edge.confidence==='documented'?'有來源描述；不是獨立程式驗證。':'推論／規劃或來源不足，尚未確認。'}</p>`,true)+step(2,'方向與相連模組',raw.map(e=>`<button class="jump" data-jump="${esc(e.source)}">來源：${esc(entity(e.source)?.title)}</button><button class="jump" data-jump="${esc(e.target)}">目標：${esc(entity(e.target)?.title)}</button><p>${esc(e.label)}</p>`).join(''),true)+step(3,'狀態與驗收缺口','<p>關係存在於文件不表示執行路徑已驗收。</p>')+step(4,'技術細節與限制',`<p>${esc(raw.map(e=>e.type).join('、'))}</p>`)+step(5,'原始對話證據',evidence(raw.flatMap(e=>e.events)));}
    else return;
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close" aria-label="關閉詳情">✕ 關閉抽屜</button><div class="eyebrow">KNOWLEDGE EXPLORER${autoSync?' · 步驟自動連動':''}</div><h2>${esc(title)}</h2></div>${body}`;
    $('#drawer').classList.add('open');$('#drawer').classList.toggle('auto-synced',Boolean(autoSync));$('#drawer').scrollTop=0;highlight();highlightLogicChips(id);highlightEvolutionChips(id,null);if(focus)$('#close').focus();
    enhanceMobileDrawer(e?.id);syncSheet();
  }
  function close(){selected=null;$('#drawer').classList.remove('open','auto-synced','sheet-full');$('#drawer').innerHTML='<div class="drawer-empty"><span>↗</span><h2>選取下一個模組</h2><p>沿著關係探索它的角色與來源。</p></div>';syncSheet();highlight();highlightLogicChips();highlightEvolutionChips();if(origin?.isConnected)origin.focus({preventScroll:true});}
  let knowledgeSnapshotPromise;
  async function workspaceKnowledge(){
    if(window.__V2_STATIC_BUNDLE__)return {views:Object.fromEntries(Object.entries(window.__V2_STATIC_BUNDLE__.views).map(([scope,v])=>[scope,v.latest]))};
    if(!knowledgeSnapshotPromise)knowledgeSnapshotPromise=(async()=>{
      const element=$('#workspace-knowledge');if(!element)return null;
      const value=JSON.parse(element.textContent);
      if(element.dataset.encoding!=='gzip-base64')return value;
      const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    })();
    return knowledgeSnapshotPromise;
  }
  window.ProjectKnowledgeSnapshot=workspaceKnowledge;
  async function load(){const token=++request;$('#notice').textContent='正在讀取唯讀知識…';try{const currentAgent=$('#agent').value==='history'?'history':'action';const params=new URLSearchParams({agent:currentAgent});if(currentAsOf)params.set('as_of',currentAsOf);let d;const localSnapshot=$('#workspace-knowledge');if(window.__V2_STATIC_BUNDLE__){let saved=window.__V2_STATIC_BUNDLE__.views?.[currentAgent]?.[currentAsOf||'latest'];if(!saved&&currentAsOf&&window.__V2_STATIC_BUNDLE__.paths?.[currentAgent]?.[currentAsOf]){const response=await fetch(new URL(window.__V2_STATIC_BUNDLE__.paths[currentAgent][currentAsOf],document.baseURI));if(!response.ok)throw Error('歷史時間切面下載失敗');saved=await response.json();window.__V2_STATIC_BUNDLE__.views[currentAgent][currentAsOf]=saved;}if(!saved&&currentAsOf){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;saved=window.__V2_STATIC_BUNDLE__.views?.[currentAgent]?.['latest'];}if(!saved)throw Error('此時間切面未收錄於靜態封存');d=structuredClone(saved);}else{let r=await fetch('/api/v2/knowledge?'+params);if(!r.ok&&currentAsOf){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;params.delete('as_of');r=await fetch('/api/v2/knowledge?'+params);}d=await r.json();if(!r.ok)throw Error(d.error||'資料讀取失敗');if(currentAsOf&&d.evolution){const validCps=(d.evolution.as_of_checkpoints||d.evolution.all_checkpoints||[]).map(c=>c.as_of);if(!validCps.includes(currentAsOf)){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);params.delete('as_of');const refetch=await fetch('/api/v2/knowledge?'+params);d=await refetch.json();if(!refetch.ok)throw Error(d.error||'資料讀取失敗');asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;}}}if(token!==request)return;data=d;if(currentAgent==='action'&&d.agent_logic?.workflows?.some(w=>w.id==='mvp_action_workflow')){$('#logic-type').value='design_workflow';logicId='mvp_action_workflow';logicIndex=0;logicAll=false;}selected=null;close();const s=d.summary||{};$('#stats').innerHTML=[['核心已實現',s.core_achieved??0],['待確認',s.pending??0],['未解問題',s.open_issues??0],['下一步',s.next_steps??0]].map(([t,n])=>`<div class="stat"><span>${t}</span><strong>${n}</strong></div>`).join('');$('#stats').title=s.basis||'';$('#notice').textContent=(currentAsOf?`時間切面（as_of: ${currentAsOf}）· `:'')+'工作與學習紀錄 · 來源覆蓋：部分 · 核心成果不等於全面驗收';const m=d.provenance_manifest||{};$('#manifest').textContent=`快照 ${m.snapshot_captured_at||'尚未取得'} · ${m.event_count??0} 筆來源事件 · ${(m.knowledge_version_ids||[]).length} 個知識版本`;renderGraph();renderLogic();renderEvolution();renderProgress();if(!window.__V2_STATIC_BUNDLE__)refreshClosure().catch(()=>{});}catch(e){if(token!==request)return;$('#notice').textContent='無法讀取：'+e.message;}}
  // ---- Agent Logic: manual Design Walkthrough (never a runtime trace; no timers, durations or autoplay). ----
  const DEFAULT_SYNTHETIC_NOTICE='目前沒有教學示例；不以合成內容混充真實證據';
  const logicData=()=>data?.agent_logic||{workflows:[],cases:[],synthetic_examples:[],query_abilities:[],synthetic_notice:DEFAULT_SYNTHETIC_NOTICE};
  const logicRoles={python_rule:'Python 確定性規則',llm_reasoning:'DaVinci 語意判斷',tool_query:'Tool 查詢',db_snapshot:'DB / Snapshot',ui_interaction:'UI 操作',human:'人員',unknown:'角色未記載'};
  const groupTitle=id=>data?.groups?.find(g=>g.id===id)?.title||'';
  const materialLabel=m=>m?.material_type==='case_report'?'開發案例紀錄':m?.material_type==='synthetic_example'?'教學示例（合成）':'設計流程';
  const logicMaterials=()=>{
    const lg=logicData(),t=$('#logic-type')?.value,ag=$('#agent')?.value==='history'?'history':'action';
    const raw=(t==='case_report'?lg.cases:t==='synthetic_example'?lg.synthetic_examples:lg.workflows)||[];
    if(ag==='action')return raw.filter(m=>m.agent_scope==='action'||m.agent_scope==='shared');
    return raw.filter(m=>m.agent_scope==='history'||m.agent_scope==='shared'||m.agent_scope==='unknown');
  };
  const query=()=>$('#search').value.trim().toLowerCase();
  const searchLogic=s=>!query()||txt(s).toLowerCase().includes(query());
  // Split raw text on the query and escape each piece, so highlighting never breaks HTML entities.
  const hl=v=>{const s=String(v??''),q=query();if(!q)return esc(s);const lower=s.toLowerCase();let out='',i=0,j;while((j=lower.indexOf(q,i))!==-1){out+=esc(s.slice(i,j))+'<mark>'+esc(s.slice(j,j+q.length))+'</mark>';i=j+q.length;}return out+esc(s.slice(i));};
  const currentMaterial=()=>logicMaterials().find(m=>m.id===logicId);
  const valueBlock=(title,values,cls='')=>`<section class="io-block ${cls}"><h4>${esc(title)}</h4>${values?.filter(Boolean).length?values.filter(Boolean).map(v=>`<p>${hl(v)}</p>`).join(''):'<p class="logic-unknown">來源未記載（Unknown）</p>'}</section>`;
  const confidencePill=s=>s?.step_confidence==='documented'?'<span class="pill green">有明確來源 documented</span>':'<span class="pill amber">部分記載 partial</span>';
  const linkLabel=s=>s?.next_step_status==='connected'?'有來源順序':s?.next_step_status==='data_cutoff'?'⚠ 後續未取得資料':'⚠ 順序／分支條件未知';
  function logicIoSection(s){
    const io=s?.io_spec||{};
    const src=k=>io.field_sources?.[k]?.length?` · 欄位 ${io.field_sources[k].join('、')}`:'';
    const cols=[
      ['① 輸入'+src('inputs'),(io.inputs||[]).filter(Boolean)],
      ['② 處理規則'+src('process_rules'),(io.process_rules||[]).filter(Boolean)],
      ['② 條件／分支'+src('conditions'),(io.conditions||[]).filter(Boolean)],
      ['③ 輸出'+src('outputs'),(io.outputs||[]).filter(Boolean)],
      ['副作用／邊界',(io.side_effects||[]).filter(Boolean)]
    ].filter(([,vals])=>vals.length>0);
    if(!cols.length){
      return `<div class="logic-io-compact io-basis" role="note">ℹ️ I/O 與邊界規格：來源對話未明確記載結構化輸入/輸出欄位（狀態：${esc(io.status||'unknown')} · ${esc(io.mapping_basis||'未記載')}）</div>`;
    }
    return `<div class="logic-io has-content" style="grid-template-columns:repeat(${Math.min(cols.length,3)},minmax(0,1fr))" aria-label="輸入、處理與條件、輸出">${cols.map(([t,vals])=>`<section class="io-block"><h4>${esc(t)}</h4>${vals.map(v=>`<p>${hl(v)}</p>`).join('')}</section>`).join('')}</div><p class="io-basis">ℹ️ I/O 狀態：${esc(io.status||'partial')} · ${esc(io.mapping_basis||'')}（僅展開有白名單記載之欄位）</p>`;
  }
  function logicCard(s){
    const relIds=s?.related_entity_ids||[];
    const chips=relIds.map(id=>`<button class="logic-chip" data-jump="${esc(id)}">↗ ${esc(entity(id)?.title||id)}</button>`).join('');
    const mentions=(s?.actor_mentions||[]).map(m=>`<span class="pill gray" title="${esc(m.note)}">內文提及: ${esc(logicRoles[m.role]||m.role)}（${esc((m.tokens||[]).join('、'))}）</span>`).join('');
    const notes=(s?.scope_notes||[]).map(n=>`<p><b>${esc(n.field)}</b>：${hl(n.text)}</p>`).join('');
    const roleUnknown=!s?.actor_role||s.actor_role==='unknown';
    const rolePill=`<span class="pill role ${roleUnknown?'gray':'blue'}" title="${roleUnknown?'來源未明確記載此步驟由誰執行':s.actor_role_basis==='source_backed_design_projection'?'依對話正文重建的設計角色，非程式執行驗證':'來源 metadata 明確記載'}">${roleUnknown?'角色未記載':'執行角色：'+esc(logicRoles[s.actor_role]||s.actor_role)}</span>`;
    const evRefs=s?.evidence_refs||[];
    const gaps=s?.gaps||[];
    return `<article class="logic-card" data-step-card="${esc(s.step_id)}"><div class="logic-card-heading"><div class="logic-card-meta"><span class="eyebrow">STEP ${String(s.ordinal).padStart(2,'0')}${s.reading_group?' · '+esc(groupTitle(s.reading_group)):''}</span>${confidencePill(s)}${rolePill}${mentions}</div><h2>${hl(s.title)}</h2></div>`+
      `<div class="logic-summary story-lead">${hl(s.plain_summary)}</div>`+
      logicIoSection(s)+
      `<div class="logic-links"><span class="logic-links-label">關聯模組：</span>${chips||'<span class="logic-muted-inline">來源未建立直接模組對應（不以名稱猜測）</span>'}</div>`+
      (notes?`<details class="logic-context-accordion logic-scope-notes"><summary>📂 Agent 範圍備註（來源欄位原文，未用於自動歸屬）</summary>${notes}</details>`:'')+
      `<details class="logic-context-accordion logic-evidence"><summary>📂 步驟來源證據與斷點資訊（${evRefs.length} 筆來源證據${gaps.length?` · ${gaps.length} 項缺口註記`:''} — 點擊展開）</summary>${evRefs.map((r,i)=>`<button class="logic-chip source-chip" data-logic-source="${i}" data-logic-source-step="${esc(s.step_id)}">${esc(r.display_date||'日期未知')} · 精度 ${esc(r.date_precision)} · ${esc(r.evidence_type)} · ${esc(r.coverage)}<small>${esc(r.title)}</small></button>`).join('')||'<p>來源未記載</p>'}${gaps.length?`<div class="logic-gaps-inline">${gaps.map(g=>`<span class="pill amber">缺口：${esc(g)}</span>`).join('')}</div>`:''}<p class="logic-break ${s.next_step_status==='connected'?'connected':''}">${s.next_step_status==='connected'?'↓ 有來源順序關係；不表示已執行':'⚠ '+esc(s.break_reason)}</p></details></article>`;
  }
  const breakpoint=()=>`<article class="logic-breakpoint" role="note"><h3>⚠ 後續未取得資料</h3><p>來源到此為止。未記載的下一步、分支條件或工具呼叫不會被補寫；這裡不是執行結束點。</p></article>`;
  function casePanel(m){
    const ctx=m?.assessment_context||{};
    const causes=m?.cause_assessments||[];
    const gaps=ctx.data_gaps||[],vals=ctx.validation_evidence||[];
    return `<section class="case-panel"><div class="case-panel-head"><h3>案例正反證據對照與四大根因矩陣（4M）</h3><span class="scope">${esc(m.input_snapshot_notice)} · 未綁定 Job · ${esc(m.display_date)}</span></div>`+
      `<div class="case-compare"><section class="io-block support"><h4>✓ 支持證據 Support</h4><p>${hl(m.support||'來源未記載')}</p></section><section class="io-block counter"><h4>✗ 反面證據 Counter Evidence</h4><p>${hl(m.counter_evidence||'來源未記載')}</p></section></div>`+
      `<div class="cause-grid">${causes.map(c=>`<article class="cause-card"><div class="cause-card-top"><h4>${esc(c.category_label||c.category)} <small>${esc(c.category)}</small></h4><span class="pill amber">${esc(c.status)}</span></div><p>${hl(c.detail)}</p><small>${esc(c.evidence_type)} · ${esc(c.source_record)}</small></article>`).join('')||'<p class="logic-muted-inline">來源未記載</p>'}</div>`+
      `<div class="case-compare"><section class="io-block"><h4>結論與下一步 Conclusion</h4><p>${hl(m.conclusion||'來源未記載')}${m.next_step?`\n下一步（來源回報）：${hl(m.next_step)}`:''}</p></section><section class="io-block unknowns"><h4>⚠ 未知與待查缺口 Unknowns</h4><p>${hl(m.unknowns||'來源未記載')}</p></section></div>`+
      `<details class="logic-context-accordion case-context"><summary>📂 同批次評估背景參考（${gaps.length} 項資料缺口 · ${vals.length} 項驗證證據 — 點擊展開）</summary><p class="io-basis">${esc(ctx.basis||'')} · 評估批次 ${esc(ctx.assessment_id||'未記載')} · 收錄 ${esc(ctx.assessment_captured_at||'未記載')}</p><h4>資料缺口（data_gaps）</h4>${gaps.map(g=>`<p><b>${hl(g.title)}</b> · ${esc(g.status)}<br>${hl(g.why)}<br><small>${esc(g.evidence_type)} · ${esc(g.source_record)}</small></p>`).join('')||'<p>來源未記載</p>'}<h4>驗證回報（validation_evidence）</h4>${vals.map(v=>`<p><b>${hl(v.title)}</b> · ${hl(v.result)}<br><small>${esc(v.display_date)}（原文日期，無年份）· ${esc(v.evidence_type)} · ${esc(v.source_record)}</small></p>`).join('')||'<p>來源未記載</p>'}</details></section>`;
  }
  function renderTrackBar(){
    const lg=logicData(),ag=$('#agent')?.value==='history'?'history':'action';
    const filterScope=list=>(list||[]).filter(m=>ag==='action'?(m.agent_scope==='action'||m.agent_scope==='shared'):(m.agent_scope==='history'||m.agent_scope==='shared'||m.agent_scope==='unknown'));
    const c=filterScope(lg.cases)[0],workflows=filterScope(lg.workflows),w=workflows.find(w=>w.id==='mvp_action_workflow'&&ag==='action')||workflows[0],syn=lg.synthetic_examples||[];
    const curType=$('#logic-type')?.value||'case_report';
    const synNotice=lg.synthetic_notice||DEFAULT_SYNTHETIC_NOTICE;
    const cSteps=c?.steps?.length??0,wSteps=w?.steps?.length??0;
    const tracks=[
      {type:'case_report',id:c?.id||'',label:c?`📋 開發案例：重複修機異常調查（${cSteps} 步）`:'📋 此範圍尚無已整理案例',active:curType==='case_report',title:c?.title||'開發案例紀錄'},
      {type:'design_workflow',id:w?.id||'',label:`🔄 ${w?.id==='mvp_action_workflow'?'MVP 行動型設計流程':'Agent 設計流程'}（${wSteps} 步）`,active:curType==='design_workflow',title:w?.title||'Agent 設計流程'},
      {type:'synthetic_example',id:'',label:`💡 教學示例（${syn.length} · 暫無合成資料）`,active:curType==='synthetic_example',title:synNotice}
    ];
    const bar=$('#logic-tracks');
    if(bar)bar.innerHTML=tracks.map(t=>`<button type="button" class="track-pill ${t.active?'active':''}" role="tab" aria-selected="${t.active}" data-logic-track="${esc(t.type)}" data-material-id="${esc(t.id)}" title="${esc(t.title)}">${esc(t.label)}</button>`).join('');
  }
  function syncLogicDrawer(s,m){
    if(viewName!=='logic'||!s)return;
    const jumpId=(s.related_entity_ids||m?.related_entity_ids||[]).find(id=>entity(id));
    if(jumpId){openDetail(jumpId,false,true);return;}
    const ref=s.evidence_refs?.[0]||m?.evidence_refs?.[0];
    if(ref){sourceDrawer(ref,null,false,true);highlightLogicChips(null,s.step_id,0);}
  }
  function filteredSteps(m){return m?.steps?.filter(s=>searchLogic([s,m.title,m.hypothesis,m.support,m.counter_evidence,m.unknowns,m.cause_assessments]))||[];}
  function renderLogic(){
    if(!data)return;
    renderTrackBar();
    const lg=logicData();
    const all=logicMaterials();
    const materials=all.filter(m=>searchLogic([m.title,m.steps,m.hypothesis,m.support,m.counter_evidence,m.unknowns,m.cause_assessments,m.assessment_context]));
    if(!materials.some(m=>m.id===logicId)){logicId=materials[0]?.id||null;logicIndex=0;}
    $('#logic-material').innerHTML=materials.map(m=>`<option value="${esc(m.id)}">[${materialLabel(m)}] ${esc(m.title)}</option>`).join('')||'<option value="">沒有符合的來源</option>';
    $('#logic-material').value=logicId||'';
    $('.logic-selects').hidden=!($('#agent').value!=='action'&&materials.length>1);
    const m=currentMaterial();let steps=filteredSteps(m);
    // A material can match via case-level fields only; then keep every step readable.
    if(m&&!steps.length)steps=m.steps||[];
    logicIndex=Math.min(Math.max(logicIndex,0),Math.max(steps.length-1,0));
    $('#logic-first').disabled=$('#logic-prev').disabled=!steps.length||logicIndex===0||logicAll;
    $('#logic-next').disabled=!steps.length||logicIndex===steps.length-1||logicAll;
    $('#logic-all').disabled=!steps.length;$('#logic-all').setAttribute('aria-pressed',logicAll);$('#logic-all').textContent=logicAll?'聚焦單一步驟':'展開全部步驟';
    const filtered=m&&steps.length<(m.steps?.length||0);
    $('#logic-position').textContent=!steps.length?'沒有可讀步驟':logicAll?`全部 ${steps.length} 步`:`Step ${logicIndex+1} / ${steps.length}`;
    $('#logic-search-note').textContent=query()?(filtered?`搜尋篩選：${steps.length} / ${m.steps.length} 個步驟符合`:m?'搜尋：素材符合，顯示全部步驟':'搜尋：沒有符合的素材'):'';
    const last=steps[steps.length-1];
    $('#logic-rail').innerHTML=steps.map((s,i)=>`<div class="rail-entry"><button class="${s.step_confidence==='documented'?'documented':'partial'}" data-logic-step="${i}" ${i===logicIndex&&!logicAll?'aria-current="step"':''} title="${esc(s.title)}"><span>${String(s.ordinal).padStart(2,'0')}</span><em>${hl(s.title)}</em></button>${i<steps.length-1||s.next_step_status!=='data_cutoff'?`<div class="rail-link ${s.next_step_status==='connected'?'confirmed':'partial'}">${linkLabel(s)}</div>`:''}</div>`).join('')+
      (last&&last.next_step_status==='data_cutoff'?'<div class="rail-entry"><div class="rail-break" role="note">⚠ 後續未取得資料</div></div>':'');
    syncMobileLogic(steps);
    if(!m||!steps.length){
      const ag=$('#agent').value==='history'?'history':'action';
      const otherAg=ag==='action'?'history':'action';
      const otherLabel=ag==='action'?'歷史調查型':'MVP 行動型';
      const hasQuery=Boolean(query());
      $('#logic-content').innerHTML=`<div class="logic-empty"><h2>這個範圍尚無符合的推演素材</h2><p>目前選取的 Agent 範圍或搜尋條件下沒有可讀步驟。缺少來源時系統不會自動生成或腦補流程。</p><p class="io-basis">${esc(lg.synthetic_notice||DEFAULT_SYNTHETIC_NOTICE)}</p><div class="logic-empty-actions">${hasQuery?`<button type="button" class="logic-reset-scope" data-clear-search="1">↺ 清除搜尋</button>`:''}<button type="button" class="logic-switch-agent" data-switch-agent="${otherAg}">⇄ 切換至「${otherLabel}」</button></div></div>`;
      return;
    }
    const shown=logicAll?steps:[steps[logicIndex]];
    const atEnd=logicAll||logicIndex===steps.length-1;
    const qList=lg.query_abilities||[],relList=m.documented_relationships||[];
    $('#logic-content').innerHTML=`<div class="material-heading"><div class="material-heading-top"><span class="pill purple">${materialLabel(m)}</span><span class="pill amber">來源部分覆蓋</span><span class="pill gray">${esc(scopeLabel(m))}</span><h2>${hl(m.title)}</h2></div><p>${esc(m.ordering_basis)}${m.scope_basis?` · ${esc(m.scope_basis)}`:''}</p></div>`+
      shown.map(s=>logicCard(s)).join('')+(atEnd&&last.next_step_status==='data_cutoff'?breakpoint():'')+
      (m.material_type==='case_report'?casePanel(m):`<details class="logic-context-accordion query-background"><summary>📂 相關查詢能力與架構關係背景（${qList.length} 項查詢能力 · ${relList.length} 項架構關係 — 點擊展開）</summary><h4>相關查詢能力回報（非本流程呼叫紀錄）</h4>${qList.map(q=>`<article><h3>${hl(q.title)}</h3><p>${hl(q.description)}</p><small>${esc(q.source)} · ${esc(q.evidence_type)} · ${esc(q.usage_status)} · ${esc(q.source_record)}</small></article>`).join('')||'<p>來源未記載</p>'}<h4>架構關係背景（不作執行順序）</h4>${relList.map(r=>`<p>${esc(entity(r.source)?.title)} → ${esc(entity(r.target)?.title)}：${esc(r.label)}</p>`).join('')||'<p>沒有直接對應的 documented 架構關係。</p>'}<p class="io-basis">${esc(lg.synthetic_notice||DEFAULT_SYNTHETIC_NOTICE)}</p></details>`);
    syncLogicDrawer(steps[logicIndex]||steps[0],m);
  }
  function moveLogic(index){$('#step-picker').hidden=true;$('#thumb-position').setAttribute('aria-expanded','false');logicAll=false;logicIndex=index;renderLogic();$('#logic-content').scrollTop=0;$('#logic-rail [aria-current]')?.scrollIntoView({block:'nearest',inline:mobile()?'center':'nearest',behavior:mobile()&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'instant'});}
  function logicSource(stepId,index,sourceButton){
    const m=currentMaterial(),s=m?.steps?.find(s=>s.step_id===stepId),r=s?.evidence_refs?.[index];if(!r)return;
    sourceDrawer(r,sourceButton,true,false);highlightLogicChips(null,stepId,index);
  }
  // 共用來源抽屜（Agent Logic 與 Progress 共用）：只顯示來源紀錄，不當成執行步驟。
  function sourceDrawer(r,sourceButton,focus=true,autoSync=false){
    origin=sourceButton;selected=null;
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close" aria-label="關閉詳情">✕ 關閉抽屜</button><div class="eyebrow">SOURCE EXPLORER${autoSync?' · 步驟自動連動':''}</div><h2>${esc(r.title)}</h2></div>`+
      step(1,'白話理解',`<p>${esc(r.summary||'來源未記載')}</p>`,true)+
      step(2,'角色與運作',`<p>此為來源紀錄，不是執行步驟。</p><p>${esc(r.source_record)}</p><p>${esc(r.conversation_title||'對話標題未取得')} · ${esc(r.conversation_id||'無對話 ID')}</p>`)+
      step(3,'狀態與驗收缺口',`<p>${esc(r.evidence_type)} · ${esc(r.coverage)} · ${esc(r.source_status)}</p>${(r.gaps||[]).map(g=>`<p>${esc(g)}</p>`).join('')}`)+
      step(4,'技術細節與限制',`<dl>${pair('來源 ID',r.source_record)}${pair('事件 ID',r.event_id||'未建立直接事件關聯')}${pair('日期精度',r.date_precision)}${pair('關聯訊息',r.message_ids||[])}</dl>`)+
      step(5,'原始對話證據',r.event_id?evidence([r]):`<p>案例資料表保存的回報；原始對話映射與輸入 Snapshot 未取得。</p>`);
    $('#drawer').classList.add('open');$('#drawer').classList.toggle('auto-synced',Boolean(autoSync));$('#drawer').scrollTop=0;if(focus)$('#close').focus();
    enhanceMobileDrawer();syncSheet();
  }
  $('#logic-type').addEventListener('change',()=>{const t=$('#logic-type').value;if(t!=='synthetic_example')$('#logic-synthetic-toast').hidden=true;logicId=null;logicIndex=0;logicAll=false;renderLogic();});
  $('#logic-material').addEventListener('change',()=>{logicId=$('#logic-material').value;logicIndex=0;logicAll=false;renderLogic();});
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-logic-track],[data-reset-scope],[data-clear-search],[data-switch-agent],[data-logic-step],[data-logic-source],#logic-first,#logic-prev,#logic-next,#logic-all');if(!el)return;
    if(el.dataset.logicTrack){
      const track=el.dataset.logicTrack;
      const toast=$('#logic-synthetic-toast');
      if(track==='synthetic_example'){
        const notice=logicData().synthetic_notice||DEFAULT_SYNTHETIC_NOTICE;
        toast.innerHTML=`<span>💡 教學示例說明：${esc(notice)}（synthetic_examples: 0 筆，不佔用主推演版面）</span><button type="button" id="close-syn-toast" aria-label="關閉提示">×</button>`;
        toast.hidden=!toast.hidden;
        return;
      }
      toast.hidden=true;
      $('#logic-type').value=track;
      logicId=el.dataset.materialId||null;logicIndex=0;logicAll=false;renderLogic();
      return;
    }
    if(el.dataset.clearSearch){
      $('#search').value='';
      $('#logic-synthetic-toast').hidden=true;
      renderLogic();
      return;
    }
    if(el.dataset.switchAgent){
      setAgent(el.dataset.switchAgent);
      return;
    }
    if(el.dataset.resetScope){
      $('#search').value='';
      $('#logic-synthetic-toast').hidden=true;
      renderLogic();
      return;
    }
    if(el.dataset.logicStep!==undefined)moveLogic(Number(el.dataset.logicStep));
    if(el.id==='logic-first')moveLogic(0);if(el.id==='logic-prev')moveLogic(logicIndex-1);if(el.id==='logic-next')moveLogic(logicIndex+1);
    if(el.id==='logic-all'){logicAll=!logicAll;renderLogic();}
    if(el.dataset.logicSource!==undefined)logicSource(el.dataset.logicSourceStep,Number(el.dataset.logicSource),el);
  });
  document.addEventListener('click',ev=>{if(ev.target.closest('#close-syn-toast'))$('#logic-synthetic-toast').hidden=true;});
  document.addEventListener('keydown',ev=>{
    // Arrow keys step through the walkthrough anywhere in the view except form fields and the detail drawer.
    if(viewName!=='logic'||!['ArrowLeft','ArrowRight'].includes(ev.key)||ev.altKey||ev.ctrlKey||ev.metaKey)return;
    if(ev.target.closest?.('input,select,textarea,#drawer'))return;
    const steps=Math.max(filteredSteps(currentMaterial()).length||currentMaterial()?.steps?.length||0,0);
    const next=logicIndex+(ev.key==='ArrowRight'?1:-1);
    ev.preventDefault();if(next>=0&&next<steps)moveLogic(next);
  });
  // ---- Progress 進度視角：依來源重建的開發與驗收追蹤，非 Runtime 健康度。不計算完成率、無自動刷新或動畫。 ----
  let progressView='board',progressFilter='all';
  // 後端若尚未提供 progress（前後端版本短暫不同步），全部以 Optional Chaining 與預設值降級，不拋出 TypeError。
  const progressData=()=>data?.progress||null;
  const FALLBACK_STATUS={verified:['獨立驗證','evidence'],supported:['來源支持','evidence'],partial:['部分證據','pending'],claimed:['僅宣告／回報','pending'],design_only:['設計／規劃','pending'],unresolved:['未解問題','red'],unknown:['未知','pending'],superseded:['已被取代','pending']};
  const statusMeta=id=>{const t=(progressData()?.status_taxonomy||[]).find(s=>s.id===id);return {label:t?.label||FALLBACK_STATUS[id]?.[0]||'未知',filter:t?.filter||FALLBACK_STATUS[id]?.[1]||'pending',description:t?.description||''};};
  const statusPill=(id,extra='')=>`<span class="pill st st-${esc(id)}" title="${esc(statusMeta(id).description)}">${esc(statusMeta(id).label)}</span>${extra}`;
  const CARD_FILTERS={evidence:'來源支持',pending:'待確認／部分',unresolved:'未解問題',data_gaps:'資料缺口',next:'下一步'};
  const skillTypeLabel={investigation_type:'調查類型',registered_tool:'註冊 Tool',snapshot_tool_node:'架構快照工具節點'};
  // 篩選規則：next 只看下一步；data_gaps 由評估批次資料呈現；其餘依狀態分類（evidence／pending／red）。
  const passes=(status,isNext=false)=>{
    if(progressFilter==='all')return true;
    if(progressFilter==='next')return Boolean(isNext);
    if(progressFilter==='unresolved'||progressFilter==='red')return statusMeta(status).filter==='red';
    if(progressFilter==='data_gaps')return false;
    return statusMeta(status).filter===progressFilter;
  };
  const pMatch=(o,status)=>searchLogic([o.title,o.plain_summary,o.status_basis,o.basis,o.why,o.description,o.result,o.detail,o.reason,o.next_step,o.missing_evidence,o.implementation,o.validation,o.limits,o.io,o.kind,statusMeta(status).label].filter(x=>x!=null));
  const emptyNote='<div class="p-zero-result"><p class="logic-unknown">⚠️ 目前篩選結果：0 項符合</p><p class="io-basis">點擊下方按鈕或上方已選取的卡片，即可恢復完整總覽。</p><button type="button" class="p-reset-btn" data-progress-reset="1">↺ 返回完整總覽</button></div>';
  const section=(title,count,body,note='')=>`<section class="p-section"><h2>${esc(title)} <small>${count} 項</small></h2>${note?`<p class="io-basis">${esc(note)}</p>`:''}${body||emptyNote}</section>`;
  // 事件型來源：由實體既有證據取回完整事件，不在 progress 內重複儲存。
  const evRefs=(entityId,ids)=>{const evs=entity(entityId)?.evidence_and_history?.events||[];return (ids||[]).map(i=>evs.find(e=>e.event_id===i)).filter(Boolean);};
  const evidenceList=(entityId,ids)=>{const refs=evRefs(entityId,ids);return `<details class="p-evidence"><summary>來源證據 · ${refs.length} 筆</summary>${refs.map(r=>`<button class="logic-chip source-chip" data-progress-source="${esc(entityId+'|'+r.event_id)}">${esc(r.display_date||'日期未知')} · ${esc(r.evidence_type)}<small>${esc(r.title)}</small></button>`).join('')||'<p>來源未記載</p>'}</details>`;};
  const sourceButton=key=>`<button class="logic-chip source-chip" data-progress-source="${esc(key)}">查看來源紀錄 ↗<small>${esc(key)}</small></button>`;
  function metricsStrip(p){
    const m=p.summary_metrics||{},b=m.by_status||{};
    const agentVal=$('#agent')?.value||p.scope||'action';
    const agentLabel=agentVal==='history'?'歷史調查型':'MVP 行動型';
    const pop=m.population?.items??(p.items||[]).length;
    const isFiltered=progressFilter!=='all';
    const filterTitle=CARD_FILTERS[progressFilter]||'';

    const cards=[
      {key:'evidence',title:'來源支持',num:m.evidence_backed,sub:`獨立驗證 ${m.independent_verified??0} 項`,cls:'green'},
      {key:'pending',title:'待確認／部分',num:m.pending_or_partial,sub:`部分 ${b.partial??0} · 僅宣告 ${b.claimed??0} · 設計 ${b.design_only??0} · 未知 ${b.unknown??0}${b.superseded?` · 已取代 ${b.superseded}`:''}`,cls:'amber'},
      {key:'unresolved',title:'未解問題',num:m.unresolved_issues,sub:`紅標籤 ${m.red_open_issues??0} · 其餘待查 ${(m.unresolved_issues??0)-(m.red_open_issues??0)}`,cls:'red'},
      {key:'data_gaps',title:'資料缺口（評估批次）',num:m.data_gaps,sub:'批次資料表記錄（獨立於實體母體）',cls:'red'},
      {key:'next',title:'下一步（可重疊）',num:m.next_steps,sub:`母體重疊屬性 · 另有批次建議 ${m.batch_recommendations??0}`,cls:'purple'}
    ];

    const headerHtml=isFiltered
      ?`<div class="p-strip-header">`+
          `<div class="p-strip-title"><strong>目前篩選檢視：${esc(filterTitle)}（${esc(agentLabel)}）</strong></div>`+
          `<div class="p-strip-actions">`+
            `<button type="button" class="p-reset-btn" data-progress-reset="1">↺ 返回完整總覽（${esc(pop)} 項）</button>`+
          `</div>`+
        `</div>`
      :`<div class="p-strip-header">`+
          `<div class="p-strip-title"><strong>完整能力總覽（${esc(agentLabel)} · 共 ${esc(pop)} 項）</strong></div>`+
          `<div class="p-strip-hint">點擊下方任一卡片可直接篩選對應項目；再點一次或按返回即可恢復總覽</div>`+
        `</div>`;

    const cardsHtml=`<div class="p-metrics">`+
      cards.map(c=>`<button type="button" class="p-metric" data-progress-card="${esc(c.key)}" aria-pressed="${String(progressFilter===c.key)}">`+
        `<span>${esc(c.title)}</span>`+
        `<strong class="${c.cls}">${esc(c.num??'—')}</strong>`+
        `<small>${esc(c.sub)}</small>`+
      `</button>`).join('')+
    `</div>`;

    return headerHtml+cardsHtml+`<p class="io-basis">${esc(m.basis||'')}。${esc((p.gaps||[]).join('；'))}</p>`;
  }
  function groupCard(g,items){
    const c=g.counts||{};
    const seg=(cls,v)=>v?`<span class="seg ${cls}" style="flex:${v}"></span>`:'';
    const legend=Object.entries(c).filter(([,v])=>v).map(([k,v])=>`${statusMeta(k).label} ${v}`).join(' · ');
    const blockers=g.blockers||[],unknowns=g.unknown_items||[],missing=g.missing_validation||[];
    const extra=blockers.length+unknowns.length+missing.length;
    const countBadge=progressFilter==='all'
      ?`<span class="pill gray">共 ${items.length} 項</span>`
      :`<span class="pill mint">${items.length} 項符合</span>`;

    return `<article class="p-card p-group" data-group="${esc(g.id)}"><div class="p-card-head"><h3>${hl(g.title)}</h3>${countBadge}</div>`+
      `<p class="io-basis">${esc(g.summary)} · ${esc(g.basis||'')}</p>`+
      `<div class="seg-bar" role="img" aria-label="${esc(legend)}">${seg('ev',(c.verified||0)+(c.supported||0))}${seg('mid',(c.partial||0)+(c.claimed||0))}${seg('low',(c.design_only||0)+(c.unknown||0)+(c.superseded||0))}${seg('red',c.unresolved||0)}</div>`+
      `<p class="p-legend">${esc(legend)}</p><p class="io-basis">驗證證據事件 ${g.verified_evidence_event_count??0} · 來源事件 ${g.source_event_count??0}</p>`+
      `<div class="p-chips">${items.map(i=>`<button class="p-chip st-${esc(i.status)}" data-jump="${esc(i.id)}" title="${esc(i.status_basis)}"><i class="dot"></i><span>${hl(i.title)}</span><small>${esc(statusMeta(i.status).label)}</small></button>`).join('')||emptyNote}</div>`+
      (extra?`<details class="p-blockers"><summary>阻塞點與未知 · ${extra}</summary>${blockers.map(b=>`<button class="jump" data-jump="${esc(b.id)}">${b.severity==='red'?'🔴 紅標籤':'🟠 待查'}：${esc(b.title)}<small>${esc(b.reason)}</small></button>`).join('')}${unknowns.map(b=>`<button class="jump" data-jump="${esc(b.id)}">未知：${esc(b.title)}<small>${esc(b.reason)}</small></button>`).join('')}${missing.length?`<h4>尚缺驗收（來源原文）</h4>${missing.map(b=>`<p><b>${esc(b.title)}</b>：${esc(b.note)}</p>`).join('')}`:''}</details>`:'')+`</article>`;
  }
  function boardView(p){
    if(progressFilter==='data_gaps'){
      const gaps=(p.gaps_and_issues?.data_gaps||[]).filter(x=>pMatch(x,'unresolved'));
      if(!gaps.length){
        return {html:`<div class="p-grid">${emptyNote}</div>`,shown:0};
      }
      const gapCards=gaps.map(x=>`<article class="p-card p-issue red-flag"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill red">資料缺口</span></div><p class="p-summary">${hl(x.why)}</p><p class="io-basis">來源狀態：${esc(x.status)} · ${esc(x.evidence_type)} · 評估批次 ${esc(x.assessment_id)}</p><p class="p-basis">建議下一步：<span class="logic-unknown">來源未記載（unknown）</span></p>${sourceButton(x.source_record)}</article>`).join('');
      const html=`<div class="p-grid"><article class="p-card p-group" style="grid-column:1 / -1;"><div class="p-card-head"><h3>評估批次收錄的資料缺口</h3><span class="pill mint">${gaps.length} 項符合</span></div><p class="io-basis">來源：評估批次資料表記錄 · 獨立於實體母體</p><div class="p-grid" style="margin-top:8px">${gapCards}</div></article></div>`;
      return {html,shown:gaps.length};
    }
    const byId=new Map((p.items||[]).map(i=>[i.id,i]));let shown=0;
    const cards=(p.capability_groups||[]).map(g=>{
      const items=(g.item_ids||[]).map(id=>byId.get(id)).filter(i=>i&&passes(i.status,i.is_next_step)&&pMatch(i,i.status));
      shown+=items.length;return items.length?groupCard(g,items):'';}).join('');
    return {html:`<div class="p-grid">${cards||emptyNote}</div>`,shown};
  }
  const skillCard=s=>`<article class="p-card" data-skill="${esc(s.id)}"><div class="p-card-head"><h3>${hl(s.title)}</h3>${statusPill(s.status)}<span class="pill gray">${esc(skillTypeLabel[s.skill_type]||s.skill_type)}</span></div>`+
    `<p class="p-basis">${esc(s.status_basis)}</p><p class="p-summary">${hl(s.plain_summary)}</p>`+
    `<div class="p-io">${valueBlock('輸入 Inputs',s.io?.inputs)}${valueBlock('輸出 Outputs',s.io?.outputs)}${valueBlock('已知限制',s.limits)}</div>`+
    `<p class="io-basis">I/O 記載：${esc(s.io?.status||'unknown')} · 獨立驗證：${esc(s.independent_verification||'unknown')}</p>`+
    `<button class="logic-chip" data-jump="${esc(s.id)}">開啟五層詳情 ↗</button>${evidenceList(s.id,s.evidence_event_ids)}</article>`;
  const queryCard=q=>`<article class="p-card"><div class="p-card-head"><h3>${hl(q.title)}</h3>${statusPill(q.status)}<span class="pill gray">查詢能力回報</span></div><p class="p-basis">${esc(q.status_basis)}</p><p class="p-summary">${hl(q.description)}</p>`+
    `<div class="p-io">${valueBlock('輸入 Inputs',q.io?.inputs)}${valueBlock('輸出 Outputs',q.io?.outputs)}${valueBlock('已知限制',q.limits)}</div><p class="io-basis">${esc(q.source)} · ${esc(q.evidence_type)} · 評估批次收錄 ${esc(q.assessment_captured_at||'未記載')}</p>${sourceButton(q.source_record)}</article>`;
  const validationCard=v=>`<article class="p-card"><div class="p-card-head"><h3>${hl(v.title)}</h3>${statusPill(v.status)}<span class="pill gray">驗證回報</span></div><p class="p-basis">${esc(v.status_basis)}</p>`+
    `<p class="p-result"><b>回報結果（原文）：</b>${hl(v.result)}</p>${v.detail?`<p class="p-summary">${hl(v.detail)}</p>`:''}<p class="io-basis">${esc(v.display_date)}（原文日期，無年份）· ${esc(v.evidence_type)}</p>${sourceButton(v.source_record)}</article>`;
  function skillsView(p){
    const sm=p.skill_matrix||{};
    const skills=(sm.skills||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    const queries=(sm.query_abilities||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    const vals=(sm.validation_evidence||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    return {html:section('調查類型與 Tool',skills.length,skills.map(skillCard).join(''),sm.basis||'')+section('查詢能力回報（query_abilities）',queries.length,queries.map(queryCard).join(''))+section('驗證回報（validation_evidence）',vals.length,vals.map(validationCard).join('')),shown:skills.length+queries.length+vals.length};
  }
  function gapsView(p){
    const g=p.gaps_and_issues||{};
    const issues=(g.open_issues||[]).filter(i=>passes('unresolved')&&pMatch(i,'unresolved'));
    const gaps=(g.data_gaps||[]).filter(i=>(progressFilter==='all'||progressFilter==='unresolved'||progressFilter==='data_gaps')&&pMatch(i,'unresolved'));
    const recs=(progressFilter==='all'||progressFilter==='next')?(g.batch_recommendations||[]).filter(i=>pMatch(i,'design_only')):[];
    const claims=(g.unsupported_claims||[]).filter(i=>passes(i.status)&&pMatch(i,i.status));
    const stepText=(v,basis)=>basis==='source'?esc(v):'<span class="logic-unknown">來源未記載（unknown）</span>';
    const issueCard=i=>`<article class="p-card p-issue ${i.severity==='red'?'red-flag':'amber-flag'}"><div class="p-card-head"><h3>${hl(i.title)}</h3><span class="pill ${i.severity==='red'?'red':'amber'}">${i.severity==='red'?'🔴 紅標籤':'🟠 待查'}</span></div><p class="p-basis">${esc(i.basis)}</p>`+
      `<div class="p-io two"><section class="io-block"><h4>建議下一步</h4><p>${stepText(i.next_step,i.next_step_basis)}</p></section><section class="io-block"><h4>缺少的證據</h4><p>${i.missing_evidence==='unknown'?'<span class="logic-unknown">來源未記載（unknown）</span>':hl(i.missing_evidence)}</p></section></div>`+
      `<button class="logic-chip" data-jump="${esc(i.id)}">開啟五層詳情 ↗</button>${evidenceList(i.id,i.evidence_event_ids)}</article>`;
    const gapCard=x=>`<article class="p-card p-issue red-flag"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill red">資料缺口</span></div><p class="p-summary">${hl(x.why)}</p>`+
      `<p class="io-basis">來源狀態：${esc(x.status)} · ${esc(x.evidence_type)} · 評估批次 ${esc(x.assessment_id)}</p><p class="p-basis">建議下一步：<span class="logic-unknown">來源未記載（unknown）</span>（見下方批次建議，非本缺口的指定解法）</p>${sourceButton(x.source_record)}</article>`;
    const recCard=x=>`<article class="p-card"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill purple">批次建議</span></div><p class="p-summary">${hl(x.why)}</p><p class="io-basis">${esc(x.basis)} · 狀態 ${esc(x.status)} · ${esc(x.source)}</p>${sourceButton(x.source_record)}</article>`;
    const claimRow=c=>`<button class="jump" data-jump="${esc(c.id)}">${statusPill(c.status)} ${hl(c.title)}<small>${esc(c.reason)}</small></button>`;
    return {html:section('紅標籤與待查問題',issues.length,issues.map(issueCard).join(''),'紅標籤＝來源明確記載尚未解決；待查＝需再檢視、風險未驗證或待真實驗收。')+
      section('資料缺口（data_gaps）',gaps.length,gaps.map(gapCard).join(''))+
      section('評估批次建議',recs.length,recs.map(recCard).join(''))+
      `<section class="p-section"><details class="p-claims"><summary>缺少獨立驗證的宣告 · ${claims.length} 項（實作回報不等於已驗證）</summary>${claims.map(claimRow).join('')||emptyNote}</details></section>`,
      shown:issues.length+gaps.length+recs.length+claims.length};
  }
  // 開發結案獨立於架構與驗證清單，統計僅使用持久化功能母體。
  const closureLabels={CLOSED_REPORTED:'已結案',PENDING_REPORT:'待回報',NEEDS_USER_REVIEW:'待我驗證',NEEDS_FIX:'需修正'};
  const closureTones={CLOSED_REPORTED:'green',PENDING_REPORT:'amber',NEEDS_USER_REVIEW:'amber',NEEDS_FIX:'red'};
  let closureFilter='all',reviewAuthenticated=false,reviewEnabled=false;
  const closureData=()=>data?.progress?.closure;
  const closureMatch=i=>!query()||JSON.stringify([i.title,i.acceptance_scope,i.decision_reason]).toLowerCase().includes(query());
  async function refreshClosure(){
    if(window.__V2_STATIC_BUNDLE__||currentAsOf)return;
    const scope=$('#agent').value;const token=request;
    const r=await fetch('/api/progress?agent='+encodeURIComponent(scope));
    if(!r.ok)return;
    const v=await r.json();if(token!==request||scope!==$('#agent').value||currentAsOf)return;
    if(data?.progress)data.progress.closure=v.closure;
    reviewAuthenticated=v.authenticated;reviewEnabled=v.write_enabled;
    if(viewName==='progress')renderProgress();
  }
  function closureBoard(){
    const p=closureData(),all=p.items||[],matched=all.filter(closureMatch);
    const shown=matched.filter(i=>closureFilter==='all'||i.development_status===closureFilter);
    const readonly=Boolean(window.__V2_STATIC_BUNDLE__||currentAsOf);
    $('#progress-note').textContent=`共 ${all.length} 項功能 · 搜尋符合 ${matched.length} · 目前顯示 ${shown.length}`;
    const cards=Object.entries(closureLabels).map(([key,label])=>`<button class="p-metric" data-closure-filter="${key}" aria-pressed="${closureFilter===key}"><span>${label}</span><strong class="${closureTones[key]}">${p.counts[key]||0}</strong><small>${query()?`搜尋符合 ${matched.filter(i=>i.development_status===key).length} 項`:'點擊篩選 · 再點恢復全部'}</small></button>`).join('');
    const rows=shown.map(i=>`<article class="p-card closure-item"><button class="closure-item-open" data-closure-item="${esc(i.item_id)}"><span class="pill ${closureTones[i.development_status]}">${closureLabels[i.development_status]}</span><h3>${hl(i.title)}</h3><p>${esc(i.decision_reason)}</p><small>${i.agent_scope==='shared'?'共用基底 · ':''}${esc(i.verification_level)} · 查看回報與歷史 ↗</small></button>${i.development_status==='NEEDS_USER_REVIEW'?`<button class="closure-verify" data-closure-verify="${esc(i.item_id)}">驗證此項 ↗</button>`:''}</article>`).join('');
    $('#progress-content').innerHTML=`<div class="p-strip-header"><strong>開發交付 · ${all.length} 項</strong><button data-closure-filter="all">全部功能</button></div><div class="p-metrics closure-metrics">${cards}</div><p class="io-basis">${esc(p.basis)}${readonly?' 線上／歷史版唯讀；人工驗收請回本機，不會寫入正式 DB。':' 人工驗收需本機金鑰登入，決定會保存至 SQLite。'}</p><div class="p-grid closure-grid">${rows||'<p class="logic-unknown">沒有符合的功能；請清除搜尋或切回全部。</p>'}</div>`;
  }
  function closureDetail(id,button){
    const i=closureData()?.items.find(i=>i.item_id===id);if(!i)return;
    origin=button;selected=null;
    const readonly=Boolean(window.__V2_STATIC_BUNDLE__||currentAsOf);
    const reports=(i.reports||[]).map(r=>`<article class="event"><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><small>${esc(r.display_date)} · ${esc(r.evidence_type)} · ${esc(r.version_scope)}</small><p>Commit：${esc(r.commit||'尚未取得')}</p><code>${esc(r.event_id)}</code><p>${esc(r.reason)}</p></article>`).join('')||'<p>尚未找到相關回報；線上版不公開私人來源。</p>';
    const history=(i.history||[]).map(h=>`<article class="event"><b>${esc(closureLabels[h.development_status])}</b><p>${esc(h.decision_reason)}</p><small>${esc(h.at)} · ${esc(h.actor)} · ${esc(h.action)}</small></article>`).join('');
    const mobileReview=window.__V2_STATIC_BUNDLE__? `<div class="mobile-review"><p><b>手機驗證（GitHub 帳號確認）</b>：下列操作會開啟 GitHub 的公開 Issue 編輯頁面；確認送出後，Mac 上的同步程序才會將決定寫入 SQLite 並更新網站。在同步前仍顯示「待我驗證」。請勿在公開 Issue 中填寫內部資料。</p><div class="closure-actions"><button type="button" data-review-remote="accept" data-review-id="${esc(i.item_id)}">通過・送出驗證</button><button type="button" data-review-remote="reject" data-review-id="${esc(i.item_id)}">需修正・送出</button><button type="button" data-review-remote="defer" data-review-id="${esc(i.item_id)}">暫緩・送出</button></div></div>`:'';
    const manual=i.development_status==='NEEDS_USER_REVIEW'?(readonly?mobileReview:`<form id="closure-review" data-item="${esc(i.item_id)}"><p><b>驗收範圍</b>：${esc(i.acceptance_scope)}</p>${reviewAuthenticated?'':`<label>本機驗收金鑰<input name="token" type="password" autocomplete="off" placeholder="由本機管理者提供" required></label>`}<label>判斷理由<textarea name="reason" maxlength="2000" required placeholder="請說明已確認的功能或仍需修正的範圍"></textarea></label><label><input type="checkbox" name="confirm" required>我已核對上述功能及範圍</label><div class="closure-actions"><button name="decision" value="accept">確認通過・結案</button><button name="decision" value="reject">仍需修正</button><button name="decision" value="defer">暫不決定</button></div><p id="review-message" role="status"></p></form>`):'';
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close">✕ 關閉抽屜</button><div class="eyebrow">DEVELOPMENT CLOSURE</div><h2>${esc(i.title)}</h2></div>`+
      step(1,'功能與結案範圍',`<p>${esc(i.acceptance_scope)}</p><span class="pill ${closureTones[i.development_status]}">${closureLabels[i.development_status]}</span><p>${esc(i.decision_reason)}</p>`,true)+
      step(2,'完成回報與版本',reports)+step(3,'驗證與未解事項',`<p>驗證等級：${esc(i.verification_level)} · 結案依據：${esc(i.closure_basis||'尚未結案')}</p><p>${esc(i.remaining_validation||'尚未取得進一步回報')}</p>${manual}`,i.development_status==='NEEDS_USER_REVIEW')+
      step(4,'驗收與狀態歷史',history||'<p>尚無人工驗收紀錄。</p>')+
      step(5,'原有知識與證據入口',(i.entity_ids||[]).filter(id=>entity(id)).map(id=>`<button class="jump" data-jump="${esc(id)}">${esc(entity(id).title)} ↗</button>`).join('')||'<p>來源索引保留於本機稽核紀錄。</p>');
    $('#drawer').classList.add('open');$('#drawer').classList.remove('auto-synced');$('#drawer').scrollTop=0;enhanceMobileDrawer();syncSheet();$('#close').focus();
  }
  document.addEventListener('click',e=>{
    const verify=e.target.closest('[data-closure-verify]');if(verify){closureDetail(verify.dataset.closureVerify,verify);return;}
    const filter=e.target.closest('[data-closure-filter]');if(filter){closureFilter=closureFilter===filter.dataset.closureFilter?'all':filter.dataset.closureFilter;progressView='board';renderProgress();}
    const item=e.target.closest('[data-closure-item]');if(item)closureDetail(item.dataset.closureItem,item);
  });
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-review-remote]');if(!target)return;
    const item=closureData()?.items.find(i=>i.item_id===target.dataset.reviewId);
    if(!window.__V2_STATIC_BUNDLE__||!item||item.development_status!=='NEEDS_USER_REVIEW')return;
    const decision=target.dataset.reviewRemote;
    if(!['accept','reject','defer'].includes(decision))return;
    const label={accept:'通過',reject:'需修正',defer:'暫緩'}[decision];
    if(!confirm(`已實際核對「${item.title}」的驗收範圍，確認送出「${label}」？下一步仍需在 GitHub 登入並提交 Issue，SQLite 不會立即改變。`))return;
    const reason={accept:'本人已核對本項功能的公開驗收範圍，確認通過。',reject:'本人已核對本項功能，確認仍需修正；詳細內容留在本機。',defer:'本次暫緩確認，待進一步驗證。'}[decision];
    const payload={schema:'pih-mobile-review-v1',item_id:item.item_id,expected_updated_at:item.updated_at,decision,reason};
    const title=`[PIH-REVIEW] ${decision} ${item.item_id}`;
    const body='<!-- pih-mobile-review-v1 -->\n```json\n'+JSON.stringify(payload,null,2)+'\n```\n\n此 Issue 僅供手機人工驗收佇列使用。請勿加入私人或公司內部資料。';
    const url=new URL('https://github.com/NickWang0317/project-hub-view/issues/new');
    url.searchParams.set('title',title);url.searchParams.set('body',body);
    window.open(url.toString(),'_blank','noopener,noreferrer');
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='closure-review')return;e.preventDefault();
    const form=e.target,i=closureData()?.items.find(i=>i.item_id===form.dataset.item),message=$('#review-message');if(!i)return;
    const fields=new FormData(form),decision=e.submitter?.value;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{
      const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'未能儲存');return v;};
      if(!reviewAuthenticated){await post('/api/progress/login',{token:fields.get('token')});reviewAuthenticated=true;form.querySelector('[name=token]').value='';}
      await post('/api/progress/decision',{item_id:i.item_id,decision,reason:fields.get('reason'),expected_updated_at:i.updated_at,request_id:crypto.randomUUID()});
      await refreshClosure();closureDetail(i.item_id,origin);const note=document.createElement('p');note.setAttribute('role','status');note.textContent='已保存至本機 SQLite；重新整理後仍保留。';$('#drawer .drawer-head').append(note);
    }catch(err){message.textContent='未儲存：'+err.message;buttons.forEach(b=>b.disabled=false);}
  });

  function renderProgress(){
    if(!data)return;
    const p=progressData();
    document.querySelectorAll('[data-progress-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.progressView===progressView));
    if(!p){
      $('#progress-note').textContent='';
      $('#progress-content').innerHTML='<div class="logic-empty"><h2>此版本的 API 尚未提供進度資料</h2><p>前後端版本可能暫時不同步，請重新整理頁面。不會以其他資料推測進度。</p></div>';
      return;
    }
    if(p.closure&&progressView==='board'){closureBoard();return;}
    const view=progressView==='skills'?skillsView(p):progressView==='gaps'?gapsView(p):boardView(p);
    const filterLabel=CARD_FILTERS[progressFilter]||'全部';
    if(view.shown===0){
      $('#progress-note').textContent=`${query()?`搜尋「${$('#search').value.trim()}」· `:''}目前篩選結果：0（篩選「${filterLabel}」）`;
    }else if(progressFilter!=='all'||query()){
      $('#progress-note').textContent=`${query()?`搜尋「${$('#search').value.trim()}」· `:''}目前篩選「${filterLabel}」· 共 ${view.shown} 項符合`;
    }else{
      $('#progress-note').textContent='';
    }
    const top=$('#progress-content').scrollTop;
    $('#progress-content').innerHTML=(p.closure?'<p class="io-basis">以下是來源與驗證參考，不列入功能結案母體。請切回功能結案查看四項統計。</p>':metricsStrip(p))+view.html;
    $('#progress-content').scrollTop=top;
  }
  // 以來源紀錄開啟右側抽屜：事件型為「實體ID|事件ID」，資料表型為 source_refs 的鍵。
  function progressSource(key,button){
    let r;
    if(key.includes('|')){const [id,eid]=key.split('|');const ev=entity(id)?.evidence_and_history?.events?.find(e=>e.event_id===eid);
      if(ev)r={...ev,date_precision:String(ev.occurred_at||'').includes('T')?'timestamp':ev.display_date?'day':'unknown',coverage:ev.gaps?.length?'partial':'complete',source_record:'development_events:'+ev.event_id};}
    else r=progressData()?.source_refs?.[key];
    if(r)sourceDrawer(r,button);
  }
  document.addEventListener('click',ev=>{
    const resetBtn=ev.target.closest('[data-progress-reset]');
    if(resetBtn){progressFilter='all';renderProgress();return;}
    const cardBtn=ev.target.closest('[data-progress-card]');
    if(cardBtn){
      const key=cardBtn.dataset.progressCard;
      progressFilter=(progressFilter===key)?'all':key;
      renderProgress();
      return;
    }
    const el=ev.target.closest('[data-progress-view],[data-progress-source]');if(!el)return;
    if(el.dataset.progressView){progressView=el.dataset.progressView;renderProgress();$('#progress-content').scrollTop=0;}
    if(el.dataset.progressSource)progressSource(el.dataset.progressSource,el);
  });
  // ---- Evolution 演進視角：依對話與知識版本重建的設計演進史，非系統執行日誌。 ----
  let evoView='timeline',evoIndex=0,evoAll=false;
  const evoData=()=>data?.evolution||null;
  const evoPrecisionLabel={timestamp:'精確時間戳 timestamp',day:'日期 day',free_text:'局部日期（無年份）free_text',unknown:'時間未記載 unknown'};
  const evoChangeTone={added:'green',updated:'blue',status_changed:'amber',superseded:'purple'};
  const evoShiftTone={superseded:'purple',status_shift:'amber',iterative_refinement:'blue'};

  function setAsOf(val){
    asOfNotice='';
    currentAsOf=val||'';
    const url=new URL(location.href);
    url.searchParams.set('agent',$('#agent').value==='history'?'history':'action');
    if(currentAsOf)url.searchParams.set('as_of',currentAsOf);else url.searchParams.delete('as_of');
    history.replaceState(null,'',url);
    evoAll=false;
    load().then(()=>{
      const batches=filteredEvoBatches(evoData());
      if(currentAsOf&&batches.length)evoIndex=batches.length-1;
      else evoIndex=0;
      if(viewName==='evolution')renderEvolution();
    });
  }
  function evoMetricsStrip(evo){
    const m=evo?.summary_metrics||{};
    const cells=[
      ['有效來源事件',m.visible_event_count??0,'目前已連結對話／歷史事件','blue'],
      ['知識版本迭代',m.knowledge_version_count??0,`涵蓋 ${m.unique_entity_count??0} 項知識實體`,'green'],
      ['跨版演進實體',m.multi_version_entity_count??0,`共 ${m.decision_shift_count??0} 項演進對照`,'purple'],
      ['更迭／狀態轉折',m.superseded_or_revised_count??0,'舊方案退場、暫緩或狀態升降','amber'],
      ['快照與評估批次',m.snapshot_count??0,`時間軸共 ${m.timeline_batch_count??0} 個批次`,'blue'],
      ['時間未載明項目',m.unknown_timestamp_count??0,'不猜測年份或偽造先後','gray']
    ];
    return `<div class="evo-metrics">${cells.map(([t,n,sub,c])=>`<div class="evo-metric"><span>${esc(t)}</span><strong class="${c}">${esc(n)}</strong><small>${esc(sub)}</small></div>`).join('')}</div>`;
  }
  function filteredEvoBatches(evo){
    return (evo?.timeline_batches||[]).filter(b=>searchLogic([b.date_label,b.title,b.summary,b.affected_groups,b.entity_changes,b.events,b.snapshots,b.assessments]));
  }
  function filteredEvoShifts(evo){
    return (evo?.decision_shifts||[]).filter(s=>searchLogic([s.title,s.native_id,s.shift_label,s.early_record,s.current_record,s.change_reason,s.group_title]));
  }
  function filteredEvoCheckpoints(evo){
    const list=evo?.all_checkpoints||evo?.as_of_checkpoints||[];
    return list.filter(c=>searchLogic([c.display_time,c.as_of,c.title,c.kind_label,c.active_snapshot_id]));
  }
  function evoBatchCard(b){
    const groups=(b.affected_groups||[]).map(g=>`<span class="pill gray">${esc(g.title)} ×${g.count}</span>`).join('');
    const changes=b.entity_changes||[];
    const evs=b.events||[];
    const snaps=[...(b.snapshots||[]),...(b.assessments||[])];
    return `<article class="logic-card evo-batch-card" data-batch-card="${esc(b.batch_id)}">`+
      `<div class="logic-card-heading"><div class="logic-card-meta"><span class="eyebrow">BATCH ${String(b.ordinal).padStart(2,'0')} · ${esc(b.date_label)}</span><span class="pill ${b.is_exact_time?'green':'amber'}">${esc(evoPrecisionLabel[b.time_precision]||b.time_precision)}</span><span class="pill blue">${esc(b.summary)}</span></div><h2>${hl(b.title)}</h2></div>`+
      (groups?`<div class="evo-groups-row"><span class="logic-links-label">影響概念群：</span>${groups}</div>`:'')+
      (changes.length?`<section class="evo-section"><h3>知識版本新增／修訂／更迭（${changes.length} 筆）</h3><div class="evo-change-grid">${changes.map(c=>`<div class="evo-change-item"><div class="evo-change-top"><span class="pill ${evoChangeTone[c.change_type]||'gray'}">${esc(c.change_label)}</span><span class="pill gray">${esc(c.group_title)}</span><span class="pill amber">${esc(c.status)}</span></div><h4><button type="button" class="logic-chip" data-jump="${esc(c.entity_id)}">↗ ${hl(c.title)}</button></h4><p class="evo-change-desc">${hl(c.description)}</p><p class="io-basis">修訂原因：${c.change_reason_basis==='source'?hl(c.change_reason):'<span class="logic-unknown">來源未記載（unknown）</span>'} · 生效 ${esc(c.effective_at)} · 收錄 #${c.sequence} (${esc(c.recorded_at)})</p></div>`).join('')}</div></section>`:'')+
      (snaps.length?`<section class="evo-section"><h3>架構與評估快照批次（${snaps.length} 筆）</h3><div class="evo-chip-wrap">${snaps.map(s=>`<button type="button" class="logic-chip source-chip" data-evolution-source="${esc(s.source_record)}">📸 ${hl(s.title)}<small>${esc(s.captured_at)}</small></button>${s.captured_at&&s.captured_at!=='unknown'?`<button type="button" class="logic-chip" data-evo-asof="${esc(s.captured_at)}">⏳ 預覽此時間切面</button>`:''}`).join('')}</div></section>`:'')+
      (evs.length?`<details class="logic-context-accordion evo-events-acc" ${!changes.length?'open':''}><summary>📂 本批次關聯來源事件（${evs.length} 筆對話／歷史事件 — 點擊展開或點選晶片檢視來源）</summary><div class="evo-event-list">${evs.map(e=>`<div class="evo-event-row"><button type="button" class="logic-chip source-chip" data-evolution-source="${esc(e.source_record)}">📄 ${esc(e.display_date)} · ${esc(e.evidence_type)}<small>${hl(e.title)}</small></button><p>${hl(e.summary)}</p></div>`).join('')}</div></details>`:'')+
      `</article>`;
  }
  function evoShiftCard(s){
    const er=s.early_record||{},cr=s.current_record||{};
    const vhist=s.version_history||[];
    const evIds=s.evidence_event_ids||[];
    return `<article class="logic-card evo-shift-card" data-shift-card="${esc(s.id)}">`+
      `<div class="logic-card-heading"><div class="logic-card-meta"><span class="pill ${evoShiftTone[s.shift_type]||'blue'}">${esc(s.shift_label)}</span><span class="pill gray">${esc(s.group_title)}</span><span class="pill gray">${esc(scopeLabel(s))}</span><span class="pill blue">共 ${s.version_count} 版</span></div><h3>${hl(s.title)} <small class="evo-native-id">${esc(s.native_id)}</small></h3></div>`+
      `<div class="case-compare evo-compare">`+
        `<section class="io-block evo-early"><h4>🕒 早期設計／首版記載（${esc(er.version_label)} · #${er.sequence}）</h4><p><span class="pill gray">狀態：${esc(er.status)}</span> <b>${hl(er.title)}</b></p><p>${hl(er.summary)}</p><small class="io-basis">生效：${esc(er.effective_at)} · 收錄：${esc(er.recorded_at)}</small></section>`+
        `<section class="io-block evo-current"><h4>✨ 當前有效記載（${esc(cr.version_label)} · #${cr.sequence}）</h4><p><span class="pill amber">狀態：${esc(cr.status)}</span> <b>${hl(cr.title)}</b></p><p>${hl(cr.summary)}</p><small class="io-basis">生效：${esc(cr.effective_at)} · 收錄：${esc(cr.recorded_at)}</small></section>`+
      `</div>`+
      `<div class="evo-reason-box"><b>🔀 轉折與修訂原因：</b>${s.change_reason_basis==='source'?hl(s.change_reason):'<span class="logic-unknown">來源未記載轉折原因（unknown）</span>'}</div>`+
      `<div class="logic-links"><button type="button" class="logic-chip" data-jump="${esc(s.entity_id)}">↗ 開啟五層詳情（${esc(s.title)}）</button>${evIds.slice(0,4).map(eid=>`<button type="button" class="logic-chip source-chip" data-evolution-source="development_events:${esc(eid)}">來源事件 ${esc(eid)}</button>`).join('')}</div>`+
      `<details class="logic-context-accordion"><summary>📂 完整版本演進軌跡（v1 → v${vhist.length}，共 ${vhist.length} 筆版本紀錄）</summary><div class="evo-ver-list">${vhist.map(v=>`<div class="evo-ver-row"><b>${esc(v.version_label)} (#${v.sequence})</b> · <span class="pill gray">${esc(v.status)}</span> · 生效 ${esc(v.effective_at)} · 收錄 ${esc(v.recorded_at)}<br>${hl(v.description)}<br><small>修訂原因：${v.change_reason_basis==='source'?hl(v.change_reason):'unknown'}</small></div>`).join('')}</div></details>`+
      `</article>`;
  }
  function evoCheckpointCard(cp){
    const cm=cp.cumulative_metrics||{};
    const isCur=cp.is_current_as_of||(currentAsOf&&cp.as_of===currentAsOf);
    return `<article class="logic-card evo-cp-card ${isCur?'active-cp':''}" data-cp-card="${esc(cp.id)}">`+
      `<div class="logic-card-heading"><div class="logic-card-meta"><span class="pill ${cp.kind==='architecture_snapshot'?'purple':'blue'}">${esc(cp.kind_label)}</span><span class="pill ${cp.included_in_current_slice?'green':'gray'}">${cp.included_in_current_slice?'✓ 包含於目前切面':'⏳ 晚於目前切面'}</span>${isCur?'<span class="pill amber">★ 目前所在 as_of 切面</span>':''}</div><h3>${hl(cp.display_time)} — ${hl(cp.title)}</h3></div>`+
      `<p class="io-basis">ISO 時間錨點：<code>${esc(cp.as_of)}</code> · 對應架構快照：<code>${esc(cp.active_snapshot_id||'尚未建立快照')}</code></p>`+
      `<div class="evo-cp-stats"><span>累計知識版本：<b>${cm.knowledge_version_count??0}</b></span><span>累計知識實體：<b>${cm.unique_entity_count??0}</b></span><span>累計架構快照：<b>${cm.snapshot_count??0}</b></span></div>`+
      `<div class="logic-links"><button type="button" class="logic-chip ${isCur?'active-chip':''}" data-evo-asof="${esc(cp.as_of)}">${isCur?'✓ 目前檢視此切面':'⏳ 切換至此時間切面（as_of）'}</button>${cp.active_snapshot_id?`<button type="button" class="logic-chip source-chip" data-evolution-source="architecture_snapshots:${esc(cp.active_snapshot_id)}">查看快照來源紀錄 ↗</button>`:''}</div>`+
      `</article>`;
  }
  function syncEvolutionDrawer(evo){
    if(viewName!=='evolution'||!evo)return;
    if(evoView==='timeline'){
      const batches=filteredEvoBatches(evo);
      const b=batches[evoIndex]||batches[0];
      if(!b)return;
      if(b.primary_entity_id&&entity(b.primary_entity_id)){openDetail(b.primary_entity_id,false,true);return;}
      const ref=b.primary_source_record&&evo.source_refs?.[b.primary_source_record];
      if(ref){sourceDrawer(ref,null,false,true);highlightEvolutionChips(null,b.primary_source_record);}
    }else if(evoView==='shifts'){
      const s=filteredEvoShifts(evo)[0];
      if(s?.entity_id&&entity(s.entity_id))openDetail(s.entity_id,false,true);
    }else if(evoView==='checkpoints'){
      const cp=filteredEvoCheckpoints(evo).find(c=>c.is_current_as_of)||filteredEvoCheckpoints(evo)[0];
      const key=cp?.active_snapshot_id?`architecture_snapshots:${cp.active_snapshot_id}`:null;
      const ref=key&&evo.source_refs?.[key];
      if(ref){sourceDrawer(ref,null,false,true);highlightEvolutionChips(null,key);}
    }
  }
  function renderEvolution(){
    if(!data)return;
    const evo=evoData();
    if(!evo){
      $('#evolution-content').innerHTML='<div class="logic-empty"><h2>此版本的 API 尚未提供演進資料</h2><p>請重新整理頁面載入最新唯讀轉接資料。</p></div>';
      return;
    }
    const batches=filteredEvoBatches(evo),shifts=filteredEvoShifts(evo),cps=filteredEvoCheckpoints(evo);
    const tabLabels={
      timeline:`🕒 演進時間軸（${batches.length} 批）`,
      shifts:`🔀 設計轉折與更迭（${shifts.length} 項）`,
      checkpoints:`📸 快照與時間切面回溯（${cps.length} 點）`
    };
    document.querySelectorAll('[data-evo-view]').forEach(b=>{
      const v=b.dataset.evoView,act=v===evoView;
      b.classList.toggle('active',act);b.setAttribute('aria-selected',act);
      if(tabLabels[v])b.textContent=tabLabels[v];
    });
    const allCps=evo.all_checkpoints||evo.as_of_checkpoints||[];
    const sel=$('#evo-asof');
    if(sel){
      sel.innerHTML='<option value="">最新狀態 Latest（全部記載）</option>'+allCps.map(c=>`<option value="${esc(c.as_of)}">[${esc(c.kind_label)}] ${esc(c.display_time)} · ${esc(c.title)}</option>`).join('');
      if(currentAsOf&&!allCps.some(c=>c.as_of===currentAsOf)){
        sel.innerHTML+=`<option value="${esc(currentAsOf)}">[自訂切面] ${esc(currentAsOf)}</option>`;
      }
      sel.value=currentAsOf||'';
    }
    const isSliced=Boolean(currentAsOf);
    const resetBtn=$('#evo-reset-asof'),sliceBanner=$('#evo-slice-banner');
    if(resetBtn)resetBtn.hidden=!isSliced;
    if(sliceBanner){
      if(asOfNotice){
        sliceBanner.hidden=false;
        sliceBanner.innerHTML=`<span>${esc(asOfNotice)}</span><button type="button" class="evo-reset-inline" data-clear-slice-notice="1">✕ 關閉提示</button>`;
      }else{
        sliceBanner.hidden=!isSliced;
        if(isSliced){
          const m=evo.summary_metrics||{};
          sliceBanner.innerHTML=mobile()?`<span>⏳ 歷史預覽 · ${esc(currentAsOf.slice(0,10))}<small>僅顯示當時已知資料</small></span><button type="button" class="evo-reset-inline" data-reset-asof="1">↺ 返回最新</button>`:`<span>⏳ 目前正在檢視歷史時間切面：<b>${esc(currentAsOf)}</b>（僅呈現截至該時間點已記載的 ${m.knowledge_version_count??0} 筆知識版本、${m.visible_event_count??0} 筆來源事件與 ${m.snapshot_count??0} 個快照，未來變更已過濾）</span><button type="button" class="evo-reset-inline" data-reset-asof="1">↺ 一鍵回到最新狀態（Latest）</button>`;
        }
      }
    }
    const stepNav=$('#evo-step-nav'),rail=$('#evolution-rail'),bodyWrap=document.querySelector('.evolution-body');
    const isTimeline=evoView==='timeline';
    if(stepNav)stepNav.hidden=!isTimeline;
    if(rail)rail.hidden=!isTimeline;
    if(bodyWrap)bodyWrap.classList.toggle('single-col',!isTimeline);

    if(isTimeline){
      evoIndex=Math.min(Math.max(evoIndex,0),Math.max(batches.length-1,0));
      $('#evo-prev').disabled=!batches.length||evoIndex===0||evoAll;
      $('#evo-next').disabled=!batches.length||evoIndex===batches.length-1||evoAll;
      $('#evo-all').disabled=!batches.length;
      $('#evo-all').setAttribute('aria-pressed',evoAll);
      $('#evo-all').textContent=evoAll?'聚焦單一批次':'展開全部批次';
      $('#evo-position').textContent=!batches.length?'0 / 0':evoAll?`全部 ${batches.length} 批`:`Batch ${evoIndex+1} / ${batches.length}`;
      $('#evo-search-note').textContent=query()?`搜尋「${$('#search').value.trim()}」：${batches.length} 批符合`:'';
      rail.innerHTML=batches.map((b,i)=>`<div class="rail-entry"><button type="button" class="${b.is_exact_time?'documented':'partial'}" data-evo-batch="${i}" ${i===evoIndex&&!evoAll?'aria-current="step"':''} title="${esc(b.title)}"><span>${String(b.ordinal).padStart(2,'0')}</span><em><b>${esc(b.date_label)}</b> · ${hl(b.lead_title)}</em></button></div>`).join('');
      const shown=evoAll?batches:(batches[evoIndex]?[batches[evoIndex]]:[]);
      $('#evolution-content').innerHTML=evoMetricsStrip(evo)+(shown.length?shown.map(evoBatchCard).join(''):`<div class="logic-empty"><h2>此範圍或時間切面下沒有符合的演進批次</h2><p>請調整搜尋關鍵字、Agent 範圍或點選「回到最新狀態」。</p><button type="button" class="logic-reset-scope" data-reset-asof="1">↺ 回到最新狀態</button></div>`);
    }else if(evoView==='shifts'){
      $('#evo-search-note').textContent=query()?`搜尋「${$('#search').value.trim()}」：${shifts.length} 項轉折符合`:'';
      $('#evolution-content').innerHTML=evoMetricsStrip(evo)+`<section class="evo-list-sec"><div class="evo-sec-head"><h2>設計轉折與跨版本演進對照（共 ${shifts.length} 項）</h2><p class="io-basis">對照早期設計（v1）與截至目前切面之最新有效記載；未記載轉折原因者誠實標示 unknown。</p></div>${shifts.length?shifts.map(evoShiftCard).join(''):'<div class="logic-empty"><h2>沒有符合條件的設計轉折項目</h2></div>'}</section>`;
    }else{
      $('#evo-search-note').textContent=query()?`搜尋「${$('#search').value.trim()}」：${cps.length} 個切面錨點符合`:'';
      $('#evolution-content').innerHTML=evoMetricsStrip(evo)+`<section class="evo-list-sec"><div class="evo-sec-head"><h2>快照與時間切面回溯（共 ${cps.length} 個可切換時間錨點）</h2><p class="io-basis">點選任一時間錨點可立即載入截至該時間點的完整架構、邏輯、演進與進度狀態；嚴格排除 public_poc 與無關自動圖譜快照。</p></div><div class="evo-cp-grid">${cps.length?cps.map(evoCheckpointCard).join(''):'<div class="logic-empty"><h2>沒有符合條件的時間切面錨點</h2></div>'}</div></section>`;
    }
    syncEvolutionDrawer(evo);
  }
  function moveEvoBatch(idx){evoAll=false;evoIndex=idx;renderEvolution();$('#evolution-content').scrollTop=0;$('#evolution-rail [aria-current]')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  function evolutionSource(key,btn){
    const evo=evoData();if(!evo)return;
    const r=evo.source_refs?.[key]||evo.source_refs?.[key.replace(/^development_events:/,'')];
    if(r){sourceDrawer(r,btn,true,false);highlightEvolutionChips(null,key);}
  }
  $('#evo-asof')?.addEventListener('change',ev=>setAsOf(ev.target.value));
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-evo-view],[data-evo-batch],[data-evolution-source],[data-evo-asof],[data-reset-asof],[data-clear-slice-notice],#evo-reset-asof,#evo-prev,#evo-next,#evo-all');
    if(!el)return;
    if(el.dataset.clearSliceNotice){asOfNotice='';$('#evo-slice-banner').hidden=true;return;}
    if(el.dataset.evoView){evoView=el.dataset.evoView;renderEvolution();$('#evolution-content').scrollTop=0;return;}
    if(el.dataset.evoBatch!==undefined){moveEvoBatch(Number(el.dataset.evoBatch));return;}
    if(el.dataset.evolutionSource){evolutionSource(el.dataset.evolutionSource,el);return;}
    if(el.dataset.evoAsOf!==undefined||el.dataset.evoAsof!==undefined){setAsOf(el.dataset.evoAsof||el.dataset.evoAsOf);return;}
    if(el.dataset.resetAsof||el.id==='evo-reset-asof'){if(el.classList.contains('logic-reset-scope')){$('#search').value='';}setAsOf('');return;}
    if(el.id==='evo-prev')moveEvoBatch(evoIndex-1);
    if(el.id==='evo-next')moveEvoBatch(evoIndex+1);
    if(el.id==='evo-all'){evoAll=!evoAll;renderEvolution();}
  });
  document.addEventListener('keydown',ev=>{
    if(viewName!=='evolution'||evoView!=='timeline'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)||ev.altKey||ev.ctrlKey||ev.metaKey)return;
    if(ev.target.closest?.('input,select,textarea,#drawer'))return;
    const batches=filteredEvoBatches(evoData());
    const delta=(ev.key==='ArrowRight'||ev.key==='ArrowDown')?1:-1;
    const next=evoIndex+delta;
    if(batches.length&&next>=0&&next<batches.length){ev.preventDefault();moveEvoBatch(next);}
  });
  function view(name){
    if(['architecture','logic','thinking','evolution','progress'].includes(name)){
      const url=new URL(location.href);
      url.hash='#'+name;
      history.replaceState(null,'',url);
    }
    if(name!=='thinking')$('#thinking-frame').contentWindow?.postMessage({type:'thinking-pause'},location.origin);
    viewName=name;const ws=document.querySelector('.workspace');ws.dataset.view=name;document.body.dataset.view=name;
    const compact=true;
    document.body.classList.toggle('is-compact-header',compact);
    ws.classList.toggle('is-compact-header',compact);
    document.querySelectorAll('button[data-view]').forEach(b=>{if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const activeViews=['architecture','logic','evolution','progress'];
    $('#architecture').hidden=!activeViews.includes(name);$('.graph-panel').hidden=name!=='architecture';$('#logic-panel').hidden=name!=='logic';$('#evolution-panel').hidden=name!=='evolution';$('#progress-panel').hidden=name!=='progress';
    $('#thinking-panel').hidden=name!=='thinking';
    $('#placeholder').hidden=activeViews.includes(name)||name==='thinking';close();
    if(name==='thinking')syncThinking();
    $('#thumb-bar').hidden=!mobile()||name!=='logic';$('#step-picker').hidden=true;$('#thumb-position').setAttribute('aria-expanded','false');
    if(name==='logic'){if(data)renderLogic();return;}
    if(name==='evolution'){if(data)renderEvolution();return;}
    if(name==='progress'){if(data)renderProgress();return;}
    if(name==='architecture'){if(data)fit();return;}
  }
  function setAgent(val,shouldLoad=true){
    const target=val==='history'?'history':'action';
    $('#agent').value=target;
    document.querySelectorAll('[data-agent-scope]').forEach(b=>{
      const active=b.dataset.agentScope===target;
      b.classList.toggle('active',active);
      b.setAttribute('aria-checked',String(active));
    });
    const url=new URL(location.href);
    url.searchParams.set('agent',target);
    if(currentAsOf){
      let valid=true;
      if(window.__V2_STATIC_BUNDLE__){
        valid=Boolean(window.__V2_STATIC_BUNDLE__.views?.[target]?.[currentAsOf]||window.__V2_STATIC_BUNDLE__.paths?.[target]?.[currentAsOf]);
      }else if(data?.evolution){
        const cps=(data.evolution.all_checkpoints||data.evolution.as_of_checkpoints||[]).map(c=>c.as_of);
        valid=cps.includes(currentAsOf);
      }
      if(!valid){
        currentAsOf='';
        url.searchParams.delete('as_of');
        asOfNotice=`已自動返回最新切面（原時間切面於「${target==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;
        const sliceBanner=$('#evo-slice-banner');
        if(sliceBanner){
          sliceBanner.hidden=false;
          sliceBanner.innerHTML=`<span>${esc(asOfNotice)}</span><button type="button" class="evo-reset-inline" data-clear-slice-notice="1">✕ 關閉提示</button>`;
        }
      }else{
        asOfNotice='';
      }
    }else{
      asOfNotice='';
      const sliceBanner=$('#evo-slice-banner');
      if(sliceBanner)sliceBanner.hidden=true;
    }
    history.replaceState(null,'',url);
    if(shouldLoad)load();
    if(viewName==='thinking')syncThinking();
  }
  document.addEventListener('click',ev=>{
    const agentBtn=ev.target.closest('[data-agent-scope]');
    if(agentBtn){setAgent(agentBtn.dataset.agentScope);return;}
    const el=ev.target.closest('[data-node],[data-edge],[data-jump],button[data-view],button');
    if(!el)return;
    if(el.dataset.node||el.dataset.edge){origin=el;openDetail(el.dataset.node||el.dataset.edge);}
    if(el.dataset.jump){if(!el.closest('#drawer'))origin=el;openDetail(el.dataset.jump);}
    if(el.dataset.view)view(el.dataset.view);
    if(el.id==='close')close();
    if(el.id==='mode'){expanded=!expanded;renderGraph();}
    if(el.id==='list-mode'){listMode=!listMode;renderGraph();}
    if(el.id==='fit')fit();
    if(el.id==='zoom-in')zoom(.8);
    if(el.id==='zoom-out')zoom(1.25);
    if(el.id==='back')view('architecture');
  });
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){close();return;}const target=ev.target.closest('[data-node],[data-edge]');if(target&&['Enter',' '].includes(ev.key)&&target.tagName.toLowerCase()==='g'){ev.preventDefault();origin=target;openDetail(target.dataset.node||target.dataset.edge);}if(ev.target===$('#canvas')){const move={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]}[ev.key];if(move){ev.preventDefault();camera[0]+=move[0];camera[1]+=move[1];setCamera();}if(ev.key==='+')zoom(.8);if(ev.key==='-')zoom(1.25);}});
  document.addEventListener('focusin',ev=>{const id=ev.target.dataset?.node;const n=nodes.find(n=>n.id===id);if(n&&ev.target.closest('#graph')&&(n.x<camera[0]||n.y<camera[1]||n.x+n.w>camera[0]+camera[2]||n.y+n.h>camera[1]+camera[3])){camera[0]=n.x-(camera[2]-n.w)/2;camera[1]=n.y-(camera[3]-n.h)/2;setCamera();}});
  let drag=null, pinch=null;const pointers=new Map();
  $('#canvas').addEventListener('pointerdown',e=>{
    if(e.target.closest('[data-node],[data-edge]')&&!pointers.size)return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a[0]-b[0],a[1]-b[1]),camera:[...camera]};drag=null;}
    else if(!e.target.closest('[data-node],[data-edge]'))drag=[e.clientX,e.clientY,...camera];
    $('#canvas').setPointerCapture(e.pointerId);
  });
  $('#canvas').addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance<1||pinch.distance<1)return;const c=pinch.camera,ratio=Math.max(.2,Math.min(5,pinch.distance/distance));camera=[c[0]+c[2]*(1-ratio)/2,c[1]+c[3]*(1-ratio)/2,c[2]*ratio,c[3]*ratio];setCamera();return;}
    if(!drag)return;const r=$('#canvas').getBoundingClientRect();camera=[drag[2]-(e.clientX-drag[0])*drag[4]/r.width,drag[3]-(e.clientY-drag[1])*drag[5]/r.height,drag[4],drag[5]];setCamera();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])$('#canvas').addEventListener(type,e=>{pointers.delete(e.pointerId);pinch=null;drag=null;});
  // Search controls move on mobile; IDs and data state stay shared.
  const searchLabelEl=$('#search').parentElement;
  const searchHome=document.createComment('search home');
  searchLabelEl.before(searchHome);
  document.querySelector('header').insertAdjacentHTML('beforeend','<div class="mobile-tools mobile-only"><button id="mobile-search-toggle" aria-label="展開搜尋" aria-expanded="false">⌕</button></div>');
  let wasMobile=null,desktopListMode=null;
  function syncMobileLayout(){
    const on=mobile();if(on!==wasMobile){
      if(on){if(wasMobile===false)desktopListMode=listMode;$('#mobile-search').append(searchLabelEl);listMode=true;}
      else{searchHome.after(searchLabelEl);listMode=desktopListMode??matchMedia('(max-width:900px)').matches;$('#mobile-search').hidden=true;$('#step-picker').hidden=true;}
      wasMobile=on;
      if(data){renderGraph();if(viewName==='logic')renderLogic();if(viewName==='progress')renderProgress();}
      if(on&&$('#drawer').classList.contains('open')&&!$('#drawer .sheet-content'))enhanceMobileDrawer(entity(selected)?.id);
    }
    $('#thumb-bar').hidden=!on||viewName!=='logic';
    document.querySelectorAll('#stats .stat').forEach((e,i)=>{if(on){e.setAttribute('role','button');e.tabIndex=0;e.dataset.metric=i;e.setAttribute('aria-label',e.textContent);}else{e.removeAttribute('role');e.removeAttribute('tabindex');delete e.dataset.metric;}});
    syncSheet();
  }
  new MutationObserver(()=>syncMobileLayout()).observe($('#stats'),{childList:true});
  $('#group-list').addEventListener('toggle',e=>{const id=e.target.dataset?.groupId;if(id&&!query()){if(e.target.open)openGroups.add(id);else openGroups.delete(id);}},true);
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-groups],[data-sheet-jump],.sheet-resize,.sheet-grab,#thumb-prev,#thumb-next,#thumb-position,#thumb-detail,#mobile-search-toggle,[data-metric]');if(!el||!mobile())return;
    if(el.dataset.groups){document.querySelectorAll('.mobile-group').forEach(d=>{d.open=el.dataset.groups==='open';if(d.open)openGroups.add(d.dataset.groupId);else openGroups.delete(d.dataset.groupId);});}
    if(el.matches('.sheet-resize,.sheet-grab')){$('#drawer').classList.toggle('sheet-full');syncSheetSize();}
    if(el.dataset.sheetJump!==undefined){const d=$(`#drawer [data-sheet-section="${el.dataset.sheetJump}"]`);if(d){d.open=true;d.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}}
    if(el.id==='thumb-prev')moveLogic(logicIndex-1);
    if(el.id==='thumb-next')moveLogic(logicIndex+1);
    if(el.id==='thumb-position'){$('#step-picker').hidden=!$('#step-picker').hidden;el.setAttribute('aria-expanded',String(!$('#step-picker').hidden));}
    if(el.id==='thumb-detail'){origin=el;const m=currentMaterial(),s=filteredSteps(m)[logicIndex]||m?.steps?.[logicIndex],id=s?.related_entity_ids?.find(id=>entity(id));if(id)openDetail(id);else if(s?.evidence_refs?.[0])sourceDrawer(s.evidence_refs[0],el);}
    if(el.id==='mobile-search-toggle'){const panel=$('#mobile-search');panel.hidden=!panel.hidden;el.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)$('#search').focus();}
    if(el.dataset.metric!==undefined&&closureData()){closureFilter=['CLOSED_REPORTED','NEEDS_USER_REVIEW','NEEDS_FIX','PENDING_REPORT'][Number(el.dataset.metric)]||'all';progressView='board';view('progress');renderProgress();return;}
    if(el.dataset.metric!==undefined){const key=['evidence','pending','unresolved','next'][Number(el.dataset.metric)]||'all';progressView='board';progressFilter=key;view('progress');renderProgress();$('#progress-content').scrollTop=0;}
  });
  document.addEventListener('keydown',ev=>{
    if(mobile()&&ev.target.matches('#stats [data-metric]')&&['Enter',' '].includes(ev.key)){ev.preventDefault();ev.target.click();}
    if(!mobile()||!document.body.classList.contains('sheet-open')||ev.key!=='Tab')return;
    const list=[...$('#drawer').querySelectorAll('button,a[href],summary,input,select,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length),first=list[0],last=list[list.length-1];
    if(ev.shiftKey&&(document.activeElement===first||!$('#drawer').contains(document.activeElement))){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}
  });
  function syncThinking(){
    const frame=$('#thinking-frame'),agent=$('#agent').value==='history'?'history':'action';
    if(frame.dataset.agent===agent)return;
    const bundle=$('#thinking-bundle');if(!bundle)return;
    frame.dataset.agent=agent;
    frame.srcdoc=JSON.parse(bundle.textContent).replace('<html lang=',`<html data-embedded="true" data-agent="${agent}" lang=`);
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==$('#thinking-frame').contentWindow||event.data?.type!=='thinking-scope'||!['history','action'].includes(event.data.agent))return;
    setAgent(event.data.agent);
  });
  const searchParams=new URLSearchParams(location.search);
  const rawAgent=searchParams.get('agent');
  let initialAgent=rawAgent==='history'?'history':'action';
  if(rawAgent==='all'||(rawAgent&&rawAgent!=='action'&&rawAgent!=='history')){
    const url=new URL(location.href);
    url.searchParams.set('agent','action');
    history.replaceState(null,'',url);
  }
  setAgent(initialAgent,false);
  $('#agent').addEventListener('change',()=>setAgent($('#agent').value));
  $('#search').addEventListener('input',()=>{if(data){renderGraph();renderLogic();renderEvolution();renderProgress();}});
  window.addEventListener('resize',()=>{syncMobileLayout();if(data)fit();});
  syncMobileLayout();
  load();
  const initialView=location.hash.slice(1);
  view(['architecture','logic','thinking','evolution','progress'].includes(initialView)?initialView:'architecture');
})();
