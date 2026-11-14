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

/** New canvas with the background replaced by `color` (hex). Edges are feathered and old-background colour spill is removed. */
export async function replaceBackground(src, color) {
  const w = src.width, h = src.height, g = src.getContext("2d"), img = g.getImageData(0, 0, w, h), d = img.data;
  let a = await personAlpha(src);
  // tighten the soft model edge, then feather a little
  a = blur(a, w, h, Math.max(1, Math.round(w / 500)));
  for (let i = 0; i < a.length; i++) { const t = Math.min(1, Math.max(0, (a[i] - .3) / .4)); a[i] = t * t * (3 - 2 * t); }
  // local estimate of the old background colour (for spill removal at the hair / shoulder edge)
  const R = Math.max(4, Math.round(w / 25)), wb = new Float32Array(w * h), cr = new Float32Array(w * h), cg = new Float32Array(w * h), cb = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) { const k = (1 - a[i]) ** 2; wb[i] = k; cr[i] = d[i * 4] * k; cg[i] = d[i * 4 + 1] * k; cb[i] = d[i * 4 + 2] * k; }
  const bw = blur(wb, w, h, R), br = blur(cr, w, h, R), bgc = blur(cg, w, h, R), bb = blur(cb, w, h, R);
  let mr = 0, mg = 0, mb = 0, mw = 0; for (let i = 0; i < a.length; i++) { mr += cr[i]; mg += cg[i]; mb += cb[i]; mw += wb[i]; }
  mr /= mw || 1; mg /= mw || 1; mb /= mw || 1;
  const n = parseInt(color.slice(1), 16), nr = n >> 16, ng = n >> 8 & 255, nb = n & 255;
  for (let i = 0; i < a.length; i++) {
    const al = a[i], k = 1 - al; if (k <= 0.002) continue;
    const ww = bw[i] > 1e-3 ? 1 : 0, or = ww ? br[i] / bw[i] : mr, og = ww ? bgc[i] / bw[i] : mg, ob = ww ? bb[i] / bw[i] : mb;
    // I = F·a + B0·(1-a)  →  out = F·a + N·(1-a) = I + (1-a)(N - B0)
    d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + k * (nr - or)));
    d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + k * (ng - og)));
    d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + k * (nb - ob)));
  }
  const o = document.createElement("canvas"); o.width = w; o.height = h; o.getContext("2d").putImageData(img, 0, 0);
  return o;
}
