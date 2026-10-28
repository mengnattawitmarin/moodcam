// MoonCam effects: simulated lenses, simulated camera bodies, weather. All on-device.
import {boxBlur, smooth, applyAdjust, A, hash} from "./engine.js";

const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctx2 = c => c.getContext("2d", {willReadFrequently: true});

// Seeded random so a photo always gets the same snow / rain / grain layout.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; }

function bilinear(d, w, h, x, y, out) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * w + x0) * 4, j = i + w * 4;
  for (let c = 0; c < 3; c++) out[c] = (d[i + c] * (1 - fx) + d[i + 4 + c] * fx) * (1 - fy) + (d[j + c] * (1 - fx) + d[j + 4 + c] * fx) * fy;
}

// ---------------------------------------------------------------- lens geometry
export function lensGeometry(src, lens) {
  if (!lens || lens.id === "natural") return src;
  const w = src.width, h = src.height;
  let c = src;
  if (lens.crop && lens.crop > 1) { // tighter field of view, like a longer lens
    c = cv(w, h); const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
    const sw = w / lens.crop, sh = h / lens.crop; x.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h);
  }
  if (lens.barrel) {
    const s = ctx2(c).getImageData(0, 0, w, h), o = new ImageData(w, h), sd = s.data, od = o.data, k = lens.barrel, tmp = [0, 0, 0];
    const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), rad = Math.min(w, h) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / R, dy = (y - cy) / R, r2 = dx * dx + dy * dy, f = (1 + k * r2) / (1 + k);
      const i = (y * w + x) * 4;
      if (lens.circle && Math.hypot(x - cx, y - cy) > rad) { od[i] = od[i + 1] = od[i + 2] = 0; od[i + 3] = 255; continue; }
      bilinear(sd, w, h, cx + dx * f * R, cy + dy * f * R, tmp);
      od[i] = tmp[0]; od[i + 1] = tmp[1]; od[i + 2] = tmp[2]; od[i + 3] = 255;
    }
    c = cv(w, h); c.getContext("2d").putImageData(o, 0, 0);
  }
  return c;
}

// ---------------------------------------------------------------- lens optics (on graded pixels)
export function lensOptics(d, w, h, lens) {
  if (!lens || lens.id === "natural") return;
  if (lens.bokeh) radialBlur(d, w, h, lens.bokeh);
  if (lens.soft) softGlow(d, w, h, lens.soft);
  if (lens.streak) anamorphicStreak(d, w, h, lens.streak);
  if (lens.ca) chromaticAberration(d, w, h, lens.ca);
  if (lens.vig) vignette(d, w, h, lens.vig, lens.oval);
}

