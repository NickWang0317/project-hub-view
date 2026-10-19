'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const themeToggle = $('#theme-toggle');
  function syncTheme(){themeToggle.textContent=document.documentElement.dataset.theme==='light'?'🌙 深色':'☀️ 日光';}
  syncTheme();
  themeToggle.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('pih_v2_theme',theme);}catch{}syncTheme();});
  window.addEventListener('storage',e=>{if(e.key==='pih_v2_theme'){document.documentElement.dataset.theme=e.newValue==='light'?'light':'dark';syncTheme();}});
  const mobile = () => matchMedia('(max-width:640px)').matches;
  function syncSheet(){const drawer=$('#drawer'),active=mobile()&&drawer.classList.contains('open')&&!drawer.classList.contains('auto-synced');$('#drawer-backdrop').hidden=!active;document.body.classList.toggle('sheet-open',active);drawer.setAttribute('aria-modal',String(active));if(active)drawer.setAttribute('role','dialog');else drawer.removeAttribute('role');document.querySelectorAll('.workspace>header,.workspace>nav,.context,#stats,#home-progress-shortcut,.graph-panel,#logic-panel,#evolution-panel,#progress-panel,#cases-panel,#thumb-bar,#step-picker').forEach(e=>e.inert=active);}
  new MutationObserver(syncSheet).observe($('#drawer'),{attributes:true,attributeFilter:['class']});
  $('#drawer-backdrop').addEventListener('click',()=>close());
  window.addEventListener('resize',syncSheet);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt = v => typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  let viewName = 'architecture', logicId = null, logicIndex = 0, logicAll = false;
  let data;
  let selected = null, origin = null, request = 0, edges = [];
  const stateBadge = s => `<span class="pill ${s.tone}">${esc(s.label)}</span>${s.issue==='open'?'<span class="pill red">未解問題</span>':''}`;
  const entity = id => data?.entities?.find(e => e.id === id);
  const matched = e => Boolean(e);
  const scopeLabel = e => ({action:'MVP 行動型',history:'歷史調查型',shared:'雙 Agent 共用',unknown:'適用範圍待確認'}[e.agent_scope]);
  function mobileNeighbors(id,relations){
    const incoming=new Set(),outgoing=new Set();
    for(const r of relations||[]){if(r.target===id&&r.source!==id)incoming.add(r.source);if(r.source===id&&r.target!==id)outgoing.add(r.target);}
    return {incoming:[...incoming],outgoing:[...outgoing]};
  }
  // 一張圖說清楚 Agent 的工作方式：展示已記錄的設計意圖，不把示意圖當驗收證據。
  const architectureScenes={
    action:{
      eyebrow:'MVP ACTION AGENT · 即時異常決策分流架構',
      title:'AI 怎麼協助現場處理即時異常？',
      caption:'從設備即時資料找出異常、分流「需處理」與「不需處理」，在 Dashboard 呈現建議並由現場人員最終確認。',
      steps:[
        'A("取得設備即時資料")',
        'B("找出需要注意的異常")',
        'C("判斷是否需要處理")',
        'D("提出下一步建議")',
        'E("說明不需處理原因")',
        'F("在 Dashboard 顯示結果")',
        'G("由現場人員確認")',
        'A --> B --> C',
        'C -->|"需要處理"| D',
        'C -->|"不需要處理"| E',
        'D --> F',
        'E --> F',
        'F --> G',
        'class A,B,C,D,E,F step',
        'class G result'
      ]
    },
    history:{
      eyebrow:'HISTORICAL INVESTIGATION AGENT · 多輪調查與證據驗證架構',
      title:'AI 怎麼深入追查重複發生的異常？',
      caption:'發現問題後規劃調查方向，透過「調查迴圈」反覆查閱歷史紀錄、比對並驗證證據，最後整理交班摘要與下一步建議。',
      steps:[
        'A("發現重複異常")',
        'B("決定調查方向")',
        'C("查歷史維修紀錄")',
        'D("整理調查證據")',
        'E("判斷是否查得足夠")',
        'F("驗證分析結論")',
        'G("說明資料限制")',
        'H("整理分析與交班摘要")',
        'I("提出下一步建議")',
        'A --> B --> C --> D --> E',
        'E -->|"目前資料還不夠，值得再查"| B',
        'E -->|"資料足夠，進入驗證"| F',
        'F -->|"還不能下結論，要補資料"| B',
        'F -->|"資料互相矛盾，重檢假設"| B',
        'E -->|"已達調查限制"| G',
        'F -->|"結論有證據支持"| H',
        'G --> H',
        'H --> I',
        'class A,B,C,D,E,F,G,H step',
        'class I result'
      ]
    }
  };
  const architectureLayout={
    history:{
      size:[1400,544],
      zones:[
        {x:16,y:14,w:212,h:516,tag:'STAGE 01',title:'問題發現與原則',tone:'entry'},
        {x:242,y:14,w:724,h:516,tag:'STAGE 02 – 03 · INVESTIGATION LOOP',title:'核心調查迴圈（規劃・查詢・評估・驗證）',tone:'loop'},
        {x:1132,y:14,w:252,h:516,tag:'STAGE 04',title:'摘要與建議交付',tone:'output'}
      ],
      loopCourt:{x:256,y:62,w:696,h:452,badge:'↻ 調查迴圈（Investigation Loop）· 證據不足或發現矛盾時自動回到「02 決定調查方向」'},
      callouts:[
        {
          x:26,y:192,w:192,h:320,tone:'principles',
          kicker:'AI 調查三大原則',
          items:[
            ['01 多輪追查','資料不夠時自動重規劃方向，繼續查閱歷史紀錄。'],
            ['02 嚴格驗證','檢查結論是否有證據支持；若資料矛盾則重檢假設。'],
            ['03 誠實邊界','達調查限制時明確列出缺口，絕不硬湊已確認根因。']
          ]
        },
        {
          x:1144,y:94,w:228,h:82,tone:'guardrail',
          kicker:'人工決策邊界',
          title:'AI 整理證據，人員做決定',
          sub:'提供優先順序與方向，不自動派工或改機'
        }
      ],
      boxes:{
        A:{x:26,y:94,w:192,h:72,num:'01',title:'發現重複異常',sub:'從即時資料找出重複問題',variant:'entry'},
        B:{x:266,y:94,w:202,h:72,num:'02',title:'決定調查方向',sub:'規劃要先查哪些異常線索',variant:'planner',badge:'↻ 迴圈起點'},
        C:{x:500,y:94,w:202,h:72,num:'03',title:'查歷史維修紀錄',sub:'調閱過去維修與異常資料',variant:'step'},
        D:{x:734,y:94,w:206,h:72,num:'04',title:'整理調查證據',sub:'比對不同來源的資料線索',variant:'step'},
        E:{x:734,y:206,w:206,h:72,num:'05',title:'判斷是否查得足夠',sub:'評估現有證據是否足夠支持',variant:'decision'},
        F:{x:734,y:340,w:206,h:72,num:'06',title:'驗證分析結論',sub:'檢查結論有根據且無矛盾',variant:'decision'},
        G:{x:1144,y:206,w:228,h:72,num:'07',title:'說明資料限制',sub:'標示目前缺口，不硬下結論',variant:'limit'},
        H:{x:1144,y:340,w:228,h:72,num:'08',title:'整理分析與交班摘要',sub:'彙整異常、證據與已知限制',variant:'summary'},
        I:{x:1144,y:444,w:228,h:72,num:'09',title:'提出下一步建議',sub:'提供後續處理方向供現場決定',variant:'outcome'}
      },
      wires:[
        {d:'M218 130 H266',tone:'forward'},
        {d:'M468 130 H500',tone:'forward'},
        {d:'M702 130 H734',tone:'forward'},
        {d:'M837 166 V206',tone:'forward'},
        {d:'M734 242 H416 Q402 242 402 228 V166',tone:'loop',label:'↻ 目前資料還不夠，值得再查',lx:570,ly:242,pw:228,sub:'Path A · 繼續調查補充證據'},
        {d:'M837 278 V340',tone:'ok',label:'資料足夠，進入驗證',lx:837,ly:306,pw:156,ph:24},
        {d:'M734 376 H360 Q346 376 346 362 V166',tone:'loop',label:'↻ 還不能下結論，要補資料',lx:548,ly:376,pw:216,sub:'Path C · 驗證未通過重查'},
        {d:'M837 412 V464 Q837 478 823 478 H308 Q294 478 294 464 V166',tone:'loop',label:'↻ 資料互相矛盾，重新檢查假設',lx:554,ly:478,pw:242,sub:'Path D · 缺關鍵證據或矛盾'},
        {d:'M940 242 H1144',tone:'limit',label:'已達調查限制',lx:1042,ly:242,pw:122,sub:'Path E · 停止補查'},
        {d:'M940 376 H1144',tone:'ok',label:'結論有證據支持',lx:1042,ly:376,pw:134,sub:'Path E · 驗證通過'},
        {d:'M1258 278 V340',tone:'limit'},
        {d:'M1258 412 V444',tone:'ok'}
      ]
    },
    action:{
      size:[1400,500],
      zones:[
        {x:18,y:16,w:524,h:468,tag:'STAGE 01',title:'即時資料接收與異常偵測',tone:'entry'},
        {x:556,y:16,w:542,h:468,tag:'STAGE 02 · DECISION FLOW',title:'行動分流判斷（需處理 vs. 白名單不動作）',tone:'loop'},
        {x:1112,y:16,w:270,h:468,tag:'STAGE 03',title:'畫面呈現與人工確認',tone:'output'}
      ],
      callouts:[
        {
          x:34,y:296,w:492,h:156,tone:'action-bar',
          kicker:'MVP 行動型運作邊界（Single-Pass Decision Flow）',
          cols:[
            ['即時分流','直接依當下狀態分流，不跑多輪歷史追查。'],
            ['白名單透明','不需動作的異常仍顯示，並說明不動作原因。'],
            ['人工確認','AI 提供建議與理由，由現場人員最終決定。']
          ]
        }
      ],
      boxes:{
        A:{x:34,y:140,w:226,h:80,num:'01',title:'取得設備即時資料',sub:'接收機台目前的即時狀態',variant:'entry'},
        B:{x:300,y:140,w:226,h:80,num:'02',title:'找出需要注意的異常',sub:'合併重複訊號，鎖定異常事件',variant:'step'},
        C:{x:574,y:140,w:238,h:80,num:'03',title:'判斷是否需要處理',sub:'區分需立即處理或固定不動作',variant:'decision',badge:'決策分流點'},
        D:{x:858,y:66,w:224,h:80,num:'04A',title:'提出下一步建議',sub:'針對異常提供處理方向與理由',variant:'summary'},
        E:{x:858,y:256,w:224,h:80,num:'04B',title:'說明不需處理原因',sub:'符合白名單，標示不動作原因',variant:'limit'},
        F:{x:1128,y:140,w:240,h:80,num:'05',title:'Dashboard 顯示結果',sub:'同步呈現異常、建議與判斷依據',variant:'summary'},
        G:{x:1128,y:344,w:240,h:84,num:'06',title:'由現場人員確認',sub:'由人員決定是否採用，不自動派工',variant:'outcome'}
      },
      wires:[
        {d:'M260 180 H300',tone:'forward'},
        {d:'M526 180 H574',tone:'forward'},
        {d:'M693 140 V118 Q693 106 705 106 H858',tone:'ok',label:'✓ 需要處理',lx:772,ly:106,pw:112},
        {d:'M693 220 V284 Q693 296 705 296 H858',tone:'limit',label:'— 不需要處理',lx:772,ly:296,pw:126},
        {d:'M1082 106 H1098 Q1108 106 1108 116 V166 Q1108 172 1114 172 H1128',tone:'ok'},
        {d:'M1082 296 H1098 Q1108 296 1108 286 V194 Q1108 188 1114 188 H1128',tone:'limit'},
        {d:'M1248 220 V344',tone:'ok',label:'人工確認後執行',lx:1248,ly:280,pw:136}
      ]
    }
  };
  const architectureMobileLayout={
    history:{
      size:[370,1190],
      zones:[
        {x:10,y:10,w:350,h:118,tag:'STAGE 01 · 問題發現',title:''},
        {x:10,y:140,w:350,h:642,tag:'STAGE 02 – 03 · 調查迴圈',title:'資料不足或矛盾，就回到 02 再查',tone:'loop'},
        {x:10,y:816,w:350,h:362,tag:'STAGE 04 · 摘要與下一步建議',title:'完成調查或達調查上限後整理交付',tone:'output'}
      ],
      boxes:{
        A:{x:24,y:48,w:322,h:64,num:'01',title:'發現重複異常',sub:'從即時資料找出重複發生的問題',variant:'entry'},
        B:{x:76,y:198,w:270,h:64,num:'02',title:'決定調查方向',sub:'規劃要先查哪些異常線索',variant:'planner',badge:'↻ 迴圈起點'},
        C:{x:76,y:288,w:270,h:64,num:'03',title:'查歷史維修紀錄',sub:'調閱過去維修與異常資料',variant:'step'},
        D:{x:76,y:378,w:270,h:64,num:'04',title:'整理調查證據',sub:'比對不同來源的資料線索',variant:'step'},
        E:{x:76,y:468,w:270,h:64,num:'05',title:'判斷是否查得足夠',sub:'評估現有證據是否足夠支持',variant:'decision'},
        F:{x:76,y:620,w:270,h:64,num:'06',title:'驗證分析結論',sub:'檢查結論有根據且無矛盾',variant:'decision'},
        G:{x:24,y:912,w:236,h:64,num:'07',title:'說明資料限制',sub:'標示缺口，不硬下結論',variant:'limit'},
        H:{x:24,y:1004,w:322,h:64,num:'08',title:'整理分析與交班摘要',sub:'彙整異常、驗證過的證據與已知限制',variant:'summary'},
        I:{x:24,y:1096,w:322,h:66,num:'09',title:'提出下一步建議',sub:'提供後續處理方向，由現場人員決定',variant:'outcome'}
      },
      wires:[
        {d:'M185 112 V124 Q185 130 191 130 H205 Q211 130 211 136 V198',tone:'forward'},
        {d:'M211 262 V288',tone:'forward'},
        {d:'M211 352 V378',tone:'forward'},
        {d:'M211 442 V468',tone:'forward'},
        {d:'M216 532 V558 H48 Q38 558 38 548 V238 Q38 228 48 228 H76',tone:'loop',label:'↻ 資料還不夠，值得再查',lx:140,ly:558,pw:176},
        {d:'M292 532 V620',tone:'ok',label:'資料足夠，驗證',lx:292,ly:590,pw:116},
        {d:'M286 684 V712 H48 Q38 712 38 702 V238 Q38 228 48 228 H76',tone:'loop',label:'↻ 還不能下結論，要補資料',lx:208,ly:712,pw:192},
        {d:'M92 684 V752 H30 Q22 752 22 742 V218 Q22 208 30 208 H76',tone:'loop',label:'↻ 資料互相矛盾，重檢假設',lx:208,ly:752,pw:196},
        {d:'M346 500 H354 V878 H142 V912',tone:'limit',label:'已達調查限制',lx:142,ly:878,pw:116},
        {d:'M312 684 V1004',tone:'ok',label:'結論有根據',lx:308,ly:944,pw:96},
        {d:'M142 976 V1004',tone:'limit'},
        {d:'M185 1068 V1096',tone:'ok'}
      ]
    },
    action:{
      size:[370,766],
      zones:[
        {x:10,y:10,w:350,h:204,tag:'STAGE 01 · 即時資料與異常偵測',title:''},
        {x:10,y:226,w:350,h:304,tag:'STAGE 02 · 決策分流',title:'判斷需不需要處理',tone:'loop'},
        {x:10,y:544,w:350,h:210,tag:'STAGE 03 · 結果交付',title:'',tone:'output'}
      ],
      boxes:{
        A:{x:24,y:46,w:322,h:64,num:'01',title:'取得設備即時資料',sub:'接收機台目前的即時狀態',variant:'entry'},
        B:{x:24,y:134,w:322,h:64,num:'02',title:'找出需要注意的異常',sub:'合併重複訊號，鎖定異常事件',variant:'step'},
        C:{x:24,y:280,w:322,h:64,num:'03',title:'判斷是否需要處理',sub:'區分需立即處理或固定不動作',variant:'decision',badge:'決策分流'},
        D:{x:20,y:410,w:160,h:90,num:'04A',title:'提出下一步建議',sub:'提供處理方向與理由',variant:'summary',numTop:true},
        E:{x:190,y:410,w:160,h:90,num:'04B',title:'說明不需處理原因',sub:'白名單標示不動作',variant:'limit',numTop:true},
        F:{x:24,y:582,w:322,h:64,num:'05',title:'在 Dashboard 顯示結果',sub:'同步呈現異常、建議與判斷依據',variant:'summary'},
        G:{x:24,y:672,w:322,h:68,num:'06',title:'由現場人員確認',sub:'由人員決定是否採用，不自動派工',variant:'outcome'}
      },
      wires:[
        {d:'M185 110 V134',tone:'forward'},
        {d:'M185 198 V280',tone:'forward'},
        {d:'M185 344 V364',tone:'forward',noArrow:true},
        {d:'M185 364 H112 Q100 364 100 376 V410',tone:'ok',label:'✓ 需要處理',lx:100,ly:390,pw:104},
        {d:'M185 364 H258 Q270 364 270 376 V410',tone:'limit',label:'— 不需要處理',lx:270,ly:390,pw:116},
        {d:'M100 500 V518 Q100 530 112 530 H173 Q185 530 185 542',tone:'ok',noArrow:true},
        {d:'M270 500 V518 Q270 530 258 530 H197 Q185 530 185 542',tone:'limit',noArrow:true},
        {d:'M185 542 V582',tone:'forward'},
        {d:'M185 646 V672',tone:'ok'}
      ]
    }
  };
  function architectureShowcase(scope,source,isMobile=false){
    const spec=(isMobile?architectureMobileLayout:architectureLayout)[scope];
    const [W,H]=spec.size;
    const svgEsc=s=>esc(s);
    const markerFor=tone=>tone==='loop'?'url(#arch-arrow-loop)':tone==='ok'?'url(#arch-arrow-ok)':tone==='limit'?'url(#arch-arrow-limit)':'url(#arch-arrow)';
    const zonesHtml=(spec.zones||[]).map(z=>{
      const isLoop=z.tone==='loop',isOut=z.tone==='output';
      const stroke=isLoop?'#255985':isOut?'#1f5c54':'#18324a';
      const fill=isLoop?'url(#arch-zone-loop)':isOut?'url(#arch-zone-out)':'url(#arch-zone-base)';
      const tagColor=isLoop?'#f5be6b':isOut?'#63e2b7':'#7cc4fa';
      return `<g class="arch-zone ${z.tone||''}">`+
        `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="${isLoop?1.5:1.1}"/>`+
        `<text x="${z.x+16}" y="${z.y+22}" class="arch-zone-tag" fill="${tagColor}">${svgEsc(z.tag)}</text>`+
        (z.title?`<text x="${z.x+(isMobile?16:z.w-16)}" y="${z.y+(isMobile?40:22)}" text-anchor="${isMobile?'start':'end'}" class="arch-zone-title">${svgEsc(z.title)}</text>`:'')+
      `</g>`;
    }).join('');
    const loopCourtHtml=spec.loopCourt?`<g class="arch-loop-court">`+
      `<rect x="${spec.loopCourt.x}" y="${spec.loopCourt.y}" width="${spec.loopCourt.w}" height="${spec.loopCourt.h}" rx="14" fill="rgba(12,34,58,0.38)" stroke="#2e6798" stroke-width="1.3" stroke-dasharray="6 4"/>`+
      `<rect x="${spec.loopCourt.x+14}" y="${spec.loopCourt.y-13}" width="510" height="25" rx="12.5" fill="#0b2138" stroke="#3b7ab0" stroke-width="1.2"/>`+
      `<text x="${spec.loopCourt.x+28}" y="${spec.loopCourt.y}" dominant-baseline="central" class="arch-loop-badge-text">${svgEsc(spec.loopCourt.badge)}</text>`+
    `</g>`:'';
    const calloutsHtml=(spec.callouts||[]).map(c=>{
      if(c.tone==='principles'){
        const rows=c.items.map(([head,desc],idx)=>{
          const ry=c.y+54+idx*88;
          return `<g class="arch-principle-row">`+
            `<rect x="${c.x+12}" y="${ry}" width="${c.w-24}" height="76" rx="10" fill="#081829" stroke="#1c3b57" stroke-width="1"/>`+
            `<text x="${c.x+22}" y="${ry+22}" class="arch-principle-head">${svgEsc(head)}</text>`+
            `<text x="${c.x+22}" y="${ry+44}" class="arch-principle-desc">${svgEsc(desc.slice(0,13))}</text>`+
            `<text x="${c.x+22}" y="${ry+62}" class="arch-principle-desc">${svgEsc(desc.slice(13))}</text>`+
          `</g>`;
        }).join('');
        return `<g class="arch-callout principles">`+
          `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="#061220" stroke="#1d3c58" stroke-width="1.2"/>`+
          `<text x="${c.x+16}" y="${c.y+28}" class="arch-callout-kicker">${svgEsc(c.kicker)}</text>`+
          rows+
        `</g>`;
      }
      if(c.tone==='guardrail'){
        return `<g class="arch-callout guardrail">`+
          `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="#071f24" stroke="#265e63" stroke-width="1.2" stroke-dasharray="4 3"/>`+
          `<text x="${c.x+16}" y="${c.y+23}" class="arch-callout-kicker" fill="#63e2b7">${svgEsc(c.kicker)}</text>`+
          `<text x="${c.x+16}" y="${c.y+46}" class="arch-guardrail-title">${svgEsc(c.title)}</text>`+
          `<text x="${c.x+16}" y="${c.y+66}" class="arch-guardrail-sub">${svgEsc(c.sub)}</text>`+
        `</g>`;
      }
      if(c.tone==='action-bar'){
        const colW=Math.floor((c.w-36)/3);
        const cols=c.cols.map(([head,desc],idx)=>{
          const cx=c.x+10+idx*(colW+8);
          return `<g>`+
            `<rect x="${cx}" y="${c.y+42}" width="${colW}" height="92" rx="10" fill="#081829" stroke="#1c3b57" stroke-width="1"/>`+
            `<text x="${cx+10}" y="${c.y+64}" class="arch-principle-head">${svgEsc(head)}</text>`+
            `<text x="${cx+10}" y="${c.y+86}" class="arch-principle-desc">${svgEsc(desc.slice(0,11))}</text>`+
            `<text x="${cx+10}" y="${c.y+104}" class="arch-principle-desc">${svgEsc(desc.slice(11,22))}</text>`+
            (desc.length>22?`<text x="${cx+10}" y="${c.y+122}" class="arch-principle-desc">${svgEsc(desc.slice(22))}</text>`:'')+
          `</g>`;
        }).join('');
        return `<g class="arch-callout action-bar">`+
          `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="#061220" stroke="#1d3c58" stroke-width="1.2"/>`+
          `<text x="${c.x+14}" y="${c.y+25}" class="arch-callout-kicker">${svgEsc(c.kicker)}</text>`+
          cols+
        `</g>`;
      }
      return '';
    }).join('');
    const pathsHtml=spec.wires.map(w=>{
      const tone=w.tone||'forward';
      const pillH=w.ph||(w.sub&&!isMobile?38:26);
      const pillY=w.ly?w.ly-pillH/2:0;
      const pillX=w.lx?w.lx-(w.pw||130)/2:0;
      return `<g class="arch-wire-group ${tone}">`+
        `<path class="architecture-wire ${tone}" d="${w.d}"${w.noArrow?'':` marker-end="${markerFor(tone)}"`}/>`+
        (w.label?`<g class="architecture-branch ${tone}">`+
          `<rect x="${pillX}" y="${pillY}" width="${w.pw||130}" height="${pillH}" rx="${pillH/2}"/>`+
          `<text x="${w.lx}" y="${w.sub&&!isMobile?pillY+13:w.ly}" text-anchor="middle" dominant-baseline="central" class="branch-main">${svgEsc(w.label)}</text>`+
          (w.sub&&!isMobile?`<text x="${w.lx}" y="${pillY+28}" text-anchor="middle" dominant-baseline="central" class="branch-sub">${svgEsc(w.sub)}</text>`:'')+
        `</g>`:'')+
      `</g>`;
    }).join('');
    const nodesHtml=Object.entries(spec.boxes).map(([id,b])=>{
      const {x,y,w,h,num,title,sub,variant,badge,numTop}=b;
      const isOutcome=variant==='outcome';
      const badgeW=badge?badge.length*11+18:0;
      // 手機版將角色膠囊放在卡片內，避免壓住上一行的 STAGE 說明。
      const badgeY=isMobile?y+8:y-10;
      if(numTop){
        return `<g class="node ${variant||'step'} ${isOutcome?'outcome':''}" data-arch-node="${id}">`+
          `<rect class="node-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="15"/>`+
          `<line class="node-highlight" x1="${x+14}" y1="${y+1}" x2="${x+w-14}" y2="${y+1}"/>`+
          `<rect class="node-num-bg" x="${x+12}" y="${y+10}" width="${num.length>2?36:28}" height="20" rx="6"/>`+
          `<text class="node-num" x="${x+12+(num.length>2?18:14)}" y="${y+20}" text-anchor="middle" dominant-baseline="central">${svgEsc(num)}</text>`+
          `<text class="node-title" x="${x+12}" y="${y+47}" dominant-baseline="central">${svgEsc(title)}</text>`+
          `<text class="node-sub" x="${x+12}" y="${y+71}" dominant-baseline="central">${svgEsc(sub||'')}</text>`+
        `</g>`;
      }
      return `<g class="node ${variant||'step'} ${isOutcome?'outcome':''}" data-arch-node="${id}">`+
        `<rect class="node-card" x="${x}" y="${y}" width="${w}" height="${h}" rx="15"/>`+
        `<line class="node-highlight" x1="${x+14}" y1="${y+1}" x2="${x+w-14}" y2="${y+1}"/>`+
        `<rect class="node-num-bg" x="${x+12}" y="${y+13}" width="${num.length>2?36:28}" height="22" rx="7"/>`+
        `<text class="node-num" x="${x+12+(num.length>2?18:14)}" y="${y+24}" text-anchor="middle" dominant-baseline="central">${svgEsc(num)}</text>`+
        (badge?`<rect class="node-role-pill" x="${x+w-badgeW-10}" y="${badgeY}" width="${badgeW}" height="20" rx="10"/><text class="node-role-text" x="${x+w-badgeW/2-10}" y="${badgeY+10}" text-anchor="middle" dominant-baseline="central">${svgEsc(badge)}</text>`:'')+
        `<text class="node-title" x="${x+(num.length>2?56:48)}" y="${y+24}" dominant-baseline="central">${svgEsc(title)}</text>`+
        `<text class="node-sub" x="${x+14}" y="${y+51}" dominant-baseline="central">${svgEsc(sub||'')}</text>`+
      `</g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="presentation">`+
      `<defs>`+
        `<linearGradient id="arch-zone-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#071525" stop-opacity="0.88"/><stop offset="100%" stop-color="#040c16" stop-opacity="0.92"/></linearGradient>`+
        `<linearGradient id="arch-zone-loop" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a2139" stop-opacity="0.92"/><stop offset="100%" stop-color="#051222" stop-opacity="0.95"/></linearGradient>`+
        `<linearGradient id="arch-zone-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#072227" stop-opacity="0.88"/><stop offset="100%" stop-color="#041217" stop-opacity="0.94"/></linearGradient>`+
        `<linearGradient id="arch-card-step" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#122f50"/><stop offset="100%" stop-color="#0b1f36"/></linearGradient>`+
        `<linearGradient id="arch-card-planner" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#163b63"/><stop offset="100%" stop-color="#0d2642"/></linearGradient>`+
        `<linearGradient id="arch-card-decision" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#17385c"/><stop offset="100%" stop-color="#0e243d"/></linearGradient>`+
        `<linearGradient id="arch-card-limit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2c2216"/><stop offset="100%" stop-color="#1b150e"/></linearGradient>`+
        `<linearGradient id="arch-card-summary" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0e3345"/><stop offset="100%" stop-color="#092230"/></linearGradient>`+
        `<linearGradient id="arch-card-outcome" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0d3b36"/><stop offset="100%" stop-color="#072422"/></linearGradient>`+
        `<marker id="arch-arrow" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 1 L9 5 L0 9 L2.2 5 Z" fill="#89b8e0"/></marker>`+
        `<marker id="arch-arrow-loop" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 1 L9 5 L0 9 L2.2 5 Z" fill="#f5be6b"/></marker>`+
        `<marker id="arch-arrow-ok" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 1 L9 5 L0 9 L2.2 5 Z" fill="#5ce1b6"/></marker>`+
        `<marker id="arch-arrow-limit" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 1 L9 5 L0 9 L2.2 5 Z" fill="#e5a95c"/></marker>`+
      `</defs>`+
      zonesHtml+loopCourtHtml+calloutsHtml+pathsHtml+nodesHtml+
    `</svg>`;
  }
  let graphRenderToken=0,graphSize=null,mermaidReady=false;
  function fit(){
    if(viewName!=='architecture'||!graphSize)return;
    const canvas=$('#canvas'),graph=$('#graph'),svg=graph.querySelector('svg');
    if(!svg)return;
    const r=canvas.getBoundingClientRect(),w=graphSize.width,h=graphSize.height;
    if(!r.width)return;
    if(mobile()){
      const mScale=Math.max(0.78,Math.min(1.08,(r.width-8)/w));
      graph.style.width=Math.round(w*mScale)+'px';
      graph.style.height=Math.round(h*mScale)+'px';
      svg.style.width='100%';svg.style.height='100%';svg.style.maxWidth='none';
      return;
    }
    if(!r.height)return;
    const scale=Math.min(1.35,(r.width-20)/w,(r.height-12)/h);
    graph.style.width=Math.round(w*scale)+'px';
    graph.style.height=Math.round(h*scale)+'px';
    svg.style.width='100%';svg.style.height='100%';svg.style.maxWidth='none';
  }
  function highlight(){} // 其餘頁面沿用詳情狀態；展示圖不做節點高亮。
  async function renderGraph(){
    if(!data)return;
    const token=++graphRenderToken;
    const scope=$('#agent').value==='history'?'history':'action';
    const scene=architectureScenes[scope];
    const eyebrowEl=document.querySelector('.arch-eyebrow');
    if(eyebrowEl&&scene.eyebrow)eyebrowEl.textContent=scene.eyebrow;
    $('#graph-heading').textContent=scene.title;
    $('#count').textContent=scene.caption;
    const isMob=mobile();
    const source=[
      isMob?'flowchart TB':'flowchart LR',
      ...scene.steps,
      'classDef step fill:#0e2a49,stroke:#284b6a,color:#bddcf5,stroke-width:1.4px',
      'classDef result fill:#09263e,stroke:#437498,color:#c8e8ff,stroke-width:1.6px',
      'linkStyle default stroke:#8799a7,stroke-width:1.3px'
    ].join('\n');
    $('#graph').innerHTML=architectureShowcase(scope,source,isMob);
    const box=$('#graph svg')?.viewBox?.baseVal;
    graphSize={width:Math.max(200,box?.width||1400),height:Math.max(180,box?.height||544)};
    if(viewName==='architecture')fit();
    if(!window.PihMermaid)return;
    try{
      if(!mermaidReady){
        window.PihMermaid.initialize({
          startOnLoad:false,securityLevel:'strict',theme:'base',
          themeVariables:{
            background:'#020507',primaryColor:'#0e2a49',primaryTextColor:'#bddcf5',
            primaryBorderColor:'#284b6a',lineColor:'#8799a7',
            fontFamily:'PingFang TC, Noto Sans TC, sans-serif',fontSize:'19px'
          },
          flowchart:{htmlLabels:false,curve:'basis',nodeSpacing:64,rankSpacing:38,padding:18}
        });
        mermaidReady=true;
      }
      await window.PihMermaid.render('pih-simple-architecture-'+token,source);
    }catch(err){
      console.error('Mermaid 驗證略過',err);
    }
  }
  const step=(n,title,body,open=false)=>`<details ${open?'open':''}><summary>${n}. ${title}</summary>${body}</details>`;
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
    if(id){const ns=mobileNeighbors(id,data.relationships);content.insertAdjacentHTML('afterbegin',`<section class="one-hop" aria-label="相關功能"><b>${esc(entity(id)?.title)}</b>${[['incoming','⬅ 上游輸入來源'],['outgoing','➡ 下游呼叫／輸出']].map(([dir,label])=>`<div><h3>${label}</h3>${ns[dir].filter(x=>entity(x)).map(x=>`<button class="logic-chip" data-jump="${esc(x)}">${esc(entity(x).title)}</button>`).join('')||'<p>尚無關係紀錄</p>'}</div>`).join('')}<small>這是紀錄中的關係</small></section>`);}
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
        step(1,'用途',`<p>${esc(e.plain_summary.purpose)}</p><p>邊界：${esc(e.plain_summary.limits)}</p>`,true)+
        step(2,'如何運作',`<dl>${Object.entries(e.responsibility).map(([k,v])=>pair(({role_type:'角色',input:'輸入',process:'處理',output:'輸出'})[k],v)).join('')}</dl>${e.relationships.map(r=>`<button class="jump" data-jump="${esc(r.entity_id)}">${r.direction==='incoming'?'← 來自':'→ 前往'} ${esc(entity(r.entity_id)?.title||r.entity_id)}</button>`).join('')||'<p>尚無明確模組關係紀錄。</p>'}`)+
        step(3,'完成情況',`<dl>${[['實作',s.implementation],['核心成果',s.label],['驗證',s.validation],['尚缺驗收',s.remaining_validation],['問題',s.issue],['批准',s.approval],['證據分類',s.evidence_type]].map(([k,v])=>pair(k,v)).join('')}</dl>`)+
        step(4,'技術資訊',`<dl>${Object.entries(e.technical_details).map(([k,v])=>pair(k,v)).join('')}</dl>`)+
        step(5,'參考紀錄',evidence(h.events)+`<h3>修改紀錄</h3>${h.versions.map(v=>`<p>#${v.sequence} · 收錄 ${esc(v.recorded_at)}<br>${esc(v.change_reason)}</p>`).join('')||(e.id.startsWith('projection:')?'<p>這是從既有資料整理的內容。</p>':'<p>來自架構紀錄。</p>')}`);
    }else if(g){title=g.title;body=step(1,'用途',`<p>${esc(g.summary)}</p><p>${esc(g.basis)}；不將分群標記為整體完成。</p>`,true)+step(2,'探索模組',g.members.filter(id=>matched(entity(id))).map(id=>{const e=entity(id);return `<button class="jump" data-jump="${esc(id)}">${esc(e.title)} ${stateBadge(e.state)}</button>`;}).join(''),true)+step(3,'完成情況','<p>各模組分別保留核心成果、驗收與問題。請選取模組查看。</p>')+step(4,'技術資訊','<p>這是功能分類，不是執行流程。</p>')+step(5,'參考紀錄','<p>來源依各模組分別保存，請點擊模組追溯。</p>');
    }else if(edge){title='模組之間的關係';const raw=edge.members?data.relationships.filter(e=>edge.members.includes(e.id)):[edge];body=step(1,'用途',`<p>${esc(edge.label)}</p><p>${edge.confidence==='documented'?'有來源描述；不是獨立程式驗證。':'推論／規劃或來源不足，尚未確認。'}</p>`,true)+step(2,'方向與相連模組',raw.map(e=>`<button class="jump" data-jump="${esc(e.source)}">來源：${esc(entity(e.source)?.title)}</button><button class="jump" data-jump="${esc(e.target)}">目標：${esc(entity(e.target)?.title)}</button><p>${esc(e.label)}</p>`).join(''),true)+step(3,'完成情況','<p>關係存在於文件不表示執行路徑已驗收。</p>')+step(4,'技術資訊',`<p>${esc(raw.map(e=>e.type).join('、'))}</p>`)+step(5,'參考紀錄',evidence(raw.flatMap(e=>e.events)));}
    else return;
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close" aria-label="關閉詳情">✕ 關閉</button><div class="eyebrow">功能說明${autoSync?' · 步驟自動連動':''}</div><h2>${esc(title)}</h2></div>${body}`;
    $('#drawer').classList.add('open');$('#drawer').classList.toggle('auto-synced',Boolean(autoSync));$('#drawer').scrollTop=0;highlight();highlightLogicChips(id);highlightEvolutionChips(id,null);if(focus)$('#close').focus();
    enhanceMobileDrawer(e?.id);syncSheet();
  }
  function close(){selected=null;$('#drawer').classList.remove('open','auto-synced','sheet-full');$('#drawer').innerHTML='<div class="drawer-empty"><span>↗</span><h2>選擇功能</h2><p>查看用途與相關紀錄。</p></div>';syncSheet();highlight();highlightLogicChips();highlightEvolutionChips();if(origin?.isConnected)origin.focus({preventScroll:true});}
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
  async function load(){const token=++request;$('#notice').textContent='載入中…';try{const currentAgent=$('#agent').value==='history'?'history':'action';const params=new URLSearchParams({agent:currentAgent});if(currentAsOf)params.set('as_of',currentAsOf);let d;const localSnapshot=$('#workspace-knowledge');if(window.__V2_STATIC_BUNDLE__){let saved=window.__V2_STATIC_BUNDLE__.views?.[currentAgent]?.[currentAsOf||'latest'];if(!saved&&currentAsOf&&window.__V2_STATIC_BUNDLE__.paths?.[currentAgent]?.[currentAsOf]){const response=await fetch(new URL(window.__V2_STATIC_BUNDLE__.paths[currentAgent][currentAsOf],document.baseURI));if(!response.ok)throw Error('歷史時間切面下載失敗');saved=await response.json();window.__V2_STATIC_BUNDLE__.views[currentAgent][currentAsOf]=saved;}if(!saved&&currentAsOf){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;saved=window.__V2_STATIC_BUNDLE__.views?.[currentAgent]?.['latest'];}if(!saved)throw Error('此時間切面未收錄於靜態封存');d=structuredClone(saved);}else{let r=await fetch('/api/v2/knowledge?'+params);if(!r.ok&&currentAsOf){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;params.delete('as_of');r=await fetch('/api/v2/knowledge?'+params);}d=await r.json();if(!r.ok)throw Error(d.error||'資料讀取失敗');if(currentAsOf&&d.evolution){const validCps=(d.evolution.as_of_checkpoints||d.evolution.all_checkpoints||[]).map(c=>c.as_of);if(!validCps.includes(currentAsOf)){currentAsOf='';const u=new URL(location.href);u.searchParams.delete('as_of');history.replaceState(null,'',u);params.delete('as_of');const refetch=await fetch('/api/v2/knowledge?'+params);d=await refetch.json();if(!refetch.ok)throw Error(d.error||'資料讀取失敗');asOfNotice=`已自動返回最新切面（原時間切面於「${currentAgent==='action'?'MVP 行動型':'歷史調查型'}」不適用）`;}}}if(token!==request)return;data=d;if(currentAgent==='action'&&d.agent_logic?.workflows?.some(w=>w.id==='mvp_action_workflow')){$('#logic-type').value='design_workflow';logicId='mvp_action_workflow';logicIndex=0;logicAll=false;}selected=null;close();const s=d.summary||{};$('#stats').innerHTML=[['核心已實現',s.core_achieved??0],['待確認',s.pending??0],['未解問題',s.open_issues??0],['下一步',s.next_steps??0]].map(([t,n])=>`<div class="stat"><span>${t}</span><strong>${n}</strong></div>`).join('');$('#stats').title=s.basis||'';$('#notice').textContent=(currentAsOf?`時間切面（as_of: ${currentAsOf}）· `:'')+'資料來自開發紀錄';const m=d.provenance_manifest||{};renderFreshness();renderGraph();renderLogic();renderEvolution();renderProgress();if(!window.__V2_STATIC_BUNDLE__)refreshClosure().catch(()=>{});}catch(e){if(token!==request)return;$('#notice').textContent='無法讀取：'+e.message;}}
  // ---- Agent Logic: manual Design Walkthrough (never a runtime trace; no timers, durations or autoplay). ----
  const DEFAULT_SYNTHETIC_NOTICE='目前沒有教學範例。';
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
  // 搜尋已停用；所有現有紀錄直接呈現，原本的分類與狀態切換保留。
  const query=()=>'';
  const searchLogic=()=>true;
  const hl=v=>esc(v);
  const currentMaterial=()=>logicMaterials().find(m=>m.id===logicId);
  const valueBlock=(title,values,cls='')=>`<section class="io-block ${cls}"><h4>${esc(title)}</h4>${values?.filter(Boolean).length?values.filter(Boolean).map(v=>`<p>${hl(v)}</p>`).join(''):'<p class="logic-unknown">尚無紀錄</p>'}</section>`;
  const confidencePill=s=>s?.step_confidence==='documented'?'<span class="pill green">有來源紀錄</span>':'<span class="pill amber">來源不完整</span>';
  const linkLabel=s=>s?.next_step_status==='connected'?'有來源順序':s?.next_step_status==='data_cutoff'?'⚠ 後續未取得資料':'下一步待確認';
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
      return `<div class="logic-io-compact io-basis" role="note">ℹ️ 輸入和輸出尚無完整紀錄。</div>`;
    }
    return `<div class="logic-io has-content" style="grid-template-columns:repeat(${Math.min(cols.length,3)},minmax(0,1fr))" aria-label="輸入、處理與條件、輸出">${cols.map(([t,vals])=>`<section class="io-block"><h4>${esc(t)}</h4>${vals.map(v=>`<p>${hl(v)}</p>`).join('')}</section>`).join('')}</div><p class="io-basis">ℹ️ 資料完整度：${esc(io.status||'partial')} · ${esc(io.mapping_basis||'')}</p>`;
  }
  function logicCard(s){
    const relIds=s?.related_entity_ids||[];
    const chips=relIds.map(id=>`<button class="logic-chip" data-jump="${esc(id)}">↗ ${esc(entity(id)?.title||id)}</button>`).join('');
    const mentions=(s?.actor_mentions||[]).map(m=>`<span class="pill gray" title="${esc(m.note)}">提到： ${esc(logicRoles[m.role]||m.role)}（${esc((m.tokens||[]).join('、'))}）</span>`).join('');
    const notes=(s?.scope_notes||[]).map(n=>`<p><b>${esc(n.field)}</b>：${hl(n.text)}</p>`).join('');
    const roleUnknown=!s?.actor_role||s.actor_role==='unknown';
    const rolePill=`<span class="pill role ${roleUnknown?'gray':'blue'}" title="${roleUnknown?'來源未明確記載此步驟由誰執行':s.actor_role_basis==='source_backed_design_projection'?'依對話正文重建的設計角色，非程式執行驗證':'來源已有紀錄'}">${roleUnknown?'角色未記載':'負責：'+esc(logicRoles[s.actor_role]||s.actor_role)}</span>`;
    const evRefs=s?.evidence_refs||[];
    const gaps=s?.gaps||[];
    return `<article class="logic-card" data-step-card="${esc(s.step_id)}"><div class="logic-card-heading"><div class="logic-card-meta"><span class="eyebrow">步驟 ${s.ordinal}${s.reading_group?' · '+esc(groupTitle(s.reading_group)):''}</span>${confidencePill(s)}${rolePill}${mentions}</div><h2>${hl(s.title)}</h2></div>`+
      `<div class="logic-summary story-lead">${hl(s.plain_summary)}</div>`+
      logicIoSection(s)+
      `<div class="logic-links"><span class="logic-links-label">相關功能：</span>${chips||'<span class="logic-muted-inline">尚無相關功能紀錄</span>'}</div>`+
      (notes?`<details class="logic-context-accordion logic-scope-notes"><summary>適用範圍</summary>${notes}</details>`:'')+
      `<details class="logic-context-accordion logic-evidence"><summary>來源紀錄（${evRefs.length} 筆來源證據${gaps.length?` · ${gaps.length} 項缺口註記`:''}）</summary>${evRefs.map((r,i)=>`<button class="logic-chip source-chip" data-logic-source="${i}" data-logic-source-step="${esc(s.step_id)}">${esc(r.display_date||'日期未知')} · 精度 ${esc(r.date_precision)} · ${esc(r.evidence_type)} · ${esc(r.coverage)}<small>${esc(r.title)}</small></button>`).join('')||'<p>來源未記載</p>'}${gaps.length?`<div class="logic-gaps-inline">${gaps.map(g=>`<span class="pill amber">缺口：${esc(g)}</span>`).join('')}</div>`:''}<p class="logic-break ${s.next_step_status==='connected'?'connected':''}">${s.next_step_status==='connected'?'↓ 記錄中的下一步':'⚠ '+esc(s.break_reason)}</p></details></article>`;
  }
  const breakpoint=()=>`<article class="logic-breakpoint" role="note"><h3>⚠ 後續未取得資料</h3><p>後續流程尚無紀錄。</p></article>`;
  function casePanel(m){
    const ctx=m?.assessment_context||{};
    const causes=m?.cause_assessments||[];
    const gaps=ctx.data_gaps||[],vals=ctx.validation_evidence||[];
    return `<section class="case-panel"><div class="case-panel-head"><h3>案例分析與證據</h3><span class="scope">${esc(m.input_snapshot_notice)} · 未綁定 Job · ${esc(m.display_date)}</span></div>`+
      `<div class="case-compare"><section class="io-block support"><h4>支持的證據</h4><p>${hl(m.support||'來源未記載')}</p></section><section class="io-block counter"><h4>不支持的證據</h4><p>${hl(m.counter_evidence||'來源未記載')}</p></section></div>`+
      `<div class="cause-grid">${causes.map(c=>`<article class="cause-card"><div class="cause-card-top"><h4>${esc(c.category_label||c.category)} <small>${esc(c.category)}</small></h4><span class="pill amber">${esc(c.status)}</span></div><p>${hl(c.detail)}</p><small>${esc(c.evidence_type)} · ${esc(c.source_record)}</small></article>`).join('')||'<p class="logic-muted-inline">來源未記載</p>'}</div>`+
      `<div class="case-compare"><section class="io-block"><h4>結論與下一步</h4><p>${hl(m.conclusion||'來源未記載')}${m.next_step?`\n下一步（來源回報）：${hl(m.next_step)}`:''}</p></section><section class="io-block unknowns"><h4>還不知道的事</h4><p>${hl(m.unknowns||'來源未記載')}</p></section></div>`+
      `<details class="logic-context-accordion case-context"><summary>其他背景（${gaps.length} 項資料缺口 · ${vals.length} 項驗證證據）</summary><p class="io-basis">${esc(ctx.basis||'')} · 評估批次 ${esc(ctx.assessment_id||'未記載')} · 收錄 ${esc(ctx.assessment_captured_at||'未記載')}</p><h4>缺少的資料</h4>${gaps.map(g=>`<p><b>${hl(g.title)}</b> · ${esc(g.status)}<br>${hl(g.why)}<br><small>${esc(g.evidence_type)} · ${esc(g.source_record)}</small></p>`).join('')||'<p>來源未記載</p>'}<h4>測試結果</h4>${vals.map(v=>`<p><b>${hl(v.title)}</b> · ${hl(v.result)}<br><small>${esc(v.display_date)}（原文日期，無年份）· ${esc(v.evidence_type)} · ${esc(v.source_record)}</small></p>`).join('')||'<p>來源未記載</p>'}</details></section>`;
  }
  function renderTrackBar(){
    const lg=logicData(),ag=$('#agent')?.value==='history'?'history':'action';
    const filterScope=list=>(list||[]).filter(m=>ag==='action'?(m.agent_scope==='action'||m.agent_scope==='shared'):(m.agent_scope==='history'||m.agent_scope==='shared'||m.agent_scope==='unknown'));
    const c=filterScope(lg.cases)[0],workflows=filterScope(lg.workflows),w=workflows.find(w=>w.id==='mvp_action_workflow'&&ag==='action')||workflows[0];
    const curType=$('#logic-type')?.value||'case_report';
    const tracks=[
      ...(w?[{type:'design_workflow',id:w.id,label:'運作流程',active:curType==='design_workflow',title:w.title}]:[]),
      ...(c?[{type:'case_report',id:c.id,label:'實際案例紀錄',active:curType==='case_report',title:c.title}]:[])
    ];
    const bar=$('#logic-tracks');
    if(bar){
      bar.innerHTML=tracks.map(t=>`<button type="button" class="track-pill ${t.active?'active':''}" role="tab" aria-selected="${t.active}" data-logic-track="${esc(t.type)}" data-material-id="${esc(t.id)}" title="${esc(t.title)}">${esc(t.label)}</button>`).join('');
      bar.hidden=tracks.length<2;
    }
  }
  const logicSimpleTitles={
    '載入一次與觸發入口':'開啟畫面，準備開始分析',
    '讀取共用 Snapshot':'取得 Dashboard 的即時資料',
    '整理異常與合併事件':'找出異常，合併重複事件',
    'Normal／Debug 邊界待確認':'不同分析模式尚未確認',
    '白名單固定不動作':'確認哪些異常不需要處理',
    '針對異常提出下一步':'AI 提出下一步與理由',
    '呈現事件、下一步與原因':'在 Dashboard 顯示結果',
    '人員判斷與獨立盲測':'由人員判斷是否採用',
    '深入調查全部 Candidate':'查閱異常的歷史資料',
    'Evidence 分析與程式驗證':'檢查分析是否有證據',
    'Briefing 與 Dashboard 結果交付':'將分析摘要送到畫面',
    '提出優先處理建議':'提醒哪些問題需要優先注意',
    '核心假設':'先提出可能原因','支持證據':'找支持這個想法的資料',
    '反面證據':'找出與想法矛盾的資料',
    '四大根因評估（人・機・料・法）':'從人、設備、材料與方法檢查',
    '未知與待查缺口':'列出還缺哪些資料','結論與下一步':'整理結論與後續確認事項'
  };
  const logicSimpleSummaries={
    '載入一次與觸發入口':'規劃在開啟畫面時開始分析一次；真正啟動分析工作的連接還要驗證。',
    '讀取共用 Snapshot':'預計使用 Dashboard 同一份即時資料；是否已成功接入還要確認。',
    '整理異常與合併事件':'同一件異常合併呈現，同機台不同的異常仍分開保留。',
    'Normal／Debug 邊界待確認':'資料還無法證明這個版本有兩種分析模式；不能把它當成已存在的流程。',
    '白名單固定不動作':'符合白名單的異常仍會顯示，但固定標示「不動作」，其他異常照常分析。',
    '針對異常提出下一步':'AI 根據本次資料提出建議與原因，不自行編造現場資訊，也不直接操作設備。',
    '呈現事件、下一步與原因':'目標是在畫面顯示異常、建議和原因，並減少重複文字；完整畫面仍待驗證。',
    '人員判斷與獨立盲測':'由現場人員決定是否採用，並分別回答後再比較；不會自動派工。',
    '深入調查全部 Candidate':'根據異常類型查歷史紀錄。重複修機已有真實案例，但不是所有異常都完成深入調查。',
    'Evidence 分析與程式驗證':'對分析內容、數字和歷史資料做檢查；證據不足就不能當成已確認原因。',
    'Briefing 與 Dashboard 結果交付':'已有後端分析成功的回報；完整畫面顯示與前後端一致性仍待驗證。',
    '提出優先處理建議':'整理需要注意的問題及優先程度，不會自動給出派工、停機或更換零件指令。'
  };
  const logicUncertain=s=>/Normal／Debug 邊界待確認/.test(s.title||'');
  const logicStorySummary=s=>{
    const original=String(s.plain_summary||'').trim().replace(/\s+/g,' ');
    return logicSimpleSummaries[s.title]||((original.length>145?original.slice(0,142).replace(/[，、；\s]+$/,'')+'…':original)||'目前沒有足夠記錄說明這一步。');
  };
  let logicSelectedId=null;
  const logicRoleShort={python_rule:'程式規則',llm_reasoning:'AI 判斷',tool_query:'資料查詢',db_snapshot:'資料來源',ui_interaction:'畫面呈現',human:'現場人員'};
  function logicStepDetail(s,flow,idx,isCase){
    const currentTitle=logicSimpleTitles[s.title]||s.title;
    const role=logicRoleShort[s.actor_role];
    const prev=flow[idx-1],next=flow[idx+1];
    const neighbors=`<div class="flow-neighbors">${prev?`<button type="button" data-flow-step="${esc(prev.step_id)}" aria-label="選擇上一個步驟">← ${esc(logicSimpleTitles[prev.title]||prev.title)}</button>`:'<span>流程起點</span>'}${next?`<button type="button" data-flow-step="${esc(next.step_id)}" aria-label="選擇下一個步驟">${esc(logicSimpleTitles[next.title]||next.title)} →</button>`:'<span>流程終點</span>'}</div>`;
    return `<div class="flow-detail-inner"><div class="flow-detail-kicker">第 ${idx+1} 步／共 ${flow.length} 步${role?` · ${esc(role)}`:''}</div><h3>${esc(currentTitle)}</h3><p class="flow-detail-lead">${esc(logicStorySummary(s))}</p><p class="flow-detail-note">${isCase?'依已保存的案例紀錄整理，不代表故障原因已確認。':'依開發紀錄整理的設計說明，並非即時執行結果。'}</p><details class="story-tech" data-story-step="${esc(s.step_id)}"><summary>技術細節與來源證據</summary><div class="story-tech-body"></div></details>${neighbors}</div>`;
  }
  function logicStoryPage(m,steps,materials){
    const isCase=m.material_type==='case_report';
    const uncertain=steps.filter(logicUncertain),flow=steps.filter(s=>!logicUncertain(s));
    const label=$('#agent').value==='history'?'歷史調查型':'MVP 行動型';
    const headline=isCase?'這個案例如何判斷？':label+'怎麼運作？';
    if(!flow.some(s=>s.step_id===logicSelectedId))logicSelectedId=mobile()?null:flow[0]?.step_id||null;
    const active=flow.findIndex(s=>s.step_id===logicSelectedId);
    const entries=flow.map((s,i)=>{
      const chosen=s.step_id===logicSelectedId;
      const title=logicSimpleTitles[s.title]||s.title;
      return `<div class="flow-node-wrap"><button type="button" class="flow-node ${chosen?'is-selected':''}" data-flow-step="${esc(s.step_id)}" aria-pressed="${chosen}" aria-expanded="${chosen}" aria-controls="flow-mobile-detail-${i}"><span class="flow-node-number">${i+1}</span><span class="flow-node-title">${esc(title)}</span><span class="flow-node-caret" aria-hidden="true">${chosen?'●':'›'}</span></button><div class="flow-mobile-inspector ${chosen?'is-selected':''}" id="flow-mobile-detail-${i}" ${chosen?'':'hidden'}>${chosen?logicStepDetail(s,flow,i,isCase):''}</div></div>`;
    }).join('');
    const gap=uncertain.length?`<details class="story-unknown"><summary>尚未確認（${uncertain.length} 項）</summary><div class="story-unknown-body">${uncertain.map(s=>`<p><b>${esc(logicSimpleTitles[s.title]||s.title)}：</b>${esc(logicStorySummary(s))}</p><details class="story-tech" data-story-step="${esc(s.step_id)}"><summary>查看來源紀錄</summary><div class="story-tech-body"></div></details>`).join('')}</div></details>`:'';
    const more=materials.length>1?`<details class="story-more"><summary>查看其他流程紀錄</summary><label>選擇來源<select data-story-material>${materials.map(a=>`<option value="${esc(a.id)}" ${a.id===m.id?'selected':''}>${esc(a.title)}</option>`).join('')}</select></label></details>`:'';
    const caseInfo=isCase?`<details class="story-more" data-story-case><summary>查看案例的證據與結論</summary><div class="story-case-body"></div></details>`:'';
    return `<div class="story-page"><div class="story-intro"><h2>${esc(headline)}</h2><p>點選流程節點，查看這一步的說明。${isCase?'案例結論仍需對照證據。':'這是設計流程，不代表全部完成驗收。'}</p></div><div class="flow-workspace"><section class="flow-map" aria-label="互動流程圖"><div class="flow-map-heading"><b>完整流程</b><small>${flow.length} 個步驟 · 依紀錄的閱讀順序</small></div><div class="flow-nodes">${entries||'<p>目前沒有足夠紀錄可以畫出流程。</p>'}</div></section><section id="flow-detail" class="flow-desktop-inspector" aria-label="目前選取的步驟">${active>=0?logicStepDetail(flow[active],flow,active,isCase):'<p>點選流程步驟查看說明。</p>'}</section></div><div class="flow-extras">${gap}${caseInfo}${more}</div></div>`;
  }
  function syncLogicDrawer(s,m){
    if(viewName!=='logic'||!s)return;
    const jumpId=(s.related_entity_ids||m?.related_entity_ids||[]).find(id=>entity(id));
    if(jumpId){openDetail(jumpId,false,true);return;}
    const ref=s.evidence_refs?.[0]||m?.evidence_refs?.[0];
    if(ref){sourceDrawer(ref,null,false,true);highlightLogicChips(null,s.step_id,0);}
  }
  function filteredSteps(m){return m?.steps||[];}
  function renderLogic(){
    if(!data)return;
    // 閱讀模式：先給完整且易懂的流程，欄位、工具、來源只在點開時載入。
    const lg=logicData();
    if($('#logic-type').value==='synthetic_example')$('#logic-type').value='design_workflow';
    if($('#agent').value==='action')$('#logic-type').value='design_workflow';
    const all=logicMaterials();
    const materials=all;
    if(!materials.some(m=>m.id===logicId)){logicId=materials[0]?.id||null;logicIndex=0;}
    renderTrackBar();
    $('#logic-material').innerHTML=materials.map(m=>`<option value="${esc(m.id)}">[${materialLabel(m)}] ${esc(m.title)}</option>`).join('')||'<option value="">沒有符合的來源</option>';
    $('#logic-material').value=logicId||'';
    $('.logic-selects').hidden=true;
    const m=currentMaterial();let steps=filteredSteps(m);
    // A material can match via case-level fields only; then keep every step readable.
    if(m&&!steps.length)steps=m.steps||[];
    $('#logic-rail').hidden=true;
    $('.logic-navigation').hidden=true;
    $('#logic-synthetic-toast').hidden=true;
    $('#thumb-bar').hidden=true;
    $('#step-picker').hidden=true;
    $('#logic-content').innerHTML=m?logicStoryPage(m,steps,materials):'<div class="logic-empty"><h2>目前沒有可用流程</h2><p>請切換上方 Agent 範圍。</p></div>';
  }
  function moveLogic(index){$('#step-picker').hidden=true;$('#thumb-position').setAttribute('aria-expanded','false');logicAll=false;logicIndex=index;renderLogic();$('#logic-content').scrollTop=0;$('#logic-rail [aria-current]')?.scrollIntoView({block:'nearest',inline:mobile()?'center':'nearest',behavior:mobile()&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'instant'});}
  function logicSource(stepId,index,sourceButton){
    const m=currentMaterial(),s=m?.steps?.find(s=>s.step_id===stepId),r=s?.evidence_refs?.[index];if(!r)return;
    sourceDrawer(r,sourceButton,true,false);highlightLogicChips(null,stepId,index);
  }
  // 共用來源抽屜（Agent Logic 與 Progress 共用）：只顯示來源紀錄，不當成執行步驟。
  function sourceDrawer(r,sourceButton,focus=true,autoSync=false){
    origin=sourceButton;selected=null;
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close" aria-label="關閉詳情">✕ 關閉</button><div class="eyebrow">來源紀錄${autoSync?' · 步驟自動連動':''}</div><h2>${esc(r.title)}</h2></div>`+
      step(1,'用途',`<p>${esc(r.summary||'來源未記載')}</p>`,true)+
      step(2,'如何運作',`<p>此為來源紀錄，不是執行步驟。</p><p>${esc(r.source_record)}</p><p>${esc(r.conversation_title||'對話標題未取得')} · ${esc(r.conversation_id||'無對話 ID')}</p>`)+
      step(3,'完成情況',`<p>${esc(r.evidence_type)} · ${esc(r.coverage)} · ${esc(r.source_status)}</p>${(r.gaps||[]).map(g=>`<p>${esc(g)}</p>`).join('')}`)+
      step(4,'技術資訊',`<dl>${pair('來源 ID',r.source_record)}${pair('事件 ID',r.event_id||'未建立直接事件關聯')}${pair('日期精度',r.date_precision)}${pair('關聯訊息',r.message_ids||[])}</dl>`)+
      step(5,'參考紀錄',r.event_id?evidence([r]):`<p>案例資料表保存的回報；原始對話映射與輸入 Snapshot 未取得。</p>`);
    $('#drawer').classList.add('open');$('#drawer').classList.toggle('auto-synced',Boolean(autoSync));$('#drawer').scrollTop=0;if(focus)$('#close').focus();
    enhanceMobileDrawer();syncSheet();
  }
  $('#logic-type').addEventListener('change',()=>{const t=$('#logic-type').value;if(t!=='synthetic_example')$('#logic-synthetic-toast').hidden=true;logicId=null;logicIndex=0;logicAll=false;renderLogic();});
  $('#logic-material').addEventListener('change',()=>{logicId=$('#logic-material').value;logicIndex=0;logicAll=false;renderLogic();});
  document.addEventListener('change',ev=>{
    const sel=ev.target.closest?.('[data-story-material]');
    if(!sel)return;
    logicId=sel.value;logicIndex=0;logicSelectedId=null;renderLogic();$('#logic-content').scrollTop=0;
  });
  document.addEventListener('click',ev=>{
    const btn=ev.target.closest?.('[data-flow-step]');
    if(!btn||viewName!=='logic')return;
    const was=logicSelectedId;
    logicSelectedId=btn.dataset.flowStep;
    if(logicSelectedId===was&&btn.closest('.flow-node-wrap')&&mobile()){
      // 手機版重點選同一步時可關閉內容，保持全流程清楚。
      const wrap=btn.closest('.flow-node-wrap');
      const inspector=wrap.querySelector('.flow-mobile-inspector');
      inspector.hidden=!inspector.hidden;
      btn.setAttribute('aria-expanded',String(!inspector.hidden));
      return;
    }
    renderLogic();
    const chosen=$('#logic-content .flow-node.is-selected');
    if(chosen)chosen.setAttribute('aria-expanded','true');
    if(mobile()&&chosen)chosen.scrollIntoView({block:'nearest',behavior:'instant'});
  });
  document.addEventListener('toggle',ev=>{
    const details=ev.target;
    if(viewName!=='logic'||!details?.open||details.dataset.loaded)return;
    if(details.matches?.('[data-story-step]')){
      const s=currentMaterial()?.steps?.find(x=>x.step_id===details.dataset.storyStep);
      if(!s)return;
      details.querySelector('.story-tech-body').innerHTML=logicCard(s);
      details.dataset.loaded='true';
    }else if(details.matches?.('[data-story-case]')){
      const m=currentMaterial();
      if(!m||m.material_type!=='case_report')return;
      details.querySelector('.story-case-body').innerHTML=casePanel(m);
      details.dataset.loaded='true';
    }
  },true);
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
    if(el.dataset.switchAgent){
      setAgent(el.dataset.switchAgent);
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
  // ---- Progress 進度視角：依來源重建的開發與驗收追蹤，非 Runtime 健康度。不計算完成率、有新資料時提示更新，不中斷使用者操作。 ----
  function renderFreshness(){
    const f=data?.freshness||{};
    const date=v=>v?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未整理';
    $('#manifest').textContent=`紀錄 ${date(f.events_updated_at)} · 知識 ${date(f.knowledge_updated_at)} · 進度 ${date(f.progress_updated_at)}`+(f.generated_at?` · 網站產生 ${date(f.generated_at)}`:' · 本機即時讀取');
  }
  let checkingRevision=false;
  async function checkRevision(){
    if(checkingRevision||document.hidden||currentAsOf||!data?.freshness?.revision)return;
    checkingRevision=true;
    try{
      let revision;
      if(window.__V2_STATIC_BUNDLE__){
        const r=await fetch(new URL('robots.txt',document.baseURI),{cache:'no-store'});
        if(!r.ok)return;
        revision=(await r.text()).match(/data-revision: ([a-f0-9]{64})/)?.[1];
      }else{
        const r=await fetch('/api/v2/revision',{cache:'no-store'});
        if(!r.ok)return;
        revision=(await r.json()).revision;
      }
      if(revision&&revision!==data.freshness.revision&&!$('#data-refresh')){
        const button=document.createElement('button');button.id='data-refresh';button.type='button';
        button.textContent='有新紀錄 · 更新畫面';
        button.onclick=()=>{if(window.__V2_STATIC_BUNDLE__)location.reload();else{button.remove();load();}};
        $('#manifest').append(' ',button);
      }
    }catch{ /* 離線時保留目前內容，下輪重試。 */ }
    finally{checkingRevision=false;}
  }
  setInterval(checkRevision,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkRevision();});

  let progressView='board',progressFilter='all';
  // 待辦直接使用目前功能結案資料；不另存工作清單，也不透過 LLM 猜測優先級。
  const progressTabs=document.querySelector('#progress-panel .progress-tabs');
  if(progressTabs&&!progressTabs.querySelector('[data-progress-view="next"]')){
    progressTabs.insertAdjacentHTML('beforeend','<button type="button" data-progress-view="next" aria-pressed="false">下一步</button>');
  }
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
  const pMatch=()=>true;
  const emptyNote='<div class="p-zero-result"><p class="logic-unknown">⚠️ 目前篩選結果：0 項符合</p><p class="io-basis">點擊下方按鈕或上方已選取的卡片，即可恢復完整總覽。</p><button type="button" class="p-reset-btn" data-progress-reset="1">↺ 顯示全部</button></div>';
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
          `<div class="p-strip-title"><strong>篩選結果：${esc(filterTitle)}（${esc(agentLabel)}）</strong></div>`+
          `<div class="p-strip-actions">`+
            `<button type="button" class="p-reset-btn" data-progress-reset="1">↺ 顯示全部（${esc(pop)} 項）</button>`+
          `</div>`+
        `</div>`
      :`<div class="p-strip-header">`+
          `<div class="p-strip-title"><strong>能力總覽（${esc(agentLabel)} · 共 ${esc(pop)} 項）</strong></div>`+
          `<div class="p-strip-hint">點選數字可篩選。</div>`+
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
      `<p class="p-legend">${esc(legend)}</p><p class="io-basis">驗證紀錄 ${g.verified_evidence_event_count??0} · 來源事件 ${g.source_event_count??0}</p>`+
      `<div class="p-chips">${items.map(i=>`<button class="p-chip st-${esc(i.status)}" data-jump="${esc(i.id)}" title="${esc(i.status_basis)}"><i class="dot"></i><span>${hl(i.title)}</span><small>${esc(statusMeta(i.status).label)}</small></button>`).join('')||emptyNote}</div>`+
      (extra?`<details class="p-blockers"><summary>阻塞點與未知 · ${extra}</summary>${blockers.map(b=>`<button class="jump" data-jump="${esc(b.id)}">${b.severity==='red'?'🔴 紅標籤':'🟠 待查'}：${esc(b.title)}<small>${esc(b.reason)}</small></button>`).join('')}${unknowns.map(b=>`<button class="jump" data-jump="${esc(b.id)}">未知：${esc(b.title)}<small>${esc(b.reason)}</small></button>`).join('')}${missing.length?`<h4>尚缺驗收（來源原文）</h4>${missing.map(b=>`<p><b>${esc(b.title)}</b>：${esc(b.note)}</p>`).join('')}`:''}</details>`:'')+`</article>`;
  }
  function boardView(p){
    if(progressFilter==='data_gaps'){
      const gaps=(p.gaps_and_issues?.data_gaps||[]).filter(x=>pMatch(x,'unresolved'));
      if(!gaps.length){
        return {html:`<div class="p-grid">${emptyNote}</div>`,shown:0};
      }
      const gapCards=gaps.map(x=>`<article class="p-card p-issue red-flag"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill red">資料缺口</span></div><p class="p-summary">${hl(x.why)}</p><p class="io-basis">來源狀態：${esc(x.status)} · ${esc(x.evidence_type)} · 評估批次 ${esc(x.assessment_id)}</p><p class="p-basis">建議下一步：<span class="logic-unknown">尚無紀錄</span></p>${sourceButton(x.source_record)}</article>`).join('');
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
    `<div class="p-io">${valueBlock('輸入',s.io?.inputs)}${valueBlock('輸出',s.io?.outputs)}${valueBlock('已知限制',s.limits)}</div>`+
    `<p class="io-basis">輸入輸出：${esc(s.io?.status||'unknown')} · 測試：${esc(s.independent_verification||'unknown')}</p>`+
    `<button class="logic-chip" data-jump="${esc(s.id)}">查看詳情 ↗</button>${evidenceList(s.id,s.evidence_event_ids)}</article>`;
  const queryCard=q=>`<article class="p-card"><div class="p-card-head"><h3>${hl(q.title)}</h3>${statusPill(q.status)}<span class="pill gray">查詢能力回報</span></div><p class="p-basis">${esc(q.status_basis)}</p><p class="p-summary">${hl(q.description)}</p>`+
    `<div class="p-io">${valueBlock('輸入',q.io?.inputs)}${valueBlock('輸出',q.io?.outputs)}${valueBlock('已知限制',q.limits)}</div><p class="io-basis">${esc(q.source)} · ${esc(q.evidence_type)} · 評估批次收錄 ${esc(q.assessment_captured_at||'未記載')}</p>${sourceButton(q.source_record)}</article>`;
  const validationCard=v=>`<article class="p-card"><div class="p-card-head"><h3>${hl(v.title)}</h3>${statusPill(v.status)}<span class="pill gray">驗證回報</span></div><p class="p-basis">${esc(v.status_basis)}</p>`+
    `<p class="p-result"><b>測試結果：</b>${hl(v.result)}</p>${v.detail?`<p class="p-summary">${hl(v.detail)}</p>`:''}<p class="io-basis">${esc(v.display_date)}（原文日期，無年份）· ${esc(v.evidence_type)}</p>${sourceButton(v.source_record)}</article>`;
  function skillsView(p){
    const sm=p.skill_matrix||{};
    const skills=(sm.skills||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    const queries=(sm.query_abilities||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    const vals=(sm.validation_evidence||[]).filter(s=>passes(s.status)&&pMatch(s,s.status));
    return {html:section('調查能力',skills.length,skills.map(skillCard).join(''),sm.basis||'')+section('查詢能力',queries.length,queries.map(queryCard).join(''))+section('測試結果',vals.length,vals.map(validationCard).join('')),shown:skills.length+queries.length+vals.length};
  }
  function gapsView(p){
    const g=p.gaps_and_issues||{};
    const issues=(g.open_issues||[]).filter(i=>passes('unresolved')&&pMatch(i,'unresolved'));
    const gaps=(g.data_gaps||[]).filter(i=>(progressFilter==='all'||progressFilter==='unresolved'||progressFilter==='data_gaps')&&pMatch(i,'unresolved'));
    const recs=(progressFilter==='all'||progressFilter==='next')?(g.batch_recommendations||[]).filter(i=>pMatch(i,'design_only')):[];
    const claims=(g.unsupported_claims||[]).filter(i=>passes(i.status)&&pMatch(i,i.status));
    const stepText=(v,basis)=>basis==='source'?esc(v):'<span class="logic-unknown">尚無紀錄</span>';
    const issueCard=i=>`<article class="p-card p-issue ${i.severity==='red'?'red-flag':'amber-flag'}"><div class="p-card-head"><h3>${hl(i.title)}</h3><span class="pill ${i.severity==='red'?'red':'amber'}">${i.severity==='red'?'🔴 紅標籤':'🟠 待查'}</span></div><p class="p-basis">${esc(i.basis)}</p>`+
      `<div class="p-io two"><section class="io-block"><h4>建議下一步</h4><p>${stepText(i.next_step,i.next_step_basis)}</p></section><section class="io-block"><h4>缺少的證據</h4><p>${i.missing_evidence==='unknown'?'<span class="logic-unknown">尚無紀錄</span>':hl(i.missing_evidence)}</p></section></div>`+
      `<button class="logic-chip" data-jump="${esc(i.id)}">查看詳情 ↗</button>${evidenceList(i.id,i.evidence_event_ids)}</article>`;
    const gapCard=x=>`<article class="p-card p-issue red-flag"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill red">資料缺口</span></div><p class="p-summary">${hl(x.why)}</p>`+
      `<p class="io-basis">來源狀態：${esc(x.status)} · ${esc(x.evidence_type)} · 評估批次 ${esc(x.assessment_id)}</p><p class="p-basis">建議下一步：<span class="logic-unknown">尚無紀錄</span>（見下方批次建議，非本缺口的指定解法）</p>${sourceButton(x.source_record)}</article>`;
    const recCard=x=>`<article class="p-card"><div class="p-card-head"><h3>${hl(x.title)}</h3><span class="pill purple">批次建議</span></div><p class="p-summary">${hl(x.why)}</p><p class="io-basis">${esc(x.basis)} · 狀態 ${esc(x.status)} · ${esc(x.source)}</p>${sourceButton(x.source_record)}</article>`;
    const claimRow=c=>`<button class="jump" data-jump="${esc(c.id)}">${statusPill(c.status)} ${hl(c.title)}<small>${esc(c.reason)}</small></button>`;
    return {html:section('待處理問題',issues.length,issues.map(issueCard).join(''),'')+
      section('缺少的資料',gaps.length,gaps.map(gapCard).join(''))+
      section('建議處理',recs.length,recs.map(recCard).join(''))+
      `<section class="p-section"><details class="p-claims"><summary>尚未確認的項目 · ${claims.length} 項</summary>${claims.map(claimRow).join('')||emptyNote}</details></section>`,
      shown:issues.length+gaps.length+recs.length+claims.length};
  }
  // 開發結案獨立於架構與驗證清單，統計僅使用持久化功能母體。
  const closureLabels={CLOSED_REPORTED:'已結案',PENDING_REPORT:'待回報',NEEDS_USER_REVIEW:'待我驗證',NEEDS_FIX:'需修正'};
  const closureTones={CLOSED_REPORTED:'green',PENDING_REPORT:'amber',NEEDS_USER_REVIEW:'amber',NEEDS_FIX:'red'};
  // 由 2026-10-17 功能驗收紀錄整理：只有來源足夠清楚的項目才提供具體驗證步驟。
  // 純呈現文字，不更改任何 SQLite 驗收狀態或結案依據。
  const closureGuide={
    'action.advice':{
      title:'AI 能不能提出處理建議？',
      purpose:'設備異常時，AI 提出下一步建議及原因。',
      progress:'已有設計紀錄，尚未確認最新版是否正常運作。',
      check:'查看實際異常案例，確認建議和原因是否合理。',
      pass:'能看到具體的處理建議，以及提出建議的原因。'
    },
    'action.blind-test':{
      title:'AI 能不能獨立分析現場異常？',
      purpose:'讓 AI 分析事先不知道答案的異常案例。',
      progress:'已有盲測需求，還缺最新版的實測回報。',
      check:'用未提供答案的案例執行 AI，再核對它的結論。',
      pass:'現場人員可以依實際資料核對分析結果與建議。'
    },
    'history.parity':{
      title:'AI 的異常清單和 Dashboard 一樣嗎？',
      purpose:'避免 AI 的異常清單漏掉或判錯項目。',
      progress:'新模擬測試已有成果，舊差異尚未全部核對。',
      check:'使用同一份資料，逐項比較 AI 與 Dashboard。',
      pass:'先前的不一致案例都已確認修正，不能只比數量。'
    },
    'history.row-selection':{
      title:'同一台設備多筆資料時，AI 有沒有選對？',
      purpose:'設備有多筆紀錄時，正確判斷應採用的狀態。',
      progress:'已發現可能選錯資料的風險，尚未確認實際出錯。',
      check:'找一個同設備多筆紀錄的案例，核對取用結果。',
      pass:'使用正確的資料列，不會因此判錯設備狀態。'
    },
    'history.trigger':{
      title:'開啟 Dashboard，AI 會不會重複啟動？',
      purpose:'開啟頁面時按規則啟動，避免無故重複執行。',
      progress:'已確認需求是載入時啟動一次，尚待核對最新版。',
      check:'開啟 Dashboard，核對執行與失敗重試紀錄。',
      pass:'正常載入沒有多餘任務，失敗重試也符合規則。'
    },
    'history.old-tests':{
      title:'以前測試失敗的問題修好了嗎？',
      purpose:'確認舊測試失敗的問題在新版是否已解決。',
      progress:'已有新測試結果，但舊失敗項目尚未逐項對齊。',
      check:'逐項對照舊失敗測試與最新版的相同測試。',
      pass:'每項舊問題都有對應的新結果，不能以總通過數代替。'
    }
  };
  // 其他功能只解釋「用途」，不以用途描述代替完成證據。
  const closurePurposes={
    'snapshot':'讓 Dashboard 和 Agent 使用同一時間點的資料，避免比較錯誤。',
    'action.entry':'開啟 Dashboard 時，讓 MVP Agent 依設定開始分析。',
    'action.presentation':'把 AI 找到的異常與建議呈現在 Dashboard。',
    'action.signals':'把同一個異常的多筆訊號整理在一起，避免重複提醒。',
    'action.snapshot':'讓 MVP Agent 讀取 Dashboard 共用的即時資料。',
    'action.whitelist':'限定 AI 不得自行執行未核准的操作。',
    'history.analysis':'檢查 AI 分析的證據，不合規時重新修訂。',
    'history.api':'讓前端能透過 API 取得 Agent 的分析結果。',
    'history.briefing':'把分析結果整理成現場看得懂的摘要。',
    'history.briefing-cap':'不要只因固定筆數上限而漏掉其他需要關注的事件。',
    'history.candidate':'避免同一異常因時間或身分欄位重複被計算。',
    'history.context':'把必要證據交給下一個分析步驟，減少無關資料。',
    'history.core-migration':'整理 Agent 共用程式，減少對舊模組的依賴。',
    'history.dashboard-backend':'讓 Dashboard 的部分判斷規則改由後端統一計算。',
    'history.duration':'比較設備維修與改機的歷史耗時。',
    'history.email':'產生主管摘要，並在核准後寄送。',
    'history.frontend-mapping':'讓分析結果的欄位正確顯示在 Dashboard。',
    'history.highlights':'從即時資料找出值得提醒的異常。',
    'history.investigation.manpower':'針對人力負荷過高，進一步調查可能原因。',
    'history.investigation.olp':'針對產線 OLP 偏低，進一步調查可能原因。',
    'history.investigation.repair':'針對維修時間過長，進一步調查可能原因。',
    'history.investigation.wait-change':'針對等待改機過久，進一步調查可能原因。',
    'history.investigation.wait-repair':'針對等待維修過久，進一步調查可能原因。',
    'history.normal-watch':'確認 AI 對正常或需關注的最終判斷一致。',
    'history.olp-order':'確認直接查詢時，能選出正確的最新 OLP 紀錄。',
    'history.olp-validator':'比對 OLP 最新值與歷史數值是否正確。',
    'history.persistence':'將 Agent 分析結果保存到 Oracle，方便後續查詢。',
    'history.presentation':'讓資料限制用清楚中文呈現，避免重複資訊。',
    'history.repeat':'回查設備是否反覆維修，並分析歷史紀錄。',
    'history.test-isolation':'讓測試執行時不干擾正式資料或其他測試。',
    'history.worker-sse':'讓耗時分析在背景執行，並持續回報進度。'
  };
  const closureExplain=i=>{
    const specific=closureGuide[i.item_id];
    const status=i.development_status;
    const manuallyAccepted=status==='CLOSED_REPORTED'&&i.closure_basis==='user_acceptance';
    const progress=manuallyAccepted?'這項功能已由你人工確認通過。':
      status==='CLOSED_REPORTED'?'已收到完成回報，但不代表你已親自測試。':
      status==='PENDING_REPORT'?'尚缺這項功能的完成回報。':
      status==='NEEDS_FIX'?'已有尚未解除的問題，需先修正。':
      '目前資料不足，還不能確認最新版是否完成。';
    const check=status==='CLOSED_REPORTED'?'可查看完成紀錄；若是誤按通過，可重新等待驗證。':
      status==='PENDING_REPORT'?'先補齊完成回報，再確認是否需要驗證。':
      status==='NEEDS_FIX'?'先確認問題修正與重新測試的結果。':
      '先請開發者提供實際案例與驗證步驟，再決定是否通過。';
    // 狀態可能在手機驗證後改變；絕不能保留過期的「尚未確認」文字。
    if(specific)return status==='NEEDS_USER_REVIEW'?specific:{...specific,progress,check};
    return {title:i.title,purpose:closurePurposes[i.item_id]||i.public_summary||i.title,progress,check,pass:'請依功能範圍與實際測試證據確認；目前沒有足夠資料列出更具體的通過條件。'};
  };
  let closureFilter='all',reviewAuthenticated=false,reviewEnabled=false;
  const closureData=()=>data?.progress?.closure;
  function renderHomeShortcut(){
    const items=closureData()?.items;
    const label=$('#home-progress-counts'),button=$('#home-next-step');
    if(!Array.isArray(items)){
      label.textContent='尚未取得進度資料';button.disabled=true;return;
    }
    const closed=items.filter(i=>i.development_status==='CLOSED_REPORTED').length;
    const active=items.filter(i=>['NEEDS_FIX','NEEDS_USER_REVIEW','PENDING_REPORT'].includes(i.development_status)).length;
    label.textContent=`已結案 ${closed} 項 · 待處理 ${active} 項`;
    button.disabled=false;
  }
  $('#home-next-step').addEventListener('click',()=>{
    progressView='next';view('progress');$('#progress-content').scrollTop=0;
  });
  const closureMatch=()=>true;
  // 只顯示可撤銷的人工作業；機器判斷的結案與未解問題不允許一鍵覆蓋。
  const canReopen=i=>i&&['CLOSED_REPORTED','NEEDS_FIX'].includes(i.development_status)&&['accept','reject'].includes(i.manual_decision)&&['user_acceptance','user_review'].includes(i.closure_basis);
  async function refreshClosure(){
    if(window.__V2_STATIC_BUNDLE__||currentAsOf)return;
    const scope=$('#agent').value;const token=request;
    const r=await fetch('/api/progress?agent='+encodeURIComponent(scope));
    if(!r.ok)return;
    const v=await r.json();if(token!==request||scope!==$('#agent').value||currentAsOf)return;
    if(data?.progress)data.progress.closure=v.closure;
    reviewAuthenticated=v.authenticated;reviewEnabled=v.write_enabled;
    renderHomeShortcut();
    if(viewName==='progress')renderProgress();
  }
  // 對兩種 Agent 共用相同處理優先序；同一狀態維持原始順序，不改驗收資料。
  const closurePriority={NEEDS_FIX:0,NEEDS_USER_REVIEW:1,PENDING_REPORT:2,CLOSED_REPORTED:3};
  function closureBoard(){
    const p=closureData(),all=p.items||[],matched=all.filter(closureMatch);
    const shown=matched.filter(i=>closureFilter==='all'||i.development_status===closureFilter)
      .sort((a,b)=>(closurePriority[a.development_status]??4)-(closurePriority[b.development_status]??4));
    const readonly=Boolean(window.__V2_STATIC_BUNDLE__||currentAsOf);
    $('#progress-note').textContent=query()?`找到 ${matched.length} 項`:'';
    const cards=Object.entries(closureLabels).map(([key,label])=>`<button class="p-metric" data-closure-filter="${key}" aria-pressed="${closureFilter===key}"><span>${label}</span><strong class="${closureTones[key]}">${p.counts[key]||0}</strong>${query()?`<small>符合 ${matched.filter(i=>i.development_status===key).length} 項</small>`:''}</button>`).join('');
    const rows=shown.map(i=>{
      const guide=closureExplain(i);
      return `<article class="p-card closure-item">
        <details class="closure-card-fold">
          <summary><span class="pill ${closureTones[i.development_status]}">${closureLabels[i.development_status]}</span>
          <h3>${esc(guide.title)}</h3><span class="closure-toggle">展開</span></summary>
          <div class="closure-card-content">
          <p class="closure-line"><b>功能</b><span>${esc(guide.purpose)}</span></p>
          <p class="closure-line"><b>進度</b><span>${esc(guide.progress)}</span></p>
          <p class="closure-line"><b>驗證</b><span>${esc(guide.check)}</span></p>
          <button class="closure-card-more" data-closure-item="${esc(i.item_id)}">查看說明與紀錄 ↗</button>
        ${i.development_status==='NEEDS_USER_REVIEW'?`<button class="closure-verify" data-closure-verify="${esc(i.item_id)}">驗證此項 ↗</button>`:canReopen(i)?`<button class="closure-reopen" data-closure-verify="${esc(i.item_id)}">↶ 重新等待驗證</button>`:''}
          </div>
        </details>
      </article>`;
    }).join('');
    const updates=data?.progress?.source_updates||[];
    const pending=updates.length?`<details class="p-card source-updates" open><summary>新來源待整理 · ${updates.length} 筆</summary><p>已入庫並收錄歷程，尚未核對對功能進度的影響；既有結案與驗收結果保留。</p>${updates.map(e=>`<p><button class="logic-chip" data-evolution-source="${esc('development_events:'+e.event_id)}">${esc((e.display_date||e.recorded_at||'日期未記載').split('T')[0])} · ${esc(e.title)}</button>${e.agent_scope==='unknown'?'<small>Agent 範圍待確認</small>':''}</p>`).join('')}</details>`:'';
    $('#progress-content').innerHTML=`${pending}<div class="p-strip-header"><strong>功能進度 · ${all.length} 項</strong><button data-closure-filter="all">全部功能</button></div><div class="p-metrics closure-metrics">${cards}</div><div class="p-grid closure-grid">${rows||'<p class="logic-unknown">沒有符合的功能；請清除搜尋或切回全部。</p>'}</div>`;
  }
  const nextStages=[
    {status:'NEEDS_FIX',title:'先修正',desc:'已有未解問題，修正後再驗證。',tone:'red',action:'查看問題'},
    {status:'NEEDS_USER_REVIEW',title:'等你驗證',desc:'已有交付內容，等待人工確認。',tone:'amber',action:'前往驗證'},
    {status:'PENDING_REPORT',title:'等待完成回報',desc:'先補完成紀錄，再安排驗證。',tone:'blue',action:'查看紀錄'}
  ];
  // MVP 的下一步：驗收狀態取自現有功能結案；後續路線為尚未核准的提案。
  function mvpRoadmap(p){
    const items=p?.closure?.items||[];
    const checks=['action.advice','action.blind-test'].map(id=>items.find(i=>i.item_id===id));
    const accepted=checks.filter(i=>i?.development_status==='CLOSED_REPORTED'&&i.closure_basis==='user_acceptance').length;
    const stages=[
      {num:'01',when:'優先開發',status:'待開發規劃',
       tone:'active',title:'建立主任盲測填答',
       desc:'ME Dashboard 上方列異常統計，下方依機台集中所有異常；主任逐筆只填「下一步會做什麼？」。',
       done:'過關條件：透過 API 保存同一份即時資料、主任工號、異常內容、回答與填答時間。',
        foot:'工程：異常彙整 · 主任輸入框 · Oracle 2 張表 · API'},
      {num:'02',when:'功能完成後',status:accepted===2?'既有交付已驗收':'待人工驗收',
       tone:'proposal',title:'AI 與主任獨立判斷',
       desc:'AI 先依即時異常提出下一步及原因；主任看不到 AI 建議，獨立填答後送出。白名單照列，AI 固定「不動作／白名單」。',
       done:'過關條件：AI 不查歷史；主任提交前完全看不到 AI 答案；雙方使用相同的異常 Snapshot。',
       foot:'既有「下一步與原因／盲測交付」：'+accepted+'／2 項已人工驗收'},
      {num:'03',when:'送出後',status:'建議規劃',
       tone:'proposal',title:'解盲並驗證一致性',
       desc:'主任送出後，比較主任與 AI 的下一步，分成完全一致、部分一致、不一致，統計判斷一致率。',
       done:'過關條件：每筆都可回查主任工號、異常、兩方建議、時間及分類結果。',
       foot:'結果用於找出 AI 能力與不足，作為後續改善依據'}
    ];
    const cards=stages.map(s=>`<article class="mvp-plan-card ${s.tone}">
      <div class="mvp-plan-meta"><span class="mvp-plan-index">${s.num}</span><span class="mvp-plan-stage">${esc(s.when)}</span><span class="mvp-plan-status">${esc(s.status)}</span></div>
      <h4>${esc(s.title)}</h4><p>${esc(s.desc)}</p><p class="mvp-plan-gate">${esc(s.done)}</p><small>${esc(s.foot)}</small>
    </article>`).join('');
    return `<section class="mvp-roadmap" aria-label="MVP 下一步規劃">
      <div class="mvp-plan-heading"><div><span class="mvp-plan-eyebrow">MVP ACTION AGENT · ROADMAP</span><h2>MVP 下一步怎麼走？</h2></div><span class="mvp-plan-kind">驗收優先</span></div>
      <p class="mvp-plan-lead">看見異常 → AI 建議下一步 → 主任獨立盲測 → 驗證一致性。第一版不查歷史、不排序，也不自動派工。</p>
      <div class="mvp-plan-grid">${cards}</div>
      <div class="mvp-plan-build" aria-label="盲測所需的三項工程">
        <div><b>前端 · 異常與主任輸入</b><span>上方統計各類異常；下方依機台彙整。AI 的「發現異常／建議下一步／建議原因」在主任填答時隱藏，主任只填「下一步會做什麼？」。</span></div>
        <div><b>DB · 先用 2 張表</b><span>Case 表保存異常、Snapshot、AI 建議及比對結果；Human 表保存主任工號、下一步回答與填答時間。</span></div>
        <div><b>API · 獨立判斷與解盲</b><span>固定即時異常 → AI 獨立判斷並保密保存 → 主任獨立填答並鎖定 → 解盲比較三類一致性。</span></div>
      </div>
      <p class="mvp-plan-source">依「ME Dashboard AI Agent｜MVP V1 盲測計畫」整理。兩表方案須確保主任送出前，API 不回傳任何 AI 答案；如果權限無法隔離，才重新評估拆表。此頁是規劃，不是可填答的正式盲測系統；公司 ME Dashboard 的前端、Oracle 表與 API 尚未在此建立。兩項驗收狀態取自既有紀錄，其餘不計入下方待辦統計。</p>
    </section>`;
  }
  // GPT A 已確認的討論結論與待辦由正式事件投影，不必加入功能結案母體。
  const gptaNextSteps=p=>(p?.next_steps||[])
    .filter(i=>i.from_gpta_discussion&&!['verified','supported','superseded'].includes(i.status))
    .sort((a,b)=>(b.source_date||'').localeCompare(a.source_date||'')||a.title.localeCompare(b.title,'zh-Hant'));
  const gptaNextLabel=i=>i.decision_status||statusMeta(i.status).label;
  const gptaNextAction=s=>s==='inspect backend event source and verify actual DaVinci call flags'
    ?'確認後端事件來源及 DaVinci 實際呼叫標記':s;
  function gptaNextSection(p){
    const items=gptaNextSteps(p);
    if(!items.length)return '';
    const rows=items.map(i=>`<article class="next-item gpta-next-item"><div>`+
      `<span class="pill amber">${esc(gptaNextLabel(i))}</span><h3>${esc(i.title)}</h3>`+
      (i.decision?`<p><b>決策：</b>${esc(i.decision)}</p>`:'')+
      (i.goal?`<p><b>目標：</b>${esc(i.goal)}</p>`:'')+
      (i.adjustment?`<p><b>調整方向：</b>${esc(i.adjustment)}</p>`:'')+
      (i.summary?`<p><b>討論重點：</b>${esc(i.summary)}</p>`:'')+
      (i.next_step?`<p><b>下一步：</b>${esc(gptaNextAction(i.next_step))}</p>`:'')+
      (i.source_date?`<small>${esc(i.source_date)}</small>`:'')+
      `</div></article>`).join('');
    return `<section class="next-stage gpta-next-stage"><h2>GPT A 討論後的下一步 <small>${items.length} 項</small></h2>`+
      `<div class="next-list">${rows}</div></section>`;
  }
  function nextStepsView(p){
    const all=p?.closure?.items||[];
    const active=all.filter(i=>nextStages.some(s=>s.status===i.development_status));
    const results=active.filter(closureMatch);
    const sections=nextStages.map(s=>{
      const items=results.filter(i=>i.development_status===s.status).sort((a,b)=>a.title.localeCompare(b.title,'zh-Hant'));
      if(!items.length)return '';
      return `<section class="next-stage"><h2><span class="pill ${s.tone}">${s.title}</span><small>${items.length} 項</small></h2><p class="next-stage-desc">${s.desc}</p><div class="next-list">${items.map(i=>{
        const g=closureExplain(i);
        return `<article class="next-item"><div><h3>${esc(g.title)}</h3><p>${esc(g.purpose)}</p><small>${esc(g.check)}</small></div><button type="button" data-next-open="${esc(i.item_id)}">${s.action} ↗</button></article>`;
      }).join('')}</div></section>`;
    }).join('');
    const counts=nextStages.map(s=>`<span>${s.title} <b>${active.filter(i=>i.development_status===s.status).length}</b></span>`).join('');
    $('#progress-note').textContent=query()?`符合搜尋：${results.length} 項`:'';
    const roadmap=$('#agent').value==='action'?mvpRoadmap(p):'';
    const planning=roadmap?`<details class="mvp-roadmap-fold"><summary>後續規劃 <small>三階段盲測、工程項目與資料保存說明</small></summary>${roadmap}</details>`:'';
    const discussed=gptaNextSteps(p).length;
    $('#progress-content').innerHTML=`<div class="next-head"><h2>待處理事項 · ${active.length+discussed} 項</h2><div class="next-counts">${counts}${discussed?`<span>GPT A 待辦 <b>${discussed}</b></span>`:''}</div></div>`+
      gptaNextSection(p)+`<p class="next-caveat">以下功能驗收項目依目前狀態分組；GPT A 討論待辦獨立列出，不計入功能結案統計。</p>`+
      (sections||(!discussed?'<div class="logic-empty"><h2>沒有待處理項目</h2></div>':''))+planning;
  }
  function closureDetail(id,button){
    const i=closureData()?.items.find(i=>i.item_id===id);if(!i)return;
    origin=button;selected=null;
    const guide=closureExplain(i);
    const readonly=Boolean(window.__V2_STATIC_BUNDLE__||currentAsOf);
    const reports=(i.reports||[]).map(r=>`<article class="event"><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><small>${esc(r.display_date)} · ${esc(r.evidence_type)} · ${esc(r.version_scope)}</small><p>Commit：${esc(r.commit||'尚未取得')}</p><code>${esc(r.event_id)}</code><p>${esc(r.reason)}</p></article>`).join('')||'<p>尚未找到相關回報；線上版不公開私人來源。</p>';
    const history=(i.history||[]).map(h=>`<article class="event"><b>${esc(closureLabels[h.development_status])}</b><p>${esc(h.decision_reason)}</p><small>${esc(h.at)} · ${esc(h.actor)} · ${esc(h.action)}</small></article>`).join('');
    const mobileReview=window.__V2_STATIC_BUNDLE__? `<details class="closure-review-fold"><summary>選擇驗證結果</summary><div class="closure-actions"><button type="button" data-review-remote="accept" data-review-id="${esc(i.item_id)}">通過</button><button type="button" data-review-remote="reject" data-review-id="${esc(i.item_id)}">需修正</button><button type="button" data-review-remote="defer" data-review-id="${esc(i.item_id)}">暫緩</button></div></details>`:'';
    const manual=i.development_status==='NEEDS_USER_REVIEW'?(readonly?mobileReview:`<form id="closure-review" data-item="${esc(i.item_id)}"><p><b>驗收範圍</b>：${esc(i.acceptance_scope)}</p>${reviewAuthenticated?'':`<label>本機驗收金鑰<input name="token" type="password" autocomplete="off" placeholder="由本機管理者提供" required></label>`}<label>判斷理由<textarea name="reason" maxlength="2000" required placeholder="請說明已確認的功能或仍需修正的範圍"></textarea></label><label><input type="checkbox" name="confirm" required>我已核對上述功能及範圍</label><div class="closure-actions"><button name="decision" value="accept">確認通過・結案</button><button name="decision" value="reject">仍需修正</button><button name="decision" value="defer">暫不決定</button></div><p id="review-message" role="status"></p></form>`):canReopen(i)?(readonly?(window.__V2_STATIC_BUNDLE__?`<details class="closure-review-fold"><summary>撤銷驗證</summary><button class="closure-reopen" data-review-remote="reopen" data-review-id="${esc(i.item_id)}">重新等待驗證</button></details>`:'<p>歷史切面唯讀，請回到最新狀態後操作。</p>'):`<form id="closure-review" data-item="${esc(i.item_id)}"><p>這會撤銷前一次人工決定，回到「待我驗證」。原本的驗收歷史仍會保留。</p>${reviewAuthenticated?'':`<label>本機驗收金鑰<input name="token" type="password" autocomplete="off" required></label>`}<label>撤銷原因<textarea name="reason" maxlength="2000" required>前次人工驗收按錯，重新等待驗證。</textarea></label><label><input type="checkbox" name="confirm" required>確認將狀態改回待我驗證</label><button class="closure-reopen" name="decision" value="reopen">↶ 重新等待驗證</button><p id="review-message" role="status"></p></form>`):'';
    $('#drawer').innerHTML=`<div class="drawer-head"><button id="close">✕ 關閉</button><div class="eyebrow">功能驗收</div><h2>${esc(guide.title)}</h2></div>`+
      step(1,'這項功能要做什麼？',`<p class="closure-detail-text">${esc(guide.purpose)}</p><span class="pill ${closureTones[i.development_status]}">${closureLabels[i.development_status]}</span><p class="closure-detail-text">${esc(guide.progress)}</p>`,true)+
      step(2,'我需要確認什麼？',`<p class="closure-detail-text">${esc(guide.check)}</p><p class="closure-detail-text"><b>通過條件：</b>${esc(guide.pass)}</p>${manual}`,i.development_status==='NEEDS_USER_REVIEW'||canReopen(i))+
      step(3,'原始回報與限制',`<p>${esc(i.acceptance_scope)}</p><p>${esc(i.decision_reason)}</p><p>${esc(i.remaining_validation||'尚未取得進一步回報')}</p><p>驗證情況：${esc(i.verification_level)} · 確認依據：${esc(i.closure_basis||'尚未結案')}</p>${reports}`)+
      step(4,'驗收與狀態歷史',history||'<p>尚無人工驗收紀錄。</p>')+
      step(5,'原有知識與證據入口',(i.entity_ids||[]).filter(id=>entity(id)).map(id=>`<button class="jump" data-jump="${esc(id)}">${esc(entity(id).title)} ↗</button>`).join('')||'<p>來源索引保留於本機稽核紀錄。</p>');
    $('#drawer').classList.add('open');$('#drawer').classList.remove('auto-synced');$('#drawer').scrollTop=0;enhanceMobileDrawer();syncSheet();$('#close').focus();
  }
  document.addEventListener('click',e=>{
    const verify=e.target.closest('[data-closure-verify]');if(verify){closureDetail(verify.dataset.closureVerify,verify);return;}
    const next=e.target.closest('[data-next-open]');if(next){closureDetail(next.dataset.nextOpen,next);return;}
    const filter=e.target.closest('[data-closure-filter]');if(filter){closureFilter=closureFilter===filter.dataset.closureFilter?'all':filter.dataset.closureFilter;progressView='board';renderProgress();}
    const item=e.target.closest('[data-closure-item]');if(item)closureDetail(item.dataset.closureItem,item);
  });
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-review-remote]');if(!target)return;
    const item=closureData()?.items.find(i=>i.item_id===target.dataset.reviewId);
    if(!window.__V2_STATIC_BUNDLE__||!item)return;
    const decision=target.dataset.reviewRemote;
    if(!['accept','reject','defer','reopen'].includes(decision))return;
    if(decision==='reopen'?!canReopen(item):item.development_status!=='NEEDS_USER_REVIEW')return;
    const label={accept:'通過',reject:'需修正',defer:'暫緩',reopen:'重新等待驗證'}[decision];
    if(!confirm(`「${item.title}」確定${decision==='reopen'?'重新等待驗證':label}？（需再送出 GitHub Issue）`))return;
    const reason={accept:'本人已核對本項功能的公開驗收範圍，確認通過。',reject:'本人已核對本項功能，確認仍需修正；詳細內容留在本機。',defer:'本次暫緩確認，待進一步驗證。',reopen:'前次人工驗收按錯，重新等待驗證。'}[decision];
    const payload={schema:'pih-mobile-review-v1',item_id:item.item_id,expected_updated_at:item.updated_at,decision,reason};
    const title=`[PIH-REVIEW] ${decision} ${item.item_id}`;
    const body='<!-- pih-mobile-review-v1 -->\n```json\n'+JSON.stringify(payload,null,2)+'\n```';
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

  // 分開顯示來源快照與人工驗收；沒有跨系統同步證據時一律不宣稱最新。
  function renderProgressFreshness(){
    const f=data?.freshness||{};
    const parseDate=value=>{const d=new Date(value||'');return Number.isFinite(d.getTime())?d:null;};
    const fullTime=d=>d?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d):'尚未取得';
    $('#progress-freshness-label').textContent=`最新收錄 ${fullTime(parseDate(f.events_updated_at))} · ${f.pending_source_count||0} 筆待整理`;
    $('#progress-snapshot-time').textContent=fullTime(parseDate(data?.provenance_manifest?.snapshot_captured_at));
    $('#progress-sync-status').textContent=`知識整理 ${fullTime(parseDate(f.knowledge_updated_at))}；進度核對 ${fullTime(parseDate(f.progress_updated_at))}。`;
    const history=(data?.progress?.closure?.items||[]).flatMap(i=>i.history||[]);
    const reviewTimes=history.filter(h=>['accept','reject','defer','reopen'].includes(h.action)).map(h=>parseDate(h.at)).filter(Boolean);
    $('#progress-review-time').textContent=reviewTimes.length?fullTime(new Date(Math.max(...reviewTimes.map(d=>d.getTime())))):'尚無人工決定紀錄';
  }
  function renderProgress(){
    if(!data)return;
    renderProgressFreshness();
    renderHomeShortcut();
    const p=progressData();
    document.querySelectorAll('[data-progress-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.progressView===progressView));
    if(!p){
      $('#progress-note').textContent='';
      $('#progress-content').innerHTML='<div class="logic-empty"><h2>目前沒有進度資料</h2><p>請重新整理。</p></div>';
      return;
    }
    if(progressView==='next'){nextStepsView(p);return;}
    if(p.closure&&progressView==='board'){closureBoard();return;}
    const view=progressView==='skills'?skillsView(p):progressView==='gaps'?gapsView(p):boardView(p);
    const filterLabel=CARD_FILTERS[progressFilter]||'全部';
    if(view.shown===0){
      $('#progress-note').textContent=`目前篩選結果：0（篩選「${filterLabel}」）`;
    }else if(progressFilter!=='all'){
      $('#progress-note').textContent=`目前篩選「${filterLabel}」· 共 ${view.shown} 項符合`;
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
  let evoView='timeline',evoIndex=0,evoAll=false,evoChangesOnly=false;
  const evoData=()=>data?.evolution||null;
  const evoPrecisionLabel={timestamp:'時間已確認',day:'僅知日期',free_text:'年份未確認',unknown:'時間未知',recorded_only:''};
  const recordedTime=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);};
  const evoChangeTone={added:'green',updated:'blue',status_changed:'amber',superseded:'purple'};
  const evoShiftTone={superseded:'purple',status_shift:'amber',iterative_refinement:'blue'};
  // 開發日誌只重排、白話化現有來源文字；不可用演進紀錄推斷功能已驗收。
  const journalWords=[
    [/Snapshot/gi,'即時資料整理'],[/Highlights/gi,'異常重點'],[/Candidates?/gi,'待調查項目'],
    [/\bJob\b/gi,'分析工作'],[/\bScope\b/gi,'分析範圍'],[/\bE2E\b/gi,'完整流程'],
    [/\bMock\b/gi,'模擬測試'],[/\bparity\b/gi,'結果一致性'],[/\bTool\b/gi,'查詢工具'],
    [/\bpassed\b/gi,'通過'],[/\bskipped\b/gi,'略過'],[/\bfailed\b/gi,'失敗'],
    [/\bEmail Approval\b/gi,'郵件審核'],[/\bDashboard Alignment\b/gi,'畫面資料比對'],
    [/\bReplay\b/gi,'重播比對'],[/\bBriefing\b/gi,'分析摘要']
  ];
  const journalText=v=>{
    let s=String(v||'').trim();
    for(const [from,to] of journalWords)s=s.replace(from,to);
    return s.replace(/\s+/g,' ').trim();
  };
  const journalNames=[
    [/^程式依 (?:Highlights|異常重點) 找異常$/,'AI 怎麼找出異常'],
    [/^Evidence 分析與程式驗證$/,'確認 AI 的分析有證據'],
    [/^載入一次策略已確認$/,'AI 何時開始分析'],
    [/^Highlights 與最終判斷不一致$/,'找到的異常與最後結論對不上'],
    [/^Snapshot 與首次觸發 A 方案$/,'開啟畫面時才開始分析'],
    [/^Snapshot 建立與刷新時序$/,'什麼時候整理即時資料'],
    [/^Worker／SSE 與 API 共存$/,'分析時間較長時，畫面怎麼顯示進度']
  ];
  const journalTitle=v=>{
    const s=String(v||'').trim();
    for(const [p,replacement] of journalNames)if(p.test(s))return replacement;
    return journalText(s);
  };
  const journalDescription=c=>{
    const s=String(c?.description||'');
    if(s.startsWith('新版六項 MVP Mock 已通過；真實 Job 有 19 Highlights → 13 Candidates')){
      return '六項模擬測試已通過。真實資料曾找出 19 個異常重點，整理成 13 個待調查項目；完整流程還要驗證。';
    }
    if(s.startsWith('主要回合最多5、Structured Claim類型44種')){
      return 'AI 分析已有證據與數字的檢查規則，包括異常原因、歷史資料和是否重複發生；完整情境仍要驗證。';
    }
    if(s.startsWith('使用者最新確認：沒有五分鐘自動刷新')){
      return '執行方式已確認：開啟畫面時分析一次，不會每五分鐘自動重新分析。';
    }
    return journalShort(s||'這項內容有更新，詳細情況請看來源紀錄。');
  };
  const journalShort=(v,n=125)=>{
    const s=journalText(v);
    if(s.length<=n)return s;
    const sentences=s.match(/[^。！？]+[。！？]?/g)||[s];
    const first=sentences[0]?.trim()||'';
    return first.length<=n&&first.length>=14?first:first.slice(0,n).replace(/[，、；\s]+$/,'')+'…';
  };
  const journalStatus={
    needs_validation:'還要驗證',in_progress:'仍在處理',planned:'還在規劃',reported_implemented:'回報已實作',
    reported:'已有回報',achieved:'已確認完成',implemented:'回報已實作',
    deprecated:'已停用',superseded:'已被新方案取代',paused:'暫緩'
  };
  const journalChanges=b=>{
    const current=new Map();
    for(const c of b.entity_changes||[]){
      const key=c.entity_id||c.native_id||c.title;
      if(!current.has(key)||Number(c.sequence||0)>Number(current.get(key).sequence||0))current.set(key,c);
    }
    // 既有測試批次、舊原型與同日反覆改版保留在「其他更新」，不擠掉主要開發事項。
    const priority=c=>{
      const title=String(c.title||''),desc=String(c.description||'');
      let n=({needs_validation:5,in_progress:4,planned:3,reported_implemented:2,reported:1})[c.status]||0;
      if(/測試|驗證|異常|修機|載入|調查|資料|建議|流程|交付/.test(title))n+=2;
      if(/^(舊|bt[-－]|Dashboard子測試|Agent子測試|前端meAgent|後端Agent)/i.test(title)||/\b(?:passed|skipped|failed)\b/i.test(title))n-=12;
      if(/^(\d+\s*passed|既有測試批次回報)/i.test(desc))n-=8;
      if(/詳細成果、模式與驗收缺口見相關能力/.test(desc))n-=4;
      return n;
    };
    return [...current.values()].sort((a,b)=>priority(b)-priority(a)||Number(b.sequence||0)-Number(a.sequence||0));
  };
  function journalEntry(b,idx){
    const items=journalChanges(b);
    const title=journalTitle(b.lead_title||b.title||'開發紀錄');
    const latest=idx===0;
    const notable=items.slice(0,3);
    const summaries=notable.map(c=>`<li><b>${esc(journalTitle(c.title))}</b><span>${esc(journalDescription(c))}</span>${journalStatus[c.status]?`<em>${esc(journalStatus[c.status])}</em>`:''}</li>`).join('');
    const more=items.length>3?`<details class="journal-more"><summary>其餘 ${items.length-3} 項紀錄</summary><ul>${items.slice(3).map(c=>`<li><button type="button" data-jump="${esc(c.entity_id)}">${esc(journalText(c.title))} ↗</button><span>${esc(journalShort(c.description,95))}</span></li>`).join('')}</ul></details>`:'';
    const sourceEvents=b.events||[];
    const sourceDetails=(items.length||sourceEvents.length)?`<details class="journal-source" data-journal-source="${esc(b.batch_id)}"><summary>查看來源與完整修改內容</summary><div class="journal-source-target"></div></details>`:'';
    const description=items.length?`<ul class="journal-key-points">${summaries}</ul>${more}`:sourceEvents.length?
      `<ul class="journal-key-points">${sourceEvents.slice(0,3).map(e=>`<li><b>${esc(journalTitle(e.title))}</b><span>${esc(journalShort(e.summary,180))}</span><em>${esc(e.source_status||'來源狀態未知')}${e.recorded_at?' · '+recordedTime(e.recorded_at):''}</em></li>`).join('')}</ul>`:
      `<p class="journal-no-detail">這天有開發紀錄，但目前的公開資料沒有足夠內容說明具體改動。</p>`;
    return `<article class="journal-day" data-journal-date="${esc(b.batch_id)}"><details ${latest?'open':''}><summary><span class="journal-date">${b.time_precision==='recorded_only'?'收錄 ':''}${esc(b.date_label)}</span><span class="journal-heading">${esc(title)}</span><span class="journal-count">${items.length||sourceEvents.length?'有更新':'有紀錄'}</span><span class="journal-fold">查看</span></summary><div class="journal-day-body">${description}${sourceDetails}</div></details></article>`;
  }

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
    return (evo?.timeline_batches||[]).filter(b=>!evoChangesOnly||(b.entity_changes||[]).length>0||(b.events||[]).length);
  }
  function filteredEvoShifts(evo){
    return evo?.decision_shifts||[];
  }
  function filteredEvoCheckpoints(evo){
    return evo?.all_checkpoints||evo?.as_of_checkpoints||[];
  }
  function evoBatchCard(b){
    const groups=(b.affected_groups||[]).map(g=>`<span class="pill gray">${esc(g.title)} ×${g.count}</span>`).join('');
    const changes=b.entity_changes||[];
    const evs=b.events||[];
    // 近期 GPT B 增量入庫事件沿用既有「內容更新」卡片，不捏造知識版本或修改次數。
    const addedRecords=evs.filter(e=>String(e.event_id||'').startsWith('gptb-'));
    const remainingEvents=evs.filter(e=>!addedRecords.includes(e));
    const snaps=[...(b.snapshots||[]),...(b.assessments||[])];
    return `<article class="logic-card evo-batch-card" data-batch-card="${esc(b.batch_id)}">`+
      `<div class="logic-card-heading"><div class="logic-card-meta"><span class="eyebrow">第 ${b.ordinal} 批 · ${esc(b.date_label)}</span>${evoPrecisionLabel[b.time_precision]?`<span class="pill ${b.is_exact_time?'green':'amber'}">${esc(evoPrecisionLabel[b.time_precision])}</span>`:''}${b.time_precision==='recorded_only'?'':`<span class="pill blue">${esc(b.summary)}</span>`}</div><h2>${hl(b.title)}</h2></div>`+
      (groups?`<div class="evo-groups-row"><span class="logic-links-label">影響概念群：</span>${groups}</div>`:'')+
      (changes.length?`<section class="evo-section"><h3>內容更新（${changes.length} 筆）</h3><div class="evo-change-grid">${changes.map(c=>`<div class="evo-change-item"><div class="evo-change-top"><span class="pill ${evoChangeTone[c.change_type]||'gray'}">${esc(c.change_label)}</span><span class="pill gray">${esc(c.group_title)}</span><span class="pill amber">${esc(c.status)}</span></div><h4><button type="button" class="logic-chip" data-jump="${esc(c.entity_id)}">↗ ${hl(c.title)}</button></h4><p class="evo-change-desc">${hl(c.description)}</p><p class="io-basis">修訂原因：${c.change_reason_basis==='source'?hl(c.change_reason):'<span class="logic-unknown">尚無紀錄</span>'} · 生效 ${esc(c.effective_at)} · 收錄 #${c.sequence} (${esc(c.recorded_at)})</p></div>`).join('')}</div></section>`:'')+
      (addedRecords.length?`<section class="evo-section"><h3>內容更新（${addedRecords.length} 筆）</h3><div class="evo-change-grid">${addedRecords.map(e=>`<div class="evo-change-item"><div class="evo-change-top"><span class="pill blue">來源查核</span><span class="pill amber">${esc(e.source_status||'來源狀態未記載')}</span></div><h4><button type="button" class="logic-chip source-chip" data-evolution-source="${esc(e.source_record)}">↗ ${hl(e.title)}</button></h4><p class="evo-change-desc">${hl(e.summary)}</p><p class="io-basis">${e.recorded_at?esc(recordedTime(e.recorded_at)):''}</p></div>`).join('')}</div></section>`:'')+
      (snaps.length?`<section class="evo-section"><h3>架構紀錄（${snaps.length} 筆）</h3><div class="evo-chip-wrap">${snaps.map(s=>`<button type="button" class="logic-chip source-chip" data-evolution-source="${esc(s.source_record)}">📸 ${hl(s.title)}<small>${esc(s.captured_at)}</small></button>${s.captured_at&&s.captured_at!=='unknown'?`<button type="button" class="logic-chip" data-evo-asof="${esc(s.captured_at)}">⏳ 預覽此時間切面</button>`:''}`).join('')}</div></section>`:'')+
      (remainingEvents.length?`<details class="logic-context-accordion evo-events-acc" ${!changes.length?'open':''}><summary>📂 相關紀錄（${remainingEvents.length} 筆對話／歷史事件 — 點擊展開或點選晶片檢視來源）</summary><div class="evo-event-list">${remainingEvents.map(e=>`<div class="evo-event-row"><button type="button" class="logic-chip source-chip" data-evolution-source="${esc(e.source_record)}">📄 ${esc(e.display_date!=='unknown'?e.display_date:(e.recorded_at?'收錄 '+recordedTime(e.recorded_at):'來源時間待查'))} · ${esc(e.evidence_type)}<small>${hl(e.title)}</small></button><p>${hl(e.summary)}</p></div>`).join('')}</div></details>`:'')+
      `</article>`;
  }
  function evoShiftCard(s){
    const er=s.early_record||{},cr=s.current_record||{};
    const vhist=s.version_history||[];
    const evIds=s.evidence_event_ids||[];
    return `<article class="logic-card evo-shift-card" data-shift-card="${esc(s.id)}">`+
      `<div class="logic-card-heading"><div class="logic-card-meta"><span class="pill ${evoShiftTone[s.shift_type]||'blue'}">${esc(s.shift_label)}</span><span class="pill gray">${esc(s.group_title)}</span><span class="pill gray">${esc(scopeLabel(s))}</span><span class="pill blue">共 ${s.version_count} 版</span></div><h3>${hl(s.title)} <small class="evo-native-id">${esc(s.native_id)}</small></h3></div>`+
      `<div class="case-compare evo-compare">`+
        `<section class="io-block evo-early"><h4>🕒 早期設計（${esc(er.version_label)} · #${er.sequence}）</h4><p><span class="pill gray">狀態：${esc(er.status)}</span> <b>${hl(er.title)}</b></p><p>${hl(er.summary)}</p><small class="io-basis">生效：${esc(er.effective_at)} · 收錄：${esc(er.recorded_at)}</small></section>`+
        `<section class="io-block evo-current"><h4>✨ 目前設計（${esc(cr.version_label)} · #${cr.sequence}）</h4><p><span class="pill amber">狀態：${esc(cr.status)}</span> <b>${hl(cr.title)}</b></p><p>${hl(cr.summary)}</p><small class="io-basis">生效：${esc(cr.effective_at)} · 收錄：${esc(cr.recorded_at)}</small></section>`+
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
      `<p class="io-basis">日期：<code>${esc(cp.as_of)}</code> · 對應架構快照：<code>${esc(cp.active_snapshot_id||'尚未建立快照')}</code></p>`+
      `<div class="evo-cp-stats"><span>紀錄版本：<b>${cm.knowledge_version_count??0}</b></span><span>功能數量：<b>${cm.unique_entity_count??0}</b></span><span>架構版本：<b>${cm.snapshot_count??0}</b></span></div>`+
      `<div class="logic-links"><button type="button" class="logic-chip ${isCur?'active-chip':''}" data-evo-asof="${esc(cp.as_of)}">${isCur?'✓ 正在查看這個版本':'⏳ 查看這個版本'}</button>${cp.active_snapshot_id?`<button type="button" class="logic-chip source-chip" data-evolution-source="architecture_snapshots:${esc(cp.active_snapshot_id)}">查看快照來源紀錄 ↗</button>`:''}</div>`+
      `</article>`;
  }
  function syncEvolutionDrawer(evo){
    if(viewName!=='evolution'||!evo)return;
    if(evoView==='timeline'){
      // 開發日誌不自動開啟技術抽屜；只有使用者主動查看紀錄才開。
      if($('#drawer').classList.contains('auto-synced'))close();
      return;
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
      $('#evolution-content').innerHTML='<div class="logic-empty"><h2>目前沒有開發歷程資料</h2><p>請重新整理。</p></div>';
      return;
    }
    const batches=filteredEvoBatches(evo),shifts=filteredEvoShifts(evo),cps=filteredEvoCheckpoints(evo);
    const tabLabels={timeline:'開發日誌',shifts:'設計怎麼改',checkpoints:'舊版紀錄'};
    document.querySelectorAll('[data-evo-view]').forEach(b=>{
      const v=b.dataset.evoView,act=v===evoView;
      b.classList.toggle('active',act);b.setAttribute('aria-selected',act);
      if(tabLabels[v])b.textContent=tabLabels[v];
    });
    const allCps=evo.all_checkpoints||evo.as_of_checkpoints||[];
    const sel=$('#evo-asof');
    if(sel){
      sel.innerHTML='<option value="">最新狀態</option>'+allCps.map(c=>`<option value="${esc(c.as_of)}">[${esc(c.kind_label)}] ${esc(c.display_time)} · ${esc(c.title)}</option>`).join('');
      if(currentAsOf&&!allCps.some(c=>c.as_of===currentAsOf)){
        sel.innerHTML+=`<option value="${esc(currentAsOf)}">[自選時間] ${esc(currentAsOf)}</option>`;
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
          sliceBanner.innerHTML=mobile()?`<span>⏳ 歷史預覽 · ${esc(currentAsOf.slice(0,10))}<small>僅顯示當時已知資料</small></span><button type="button" class="evo-reset-inline" data-reset-asof="1">↺ 返回最新</button>`:`<span>⏳ 查看過去版本：<b>${esc(currentAsOf)}</b>（只看當時已有的資料）</span><button type="button" class="evo-reset-inline" data-reset-asof="1">↺ 回到最新</button>`;
        }
      }
    }
    const stepNav=$('#evo-step-nav'),rail=$('#evolution-rail'),bodyWrap=document.querySelector('.evolution-body');
    const isTimeline=evoView==='timeline';
    if(stepNav)stepNav.hidden=true;
    if(rail)rail.hidden=true;
    if(bodyWrap)bodyWrap.classList.add('single-col');
    $('#evo-asof').closest('.evo-asof-label').hidden=evoView!=='checkpoints';
    if(stepNav&&!stepNav.querySelector('[data-evo-changes]')){
      stepNav.insertAdjacentHTML('beforeend','<button type="button" data-evo-changes="1" aria-pressed="false">只看有變更</button>');
    }
    const changeButton=stepNav?.querySelector('[data-evo-changes]');
    if(changeButton){
      changeButton.setAttribute('aria-pressed',String(evoChangesOnly));
      changeButton.textContent=evoChangesOnly?'顯示所有日期':'只看有變更';
    }

    if(isTimeline){
      const recent=[...batches].reverse();
      $('#evo-search-note').textContent=query()?`找到 ${recent.length} 天紀錄`:'';
      $('#evolution-content').innerHTML=`<div class="journal-intro"><h2>開發日誌</h2><p>最近的紀錄在最上面。點日期看當天做過什麼；完成與否請以「進度」頁為準。</p><small>共 ${recent.length} 組紀錄</small></div>`+(recent.length?recent.map((b,i)=>journalEntry(b,i)).join(''):'<div class="logic-empty"><h2>沒有符合的開發紀錄</h2><p>請調整搜尋或切換專案範圍。</p></div>');
    }else if(evoView==='shifts'){
      $('#evo-search-note').textContent=query()?`搜尋「${$('#search').value.trim()}」：${shifts.length} 項轉折符合`:'';
      $('#evolution-content').innerHTML=evoMetricsStrip(evo)+`<section class="evo-list-sec"><div class="evo-sec-head"><h2>設計改了什麼（共 ${shifts.length} 項）</h2><p class="io-basis">對照早期與目前的設計。</p></div>${shifts.length?shifts.map(evoShiftCard).join(''):'<div class="logic-empty"><h2>沒有符合條件的設計轉折項目</h2></div>'}</section>`;
    }else{
      $('#evo-search-note').textContent=query()?`搜尋「${$('#search').value.trim()}」：${cps.length} 個切面錨點符合`:'';
      $('#evolution-content').innerHTML=evoMetricsStrip(evo)+`<section class="evo-list-sec"><div class="evo-sec-head"><h2>歷史版本（共 ${cps.length} 個可切換時間錨點）</h2><p class="io-basis">選擇日期查看當時的內容。</p></div><div class="evo-cp-grid">${cps.length?cps.map(evoCheckpointCard).join(''):'<div class="logic-empty"><h2>沒有符合條件的時間切面錨點</h2></div>'}</div></section>`;
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
    const el=ev.target.closest('[data-evo-view],[data-evo-batch],[data-evo-changes],[data-evolution-source],[data-evo-asof],[data-reset-asof],[data-clear-slice-notice],#evo-reset-asof,#evo-prev,#evo-next,#evo-all');
    if(!el)return;
    if(el.dataset.clearSliceNotice){asOfNotice='';$('#evo-slice-banner').hidden=true;return;}
    if(el.dataset.evoView){evoView=el.dataset.evoView;renderEvolution();$('#evolution-content').scrollTop=0;return;}
    if(el.dataset.evoChanges!==undefined){evoChangesOnly=!evoChangesOnly;evoIndex=0;evoAll=false;renderEvolution();$('#evolution-content').scrollTop=0;return;}
    if(el.dataset.evoBatch!==undefined){moveEvoBatch(Number(el.dataset.evoBatch));return;}
    if(el.dataset.evolutionSource){evolutionSource(el.dataset.evolutionSource,el);return;}
    if(el.dataset.evoAsOf!==undefined||el.dataset.evoAsof!==undefined){setAsOf(el.dataset.evoAsof||el.dataset.evoAsOf);return;}
    if(el.dataset.resetAsof||el.id==='evo-reset-asof'){setAsOf('');return;}
    if(el.id==='evo-prev')moveEvoBatch(evoIndex-1);
    if(el.id==='evo-next')moveEvoBatch(evoIndex+1);
    if(el.id==='evo-all'){evoAll=!evoAll;renderEvolution();}
  });
  document.addEventListener('toggle',ev=>{
    const details=ev.target;
    if(!details.matches?.('.journal-source')||!details.open||details.dataset.loaded)return;
    const b=(evoData()?.timeline_batches||[]).find(x=>x.batch_id===details.dataset.journalSource);
    if(!b)return;
    details.querySelector('.journal-source-target').innerHTML=evoBatchCard(b);
    details.dataset.loaded='true';
  },true);
  document.addEventListener('keydown',ev=>{
    if(viewName!=='evolution'||evoView!=='timeline'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)||ev.altKey||ev.ctrlKey||ev.metaKey)return;
    if(ev.target.closest?.('input,select,textarea,#drawer'))return;
    const batches=filteredEvoBatches(evoData());
    const delta=(ev.key==='ArrowRight'||ev.key==='ArrowDown')?1:-1;
    const next=evoIndex+delta;
    if(batches.length&&next>=0&&next<batches.length){ev.preventDefault();moveEvoBatch(next);}
  });
  function view(name){
    if(['architecture','logic','thinking','cases','evolution','progress'].includes(name)){
      const url=new URL(location.href);
      url.hash='#'+name;
      history.replaceState(null,'',url);
    }
    if(name!=='thinking')$('#thinking-frame').contentWindow?.postMessage({type:'thinking-pause'},location.origin);
    if(name!=='cases')$('#case-thinking-frame').contentWindow?.postMessage({type:'thinking-pause'},location.origin);
    viewName=name;const ws=document.querySelector('.workspace');ws.dataset.view=name;document.body.dataset.view=name;
    const compact=true;
    document.body.classList.toggle('is-compact-header',compact);
    ws.classList.toggle('is-compact-header',compact);
    document.querySelectorAll('button[data-view]').forEach(b=>{if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const activeViews=['architecture','logic','evolution','progress'];
    $('#architecture').hidden=!activeViews.includes(name);$('.graph-panel').hidden=name!=='architecture';$('#logic-panel').hidden=name!=='logic';$('#evolution-panel').hidden=name!=='evolution';$('#progress-panel').hidden=name!=='progress';
    $('#thinking-panel').hidden=name!=='thinking';
    $('#cases-panel').hidden=name!=='cases';
    $('#home-progress-shortcut').hidden=name!=='architecture';
    $('#placeholder').hidden=activeViews.includes(name)||name==='thinking'||name==='cases';close();
    if(name==='thinking')syncThinking();
    if(name==='cases')syncCaseThinking();
    $('#thumb-bar').hidden=!mobile()||name!=='logic';$('#step-picker').hidden=true;$('#thumb-position').setAttribute('aria-expanded','false');
    if(name==='logic'){if(data)renderLogic();$('#thumb-bar').hidden=true;return;}
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
    if(viewName==='cases')syncCaseThinking();
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
    if(el.id==='back')view('architecture');
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){close();return;}
    const target=ev.target.closest('[data-node],[data-edge]');
    if(target&&['Enter',' '].includes(ev.key)){
      ev.preventDefault();
      target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return;
    }
    if(ev.target===$('#canvas')){
      const move={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]}[ev.key];
      if(move){ev.preventDefault();$('#canvas').scrollBy({left:move[0],top:move[1]});}
    }
  });
  // 網站不提供文字搜尋。手機與桌面共用分類切換。
  let wasMobile=null;
  function syncMobileLayout(){
    const on=mobile();if(on!==wasMobile){
      if(!on)$('#step-picker').hidden=true;
      wasMobile=on;
      if(data){renderGraph();if(viewName==='logic')renderLogic();if(viewName==='progress')renderProgress();}
      if(on&&$('#drawer').classList.contains('open')&&!$('#drawer .sheet-content'))enhanceMobileDrawer(entity(selected)?.id);
    }
    $('#thumb-bar').hidden=true;
    document.querySelectorAll('#stats .stat').forEach((e,i)=>{if(on){e.setAttribute('role','button');e.tabIndex=0;e.dataset.metric=i;e.setAttribute('aria-label',e.textContent);}else{e.removeAttribute('role');e.removeAttribute('tabindex');delete e.dataset.metric;}});
    syncSheet();
  }
  new MutationObserver(()=>syncMobileLayout()).observe($('#stats'),{childList:true});
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-groups],[data-sheet-jump],.sheet-resize,.sheet-grab,#thumb-prev,#thumb-next,#thumb-position,#thumb-detail,[data-metric]');if(!el||!mobile())return;
    if(el.matches('.sheet-resize,.sheet-grab')){$('#drawer').classList.toggle('sheet-full');syncSheetSize();}
    if(el.dataset.sheetJump!==undefined){const d=$(`#drawer [data-sheet-section="${el.dataset.sheetJump}"]`);if(d){d.open=true;d.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}}
    if(el.id==='thumb-prev')moveLogic(logicIndex-1);
    if(el.id==='thumb-next')moveLogic(logicIndex+1);
    if(el.id==='thumb-position'){$('#step-picker').hidden=!$('#step-picker').hidden;el.setAttribute('aria-expanded',String(!$('#step-picker').hidden));}
    if(el.id==='thumb-detail'){origin=el;const m=currentMaterial(),s=filteredSteps(m)[logicIndex]||m?.steps?.[logicIndex],id=s?.related_entity_ids?.find(id=>entity(id));if(id)openDetail(id);else if(s?.evidence_refs?.[0])sourceDrawer(s.evidence_refs[0],el);}
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
  function syncCaseThinking(){
    const frame=$('#case-thinking-frame'),agent=$('#agent').value==='history'?'history':'action';
    if(frame.dataset.agent===agent)return;
    const bundle=$('#case-thinking-bundle');if(!bundle)return;
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
  window.addEventListener('resize',()=>{syncMobileLayout();if(data)fit();});
  syncMobileLayout();
  load();
  const initialView=location.hash.slice(1);
  view(['architecture','logic','thinking','cases','evolution','progress'].includes(initialView)?initialView:'architecture');
})();
