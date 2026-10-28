// MoonCam Beauty: on-device face landmarks (MediaPipe, 478 points) → clear skin, spot removal,
// makeup and gentle reshaping. Nothing is uploaded; the model and runtime ship with the app.
import {boxBlur, smooth} from "./engine.js";

let landmarker = null, loading = null;
export const faceState = {status: "idle", error: ""};

export async function loadFace() {
  if (landmarker) return landmarker;
  if (loading) return loading;
  faceState.status = "loading";
  loading = (async () => {
    const base = new URL("../vendor/", import.meta.url).href;
    const vision = await import(base + "mediapipe/vision_bundle.mjs");
    const files = await vision.FilesetResolver.forVisionTasks(base + "mediapipe/wasm");
    landmarker = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: {modelAssetPath: base + "models/face_landmarker.task", delegate: "CPU"},
      runningMode: "IMAGE", numFaces: 4,
    });
    faceState.status = "ready";
    return landmarker;
  })().catch(e => { faceState.status = "error"; faceState.error = String(e && e.message || e); loading = null; throw e; });
  return loading;
}

const cache = new WeakMap();
/** Returns faces as arrays of normalised {x,y} points (cached per source canvas). */
export async function detectFaces(canvas) {
  if (cache.has(canvas)) return cache.get(canvas);
  const lm = await loadFace();
  const res = lm.detect(canvas);
  const faces = (res.faceLandmarks || []).filter(f => f.length >= 468).map(f => f.map(p => ({x: p.x, y: p.y})));
  cache.set(canvas, faces);
  return faces;
}
export function cachedFaces(canvas) { return cache.get(canvas); }

// ------------------------------------------------------------------ landmark index sets
const IDX = {
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  lipsOut: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  lipsIn: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  eyeR: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeL: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  lidR: [33, 246, 161, 160, 159, 158, 157, 173, 133], lidL: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  lowR: [33, 7, 163, 144, 145, 153, 154, 155, 133], lowL: [263, 249, 390, 373, 374, 380, 381, 382, 362],
  browR: [46, 53, 52, 65, 55, 107, 66, 105, 63, 70], browL: [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
  browLowR: [46, 53, 52, 65, 55], browLowL: [276, 283, 282, 295, 285],
  irisR: [468, 469, 470, 471, 472], irisL: [473, 474, 475, 476, 477],
};

// Makeup presets ("ชุดแต่งหน้า"): amounts 0..100
export const MAKEUP_COLORS = {
  lip: ["#d9475f", "#c2185b", "#e8735a", "#b5525c", "#9e1b32", "#e88aa0", "#a5634f"],
  blush: ["#f08a9a", "#f4a582", "#e57373", "#d98ba8"],
  shadow: ["#a87b5a", "#c58f6e", "#d4a5a5", "#8a6a8f", "#3b2f2f", "#c9a24f"],
};
export const MAKEUP_PRESETS = [
  {id: "none", name: "ไม่แต่ง", m: {}},
  {id: "korean", name: "เกาหลีใส", m: {lip: 45, lipColor: 2, lipMode: "tint", blush: 30, blushColor: 1, shadow: 20, shadowColor: 1, brow: 15}},
  {id: "japan", name: "ญี่ปุ่นน่ารัก", m: {lip: 40, lipColor: 5, lipMode: "gloss", blush: 55, blushColor: 0, shadow: 15, shadowColor: 2, lash: 25}},
  {id: "thai", name: "ไทยหวาน", m: {lip: 55, lipColor: 3, lipMode: "matte", blush: 35, blushColor: 1, shadow: 30, shadowColor: 0, liner: 30, brow: 25, highlight: 20}},
  {id: "party", name: "ออกงาน", m: {lip: 70, lipColor: 4, lipMode: "matte", blush: 30, blushColor: 2, shadow: 45, shadowColor: 5, liner: 60, lash: 55, brow: 35, contour: 40, highlight: 45}},
  {id: "smoky", name: "สโมกกี้", m: {lip: 45, lipColor: 6, lipMode: "matte", blush: 15, blushColor: 3, shadow: 65, shadowColor: 4, liner: 70, lash: 60, brow: 30, contour: 35, highlight: 25}},
];

// ------------------------------------------------------------------ helpers
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function pts(face, idx, w, h, ox = 0, oy = 0) { return idx.map(i => face[i]).filter(Boolean).map(p => [p.x * w - ox, p.y * h - oy]); }
function centroid(P) { let x = 0, y = 0; P.forEach(p => { x += p[0]; y += p[1]; }); return [x / P.length, y / P.length]; }
function scaleP(P, k) { const [cx, cy] = centroid(P); return P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); }
function path(c, P) { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }
/** Draws a feathered mask on a canvas region and returns its alpha as Float32 0..1. */
function mask(rw, rh, feather, draw) {
  const c = document.createElement("canvas"); c.width = rw; c.height = rh;
  const x = c.getContext("2d", {willReadFrequently: true});
  x.filter = feather > 0 ? `blur(${feather.toFixed(1)}px)` : "none";
  x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineJoin = "round"; x.lineCap = "round";
  draw(x);
  const d = x.getImageData(0, 0, rw, rh).data, m = new Float32Array(rw * rh);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}
