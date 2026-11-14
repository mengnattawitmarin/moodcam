// On-device person segmentation (MediaPipe selfie multiclass: background / hair / skin / clothes) + background replacement.
let seg = null, loading = null;
export function loadSeg() {
  if (seg) return Promise.resolve(seg);
  if (!loading) loading = (async () => {
    const base = new URL("../vendor/", import.meta.url).href;
    const vision = await import(base + "mediapipe/vision_bundle.mjs");
    const files = await vision.FilesetResolver.forVisionTasks(base + "mediapipe/wasm");
    seg = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: {modelAssetPath: base + "models/selfie_multiclass_256x256.tflite", delegate: "CPU"},
      runningMode: "IMAGE", outputCategoryMask: false, outputConfidenceMasks: true,
    });
    return seg;
  })().catch(e => { loading = null; throw e; });
  return loading;
}

/** Person alpha (0..1) at the canvas size. */
export async function personAlpha(canvas) {
  const s = await loadSeg(), r = s.segment(canvas);
  const masks = r.confidenceMasks, bg = masks[0], w = bg.width, h = bg.height, d = bg.getAsFloat32Array();
  let a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = 1 - d[i];
  masks.forEach(m => m.close && m.close()); r.close && r.close();
  if (w !== canvas.width || h !== canvas.height) a = resize(a, w, h, canvas.width, canvas.height);
  return a;
}
function resize(a, w, h, W, H) {
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { const fy = (y + .5) * h / H - .5, y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), ty = Math.max(0, fy - y0);
    for (let x = 0; x < W; x++) { const fx = (x + .5) * w / W - .5, x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), tx = Math.max(0, fx - x0);
      o[y * W + x] = (a[y0 * w + x0] * (1 - tx) + a[y0 * w + x1] * tx) * (1 - ty) + (a[y1 * w + x0] * (1 - tx) + a[y1 * w + x1] * tx) * ty; } }
  return o;
}
function blur(a, w, h, r) { // separable box blur, 2 passes ≈ gaussian
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? o : a;
    for (let y = 0; y < h; y++) { let s = 0, row = y * w; for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  }
  return o;
}

function box1(a, w, h, r) { // one-pass box mean (for the guided filter)
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0, row = y * w; for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[row + x] = s / n; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}
/** Guided filter (He et al.): snaps the soft model mask onto the photo's real edges (hair strands, shoulders). */
function guided(I, p, w, h, r, eps) {
  const N = I.length, Ip = new Float32Array(N), II = new Float32Array(N);
  for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = box1(I, w, h, r), mp = box1(p, w, h, r), mIp = box1(Ip, w, h, r), mII = box1(II, w, h, r), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) { const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]; A[i] = cov / (v + eps); B[i] = mp[i] - A[i] * mI[i]; }
  const mA = box1(A, w, h, r), mB = box1(B, w, h, r), q = new Float32Array(N);
  for (let i = 0; i < N; i++) q[i] = Math.min(1, Math.max(0, mA[i] * I[i] + mB[i]));
  return q;
}

/** New canvas with the background replaced. color = hex, or "limbo" for a seamless studio white with soft light fall-off and a faint contact shadow.
 *  Edges: model mask → guided filter on the photo → feather; old-background colour spill is removed at the edge. */
export async function replaceBackground(src, color) {
  const w = src.width, h = src.height, g = src.getContext("2d"), img = g.getImageData(0, 0, w, h), d = img.data, N = w * h;
  let a = await personAlpha(src);
  // 1) firm up the model mask, 2) edge-aware refinement guided by the photo, 3) gentle final feather
  for (let i = 0; i < N; i++) { const t = Math.min(1, Math.max(0, (a[i] - .25) / .5)); a[i] = t * t * (3 - 2 * t); }
  const L = new Float32Array(N); for (let i = 0; i < N; i++) L[i] = (.299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]) / 255;
  a = guided(L, a, w, h, Math.max(3, Math.round(w / 110)), 2e-4);
  a = guided(L, a, w, h, Math.max(2, Math.round(w / 260)), 1e-4);
  for (let i = 0; i < N; i++) { const t = Math.min(1, Math.max(0, (a[i] - .08) / .84)); a[i] = t * t * (3 - 2 * t); }
  // local estimate of the old background colour (spill removal)
  const R = Math.max(4, Math.round(w / 25)), wb = new Float32Array(N), cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
  for (let i = 0; i < N; i++) { const k = (1 - a[i]) ** 2; wb[i] = k; cr[i] = d[i * 4] * k; cg[i] = d[i * 4 + 1] * k; cb[i] = d[i * 4 + 2] * k; }
  const bw = blur(wb, w, h, R), br = blur(cr, w, h, R), bgc = blur(cg, w, h, R), bb = blur(cb, w, h, R);
  let mr = 0, mg = 0, mb = 0, mw = 0; for (let i = 0; i < N; i++) { mr += cr[i]; mg += cg[i]; mb += cb[i]; mw += wb[i]; }
  mr /= mw || 1; mg /= mw || 1; mb /= mw || 1;
  // new background, per pixel
  const limbo = color === "limbo", n = limbo ? 0xffffff : parseInt(color.slice(1), 16), nr = n >> 16, ng = n >> 8 & 255, nb = n & 255;
  let shadow = null;
  if (limbo) { // faint, very soft shadow from the subject, nudged down-right like a big soft key light
    const sh = new Float32Array(N), dx = Math.round(w * .012), dy = Math.round(h * .018);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x - dx, sy = y - dy; sh[y * w + x] = sx >= 0 && sy >= 0 ? a[sy * w + sx] : 0; }
    shadow = blur(sh, w, h, Math.max(6, Math.round(w / 22)));
  }
  const cx = w / 2, cy = h * .4, diag = Math.hypot(w, h) / 2;
  for (let i = 0; i < N; i++) {
    const al = a[i], k = 1 - al; if (k <= 0.002) continue;
    let tr = nr, tg = ng, tb = nb;
    if (limbo) {
      const x = i % w, y = (i / w) | 0, dd = Math.hypot(x - cx, (y - cy) * 1.15) / diag, f = Math.min(1, Math.max(0, (dd - .3) / .75));
      const fall = 255 - 13 * f * f * (3 - 2 * f) - (y > h * .7 ? (y - h * .7) / (h * .3) * 4 : 0), s = 1 - .075 * shadow[i];
      tr = tg = fall * s; tb = Math.min(255, fall * s + .6);
    }
    const ww = bw[i] > 1e-3, or = ww ? br[i] / bw[i] : mr, og = ww ? bgc[i] / bw[i] : mg, ob = ww ? bb[i] / bw[i] : mb;
    d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + k * (tr - or)));
    d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + k * (tg - og)));
    d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + k * (tb - ob)));
  }
  const o = document.createElement("canvas"); o.width = w; o.height = h; o.getContext("2d").putImageData(img, 0, 0);
  return o;
}