function blurredCopy(d, w, h, radiusFrac, scale = 4) {
  const sw = Math.max(2, Math.ceil(w / scale)), sh = Math.max(2, Math.ceil(h / scale)), f = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (Math.min(h - 1, y * scale) * w + Math.min(w - 1, x * scale)) * 4, j = (y * sw + x) * 3;
    f[j] = d[i]; f[j + 1] = d[i + 1]; f[j + 2] = d[i + 2];
  }
  return {b: boxBlur(f, sw, sh, 3, Math.max(1, Math.round(Math.min(sw, sh) * radiusFrac)), 3), sw, sh, scale};
}
function sampleBlur(bc, x, y, out) {
  const {b, sw, sh, scale} = bc, fx = Math.min(sw - 1.001, x / scale), fy = Math.min(sh - 1.001, y / scale), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
  const o = (y0 * sw + x0) * 3, o2 = o + sw * 3;
  for (let c = 0; c < 3; c++) out[c] = (b[o + c] * (1 - tx) + b[o + 3 + c] * tx) * (1 - ty) + (b[o2 + c] * (1 - tx) + b[o2 + 3 + c] * tx) * ty;
}
function radialBlur(d, w, h, amt) {
  const bc = blurredCopy(d, w, h, .025), t = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x / w - .5) * 1.25, ny = (y / h - .45) * 1.05, m = smooth(.28, .62, Math.hypot(nx, ny)) * amt;
    if (m < .01) continue; const i = (y * w + x) * 4; sampleBlur(bc, x, y, t);
    d[i] += (t[0] - d[i]) * m; d[i + 1] += (t[1] - d[i + 1]) * m; d[i + 2] += (t[2] - d[i + 2]) * m;
  }
}
function softGlow(d, w, h, amt) {
  const bc = blurredCopy(d, w, h, .02), t = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; sampleBlur(bc, x, y, t);
    const l = (t[0] + t[1] + t[2]) / 765, k = amt * .55 * l;
    for (let c = 0; c < 3; c++) d[i + c] = 255 - (255 - d[i + c]) * (1 - (t[c] / 255) * k);
  }
}
function anamorphicStreak(d, w, h, amt) {
  const sc = 4, sw = Math.ceil(w / sc), sh = Math.ceil(h / sc), m = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (Math.min(h - 1, y * sc) * w + Math.min(w - 1, x * sc)) * 4, l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
    m[y * sw + x] = Math.pow(Math.max(0, (l - .72) / .28), 2);
  }
  // long horizontal blur only
  const r = Math.max(2, Math.round(sw * .18)), out = new Float32Array(sw * sh);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < sh; y++) { let s = 0; const o = y * sw; for (let k = -r; k <= r; k++) s += m[o + Math.min(sw - 1, Math.max(0, k))];
      for (let x = 0; x < sw; x++) { out[o + x] = s / (2 * r + 1); s += m[o + Math.min(sw - 1, x + r + 1)] - m[o + Math.max(0, x - r)]; } }
    m.set(out);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = m[Math.min(sh - 1, (y / sc) | 0) * sw + Math.min(sw - 1, (x / sc) | 0)] * amt * 2.2; if (v < .003) continue;
    const i = (y * w + x) * 4;
    d[i] = 255 - (255 - d[i]) * (1 - Math.min(1, v * .45)); d[i + 1] = 255 - (255 - d[i + 1]) * (1 - Math.min(1, v * .7)); d[i + 2] = 255 - (255 - d[i + 2]) * (1 - Math.min(1, v));
  }
}
function chromaticAberration(d, w, h, amt) {
  const src = new Uint8ClampedArray(d), cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), px = Math.max(1, w * .004 * amt);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / R, dy = (y - cy) / R, r = Math.hypot(dx, dy); if (r < .35) continue;
    const s = px * (r - .35) / .65, ux = dx / (r || 1), uy = dy / (r || 1), i = (y * w + x) * 4;
    const xr = Math.min(w - 1, Math.max(0, Math.round(x + ux * s))), yr = Math.min(h - 1, Math.max(0, Math.round(y + uy * s)));
    const xb = Math.min(w - 1, Math.max(0, Math.round(x - ux * s))), yb = Math.min(h - 1, Math.max(0, Math.round(y - uy * s)));
    d[i] = src[(yr * w + xr) * 4]; d[i + 2] = src[(yb * w + xb) * 4 + 2];
  }
}
function vignette(d, w, h, amt, oval) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = x / w - .5, ny = (y / h - .5) * (oval ? 1.35 : 1), m = 1 - amt * .8 * smooth(.38, .95, Math.hypot(nx, ny) * 1.414), i = (y * w + x) * 4;
    d[i] *= m; d[i + 1] *= m; d[i + 2] *= m;
  }
}

// ---------------------------------------------------------------- camera body character
export function bodyAdj(body) { return body && body.adj ? body.adj : null; }
export function bodyFx(d, w, h, body, seed = 7) {
  if (!body || body.id === "none") return;
  if (body.flash) { // built-in flash: hot centre, falling off to the corners
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = x / w - .5, ny = y / h - .5, r2 = (nx * nx + ny * ny) * 2, m = 1 + body.flash * (.32 - .75 * r2), i = (y * w + x) * 4;
      d[i] *= m; d[i + 1] *= m; d[i + 2] *= m;
    }
  }
  if (body.sharpen) {
    const bc = blurredCopy(d, w, h, .004, 2), t = [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; sampleBlur(bc, x, y, t); for (let c = 0; c < 3; c++) d[i + c] += (d[i + c] - t[c]) * body.sharpen; }
  }
  if (body.soft) softCorners(d, w, h, body.soft);
  if (body.chroma) { // VHS colour bleed
    const src = new Uint8ClampedArray(d), s = Math.max(1, Math.round(w * .006 * body.chroma));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = src[(y * w + Math.min(w - 1, x + s)) * 4]; d[i + 2] = src[(y * w + Math.max(0, x - s)) * 4 + 2]; }
  }
  if (body.scan) { const period = Math.max(2, Math.round(h / 260)); for (let y = 0; y < h; y++) if (y % period === 0) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, m = 1 - body.scan * .45; d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; } }
  if (body.noise) { const r = rng(seed); const a = body.noise * 26; for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * a; d[i] += n + (r() - .5) * a * .6; d[i + 1] += n; d[i + 2] += n + (r() - .5) * a * .6; } }
}
function softCorners(d, w, h, amt) {
  const bc = blurredCopy(d, w, h, .012), t = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = smooth(.35, .75, Math.hypot(x / w - .5, y / h - .5) * 1.414) * amt; if (m < .01) continue;
    const i = (y * w + x) * 4; sampleBlur(bc, x, y, t); d[i] += (t[0] - d[i]) * m; d[i + 1] += (t[1] - d[i + 1]) * m; d[i + 2] += (t[2] - d[i + 2]) * m;
  }
}