function sample(d, w, h, x, y, out) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * w + x0) * 4, j = i + w * 4;
  for (let c = 0; c < 3; c++) out[c] = (d[i + c] * (1 - fx) + d[i + 4 + c] * fx) * (1 - fy) + (d[j + c] * (1 - fx) + d[j + 4 + c] * fx) * fy;
}

// ------------------------------------------------------------------ reshape (local warps)
function warpRegion(d, w, h, cx, cy, R, fn) {
  const x0 = Math.max(0, (cx - R) | 0), x1 = Math.min(w - 1, (cx + R) | 0), y0 = Math.max(0, (cy - R) | 0), y1 = Math.min(h - 1, (cy + R) | 0);
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1; if (rw < 2 || rh < 2) return;
  const src = new Uint8ClampedArray(d), t = [0, 0, 0], s = [0, 0];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; if (d2 >= R * R) continue;
    fn(dx, dy, d2, s); sample(src, w, h, s[0], s[1], t);
    const i = (y * w + x) * 4; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2];
  }
}
function bulge(d, w, h, cx, cy, R, k) { // k>0 enlarge, k<0 shrink
  warpRegion(d, w, h, cx, cy, R, (dx, dy, d2, s) => { const f = 1 - k * (1 - d2 / (R * R)); s[0] = cx + dx * f; s[1] = cy + dy * f; });
}
function push(d, w, h, cx, cy, R, mx, my) { // content at (cx,cy) moves by (mx,my)
  const m2 = mx * mx + my * my;
  warpRegion(d, w, h, cx, cy, R, (dx, dy, d2, s) => { const n = R * R - d2, f = n / (n + m2), ff = f * f; s[0] = cx + dx - ff * mx; s[1] = cy + dy - ff * my; });
}

// ------------------------------------------------------------------ main entry
/**
 * p = {smooth, acne, clear, even, underEye, teeth, eyes,          // skin 0..100
 *      lip, lipColor, lipMode, blush, blushColor, contour, highlight, shadow, shadowColor, liner, lash, brow,   // makeup
 *      slim, bigEyes, nose}                                        // shape
 */
export function hasBeauty(p) { return p && Object.keys(p).some(k => typeof p[k] === "number" && p[k] > 0 && !/Color$/.test(k)); }

