/* 各站共用導覽列：回入口／上一站／下一站（依 data/units.json 的 order；ready=false 的站不連過去）
   用法：<script src="js/nav.js" data-narrow="1100" data-narrow-pos="left|center" defer></script>
   - 導覽列放進 #titleCard 下方一列
   - data-narrow：該頁在這個寬度以下會藏起標題 → 只顯示導覽列
   - 在 Google Sites 等嵌入框裡，多一顆「全螢幕」（開新分頁） */
(() => {
  const me = document.currentScript;
  const narrow = +me.dataset.narrow || 0, center = me.dataset.narrowPos === 'center';
  const file = location.pathname.split('/').pop() || 'index.html';
  const css = `
#titleCard{display:grid;grid-template-columns:auto auto;justify-content:start;column-gap:12px}
#titleCard .bnav{grid-column:1/-1;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px}
#titleCard .bnav a,#titleCard .bnav span.off{font-size:13.5px;font-weight:800;padding:5px 10px;border-radius:10px;background:rgba(3,105,161,.10);color:#0369a1;text-decoration:none;white-space:nowrap;line-height:1.3}
#titleCard .bnav a:hover{background:rgba(3,105,161,.18)}
#titleCard .bnav a.next{background:#16a34a;color:#fff}
#titleCard .bnav a.fs{background:#0f2a3a;color:#fff}
#titleCard .bnav span.off{background:rgba(100,116,139,.12);color:#94a3b8}
#titleCard .bnav .pos{font-size:12.5px;color:#64748b;font-weight:700;padding:0 2px}
${narrow ? `@media (max-width:${narrow}px){
  #titleCard{display:flex!important;padding:6px 8px${center ? ';left:50%;transform:translateX(-50%);max-width:none' : ''}}
  #titleCard>.logo,#titleCard>div:not(.bnav){display:none}
  #titleCard .bnav{margin-top:0}
  #titleCard .bnav .pos{display:none}}` : ''}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  fetch('data/units.json', { cache: 'no-cache' }).then(r => r.json()).then(U => {
    const card = document.getElementById('titleCard'); if (!card) return;
    const list = U.order, i = list.findIndex(k => U.pages[k].file === file);
    const nav = document.createElement('div'); nav.className = 'bnav';
    const a = (txt, href, cls, title) => { const e = document.createElement('a'); e.textContent = txt; e.href = href; if (cls) e.className = cls; if (title) e.title = title; nav.appendChild(e); return e; };
    const off = (txt, title) => { const e = document.createElement('span'); e.className = 'off'; e.textContent = txt; e.title = title; nav.appendChild(e); };
    a('⌂ 入口', 'index.html', '', '回到入口頁');
    if (i > 0) { const p = U.pages[list[i - 1]]; p.ready ? a('‹ 上一站', p.file, '', '上一站：' + p.name) : off('‹ 上一站', p.name + '（製作中）'); }
    if (i >= 0) { const s = document.createElement('span'); s.className = 'pos'; s.textContent = `${U.pages[list[i]].no}・第 ${i + 1} 站／共 ${list.length} 站`; nav.appendChild(s); }
    if (i >= 0 && i < list.length - 1) { const p = U.pages[list[i + 1]]; p.ready ? a('下一站 ›', p.file, 'next', '下一站：' + p.name) : off('下一站 ›', p.name + '（製作中）'); }
    let inFrame = false; try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    if (inFrame || new URLSearchParams(location.search).get('embed') === '1') { const f = a('⤢ 全螢幕', location.pathname, 'fs', '開新分頁全螢幕'); f.target = '_blank'; f.rel = 'noopener'; }
    card.appendChild(nav);
  }).catch(() => { });
})();