// ---------------------------------------------------------------- weather
export const WEATHER = [
  ["none", "ปิด"], ["sunny", "☀️ แดดใส"], ["golden", "🌅 เย็นทอง"], ["snow", "❄️ หิมะ"], ["rain", "🌧 ฝน"], ["fog", "🌫 หมอก"],
];

// Finds the sky: bright, low-texture, sky-coloured pixels connected to the top edge.
export function skyMask(d, w, h) {
  const sc = 4, sw = Math.ceil(w / sc), sh = Math.ceil(h / sc), m = new Float32Array(sw * sh);
  const L = new Float32Array(sw * sh), ok = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (Math.min(h - 1, y * sc) * w + Math.min(w - 1, x * sc)) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const l = (.299 * r + .587 * g + .114 * b) / 255, mx = Math.max(r, g, b), s = mx ? (mx - Math.min(r, g, b)) / mx : 0;
    L[y * sw + x] = l;
    ok[y * sw + x] = ((s < .2 && l > .68) || (l > .42 && b >= r + 6 && b > g - 18 && s > .08)) ? 1 : 0; // overcast must be bright; blue sky must be blue
  }
  for (let x = 0; x < sw; x++) {
    for (let y = 0; y < sh * .75; y++) {
      const j = y * sw + x, grad = y > 0 ? Math.abs(L[j] - L[j - sw]) : 0, side = x > 0 ? Math.abs(L[j] - L[j - 1]) : 0;
      if (!ok[j] || grad > .07 || side > .12) break;
      m[j] = 1;
    }
  }
  const area = m.reduce((a, b) => a + b, 0) / (sw * sh);
  const b = boxBlur(m, sw, sh, 1, Math.max(1, Math.round(Math.min(sw, sh) * .02)), 2);
  return {m: b, sw, sh, sc, area};
}
function maskAt(M, x, y) { return M.m[Math.min(M.sh - 1, (y / M.sc) | 0) * M.sw + Math.min(M.sw - 1, (x / M.sc) | 0)]; }

function valueNoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1);
  return ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + e * sx) * sy) * .5 + .5; }
function clouds(x, y) { let v = 0, a = .5, f = 1; for (let o = 0; o < 4; o++) { v += valueNoise(x * f, y * f) * a; a *= .5; f *= 2.1; } return v; }