export function applyBeauty(d, w, h, faces, p) {
  if (!faces || !faces.length || !hasBeauty(p)) return;
  for (const f of faces) {
    const oval = pts(f, IDX.oval, w, h);
    const xs = oval.map(q => q[0]), ys = oval.map(q => q[1]);
    const fw = Math.max(...xs) - Math.min(...xs), fh = Math.max(...ys) - Math.min(...ys);
    if (fw < 24) continue;
    // reshape first, on the whole image
    if (p.slim > 0) {
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      for (const rel of [.62, .8]) {
        const ty = Math.min(...ys) + fh * rel;
        const left = oval.filter(q => q[0] < cx).reduce((a, b) => Math.abs(b[1] - ty) < Math.abs(a[1] - ty) ? b : a);
        const right = oval.filter(q => q[0] >= cx).reduce((a, b) => Math.abs(b[1] - ty) < Math.abs(a[1] - ty) ? b : a);
        const amt = p.slim / 100 * fw * (rel > .7 ? .055 : .04);
        push(d, w, h, left[0], left[1], fw * .3, amt, 0); push(d, w, h, right[0], right[1], fw * .3, -amt, 0);
      }
    }
    if (p.bigEyes > 0) for (const e of [IDX.eyeR, IDX.eyeL]) { const c = centroid(pts(f, e, w, h)); bulge(d, w, h, c[0], c[1], fw * .14, p.bigEyes / 100 * .28); }
    if (p.nose > 0) { const tip = f[4] || f[1]; bulge(d, w, h, tip.x * w, tip.y * h + fh * .02, fw * .13, -p.nose / 100 * .22); }

    // region for skin + makeup work
    const pad = fw * .25, rx = Math.max(0, (Math.min(...xs) - pad) | 0), ry = Math.max(0, (Math.min(...ys) - pad * 1.2) | 0);
    const rx1 = Math.min(w, (Math.max(...xs) + pad) | 0), ry1 = Math.min(h, (Math.max(...ys) + pad * .6) | 0), rw = rx1 - rx, rh = ry1 - ry;
    if (rw < 16 || rh < 16) continue;
    const P = idx => pts(f, idx, w, h, rx, ry);
    const eyeR = P(IDX.eyeR), eyeL = P(IDX.eyeL), lipsO = P(IDX.lipsOut), lipsI = P(IDX.lipsIn), browR = P(IDX.browR), browL = P(IDX.browL);
    const reg = new Float32Array(rw * rh * 3);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = ((ry + y) * w + rx + x) * 4, j = (y * rw + x) * 3; reg[j] = d[i]; reg[j + 1] = d[i + 1]; reg[j + 2] = d[i + 2]; }

    const needSkin = p.smooth > 0 || p.acne > 0 || p.clear > 0 || p.even > 0;
    const skin = needSkin || p.contour > 0 || p.highlight > 0 ? mask(rw, rh, fw * .035, x => {
      path(x, P(IDX.oval)); x.fill();
      x.globalCompositeOperation = "destination-out"; x.filter = `blur(${(fw * .015).toFixed(1)}px)`;
      [scaleP(eyeR, 1.8), scaleP(eyeL, 1.8), scaleP(browR, 1.35), scaleP(browL, 1.35), scaleP(lipsO, 1.18)].forEach(q => { path(x, q); x.fill(); });
    }) : null;
    const big = needSkin ? boxBlur(reg, rw, rh, 3, Math.max(2, Math.round(fw * .022)), 3) : null;
    const fine = needSkin ? boxBlur(reg, rw, rh, 3, Math.max(1, Math.round(fw * .004)), 2) : null;
    const mid = p.acne > 0 ? boxBlur(reg, rw, rh, 3, Math.max(2, Math.round(fw * .012)), 2) : null;

    // spot (acne / blemish) map: darker or redder than the surrounding skin, small in size
    let spots = null;
    if (p.acne > 0) {
      spots = new Float32Array(rw * rh);
      for (let k = 0; k < rw * rh; k++) {
        if (skin[k] < .3) continue; const j = k * 3;
        const L = (reg[j] * .299 + reg[j + 1] * .587 + reg[j + 2] * .114), Lb = (mid[j] * .299 + mid[j + 1] * .587 + mid[j + 2] * .114);
        const red = reg[j] - (reg[j + 1] + reg[j + 2]) / 2, redB = mid[j] - (mid[j + 1] + mid[j + 2]) / 2;
        spots[k] = Math.max(smooth(6, 22, Lb - L), smooth(6, 20, red - redB)) * skin[k];
      }
      spots = boxBlur(spots, rw, rh, 1, Math.max(1, Math.round(fw * .006)), 2).map(v => Math.min(1, v * 2.2));
    }
    const under = p.underEye > 0 ? mask(rw, rh, fw * .03, x => {
      [[P(IDX.lowR)], [P(IDX.lowL)]].forEach(([low]) => {
        const eh = fw * .05, poly = low.concat(low.slice().reverse().map(([a, b]) => [a, b + eh * 1.6])); path(x, poly); x.fill();
      });
    }) : null;
    const teeth = p.teeth > 0 ? mask(rw, rh, fw * .006, x => { path(x, lipsI); x.fill(); }) : null;
    const eyes = p.eyes > 0 ? mask(rw, rh, fw * .006, x => { path(x, eyeR); x.fill(); path(x, eyeL); x.fill(); }) : null;
    const irisPts = [P(IDX.irisR), P(IDX.irisL)].filter(q => q.length === 5);
    const lip = p.lip > 0 ? mask(rw, rh, fw * .008, x => { path(x, lipsO); x.fill(); x.globalCompositeOperation = "destination-out"; path(x, scaleP(lipsI, .92)); x.fill(); }) : null;
    const lipCore = p.lip > 0 && p.lipMode === "tint" ? mask(rw, rh, fw * .05, x => { path(x, scaleP(lipsI, 1.25)); x.fill(); }) : null;
    const cheekR = f[50] || f[205], cheekL = f[280] || f[425];
    const blush = p.blush > 0 ? mask(rw, rh, fw * .07, x => {
      [cheekR, cheekL].forEach(c => { if (!c) return; x.beginPath(); x.ellipse(c.x * w - rx, c.y * h - ry - fh * .02, fw * .12, fw * .085, 0, 0, 7); x.fill(); });
    }) : null;
    const contour = p.contour > 0 ? mask(rw, rh, fw * .06, x => {
      [[234, 61], [454, 291]].forEach(([a, b]) => { const A = f[a], B = f[b]; if (!A || !B) return;
        const cx = A.x * w - rx + (B.x - A.x) * w * .32, cy = A.y * h - ry + (B.y - A.y) * h * .32 + fh * .06;
        x.beginPath(); x.ellipse(cx, cy, fw * .14, fw * .05, Math.atan2((B.y - A.y) * h, (B.x - A.x) * w), 0, 7); x.fill(); });
    }) : null;
    const hilite = p.highlight > 0 ? mask(rw, rh, fw * .03, x => {
      const n1 = f[6], n2 = f[4]; if (n1 && n2) { x.lineWidth = fw * .045; x.beginPath(); x.moveTo(n1.x * w - rx, n1.y * h - ry); x.lineTo(n2.x * w - rx, n2.y * h - ry - fh * .03); x.stroke(); }
      [116, 345].forEach(k => { const c = f[k]; if (!c) return; x.beginPath(); x.ellipse(c.x * w - rx, c.y * h - ry, fw * .07, fw * .035, 0, 0, 7); x.fill(); });
    }) : null;
    // index 0 of each lid list is the outer eye corner, the last is the inner corner
    const lidBand = (lid, bl, frac) => { const L1 = P(lid), B1 = P(bl);
      const top = L1.map(([a, b2]) => { const q = B1.reduce((u, v) => Math.hypot(v[0] - a, v[1] - b2) < Math.hypot(u[0] - a, u[1] - b2) ? v : u); return [a + (q[0] - a) * frac, b2 + (q[1] - b2) * frac]; });
      return L1.concat(top.reverse()); };
    const shadow = p.shadow > 0 ? mask(rw, rh, fw * .025, x => {
      [[IDX.lidR, IDX.browLowR], [IDX.lidL, IDX.browLowL]].forEach(([lid, bl]) => { path(x, lidBand(lid, bl, .5)); x.fill(); });
    }) : null;
    const liner = p.liner > 0 || p.lash > 0 ? mask(rw, rh, fw * .004, x => {
      [IDX.lidR, IDX.lidL].forEach(lid => {
        const L1 = P(lid), outer = L1[0], inner = L1[L1.length - 1], dir = Math.sign(outer[0] - inner[0]) || 1;
        x.lineWidth = fw * (.006 + (p.lash || 0) / 100 * .008);
        x.beginPath(); L1.forEach(([a, b2], i) => i ? x.lineTo(a, b2 - fw * .004) : x.moveTo(a, b2 - fw * .004));
        x.moveTo(outer[0], outer[1] - fw * .004); x.lineTo(outer[0] + dir * fw * .045 * Math.max(.3, (p.liner || 0) / 100), outer[1] - fw * .022); x.stroke();
      });
    }) : null;
    const brow = p.brow > 0 ? mask(rw, rh, fw * .006, x => { path(x, browR); x.fill(); path(x, browL); x.fill(); }) : null;

    const lc = hex(MAKEUP_COLORS.lip[p.lipColor | 0] || MAKEUP_COLORS.lip[0]), bcol = hex(MAKEUP_COLORS.blush[p.blushColor | 0] || MAKEUP_COLORS.blush[0]), sc = hex(MAKEUP_COLORS.shadow[p.shadowColor | 0] || MAKEUP_COLORS.shadow[0]);
    const k = v => (v || 0) / 100;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const m = y * rw + x, j = m * 3, i = ((ry + y) * w + rx + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const r0 = reg[j], g0 = reg[j + 1], b0 = reg[j + 2];
      if (skin && skin[m] > .002) {
        const s = skin[m];
        if (p.smooth > 0) { // frequency separation: smooth low frequencies, keep a little pore texture
          const hiR = r0 - fine[j], hiG = g0 - fine[j + 1], hiB = b0 - fine[j + 2];
          const diff = (Math.abs(r0 - big[j]) + Math.abs(g0 - big[j + 1]) + Math.abs(b0 - big[j + 2])) / 3;
          const ws = s * k(p.smooth) * .9 * (.35 + .65 * (1 - smooth(18, 60, diff)));
          r += (big[j] + hiR * .55 - r) * ws; g += (big[j + 1] + hiG * .55 - g) * ws; b += (big[j + 2] + hiB * .55 - b) * ws;
        }
        if (spots && spots[m] > .01) { const ws = spots[m] * k(p.acne); r += (mid[j] - r) * ws; g += (mid[j + 1] - g) * ws; b += (mid[j + 2] - b) * ws; }
        if (p.even > 0) { const t = s * k(p.even); r -= (r - g) * .2 * t; b += (g - b) * .06 * t; }
        if (p.clear > 0) { const t = s * k(p.clear) * .2; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
        if (contour) { const t = contour[m] * k(p.contour) * .22; r *= 1 - t; g *= 1 - t * 1.1; b *= 1 - t * 1.15; }
        if (hilite) { const t = hilite[m] * k(p.highlight) * .2; r += (255 - r) * t; g += (250 - g) * t; b += (240 - b) * t; }
      }
      if (under && under[m] > .01) { const t = under[m] * k(p.underEye) * .28; r += (255 - r) * t * .9; g += (240 - g) * t * .85; b += (225 - b) * t * .7; }
      if (teeth && teeth[m] > .01) { const L = (r + g + b) / 3; if (L > 80) { const t = teeth[m] * k(p.teeth) * smooth(80, 150, L); const avg = (r + g + b) / 3; r += (avg + 25 - r) * t * .6; g += (avg + 25 - g) * t * .6; b += (avg + 32 - b) * t * .8; } }
      if (eyes && eyes[m] > .01) { const t = eyes[m] * k(p.eyes); const avg = (r + g + b) / 3; r += (avg - r) * t * .35; r += (255 - r) * t * .08; g += (255 - g) * t * .08; b += (255 - b) * t * .1; }
      if (shadow && shadow[m] > .01) { const t = shadow[m] * k(p.shadow) * .55; r += (r * sc[0] / 255 - r) * t; g += (g * sc[1] / 255 - g) * t; b += (b * sc[2] / 255 - b) * t; }
      if (brow && brow[m] > .01) { const t = brow[m] * k(p.brow) * .4; r *= 1 - t * .55; g *= 1 - t * .6; b *= 1 - t * .62; }
      if (liner && liner[m] > .01) { const t = liner[m] * Math.max(k(p.liner), k(p.lash)) * .85; r *= 1 - t * .85; g *= 1 - t * .87; b *= 1 - t * .85; }
      if (blush && blush[m] > .01) { const t = blush[m] * k(p.blush) * .32; r += (r * bcol[0] / 230 - r) * t; g += (g * bcol[1] / 255 - g) * t; b += (b * bcol[2] / 255 - b) * t; }
      if (lip && lip[m] > .01) {
        let t = lip[m] * k(p.lip) * .75; if (lipCore) t *= .35 + .65 * lipCore[m];
        const lr = Math.min(255, r * lc[0] / 200), lg = Math.min(255, g * lc[1] / 200), lb = Math.min(255, b * lc[2] / 200);
        r += (lr - r) * t; g += (lg - g) * t; b += (lb - b) * t;
        if (p.lipMode === "gloss") { const L = (r0 + g0 + b0) / 765, sp = smooth(.45, .75, L) * lip[m] * k(p.lip) * .5; r += (255 - r) * sp; g += (255 - g) * sp; b += (255 - b) * sp; }
        if (p.lipMode === "matte") { const avg = (r + g + b) / 3; r += (avg - r) * .08 * t; g += (avg - g) * .08 * t; b += (avg - b) * .08 * t; }
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    // iris: brighter, crisper
    if (p.eyes > 0) irisPts.forEach(I => {
      const [cx, cy] = centroid(I), rad = Math.hypot(I[1][0] - cx, I[1][1] - cy) * 1.05;
      for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(rh, cy + rad); y++) for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(rw, cx + rad); x++) {
        const dd = Math.hypot(x - cx, y - cy) / rad; if (dd > 1) continue; const t = (1 - dd) * k(p.eyes) * .25, i = ((ry + y) * w + rx + x) * 4;
        d[i] += (255 - d[i]) * t * .6; d[i + 1] += (255 - d[i + 1]) * t * .6; d[i + 2] += (255 - d[i + 2]) * t * .6;
      }
    });
  }
}
