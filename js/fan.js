/* 沖積扇總覽地形（pt 林邊溪扇、ch 濁水溪扇彰化側）共用模組：B1、B2、B3 使用
   座標：local＝自場景西北角起算的公尺（x 向東、z 向南）；fan.group 內的座標＝local −（W/2, D/2），y＝高程 × vex
   海：DEM 圖幅不含海面，邊界是直線 → 用 OSM 海岸線圍出海域（從 seaSeed 開始填滿），海域壓平、改成海水色
   用法：
     import { loadFan } from './js/fan.js';
     const fan = await loadFan('ch', { vex: 3, seaSeed: [0, 0] });   // pt 用 seaSeed: [0, 22260]
     scene.add(fan.group);
     fan.h(lx, lz)            → 地面高（已乘 vex；海＝0）
     fan.P(lx, lz, dy)        → group 內的 Vector3（dy 是離地高度，不乘 vex）
     fan.isSea(lx, lz)        → 是否在海上
     fan.lines(filter, style) → 把 OSM 的線貼在地面上（style：color、width、dy、opacity），回傳 Mesh（已加進 group）
     fan.ribbon(pts, style)   → 自己給一串 local 點
     fan.place('員林市')       → [lx, lz]（OSM 地名；找不到回傳 null）
     fan.fromTM2(x, y)／fan.fromLL(lat, lon)（經緯度是線性近似，誤差約 100～200 公尺）
     fan.skirt(depth, color)  → 加上四周的側壁，變成一塊「地塊」 */
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const loadTex = url => new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));