export function weatherFx(canvas, mode, amount = 1, seed = 11) {
  if (!mode || mode === "none" || amount <= 0) return canvas;
  const w = canvas.width, h = canvas.height, out = cv(w, h), x = out.getContext("2d");
  x.drawImage(canvas, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data, k = amount;

  if (mode === "sunny" || mode === "golden") {
    const M = skyMask(d, w, h), sunX = w * (mode === "golden" ? .3 : .78), sunY = h * (mode === "golden" ? .34 : .1);
    const top = mode === "golden" ? [52, 64, 128] : [52, 118, 210], mid = mode === "golden" ? [238, 132, 88] : [96, 160, 228], hor = mode === "golden" ? [255, 212, 150] : [178, 216, 244];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const m = maskAt(M, xx, yy) * k; if (m < .01) continue;
      const t = Math.min(1, yy / (h * .55)), col = t < .5 ? top.map((c, i) => c + (mid[i] - c) * t * 2) : mid.map((c, i) => c + (hor[i] - c) * (t - .5) * 2);
      const cl = smooth(.52, .78, clouds(xx / w * 3.2, yy / h * 6)) * (mode === "golden" ? .55 : .85);
      const ccol = mode === "golden" ? [255, 196, 160] : [255, 255, 255];
      const i = (yy * w + xx) * 4;
      for (let c = 0; c < 3; c++) { const sky = col[c] + (ccol[c] - col[c]) * cl; d[i + c] += (sky - d[i + c]) * m; }
    }
    // sunlight grade on everything
    applyAdjust(d, w, h, A(mode === "golden"
      ? {temp: 34 * k, tint: 6 * k, contrast: 18 * k, saturation: 12 * k, highlightTintHue: 35, highlightTintAmt: 50 * k, shadowTintHue: 260, shadowTintAmt: 18 * k}
      : {temp: 16 * k, exposure: 8 * k, contrast: 22 * k, vibrance: 22 * k, saturation: 8 * k, highlights: -10 * k, shadowTintHue: 215, shadowTintAmt: 15 * k}));
    // sun glow + small lens flare
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx - sunX, yy - sunY) / Math.max(w, h), g = Math.exp(-r * r * 22) * .85 * k + Math.exp(-r * r * 400) * .9 * k;
      if (g < .004) continue; const i = (yy * w + xx) * 4, tint = mode === "golden" ? [1, .82, .55] : [1, .97, .88];
      for (let c = 0; c < 3; c++) d[i + c] = 255 - (255 - d[i + c]) * (1 - Math.min(1, g * tint[c]));
    }
    x.putImageData(id, 0, 0);
    x.globalCompositeOperation = "screen";
    const dx = w / 2 - sunX, dy = h / 2 - sunY;
    [[.45, .05, "rgba(255,200,120,.18)"], [.75, .03, "rgba(120,200,255,.14)"], [1.1, .07, "rgba(255,160,200,.10)"]].forEach(([t, r, c]) => {
      const gx = sunX + dx * t * 2, gy = sunY + dy * t * 2, rr = Math.max(w, h) * r, gr = x.createRadialGradient(gx, gy, 0, gx, gy, rr);
      gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
    });
    x.globalCompositeOperation = "source-over";
    return out;
  }

  if (mode === "snow") {
    applyAdjust(d, w, h, A({temp: -16 * k, saturation: -22 * k, exposure: 6 * k, fade: 8 * k, shadowTintHue: 210, shadowTintAmt: 20 * k}));
    for (let i = 0; i < d.length; i += 4) { // snow settling on bright, flat surfaces
      const l = (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) / 255, m = smooth(.5, .8, l) * .45 * k;
      d[i] += (245 - d[i]) * m; d[i + 1] += (248 - d[i + 1]) * m; d[i + 2] += (255 - d[i + 2]) * m;
    }
    x.putImageData(id, 0, 0);
    const r = rng(seed), unit = Math.min(w, h);
    [[1400, .002, .55], [500, .005, .7], [90, .012, .5]].forEach(([n, size, alpha]) => {
      for (let i = 0; i < n * k; i++) {
        const px = r() * w, py = r() * h, rr = unit * size * (.5 + r()), g = x.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    });
    return out;
  }

  if (mode === "rain") {
    applyAdjust(d, w, h, A({exposure: -8 * k, temp: -14 * k, contrast: 12 * k, saturation: -16 * k, shadowTintHue: 205, shadowTintAmt: 30 * k}));
    for (let yy = (h * .62) | 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { // wet ground sheen
      const i = (yy * w + xx) * 4, l = (d[i] + d[i + 1] + d[i + 2]) / 765, m = smooth(.35, .8, l) * .25 * k * ((yy - h * .62) / (h * .38));
      d[i] += (180 - d[i]) * m * .5; d[i + 1] += (200 - d[i + 1]) * m * .6; d[i + 2] += (230 - d[i + 2]) * m;
    }
    x.putImageData(id, 0, 0);
    const r = rng(seed), unit = Math.min(w, h); x.lineCap = "round";
    [[900, .035, .18, 1], [260, .07, .28, 2]].forEach(([n, len, a, lw]) => {
      x.strokeStyle = `rgba(220,232,255,${a})`; x.lineWidth = Math.max(1, unit * .0016 * lw);
      x.beginPath();
      for (let i = 0; i < n * k; i++) { const px = r() * w, py = r() * h, l = unit * len * (.6 + r() * .8); x.moveTo(px, py); x.lineTo(px - l * .22, py + l); }
      x.stroke();
    });
    return out;
  }

  if (mode === "fog") {
    const fog = [214, 220, 226];
    for (let yy = 0; yy < h; yy++) { const depth = Math.pow(1 - yy / h, .7);
      for (let xx = 0; xx < w; xx++) { const i = (yy * w + xx) * 4, m = Math.min(.85, k * (.25 + .6 * depth));
        for (let c = 0; c < 3; c++) d[i + c] += (fog[c] - d[i + c]) * m; } }
    applyAdjust(d, w, h, A({contrast: -10 * k, saturation: -12 * k, temp: -6 * k}));
    x.putImageData(id, 0, 0);
    return out;
  }
  return canvas;
}