export async function loadFan(name, o = {}) {
  const DATA = o.data ?? 'data/', vex = o.vex ?? 1, seed = o.seaSeed, seaColor = new THREE.Color(o.seaColor ?? 0x2f6f95);
  const [meta, buf, osm, tex] = await Promise.all([
    fetch(DATA + `meta_${name}.json`).then(r => r.json()), fetch(DATA + `dem_${name}.f32`).then(r => r.arrayBuffer()),
    fetch(DATA + `osm_${name}.json`).then(r => r.json()), loadTex(DATA + `ortho_${name}.jpg`)]);
  const H = new Float32Array(buf), { nx, ny, cell } = meta, W = meta.x1 - meta.x0, D = meta.y1 - meta.y0;

  /* ---------- 海域：OSM 海岸線當邊界，從 seaSeed 往外填 ---------- */
  const sea = new Float32Array(nx * ny);
  if (seed) {
    const bar = new Uint8Array(nx * ny);
    for (const l of osm.lines) if (l.kind === 'coast') for (let i = 0; i < l.pts.length - 1; i++) {
      const a = l.pts[i], b = l.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell * 0.4)));
      for (let k = 0; k <= n; k++) { const ci = Math.round(lerp(a[0], b[0], k / n) / cell), cj = Math.round(lerp(a[1], b[1], k / n) / cell); if (ci >= 0 && ci < nx && cj >= 0 && cj < ny) bar[cj * nx + ci] = 1; }
    }
    const st = [clamp(Math.round(seed[1] / cell), 0, ny - 1) * nx + clamp(Math.round(seed[0] / cell), 0, nx - 1)];
    while (st.length) {
      const k = st.pop(); if (sea[k] || bar[k]) continue; sea[k] = 1;
      const i = k % nx, j = (k - i) / nx;
      if (i > 0) st.push(k - 1); if (i < nx - 1) st.push(k + 1); if (j > 0) st.push(k - nx); if (j < ny - 1) st.push(k + nx);
    }
  }
  const Y = new Float32Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) Y[k] = sea[k] ? 0 : Math.max(H[k], 0.4) * vex;
  const seaSoft = new Float32Array(sea);                       // 邊緣柔化（上色用）
  for (let pass = 0; pass < 2; pass++) { const s = seaSoft.slice(); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; seaSoft[k] = (s[k] * 4 + s[k - 1] + s[k + 1] + s[k - nx] + s[k + nx]) / 8; } }

  /* ---------- 地形網格 ---------- */
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; pos[k * 3] = i * cell - W / 2; pos[k * 3 + 1] = Y[k]; pos[k * 3 + 2] = j * cell - D / 2;
    uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = 1 - j / (ny - 1);
  }
  let p = 0; for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSea', new THREE.BufferAttribute(seaSoft, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uSea = { value: seaColor };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSea; varying float vSea;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = aSea;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSea; uniform vec3 uSea;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uSea, smoothstep(0.38, 0.62, vSea));');
  };
  const group = new THREE.Group(), mesh = new THREE.Mesh(geo, mat); group.add(mesh);

  const h = (lx, lz) => {
    const fx = clamp(lx / cell, 0, nx - 1.001), fz = clamp(lz / cell, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i;
    return lerp(lerp(Y[k], Y[k + 1], tx), lerp(Y[k + nx], Y[k + nx + 1], tx), tz);
  };
  const isSea = (lx, lz) => sea[clamp(Math.round(lz / cell), 0, ny - 1) * nx + clamp(Math.round(lx / cell), 0, nx - 1)] > 0;
  const P = (lx, lz, dy = 0) => new THREE.Vector3(lx - W / 2, h(lx, lz) + dy, lz - D / 2);
  const inside = q => q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= D;

  /* ---------- 貼地的線（帶狀面） ---------- */
  function strip(pts, width, dy, out) {             // 把一條線加進 out（pos、idx）；場景外的線段不畫
    let run = [];
    const flush = () => {
      if (run.length > 1) for (let i = 0; i < run.length; i++) {
        const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ox = -(b[1] - a[1]) / L * width / 2, oz = (b[0] - a[0]) / L * width / 2, k = out.pos.length / 3;
        for (const s of [1, -1]) { const lx = clamp(run[i][0] + ox * s, 0, W), lz = clamp(run[i][1] + oz * s, 0, D); out.pos.push(lx - W / 2, h(lx, lz) + dy, lz - D / 2); }
        if (i) out.idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
      run = [];
    };
    for (let i = 0; i < pts.length; i++) {          // 太長的線段補點，才會貼著地形
      if (!inside(pts[i])) { flush(); continue; }
      if (run.length) { const a = run[run.length - 1], d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]), n = Math.floor(d / (cell * 2)); for (let k = 1; k <= n; k++) run.push([lerp(a[0], pts[i][0], k / (n + 1)), lerp(a[1], pts[i][1], k / (n + 1))]); }
      run.push(pts[i]);
    }
    flush();
  }
  function stripMesh(list, s = {}) {
    const out = { pos: [], idx: [] }; for (const pts of list) strip(pts, s.width ?? 120, s.dy ?? 12, out);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setIndex(out.idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: s.color ?? 0x38bdf8, transparent: true, opacity: s.opacity ?? 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.renderOrder = s.order ?? 2; group.add(m); return m;
  }
  const lines = (filter, style) => stripMesh(osm.lines.filter(filter).map(l => l.pts), style);
  const ribbon = (pts, style) => stripMesh([pts], style);
  const linePts = filter => osm.lines.filter(filter).map(l => l.pts);

  function skirt(depth = 600, color = 0x7c705f) {
    const sp = [], si = [], edge = [];
    for (let i = 0; i < nx; i++) edge.push([i, 0]); for (let j = 1; j < ny; j++) edge.push([nx - 1, j]);
    for (let i = nx - 2; i >= 0; i--) edge.push([i, ny - 1]); for (let j = ny - 2; j >= 0; j--) edge.push([0, j]);
    edge.forEach(([i, j], n) => { const x = i * cell - W / 2, z = j * cell - D / 2; sp.push(x, Y[j * nx + i], z, x, -depth, z); if (n) { const k = n * 2; si.push(k - 2, k, k - 1, k, k + 1, k - 1); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g.setIndex(si); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })); group.add(m);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x3b3329 })); bottom.rotation.x = Math.PI / 2; bottom.position.y = -depth; group.add(bottom);
    return m;
  }
  const place = n => { const q = osm.places.find(pl => pl.name === n); return q ? q.p : null; };
  const bb = meta.bbox_ll;   // [latS, latN, lonW, lonE]
  return { name, meta, osm, group, mesh, tex, W, D, cell, vex, h, P, isSea, lines, ribbon, linePts, skirt, place,
    fromTM2: (x, y) => [x - meta.x0, meta.y1 - y],
    fromLL: (lat, lon) => [(lon - bb[2]) / (bb[3] - bb[2]) * W, (bb[1] - lat) / (bb[1] - bb[0]) * D] };
}

/* 各站共用的小工具 */
export function chaikin(pts, n) {
  for (let k = 0; k < n; k++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(pts[pts.length - 1]); pts = o; }
  return pts;
}
