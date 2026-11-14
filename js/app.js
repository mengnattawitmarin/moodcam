// MoonCam v4 — app controller (camera, editor, photo dump, film roll, privacy, device sync).
import * as E from "./engine.js";
import {PRESETS, CATS, LENSES, BODIES} from "./looks.js";
import * as FX from "./fx.js";
import * as F from "./face.js";
import * as SO from "./social.js";
import * as EX from "./exif.js";
import * as CAM from "./camera.js";
import {detectDevice} from "./device.js";
import * as AN from "./analog.js";
import * as VI from "./visa.js";
import * as SG from "./segment.js";
import * as DB from "./store.js";

const VERSION = "v6";
const APP_URL = "https://mengnattawitmarin.github.io/moodcam/";
const $ = q => document.querySelector(q);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = id => `<svg class="i"><use href="#i-${id}"/></svg>`;
const LS = {
  get(k, d) { try { const v = localStorage.getItem("mc." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("mc." + k, JSON.stringify(v)); } catch (e) {} },
};
const bridge = window.MoodCamAndroid || null;
const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
let toastT; function toast(m, ms = 2600) { let t = $(".toast"); if (!t) { t = el("div", "toast"); t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; t.style.animation = "none"; void t.offsetWidth; t.style.animation = ""; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }

// ------------------------------------------------------------------ preferences & state
const prefs = Object.assign({grid: true, center: false, gps: false, stripGpsOnShare: false, keepExif: true, quality: .95, deviceProfile: true, rollSize: 24, ratio: "3:4", timer: 0, flash: "off", lastLook: "teal_orange", strength: 100, level: false, histo: false, sound: true, mirror: true, tapShoot: false, tray: "looks", editAfter: false, instantModel: "classic", instantFrame: 0, instantFmt: "card", pack: 10, film: "sunny_gold", advanced: true, visaSpec: "schengen"}, LS.get("prefs", {}));
const savePrefs = () => LS.set("prefs", prefs);
let mine = LS.get("looks", []).map(l => Object.assign(l, {adj: E.A(l.adj)}));
const saveMine = () => LS.set("looks", mine);
const allLooks = () => mine.concat(PRESETS);
let device = {preview: 1400, exportMax: 4000, profile: {adj: {}, note: ""}, brandName: "", model: ""};

const S = {lookId: "original", lookName: "Original", adj: E.defAdj(), ref: null, strength: prefs.strength, beauty: {}, weather: {mode: "none", amt: 80}, lens: "natural", body: "none", social: SO.defaultSocial(), cam: {exposure: 0, temp: 0}};
const lookOf = () => allLooks().find(l => l.id === S.lookId);
const lensOf = () => LENSES.find(l => l.id === S.lens) || LENSES[0];
const bodyOf = () => BODIES.find(b => b.id === S.body) || BODIES[0];

function applyLook(l, {commit: c = true} = {}) {
  S.lookId = l.id; S.lookName = l.name; S.adj = E.clone(l.adj); S.ref = l.ref || null;
  prefs.lastLook = l.id; savePrefs();
  if (c) commit();
}
const HUE = {shadowTintHue: "shadowTintAmt", midTintHue: "midTintAmt", highlightTintHue: "highlightTintAmt"};
function mergeAdj(a, b) {
  if (!b) return a; const o = E.clone(a);
  for (const k in b) {
    if (k === "hsl" || typeof b[k] !== "number") { if (k === "mono") o.mono = o.mono || b.mono; continue; }
    if (HUE[k]) { if ((b[HUE[k]] || 0) > (a[HUE[k]] || 0)) o[k] = b[k]; continue; }
    if (k === "keepBright" || k === "grainSize") { o[k] = Math.max(o[k] || 0, b[k]); continue; }
    o[k] = (o[k] || 0) + b[k];
  }
  return o;
}
function gradeAdj(soft = S.cam) {
  let a = E.effective(S.adj, S.strength / 100);
  if (soft && (soft.exposure || soft.temp)) a = mergeAdj(a, soft);
  a = mergeAdj(a, FX.bodyAdj(bodyOf()));
  if (prefs.deviceProfile && device.profile && session.fromCamera) a = mergeAdj(a, device.profile.adj);
  return a;
}

// ------------------------------------------------------------------ undo / redo
const hist = {u: [], r: [], last: null};
const snap = () => JSON.stringify({lookId: S.lookId, lookName: S.lookName, adj: S.adj, ref: S.ref, strength: S.strength, beauty: S.beauty, weather: S.weather, lens: S.lens, body: S.body, social: S.social, cam: S.cam});
function commit() { const s = snap(); if (s === hist.last) return; if (hist.last) hist.u.push(hist.last); if (hist.u.length > 60) hist.u.shift(); hist.r = []; hist.last = s; syncHist(); }
function restore(s) { Object.assign(S, JSON.parse(s)); hist.last = s; syncHist(); renderPanel(); requestRender(); }
function syncHist() { $("#e-undo").disabled = !hist.u.length; $("#e-redo").disabled = !hist.r.length; }

// ------------------------------------------------------------------ canvases
let canvasId = 0;
const newCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; c.__id = ++canvasId; return c; };
function scaled(img, maxSide) { const w0 = img.width || img.videoWidth, h0 = img.height || img.videoHeight, s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = newCanvas(Math.max(1, Math.round(w0 * s)), Math.max(1, Math.round(h0 * s))), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height); return c; }
function cropToRatio(c, ratio) { // ratio = w/h
  if (!ratio) return c; const r0 = c.width / c.height; if (Math.abs(r0 - ratio) < .01) return c;
  let sw = c.width, sh = c.height; if (r0 > ratio) sw = Math.round(sh * ratio); else sh = Math.round(sw / ratio);
  const o = newCanvas(sw, sh); o.getContext("2d").drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, sw, sh); return o;
}
const copyCanvas = c => { const o = newCanvas(c.width, c.height); o.getContext("2d").drawImage(c, 0, 0); return o; };
const pixels = c => c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, c.width, c.height);

// ------------------------------------------------------------------ session (the photo being edited)
const session = {full: null, prev: null, blob: null, exif: null, gps: null, when: new Date(), faces: null, fromCamera: false, name: ""};
const memo = new Map();
function memoStage(key, fn) { if (memo.has(key)) return memo.get(key); const v = fn(); memo.set(key, v); if (memo.size > 10) memo.delete(memo.keys().next().value); return v; }

/** Full pipeline: beauty → weather → lens geometry → colour grade → optics / body. */
function renderPipeline(base, useMemo) {
  const M = useMemo ? memoStage : (k, fn) => fn();
  const bKey = base.__id + "|" + JSON.stringify(S.beauty);
  const faces = session.faces;
  const c1 = F.hasBeauty(S.beauty) && faces && faces.length ? M("b" + bKey, () => {
    const c = copyCanvas(base), id = pixels(c); F.applyBeauty(id.data, c.width, c.height, faces, S.beauty); c.getContext("2d").putImageData(id, 0, 0); c.__id = ++canvasId; return c;
  }) : base;
  const wKey = bKey + "|" + S.weather.mode + S.weather.amt;
  const c2 = S.weather.mode !== "none" ? M("w" + wKey, () => { const c = FX.weatherFx(c1, S.weather.mode, S.weather.amt / 100); c.__id = ++canvasId; return c; }) : c1;
  const lens = lensOf(), body = bodyOf();
  const c3 = (lens.crop || lens.barrel) ? M("g" + wKey + lens.id, () => { const c = FX.lensGeometry(c2, lens); c.__id = ++canvasId; return c; }) : c2;
  const out = copyCanvas(c3), id = pixels(out), d = id.data, w = out.width, h = out.height;
  if (S.ref) E.applyTransfer(d, S.ref, S.strength / 100);
  E.applyGrade(d, w, h, gradeAdj());
  FX.lensOptics(d, w, h, lens);
  FX.bodyFx(d, w, h, body, 17);
  out.getContext("2d").putImageData(id, 0, 0);
  return out;
}
const finalCompose = (img, maxLong) => SO.compose(img, S.social, maxLong, bodyOf(), session.when);

// ------------------------------------------------------------------ views
const views = ["#v-cam", "#v-edit", "#v-dump", "#v-roll", "#v-wall"];
function show(v) { views.forEach(q => $(q).hidden = q !== v); if (v === "#v-cam") { startCamera(); if (prefs.level) level(true); } else { CAM.stop(); histo(false); level(false); toggleQS(false); } }

// ================================================================== CAMERA
const RATIOS = {"3:4": 3 / 4, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "full": 0};
const camState = {mode: "photo", prevBody: null, prevLook: null, lastPos: null, watch: null, starting: false, thumbSrc: null,
  ev: 0, wb: 0, zoom: 1, digital: 1, ultra: false, focusAt: {x: .5, y: .5}, tray: prefs.tray || "looks"};
const ratioVal = () => camState.mode === "visa" ? (s => s.w / s.h)(VI.specOf(prefs.visaSpec)) : camState.mode === "instant" ? AN.instantOf(prefs.instantModel).ratio : camState.mode === "roll" ? 2 / 3 : prefs.ratio === "full" ? ($("#v-cam").clientWidth || innerWidth) / ($("#v-cam").clientHeight || innerHeight) : RATIOS[prefs.ratio] || 3 / 4;
// camera-only software corrections (used when the phone does not expose real EV / white balance)
function camSoft() {
  const mc = CAM.manualCaps(), o = {exposure: 0, temp: 0};
  if (!mc.ev && camState.ev) o.exposure = camState.ev / 1.5 * 100;
  if (!(mc.wb && mc.wbManual) && camState.wb) o.temp = Math.max(-100, Math.min(100, (camState.wb - 5500) / 35));
  return o;
}
const coalesce = fn => { let busy = false, next; return v => { next = v; if (busy) return; const run = async () => { busy = true; const x = next; next = undefined; try { await fn(x); } catch (e) {} busy = false; if (next !== undefined) run(); }; run(); }; };
const hwZoom = coalesce(v => CAM.setZoom(v)), hwEV = coalesce(v => CAM.setEV(v)), hwWB = coalesce(v => CAM.setWB(v)), hwISO = coalesce(v => CAM.setISO(v)), hwSh = coalesce(v => CAM.setShutter(v)), hwFocus = coalesce(v => CAM.setFocus(v));

async function startCamera(opts = {}) {
  if (!LS.get("consent", null) || camState.starting) return;
  if (!CAM.supported()) return noCam("เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องใช้ https และเบราว์เซอร์รุ่นใหม่)");
  camState.starting = true;
  try {
    await CAM.start($("#video"), Object.assign({facing: CAM.cam.facing}, opts));
    $("#vf-nocam").hidden = true;
    $("#vf").classList.toggle("front", CAM.cam.facing === "user" && !opts.deviceId);
    const lens = opts.deviceId && CAM.cam.lenses.find(l => l.id === opts.deviceId);
    camState.lensRatio = CAM.cam.facing === "user" ? 1 : lens ? lens.ratio || 1 : 1; camState.lensId = lens ? lens.id : null;
    if (!opts.keepZoom) { camState.zoom = camState.lensRatio; camState.digital = 1; }
    if (CAM.manualCaps().ev && camState.ev) CAM.setEV(camState.ev);
    renderZoom(); applyLivePreview(); renderCamLooks(); renderQbar(); updateHud();
    setTimeout(snapshotThumbs, 600);
    if (prefs.gps) watchGps(true);
    histo(prefs.histo);
  } catch (e) {
    const msg = e && e.name === "NotAllowedError" ? "ยังไม่ได้อนุญาตกล้อง — เปิดสิทธิ์กล้องให้ MoonCam ในการตั้งค่าเบราว์เซอร์/แอป แล้วกดลองอีกครั้ง" : "เปิดกล้องไม่ได้: " + (e && e.message || e);
    noCam(msg);
  } finally { camState.starting = false; }
}
function noCam(msg) { $("#vf-nocam").hidden = false; $("#nocam-msg").textContent = msg; }

// ---------------------------------------------------------------- layout: preview box sized to the ratio (WYSIWYG with the crop)
function layoutCam() {
  if (skinOn()) return layoutSkin();
  const root = $("#v-cam"), vw = root.clientWidth || innerWidth, vh = root.clientHeight || innerHeight, TOP = 56, BOT = 214, r = ratioVal();
  const avail = vh - TOP - BOT;
  let w, h, top;
  if (prefs.ratio === "full") { w = vw; h = vh; top = 0; }
  else if (vw > vh) { h = Math.min(avail, vw / r); w = h * r; top = TOP; }
  else {
    w = vw; h = vw / r;
    if (h <= avail) top = TOP + Math.max(0, (avail - h) * .25);
    else if (h <= vh - TOP) top = TOP;
    else if (h <= vh) top = (vh - h) / 2;
    else { h = vh; w = h * r; top = 0; }
  }
  const vf = $("#vf"); Object.assign(vf.style, {width: w + "px", height: h + "px", top: top + "px", left: (vw - w) / 2 + "px"});
  root.classList.toggle("over", top + h > vh - BOT + 8);
  $("#c-ratio").textContent = prefs.ratio === "full" ? "FULL" : prefs.ratio;
}

// ---------------------------------------------------------------- zoom (hardware where possible, digital beyond / otherwise)
function zoomLimits() {
  const z = CAM.manualCaps().zoom, lr = camState.lensRatio || 1;
  const min = lr * (z && z.min < 1 ? z.min : 1), max = Math.max(lr * (z ? z.max : 1), 10);
  return {z, lr, min, max};
}
function setZoomLevel(v, {show = true} = {}) {
  const L = zoomLimits();
  v = Math.max(L.min, Math.min(L.max, v));
  const rel = v / L.lr;
  if (L.z) { const hz = Math.max(L.z.min, Math.min(L.z.max, rel)); hwZoom(hz); camState.digital = Math.max(1, rel / hz); camState.zoom = L.lr * hz * camState.digital; }
  else { camState.digital = Math.max(1, rel); camState.zoom = L.lr * camState.digital; }
  applyLivePreview(); renderZoom();
  if (show) { const t = $("#vf-zoom"); t.textContent = camState.zoom.toFixed(1).replace(/\.0$/, "") + "×"; t.hidden = false; clearTimeout(setZoomLevel.t); setZoomLevel.t = setTimeout(() => t.hidden = true, 700); }
}
// the phone's real back lenses (0.6× / 1× / 3×…) the browser can open, plus the ones only the Android app reaches
function lensStops() {
  if (CAM.cam.facing === "user") return [{r: 1}, {r: 2}];
  const L = zoomLimits(), web = CAM.cam.lenses.filter(l => l.ratio), nat = (window.__camInfo && window.__camInfo.lenses) || [];
  const stops = [];
  const add = (r, lens, nativeOnly) => { if (!stops.some(s => Math.abs(s.r - r) / r < .1)) stops.push({r, lens, nativeOnly}); };
  web.forEach(l => add(l.ratio, l));
  if (L.z && L.z.min < 1) add(+(L.lr * L.z.min).toFixed(1));
  nat.forEach(n => add(+(+n.ratio).toFixed(1), null, true));
  if (!stops.some(s => s.r > 1.5 && s.r < 2.5)) add(2);
  if (!stops.some(s => Math.abs(s.r - 1) < .1)) add(1);
  return stops.sort((a, b) => a.r - b.r);
}
async function goStop(s) {
  const web = CAM.cam.lenses.filter(l => l.ratio);
  // best real lens for this zoom: the longest one that is not longer than the target
  let lens = s.lens || web.filter(l => l.ratio <= s.r + .02).sort((a, b) => b.ratio - a.ratio)[0];
  if (!lens && s.r < 1) {
    if (L0().z && L0().lr * L0().z.min <= s.r + .02) return setZoomLevel(s.r);
    return toast(`เลนส์ ${s.r}× — เบราว์เซอร์มองไม่เห็นกล้องตัวนี้ ใช้ได้ในโหมดภาพยนตร์ของแอป Android`, 2200);
  }
  if (lens && lens.id !== camState.lensId && !(lens.ratio === 1 && !camState.lensId && camState.lensRatio === 1)) { await startCamera({deviceId: lens.id, keepZoom: true}); }
  else if (!lens && camState.lensRatio !== 1) await startCamera({facing: "environment"});
  setZoomLevel(s.r);
  if (s.nativeOnly && s.r > 1.5) toast(`${s.r}× ตอนนี้เป็นซูมจากกล้องหลัก — เลนส์เทเลจริงใช้ในโหมดภาพยนตร์`, 1800);
}
const L0 = () => zoomLimits();
function renderZoom() {
  const pill = $("#zoom-pill"); pill.textContent = "";
  const stops = lensStops(), cur = camState.zoom;
  let active = 0; stops.forEach((s, i) => { if (cur >= s.r - .05) active = i; });
  stops.forEach((s, i) => {
    if (i) pill.appendChild(el("span", "dots", "···"));
    const on = i === active, txt = on ? (Math.abs(cur - s.r) < .05 ? s.r + "x" : cur.toFixed(1) + "x") : String(s.r);
    const b = el("button", (on ? "on" : "") + (s.nativeOnly && !s.lens ? " nat" : ""), txt.replace(".0x", "x"));
    b.onclick = e => { e.stopPropagation(); haptic(); goStop(s); };
    pill.appendChild(b);
  });
}
function liveFilter(a) {
  const b = Math.pow(2, a.exposure / 100 * 1.5) * (1 + a.fade / 100 * .06) * (1 - a.density / 100 * .18);
  const c = (a.contrast >= 0 ? 1 + a.contrast / 100 * .9 : 1 + a.contrast / 100 * .5) * (1 - a.fade / 100 * .2) * (1 - a.blacks / 100 * .25) * (1 + a.curve / 100 * .35 + a.density / 100 * .15);
  const s = a.mono ? 0 : Math.max(0, (1 + a.saturation / 100) * (1 + a.vibrance / 100 * .3));
  const warm = Math.max(0, a.temp) / 100 * .45 + a.highlightTintAmt / 100 * .12, hue = -a.tint / 100 * 12 + (a.temp < 0 ? a.temp / 100 * 25 : 0);
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) sepia(${warm.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)` + (a.mono ? " grayscale(1)" : "");
}
function applyLivePreview() {
  layoutCam();
  const a = gradeAdj(camSoft()), lens = lensOf(), body = bodyOf(), v = $("#video");
  let f = liveFilter(a); if (lens.soft || body.soft) f += " blur(.4px)";
  v.style.filter = f;
  const mirror = $("#vf").classList.contains("front") ? -1 : 1, k = (lens.crop || 1) * camState.digital;
  v.style.transform = `scale(${mirror * k},${k})`;
  const vig = Math.max(a.vignette / 100, lens.vig || 0);
  $("#vf-vig").style.background = lens.circle ? "radial-gradient(circle at center,transparent 47%,#000 48%)" : vig > 0 ? `radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,${(vig * .7).toFixed(2)}) 100%)` : "none";
  $("#vf-scan").hidden = !body.scan;
  $("#vf-grid").hidden = !prefs.grid; $("#vf-center").hidden = !prefs.center;
  $("#c-grid").classList.toggle("on", prefs.grid || prefs.center);
}
function updateHud() {
  const hud = $("#cam-hud"); hud.textContent = "";
  const m = CAM.cam.manual, add = t => hud.appendChild(el("span", "pill glass num", t));
  if (camState.mode === "pro") { /* values live in the quick bar */ }
  else { if (camState.ev) add((camState.ev > 0 ? "+" : "") + camState.ev.toFixed(1) + " EV"); if (camState.wb) add(camState.wb + "K"); }
  if (S.lens !== "natural") add(lensOf().name); if (S.body !== "none") add(bodyOf().name);
  if (prefs.gps && camState.lastPos) add("📍");
  $("#c-flash").classList.toggle("on", prefs.flash !== "off");
  $("#c-flash").innerHTML = prefs.flash === "torch" ? icon("sun") : icon("flash") + (prefs.flash === "off" ? `<span class="slash"></span>` : "");
  $("#c-timer").classList.toggle("on", !!prefs.timer); $("#c-timer-n").textContent = prefs.timer || "";
}
// live look thumbnails from a real frame of the camera
function snapshotThumbs() {
  const v = $("#video"); if (!v.videoWidth) return;
  const c = newCanvas(72, 72), x = c.getContext("2d"), s = Math.min(v.videoWidth, v.videoHeight);
  x.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 72, 72);
  camState.thumbSrc = c; thumbCache.clear(); renderCamLooks();
}
function renderCamLooks() {
  const strip = $("#cam-looks"); const src = camState.thumbSrc || sampleThumb();
  strip.textContent = "";
  const list = [allLooks().find(l => l.id === "original")].concat(PRESETS.filter(l => l.cat === "trend"), mine, PRESETS.filter(l => l.cat !== "trend" && l.id !== "original"));
  list.forEach(l => {
    const b = el("button", "lchip" + (l.id === S.lookId ? " on" : "")); b.appendChild(thumbFor(l, src, 52)); b.appendChild(el("span", null, l.name));
    b.onclick = () => { haptic(); if (l.id === S.lookId && l.id !== "original") { openRuler("str"); return; } applyLook(l); applyLivePreview(); renderCamLooks(); renderQbar(); updateHud(); toast(l.name + (l.desc ? " — " + l.desc : ""), 1600); };
    strip.appendChild(b);
  });
  const on = strip.querySelector(".on"); if (on && !strip.hidden) on.scrollIntoView({inline: "center", block: "nearest"});
}

// ---------------------------------------------------------------- quick bar + ruler (ProCam-style)
const fmtEV = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
function qItems() {
  const mc = CAM.manualCaps(), m = CAM.cam.manual, pro = camState.mode === "pro";
  const it = [{k: "look", t: "LOOK", v: S.lookName, set: S.lookId !== "original"}, {k: "str", t: "แรง", v: S.strength + "%", set: S.strength !== 100},
    {k: "ev", t: "EV", v: camState.ev ? fmtEV(camState.ev) : "0.0", set: !!camState.ev}, {k: "wb", t: "WB", v: camState.wb ? camState.wb + "K" : "auto", set: !!camState.wb}];
  if (pro) it.push({k: "iso", t: "ISO", v: m.iso ? Math.round(m.iso) : "auto", set: !!m.iso, off: !(mc.iso && mc.exposureManual)},
    {k: "sh", t: "S", v: m.shutter ? CAM.formatShutter(m.shutter) : "auto", set: !!m.shutter, off: !(mc.shutter && mc.exposureManual)},
    {k: "focus", t: "F", v: m.focus != null ? (+m.focus).toFixed(2) : "AF", set: m.focus != null, off: !(mc.focus && mc.focusManual)});
  it.push({k: "lens", t: "LENS", v: S.lens !== "natural" ? lensOf().name : S.body !== "none" ? bodyOf().name : "ปกติ", set: S.lens !== "natural" || S.body !== "none"});
  return it;
}
function renderQbar() {
  const q = $("#qbar"); q.textContent = "";
  qItems().forEach(i => {
    const open = (i.k === "look" && camState.tray === "looks") || ($("#ruler").hidden === false && ruler.k === i.k);
    const b = el("button", [i.set ? "set" : "", open ? "on" : "", i.off ? "off" : ""].join(" "), `<b>${i.t}</b><small>${i.v}</small>`);
    b.onclick = () => { haptic();
      if (i.off) return toast(`${i.t}: มือถือ/เบราว์เซอร์นี้ไม่เปิดให้ปรับเอง`, 1600);
      if (i.k === "lens") return openLensSheet();
      if (i.k === "look") return setTray(camState.tray === "looks" ? "none" : "looks");
      if (open) return setTray("none");
      openRuler(i.k);
    };
    q.appendChild(b);
  });
  $("#c-looks").classList.toggle("on", camState.tray === "looks");
}
function setTray(t) {
  camState.tray = t; if (t !== "ruler") { prefs.tray = t; savePrefs(); }
  $("#cam-looks").hidden = t !== "looks"; $("#ruler").hidden = t !== "ruler";
  if (t === "looks") renderCamLooks();
  renderQbar();
}
const ruler = {k: null, o: null, p: 0, W: 320};
function rulerSpec(k) {
  const mc = CAM.manualCaps(), m = CAM.cam.manual;
  if (k === "str") return {name: "ความแรง Look", min: 0, max: 150, step: 1, get: () => S.strength, fmt: v => v + "%", set: v => { S.strength = v; prefs.strength = v; applyLivePreview(); }, auto: () => 100, autoLabel: "100%"};
  if (k === "ev") { const r = mc.ev || {min: -3, max: 3, step: .1}; return {name: mc.ev ? "EV (กล้องจริง)" : "EV", min: r.min, max: r.max, step: r.step || .1, get: () => camState.ev, fmt: fmtEV,
    set: v => { camState.ev = v; if (mc.ev) hwEV(v); applyLivePreview(); }, auto: () => 0, autoLabel: "0"}; }
  if (k === "wb") { const hw = mc.wb && mc.wbManual, r = hw ? mc.wb : {min: 2000, max: 9000}; return {name: hw ? "WB (กล้องจริง)" : "WB", min: Math.max(2000, r.min), max: Math.min(10000, r.max), step: 50, get: () => camState.wb || 5500, fmt: v => v + "K",
    set: v => { camState.wb = v; if (hw) hwWB(v); applyLivePreview(); }, auto: () => { camState.wb = 0; if (hw) CAM.autoWB(); applyLivePreview(); return null; }, autoLabel: "AUTO", isAuto: () => !camState.wb}; }
  if (k === "iso") return {name: "ISO", min: mc.iso.min, max: mc.iso.max, step: 1, log: true, get: () => m.iso || 100, fmt: v => Math.round(v), set: v => hwISO(v), auto: () => { CAM.autoExposure(); return null; }, autoLabel: "AUTO", isAuto: () => !m.iso};
  if (k === "sh") return {name: "Shutter", min: mc.shutter.min, max: Math.min(mc.shutter.max, 10000), step: 1, log: true, get: () => m.shutter || 80, fmt: v => CAM.formatShutter(v), set: v => hwSh(v), auto: () => { CAM.autoExposure(); return null; }, autoLabel: "AUTO", isAuto: () => !m.shutter};
  if (k === "focus") return {name: "Focus", min: mc.focus.min, max: mc.focus.max, step: mc.focus.step || .01, get: () => m.focus != null ? m.focus : mc.focus.min, fmt: v => (+v).toFixed(2), set: v => hwFocus(v), auto: () => { CAM.autoFocus(); return null; }, autoLabel: "AF", isAuto: () => m.focus == null};
}
const r2p = (o, v) => o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min);
const p2v = (o, p) => { let v = o.log ? o.min * Math.pow(o.max / o.min, p) : o.min + (o.max - o.min) * p; v = Math.round(v / o.step) * o.step; return +Math.max(o.min, Math.min(o.max, v)).toFixed(4); };
function openRuler(k) {
  const o = rulerSpec(k); if (!o) return;
  ruler.k = k; ruler.o = o; ruler.p = Math.max(0, Math.min(1, r2p(o, o.get())));
  $("#ruler-name").textContent = o.name; $("#ruler-auto").textContent = o.autoLabel || "AUTO";
  setTray("ruler"); drawRuler();
}
function drawRuler() {
  const o = ruler.o; if (!o) return;
  $("#ruler-ticks").style.transform = `translateX(${-ruler.p * ruler.W}px)`;
  $("#ruler-val").textContent = o.isAuto && o.isAuto() ? (o.autoLabel || "AUTO") : o.fmt(p2v(o, ruler.p));
}
(() => {
  const t = $("#ruler-track"); let d = null;
  t.addEventListener("pointerdown", e => { d = {x: e.clientX, p: ruler.p}; t.setPointerCapture(e.pointerId); });
  t.addEventListener("pointermove", e => { if (!d || !ruler.o) return; const p = Math.max(0, Math.min(1, d.p - (e.clientX - d.x) / ruler.W)); const before = p2v(ruler.o, ruler.p); ruler.p = p; const v = p2v(ruler.o, p);
    if (v !== before) { ruler.o.set(v); if (Math.round(v * 10) % 10 === 0) haptic(3); } drawRuler(); renderQbarSoon(); updateHud(); });
  const end = () => { if (d) { d = null; savePrefs(); } }; t.addEventListener("pointerup", end); t.addEventListener("pointercancel", end);
  $("#ruler-auto").onclick = () => { haptic(); const o = ruler.o; if (!o) return; const v = o.auto(); if (v != null) { o.set(v); } ruler.p = Math.max(0, Math.min(1, r2p(o, o.get()))); drawRuler(); renderQbar(); updateHud(); };
})();
let qbT; function renderQbarSoon() { clearTimeout(qbT); qbT = setTimeout(renderQbar, 60); }

// ---------------------------------------------------------------- quick settings panel
function renderQS() {
  const q = $("#qs"); q.textContent = "";
  const tile = (title, val, on, fn) => { const b = el("button", on ? "on" : "", `<b>${val}</b>${title}`); b.onclick = () => { haptic(); fn(); renderQS(); applyLivePreview(); updateHud(); }; q.appendChild(b); };
  const RK = Object.keys(RATIOS);
  tile("สัดส่วน", prefs.ratio === "full" ? "FULL" : prefs.ratio, false, () => { prefs.ratio = RK[(RK.indexOf(prefs.ratio) + 1) % RK.length]; savePrefs(); });
  tile("ตั้งเวลา", prefs.timer ? prefs.timer + "s" : "ปิด", !!prefs.timer, () => { prefs.timer = prefs.timer === 0 ? 3 : prefs.timer === 3 ? 10 : 0; savePrefs(); });
  tile("เส้นตาราง", prefs.grid ? "3×3" : "ปิด", prefs.grid, () => { prefs.grid = !prefs.grid; savePrefs(); });
  tile("จุดกลาง", prefs.center ? "เปิด" : "ปิด", prefs.center, () => { prefs.center = !prefs.center; savePrefs(); });
  tile("ระดับน้ำ", prefs.level ? "เปิด" : "ปิด", prefs.level, () => { prefs.level = !prefs.level; savePrefs(); level(prefs.level); });
  tile("ฮิสโตแกรม", prefs.histo ? "เปิด" : "ปิด", prefs.histo, () => { prefs.histo = !prefs.histo; savePrefs(); histo(prefs.histo); });
  tile("เสียงชัตเตอร์", prefs.sound ? "เปิด" : "ปิด", prefs.sound, () => { prefs.sound = !prefs.sound; savePrefs(); });
  tile("หมุดตำแหน่ง", prefs.gps ? "เปิด" : "ปิด", prefs.gps, () => setGps(!prefs.gps));
  tile("กล้องหน้า", prefs.mirror ? "กระจก" : "ตามจริง", prefs.mirror, () => { prefs.mirror = !prefs.mirror; savePrefs(); });
  tile("หลังถ่าย", prefs.editAfter ? "เปิดแต่ง" : "บันทึกเลย", !prefs.editAfter, () => { prefs.editAfter = !prefs.editAfter; savePrefs(); });
  tile("แตะเพื่อถ่าย", prefs.tapShoot ? "เปิด" : "ปิด", prefs.tapShoot, () => { prefs.tapShoot = !prefs.tapShoot; savePrefs(); });
  tile("Device Sync", prefs.deviceProfile ? "เปิด" : "ปิด", prefs.deviceProfile, () => { prefs.deviceProfile = !prefs.deviceProfile; savePrefs(); });
  tile("ม้วนฟิล์ม", prefs.rollSize + " รูป", false, () => { prefs.rollSize = prefs.rollSize === 24 ? 36 : 24; savePrefs(); refreshRollChip(); });
}
function toggleQS(force) { const q = $("#qs"), open = force != null ? force : q.hidden; q.hidden = !open; $("#c-qs").classList.toggle("on", open); if (open) renderQS(); }

// ---------------------------------------------------------------- level (horizon) & live histogram
let levelOn = false;
function onMotion(e) {
  const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
  const lv = $("#vf-level"); let ang = Math.atan2(-g.x, g.y) * 180 / Math.PI; // device roll
  let dev = ((ang % 90) + 135) % 90 - 45; // distance to the nearest 90°
  if (Math.hypot(g.x, g.y) < 4) { lv.hidden = true; return; } // phone lying flat
  lv.hidden = false; lv.querySelector("i").style.transform = `rotate(${-dev}deg)`; lv.classList.toggle("ok", Math.abs(dev) < 1);
  lv.querySelector("b").textContent = Math.abs(dev) < 1 ? "0°" : Math.round(Math.abs(dev)) + "°";
}
function level(on) {
  if (on === levelOn) return; levelOn = on;
  if (on) { const go = () => window.addEventListener("devicemotion", onMotion);
    if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().then(r => r === "granted" && go()).catch(() => {}); else go(); }
  else { window.removeEventListener("devicemotion", onMotion); $("#vf-level").hidden = true; }
}
let histoT = null;
function histo(on) {
  const c = $("#histo"); c.hidden = !on; clearInterval(histoT); histoT = null; if (!on) return;
  const s = document.createElement("canvas"); s.width = 64; s.height = 48; const sx = s.getContext("2d", {willReadFrequently: true}), x = c.getContext("2d");
  histoT = setInterval(() => {
    const v = $("#video"); if (!v.videoWidth || $("#v-cam").hidden) return;
    sx.filter = v.style.filter || "none"; sx.drawImage(v, 0, 0, 64, 48); const d = sx.getImageData(0, 0, 64, 48).data, hR = new Array(64).fill(0), hG = new Array(64).fill(0), hB = new Array(64).fill(0);
    for (let i = 0; i < d.length; i += 4) { hR[d[i] >> 2]++; hG[d[i + 1] >> 2]++; hB[d[i + 2] >> 2]++; }
    const mx = Math.max(...hR, ...hG, ...hB) || 1; x.clearRect(0, 0, 128, 48); x.globalCompositeOperation = "lighter";
    [[hR, "rgba(255,80,80,.7)"], [hG, "rgba(80,255,120,.6)"], [hB, "rgba(90,140,255,.7)"]].forEach(([h, col]) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 48); h.forEach((n, i) => x.lineTo(i * 2, 48 - Math.sqrt(n / mx) * 44)); x.lineTo(128, 48); x.fill(); });
    x.globalCompositeOperation = "source-over";
  }, 280);
}

// ---------------------------------------------------------------- shutter sound
let actx = null;
function clickSound() {
  if (!prefs.sound) return;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const n = actx.sampleRate * .09, buf = actx.createBuffer(1, n, actx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / n; ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * (t < .45 ? 1 : .55) * (i > n * .42 && i < n * .5 ? 1.6 : 1); }
    const src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = .7; g.gain.value = .5;
    src.buffer = buf; src.connect(f).connect(g).connect(actx.destination); src.start(); } catch (e) {}
}
function setAlbumThumb(canvas) {
  try { const t = scaled(canvas, 120); const url = t.toDataURL("image/jpeg", .7); LS.set("thumb", url); showAlbumThumb(url); } catch (e) {}
}
function showAlbumThumb(url) { const a = $("#c-album"); if (!url) return; a.style.backgroundImage = `url(${url})`; a.classList.add("has"); }

function watchGps(on) {
  if (!navigator.geolocation) return;
  if (on && camState.watch == null) camState.watch = navigator.geolocation.watchPosition(p => { camState.lastPos = {lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude}; updateHud(); }, () => {}, {enableHighAccuracy: true, maximumAge: 30000});
  if (!on && camState.watch != null) { navigator.geolocation.clearWatch(camState.watch); camState.watch = null; camState.lastPos = null; }
}

async function shoot() {
  if (!CAM.cam.stream || shoot.busy || !$("#iov").hidden || !$("#darkroom").hidden) return;
  if (camState.mode === "roll" && !prefs.advanced) { haptic(40); toast("ขึ้นฟิล์มก่อน — ปัดหรือแตะคันโยกขึ้นฟิล์ม", 1400); const lv = $("#sk-lever"); if (lv) { lv.classList.remove("nudge"); void lv.offsetWidth; lv.classList.add("nudge"); } return; }
  if (camState.mode === "instant" && prefs.pack <= 0) return openPackSheet();
  shoot.busy = true; haptic(15);
  try {
    if (prefs.timer) { const c = $("#vf-count"); c.hidden = false; for (let i = prefs.timer; i > 0; i--) { c.textContent = i; await new Promise(r => setTimeout(r, 1000)); } c.hidden = true; }
    clickSound();
    const f = $("#vf-flash"); f.style.opacity = ".85"; setTimeout(() => f.style.opacity = "0", 70);
    const front = $("#vf").classList.contains("front"), mirror = front && prefs.mirror !== false && camState.mode !== "visa";
    const {blob, canvas} = await CAM.capture({flash: prefs.flash === "on", mirror});
    if (camState.mode === "visa") { await visaProcess(canvas); return; }
    let shot = cropToRatio(canvas, ratioVal());
    if (camState.digital > 1.01) { const k = camState.digital, w = Math.round(shot.width / k), h = Math.round(shot.height / k), o = newCanvas(w, h); o.getContext("2d").drawImage(shot, (shot.width - w) / 2, (shot.height - h) / 2, w, h, 0, 0, w, h); shot = o; }
    const untouched = blob && shot === canvas;
    const when = new Date(), gps = prefs.gps ? camState.lastPos : null;
    S.cam = camSoft();
    if (camState.mode === "roll") {
      const jpeg = untouched ? blob : await new Promise(r => shot.toBlob(r, "image/jpeg", .95));
      const st = JSON.parse(snap()); st.film = prefs.film;
      await DB.rollAdd({id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), time: when.getTime(), blob: jpeg, gps, settings: st, developed: false, film: prefs.film});
      prefs.advanced = false; savePrefs();
      const {un} = await refreshRollChip(); renderSkin();
      if (un >= prefs.rollSize) setTimeout(showDarkroom, 600);
      return;
    }
    const exif = untouched ? await EX.readExif(blob) : null;
    if (camState.mode === "instant") { prefs.pack = Math.max(0, prefs.pack - 1); savePrefs(); renderSkin(); startInstant(shot, {blob: untouched ? blob : null, exif, gps, when}, snap()); return; }
    setAlbumThumb(shot);
    const meta = {blob: untouched ? blob : null, exif, gps, when, fromCamera: true, name: "MoonCam"};
    if (prefs.editAfter) await openEditor(shot, meta);
    else instantSave(shot, meta, snap());
  } finally { shoot.busy = false; }
}
// ---------------------------------------------------------------- instant save (no editor): full-res render with the current look, saved in the background
let saveQueue = Promise.resolve(), saving = 0;
function instantSave(shot, meta, settings) {
  camState.last = {shot, meta, settings};
  saving++; $("#c-album").classList.add("saving");
  saveQueue = saveQueue.then(async () => {
    const keepS = snap(), keepSession = {...session};
    try {
      Object.assign(S, JSON.parse(settings));
      session.full = scaled(shot, device.exportMax); session.prev = scaled(session.full, device.preview);
      Object.assign(session, {blob: meta.blob, exif: meta.exif, gps: meta.gps, when: meta.when, fromCamera: true, name: meta.name, faces: null}); memo.clear();
      const out = await exportBlob();
      await saveBlobs([{blob: out, name: fileName()}], {quiet: true});
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + (e && e.message || e)); }
    finally { Object.assign(session, keepSession); Object.assign(S, JSON.parse(keepS)); memo.clear(); if (!--saving) $("#c-album").classList.remove("saving"); }
  });
  return saveQueue;
}
async function editLast() {
  const L = camState.last; if (!L) return; await saveQueue;
  Object.assign(S, JSON.parse(L.settings)); await openEditor(L.shot, L.meta);
}
window.__mcShutter = () => { if (!$("#v-cam").hidden) shoot(); };

// ================================================================== MORE MODES · VISA / ID PHOTO
function openMoreSheet() {
  haptic();
  const b = el("div"), g = el("div", "pick-grid");
  const card = (ic, t, d, fn) => { const c = el("button", "pick more", `<span class="more-ic">${ic}</span><b>${t}</b><small>${d}</small>`); c.onclick = () => { closeSheet(); fn(); }; g.appendChild(c); };
  card("🛂", "รูปวีซ่า / พาสปอร์ต", "กรอบขนาดตามประเทศ ตรวจตำแหน่งหน้า จัดขนาดให้อัตโนมัติ พร้อมแผ่นพิมพ์", () => setMode("visa"));
  card("🎬", "ภาพยนตร์", "ถ่ายวิดีโอ log / 10-bit แบบกล้องโปร (แอป Android)", openCinema);
  card("🎞", "ม้วนฟิล์ม", "ถ่ายครบม้วนแล้วล้างดูทีเดียว", () => setMode("roll"));
  card("📷", "โพลารอยด์", "รูปค่อย ๆ ออกมาและแห้งเหมือนจริง", () => setMode("instant"));
  b.appendChild(g); openSheet("โหมดเพิ่มเติม", b);
}
function openVisaSheet() {
  const b = el("div"); b.appendChild(note("เลือกประเภทรูป — กรอบในกล้องจะเปลี่ยนตามขนาดจริง และจัดสัดส่วนศีรษะให้อัตโนมัติหลังถ่าย"));
  const g = el("div", "pick-grid");
  VI.SPECS.forEach(s => { const c = el("button", "pick visa" + (s.id === prefs.visaSpec ? " on" : ""), `<span class="visa-mini" style="aspect-ratio:${s.w}/${s.h}"><i></i></span><b>${s.flag} ${s.name}</b><em class="num">${s.w}×${s.h} มม. · ศีรษะ ${s.head[0]}–${s.head[1]}</em><small>พื้นหลัง${s.bg}${s.note ? " · " + s.note : ""}</small>`);
    c.onclick = () => { prefs.visaSpec = s.id; savePrefs(); closeSheet(); renderSkinChip(); applyLivePreview(); drawVisaGuide(); toast(`${s.name} · ${s.w}×${s.h} มม.`, 1400); }; g.appendChild(c); });
  b.appendChild(g);
  b.appendChild(button(`${icon("album")} ใช้รูปที่มีอยู่แล้วจากอัลบั้ม`, "big ghost", () => { closeSheet(); const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = async () => { const f = i.files[0]; if (!f) return; const bmp = await createImageBitmap(f); const c = newCanvas(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0); visaProcess(c); }; i.click(); }));
  b.appendChild(note("เคล็ดลับ: ยืนห่างผนังสีขาว ~1 เมตร หันหน้าเข้าหาแสง (หน้าต่าง) ให้คนอื่นถ่ายระดับสายตาจะดีที่สุด · ไม่ยิ้มเห็นฟัน · เห็นใบหูและคิ้ว · ไม่ใส่หมวก"));
  openSheet("รูปวีซ่า / พาสปอร์ต", b);
}
let visaT = null, visaBusy = false;
function visaMode(on) {
  $("#v-cam").classList.toggle("visa-on", on); $("#vf-visa").hidden = !on; $("#vf-visa-hint").hidden = !on;
  const mm = $("#m-more"); mm.classList.toggle("on", on); mm.textContent = on ? "วีซ่า" : "เพิ่มเติม";
  $("#c-skin").hidden = !on && !skinOn(); if (on) renderSkinChip();
  clearInterval(visaT); visaT = null;
  if (!on) return;
  drawVisaGuide(); visaHint("กำลังโหลดตัวช่วยจับใบหน้า… (ครั้งแรกประมาณ 13MB)", "");
  F.loadFace().then(() => { visaT = setInterval(visaLive, 900); visaLive(); }).catch(() => visaHint("โหลดตัวช่วยจับหน้าไม่ได้ — จัดศีรษะให้อยู่ในเส้นเอง", "warn"));
  if (!prefs.visaTip) { prefs.visaTip = 1; savePrefs(); setTimeout(openVisaSheet, 400); }
}
function visaHint(t, cls) { const h = $("#vf-visa-hint"); h.textContent = t; h.className = "visa-hint " + (cls || ""); $("#vf-visa").classList.toggle("ok", cls === "ok"); }
function drawVisaGuide() {
  const s = VI.specOf(prefs.visaSpec), top = VI.topMargin(s), ht = VI.headTarget(s), cx = s.w / 2;
  const eye = top + ht * .47, rx = ht * .37;
  $("#vf-visa").innerHTML = `<svg viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none">
    <rect class="band" x="0" y="${top + s.head[0]}" width="${s.w}" height="${s.head[1] - s.head[0]}"/>
    <line class="ln" x1="0" x2="${s.w}" y1="${top}" y2="${top}"/>
    <ellipse class="oval" cx="${cx}" cy="${top + ht / 2}" rx="${rx}" ry="${ht / 2}"/>
    <line class="eye" x1="${cx - rx * 1.2}" x2="${cx + rx * 1.2}" y1="${eye}" y2="${eye}"/>
    <line class="mid" x1="${cx}" x2="${cx}" y1="0" y2="${s.h}"/>
    <path class="sh" d="M ${cx - ht * .95} ${s.h} Q ${cx - ht * .9} ${top + ht * 1.12} ${cx - ht * .3} ${top + ht * 1.06} M ${cx + ht * .95} ${s.h} Q ${cx + ht * .9} ${top + ht * 1.12} ${cx + ht * .3} ${top + ht * 1.06}"/>
  </svg><span class="vlab t" style="top:${top / s.h * 100}%">เส้นบนสุดของศีรษะ</span><span class="vlab c" style="top:${(top + s.head[0]) / s.h * 100}%">ช่วงคาง ${s.head[0]}–${s.head[1]} มม.</span><span class="vlab sz">${s.w}×${s.h} มม.</span>`;
}
// the face model misses small faces: retry on square crops around the upper centre and map points back
async function detectAny(c) {
  let f = await F.detectFaces(c); if (f.length) return f;
  const S = Math.min(c.width, c.height);
  for (const [k, cy] of [[1, .42], [.75, .38], [.55, .35], [.42, .32]]) {
    const s = S * k, x = (c.width - s) / 2, y = Math.max(0, Math.min(c.height - s, c.height * cy - s / 2));
    const n = Math.min(720, Math.round(s)), t = newCanvas(n, n); t.getContext("2d").drawImage(c, x, y, s, s, 0, 0, n, n);
    f = await F.detectFaces(t);
    if (f.length) return f.map(face => face.map(p => ({x: (x + p.x * s) / c.width, y: (y + p.y * s) / c.height})));
  }
  return [];
}
async function visaLive() {
  if (visaBusy || camState.mode !== "visa" || $("#v-cam").hidden || !$("#iov").hidden || !$("#vres").hidden) return;
  const v = $("#video"); if (!v.videoWidth) return;
  visaBusy = true;
  try {
    const s = VI.specOf(prefs.visaSpec), k = 640 / Math.max(v.videoWidth, v.videoHeight), c0 = newCanvas(Math.round(v.videoWidth * k), Math.round(v.videoHeight * k));
    c0.getContext("2d").drawImage(v, 0, 0, c0.width, c0.height);
    let c = cropToRatio(c0, s.w / s.h);
    if (camState.digital > 1.01) { const z = camState.digital, w = Math.round(c.width / z), h = Math.round(c.height / z), o = newCanvas(w, h); o.getContext("2d").drawImage(c, (c.width - w) / 2, (c.height - h) / 2, w, h, 0, 0, w, h); c = o; }
    const faces = await detectAny(c);
    if (!faces.length) return visaHint("ไม่พบใบหน้า — หันหน้าเข้ากล้อง", "warn");
    const m = VI.measure(faces[0]), want = VI.headTarget(s) / s.h, top = VI.topMargin(s) / s.h, r = m.head / want;
    if (faces.length > 1) return visaHint("ต้องมีคนเดียวในภาพ", "warn");
    if (r < .88) return visaHint("เข้าใกล้กล้องอีกนิด", "warn");
    if (r > 1.12) return visaHint("ถอยห่างกล้องอีกนิด", "warn");
    if (Math.abs(m.cx - .5) > .07) return visaHint("ขยับให้ใบหน้าอยู่กลางกรอบ", "warn");
    if (m.crownY < top - .05) return visaHint("ยกกล้องขึ้น / ขยับศีรษะลงให้ตรงเส้นบน", "warn");
    if (m.crownY > top + .06) return visaHint("ลดกล้องลง / ขยับศีรษะขึ้นให้ตรงเส้นบน", "warn");
    if (Math.abs(m.roll) > 4) return visaHint("ตั้งศีรษะให้ตรง ไม่เอียง", "warn");
    if (Math.abs(m.yaw) > .08) return visaHint("หันหน้าตรงเข้ากล้อง", "warn");
    visaHint("✓ ตำแหน่งดี — กดถ่ายได้เลย", "ok");
  } catch (e) {} finally { visaBusy = false; }
}
async function visaProcess(full) {
  const s = VI.specOf(prefs.visaSpec); toast("กำลังจัดรูปตามขนาด…", 1200);
  try {
    await F.loadFace();
    const small = scaled(full, 1400), faces = await detectAny(small);
    if (!faces.length) return toast("ไม่พบใบหน้าในรูป ลองถ่ายใหม่ให้เห็นหน้าชัด ๆ", 2200);
    const m = VI.measure(faces[0]), fit = VI.fit(full, m, s);
    camState.visa = {orig: fit.canvas, m, fit, spec: s, bg: "orig", cache: {}};
    $("#vres-title").textContent = `${s.flag} ${s.name}`; $("#vres-size").textContent = `${s.w}×${s.h} มม. · ${fit.canvas.width}×${fit.canvas.height} px · ${s.dpi || 600} dpi`;
    $("#vres-img").style.aspectRatio = `${s.w}/${s.h}`;
    renderVisaBg(); showVisa(fit.canvas);
    $("#vres").hidden = false;
  } catch (e) { toast("จัดรูปไม่สำเร็จ: " + (e && e.message || e)); }
}
const VBG = [["orig", "เดิม", null], ["white", "ขาว", "#ffffff"], ["blue", "ฟ้า", "#4f8fd8"], ["grey", "เทาอ่อน", "#e4e5e7"], ["cream", "ครีม", "#f1e9d8"]];
function suggestedBg(s) { return /^ครีม/.test(s.bg) ? "cream" : /^เทา/.test(s.bg) ? "grey" : "white"; }
function renderVisaBg() {
  const V = camState.visa, box = $("#vres-bg"); box.textContent = "";
  const sug = suggestedBg(V.spec);
  VBG.forEach(([k, n, col]) => { const b = el("button", "chip" + (V.bg === k ? " on" : ""), (col ? `<span class="sw" style="background:${col}"></span>` : "") + n + (k === sug ? " ★" : ""));
    b.onclick = () => setVisaBg(k); box.appendChild(b); });
}
async function setVisaBg(k) {
  const V = camState.visa; if (!V || V.busy) return;
  V.bg = k; renderVisaBg();
  if (k === "orig") return showVisa(V.orig);
  const col = VBG.find(x => x[0] === k)[2];
  if (V.cache[k]) return showVisa(V.cache[k]);
  V.busy = true; const ul = $("#vres-list"); ul.style.opacity = ".4";
  toast(SG_LOADED ? "กำลังแยกคนออกจากพื้นหลัง…" : "กำลังโหลดตัวช่วยแยกพื้นหลัง (ครั้งแรก ~16MB)…", 2500);
  try { await new Promise(r => setTimeout(r, 30)); const c = await SG.replaceBackground(V.orig, col); SG_LOADED = true; V.cache[k] = c; if (V.bg === k) showVisa(c); }
  catch (e) { toast("แยกพื้นหลังไม่สำเร็จ: " + (e && e.message || e)); V.bg = "orig"; renderVisaBg(); }
  finally { V.busy = false; ul.style.opacity = ""; }
}
let SG_LOADED = false;
function showVisa(canvas) {
  const V = camState.visa, s = V.spec, list = VI.checks(canvas, V.m, s, V.fit);
  camState.visaOut = {canvas, spec: s};
  $("#vres-img").src = canvas.toDataURL("image/jpeg", .9);
  const ul = $("#vres-list"); ul.textContent = "";
  const fails = list.filter(x => x.pass === false).length;
  ul.appendChild(el("li", "sum " + (fails ? "warn" : "ok"), fails ? `ควรแก้ ${fails} ข้อก่อนใช้จริง` : "ผ่านทุกข้อที่ตรวจได้ ✓"));
  list.forEach(x => {
    const bgFix = x.pass === false && /พื้นหลัง/.test(x.hint || "") && V.bg === "orig";
    const li = el("li", x.pass === null ? "info" : x.pass ? "ok" : "warn", `<b>${x.pass === null ? "ℹ" : x.pass ? "✓" : "!"}</b><span>${x.pass === false && x.hint ? x.hint : x.t}</span>`);
    if (bgFix) { const fb = el("button", "chip fix", "เปลี่ยนเป็นพื้นหลัง" + VBG.find(v => v[0] === suggestedBg(s))[1]); fb.onclick = () => setVisaBg(suggestedBg(s)); li.appendChild(fb); }
    ul.appendChild(li);
  });
  if (V.bg !== "orig") ul.appendChild(el("li", "info", "<b>ℹ</b><span>พื้นหลังแยกด้วย AI ในเครื่อง — ซูมดูขอบผมก่อนใช้ บางประเทศไม่รับรูปที่แก้พื้นหลัง ถ้าทำได้ถ่ายหน้าผนังจริงจะดีที่สุด</span>"));
  ul.appendChild(el("li", "info", "<b>ℹ</b><span>แอปวัดจากจุดบนใบหน้าโดยประมาณ — ตรวจกฎของประเทศปลายทางอีกครั้งก่อนยื่น</span>"));
}
async function visaSave(kind) {
  const o = camState.visaOut; if (!o) return;
  const c = kind === "sheet" ? VI.sheet(o.canvas, o.spec) : o.canvas, dpi = kind === "sheet" ? 300 : (o.spec.dpi || 600);
  let blob = await new Promise(r => c.toBlob(r, "image/jpeg", .95)); blob = await VI.withDpi(blob, dpi);
  await saveBlobs([{blob, name: `MoonCam_${o.spec.id}_${o.spec.w}x${o.spec.h}mm${kind === "sheet" ? "_4x6" : ""}_${Date.now()}.jpg`}]);
}
$("#vres-save").onclick = () => visaSave("photo");
$("#vres-sheet").onclick = () => visaSave("sheet");
$("#vres-retake").onclick = $("#vres-back").onclick = () => { $("#vres").hidden = true; };

// ================================================================== ANALOG MODES (instant camera · film roll)
const skinOn = () => camState.mode === "instant" || camState.mode === "roll";
function applySkinLook() {
  if (camState.mode === "instant") { const m = AN.instantOf(prefs.instantModel); applyLook({id: "instant_" + m.id, name: m.name, adj: m.adj}, {commit: false}); }
  if (camState.mode === "roll") { const f = AN.filmOf(prefs.film); applyLook({id: "film_" + f.id, name: f.name, adj: f.adj}, {commit: false}); }
  S.strength = 100;
}
function setSkin() {
  const root = $("#v-cam"), on = skinOn();
  root.classList.toggle("skin-on", on); root.classList.toggle("skin-instant", camState.mode === "instant"); root.classList.toggle("skin-roll", camState.mode === "roll");
  $("#skin").hidden = !on; $("#c-skin").hidden = !on && camState.mode !== "visa"; if (!on) $("#skin-ctl").innerHTML = "";
  if (!on) { ["--sk-bg", "--sk-btn", "--sk-ring", "--sk-accent"].forEach(k => root.style.removeProperty(k)); $("#vf").style.borderRadius = ""; return; }
  const v = camState.mode === "instant" ? AN.instantOf(prefs.instantModel).skin : AN.filmOf(prefs.film);
  root.style.setProperty("--sk-bg", v.bg); root.style.setProperty("--sk-btn", v.btn);
  root.style.setProperty("--sk-ring", camState.mode === "instant" ? v.btnRing : v.body === "black" ? "conic-gradient(from 200deg,#4a4d52,#15161a,#4a4d52,#2b2e33,#4a4d52)" : "conic-gradient(from 200deg,#e9e9e6,#8e8f8b,#e9e9e6,#b9bab6,#e9e9e6)");
  root.style.setProperty("--sk-accent", camState.mode === "instant" ? v.accent : v.accent2);
  renderSkinChip();
}
function renderSkinChip() {
  const c = $("#c-skin");
  if (camState.mode === "visa") { const v = VI.specOf(prefs.visaSpec); c.innerHTML = `${v.flag} ${v.name} · ${v.w}×${v.h}<svg class="i" style="width:14px;height:14px"><path d="m6 9 6 6 6-6"/></svg>`; return; }
  if (camState.mode === "instant") { const m = AN.instantOf(prefs.instantModel); c.innerHTML = `${m.name}<svg class="i" style="width:14px;height:14px"><path d="m6 9 6 6 6-6"/></svg>`; }
  else { const f = AN.filmOf(prefs.film); c.innerHTML = `<span class="fbox" style="background:${f.box}"></span>${f.name} · ${prefs.rollSize}`; }
}
let skinGeo = null;
function layoutSkin() {
  const root = $("#v-cam"), vw = root.clientWidth || innerWidth, vh = root.clientHeight || innerHeight, TOP = 60, BOT = 152;
  const bw = Math.min(vw - 28, 400), bx = (vw - bw) / 2, by = TOP + 4, bh = Math.max(300, vh - TOP - BOT - 10);
  const g = {vw, vh, bx, by, bw, bh};
  if (camState.mode === "instant") {
    const m = AN.instantOf(prefs.instantModel), maxW = bw - 64, maxH = bh * .56;
    g.ww = Math.min(maxW, maxH * m.ratio); g.wh = g.ww / m.ratio; g.wx = (vw - g.ww) / 2; g.wy = by + 24;
    g.slotY = by + bh - 30;
    const free = g.slotY - (g.wy + g.wh) - 34; g.lens = Math.max(64, Math.min(150, free - 10)); g.lensY = g.wy + g.wh + 16 + Math.max(0, (free - g.lens) / 2);
  } else {
    g.plateH = Math.max(108, Math.min(150, bh * .27)); g.stripY = by + bh - 62;
    const top = by + g.plateH + 16, maxH = g.stripY - 14 - top;
    g.wh = Math.min(maxH, (bw - 80) * 1.5); g.ww = g.wh / 1.5; g.wx = (vw - g.ww) / 2; g.wy = top + (maxH - g.wh) / 2;
  }
  skinGeo = g;
  Object.assign($("#vf").style, {width: g.ww + "px", height: g.wh + "px", top: g.wy + "px", left: g.wx + "px", borderRadius: camState.mode === "instant" ? "10px" : "6px"});
  root.classList.remove("over");
  renderSkin();
}
function renderSkin() {
  if (!skinOn() || !skinGeo) return;
  const g = skinGeo, sk = $("#skin"), px = v => Math.round(v) + "px";
  $("#skin-ctl").innerHTML = "";
  if (camState.mode === "instant") {
    const m = AN.instantOf(prefs.instantModel), k = m.skin, L = g.lens, side = Math.min(64, (g.bw - L) / 2 - 28);
    sk.innerHTML = `<div class="ibody" style="left:${px(g.bx)};top:${px(g.by)};width:${px(g.bw)};height:${px(g.bh)};background:${k.body};border-radius:${k.radius}px;${k.trim ? `box-shadow:0 30px 60px rgba(0,0,0,.6),inset 0 0 0 5px ${k.trim}` : ""}"></div>
      <div class="iwin" style="left:${px(g.wx - 10)};top:${px(g.wy - 10)};width:${px(g.ww + 20)};height:${px(g.wh + 20)}"></div>
      <div class="iflash" style="left:${px(g.bx + 24)};top:${px(g.lensY + L / 2 - 20)};width:${px(side)};background:${k.flash}"></div>
      <div class="ilens" style="left:${px(g.vw / 2 - L / 2)};top:${px(g.lensY)};width:${px(L)};height:${px(L)};background:radial-gradient(circle,#1d2433 0 22%,#0b0d12 23% 40%,#2a2a2e 41% 46%,#121214 47% 66%,${k.ring} 67% 70%,rgba(0,0,0,.55) 71% 100%)"></div>
      <div class="ilcd num" style="left:${px(g.bx + g.bw - 24 - side)};top:${px(g.lensY + L / 2 - 20)};width:${px(side)};color:${k.lcd}">${prefs.pack}</div>
      <div class="ilogo" style="top:${px(g.slotY - 26)};color:${k.logo}">${m.id === "mini" ? "mooncam mini" : "MOONCAM"}</div>
      <div class="islot" style="left:${px(g.bx + 34)};top:${px(g.slotY)};width:${px(g.bw - 68)}"></div>`;
  } else {
    const f = AN.filmOf(prefs.film), black = f.body === "black", n = camState.rollCount || 0, tot = prefs.rollSize;
    const plate = black ? "linear-gradient(180deg,#3a3d42 0%,#1d1f23 30%,#2b2e33 46%,#121315 47%,#191a1d 100%)" : "linear-gradient(180deg,#e9e9e6 0%,#b9bab6 30%,#d6d7d3 46%,#1c1b19 47%,#262421 100%)";
    const cells = Array.from({length: tot}, (_, i) => `<i style="background:${i < n ? f.shot : i === n ? f.accent : "rgba(255,255,255,.08)"}${i === n ? `;box-shadow:0 0 6px ${f.accent}` : ""}"></i>`).join("");
    const ph = g.plateH, lever = !prefs.advanced;
    sk.innerHTML = `<div class="rplate" style="left:${px(g.bx + 6)};top:${px(g.by + 8)};width:${px(g.bw - 12)};height:${px(ph)};background:${plate}">
        <span class="rknob" style="background:${black ? "linear-gradient(180deg,#3a3d42,#15161a)" : "linear-gradient(180deg,#d6d7d3,#8e8f8b)"}"></span>
        <b class="rlogo" style="color:${black ? "#b8bcc2" : "#2b2a27"}">MOONCAM 35</b>
        <span class="rcount" style="background:radial-gradient(circle,#111 0 60%,${black ? "#55585e" : "#9c9d99"} 61%)"><b style="color:${f.accent}">${Math.min(n + (prefs.advanced ? 1 : 0), tot) || 1}</b><small>/${tot}</small></span>
        <span class="rtab" style="top:${px(ph * .52)}"><span class="fbox big" style="background:${f.box}"><em style="color:${f.boxInk}">${f.short[0]}<br>${f.short[1]}</em><strong style="color:${f.isoInk}">${f.iso}</strong></span><small>ฟิล์มในกล้อง<br><span style="color:${f.accent2}">${tot} EXP · ISO ${f.iso}</span></small></span>
      </div>
      <div class="rwin" style="left:${px(g.wx - 7)};top:${px(g.wy - 7)};width:${px(g.ww + 14)};height:${px(g.wh + 14)}"></div>
      <div class="rstrip" style="left:${px(g.bx)};top:${px(g.stripY)};width:${px(g.bw)}"><div class="sp"></div><div class="cells" style="grid-template-columns:repeat(${tot},minmax(0,1fr))">${cells}</div><div class="sp"></div></div>
      <div class="rnote" style="top:${px(g.stripY + 50)}">ถ่ายไป <b style="color:${f.accent}">${n}</b> จาก ${tot} · ${n >= tot ? "ครบแล้ว!" : "ดูรูปได้เมื่อถ่ายครบแล้วล้างฟิล์ม"}</div>`;
    $("#skin-ctl").innerHTML = `<button class="rlever${lever ? " ready" : ""}" id="sk-lever" aria-label="ขึ้นฟิล์ม" style="--acc:${f.accent}"><i style="background:${black ? "linear-gradient(180deg,#4a4d52,#15161a)" : "linear-gradient(180deg,#e6e6e3,#8e8f8b)"}"></i><span>${lever ? "ขึ้นฟิล์ม ↑" : "พร้อมถ่าย"}</span></button>`;
    const lv = $("#sk-lever"); let y0 = null;
    lv.onpointerdown = e => { y0 = e.clientY; lv.setPointerCapture(e.pointerId); };
    lv.onpointerup = e => { if (y0 == null) return; y0 = null; advanceFilm(); };
  }
}
function advanceFilm() {
  if (prefs.advanced) return; prefs.advanced = true; savePrefs(); haptic([12, 40, 12]);
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const n = actx.sampleRate * .22, b = actx.createBuffer(1, n, actx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / n; ch[i] = (Math.random() * 2 - 1) * (Math.sin(t * 90) > .6 ? .9 : .15) * (1 - t); }
    const s = actx.createBufferSource(), gn = actx.createGain(); gn.gain.value = .35; s.buffer = b; s.connect(gn).connect(actx.destination); s.start(); } catch (e) {}
  renderSkin();
}

// ---------------------------------------------------------------- pickers
function bodyMini(m) {
  const k = m.skin, w = m.id === "wide" ? 132 : m.id === "mini" ? 80 : 104, h = m.id === "wide" ? 72 : m.id === "mini" ? 90 : 84;
  return `<span class="mini-body" style="width:${w}px;height:${h}px;background:${k.body};border-radius:${Math.min(k.radius, 28) * .7}px;${k.trim ? `box-shadow:inset 0 0 0 4px ${k.trim},0 8px 16px rgba(0,0,0,.5)` : ""}">
    <i class="mb-lens" style="background:radial-gradient(circle,#1d2433 0 25%,#0b0d12 26% 55%,${k.ring} 56% 62%,rgba(0,0,0,.5) 63%)"></i><i class="mb-flash" style="background:${k.flash}"></i><i class="mb-vf"></i></span>`;
}
function openModelSheet() {
  const b = el("div"); b.appendChild(note("แต่ละรุ่นมีรูปร่าง ขนาดฟิล์ม และสีภาพไม่เหมือนกัน"));
  const g = el("div", "pick-grid");
  AN.INSTANT.forEach(m => { const c = el("button", "pick" + (m.id === prefs.instantModel ? " on" : ""), `<span class="pick-art">${bodyMini(m)}</span><b>${m.name}</b><em class="num" style="color:${m.skin.accent}">${m.format}</em><small>${m.desc}</small>`);
    c.onclick = () => { haptic(); prefs.instantModel = m.id; prefs.instantFrame = 0; savePrefs(); applySkinLook(); setSkin(); applyLivePreview(); closeSheet(); toast(m.name + " — " + m.desc, 1600); }; g.appendChild(c); });
  b.appendChild(g); openSheet("กล้องโพลารอยด์", b);
}
function openFilmSheet() {
  const b = el("div"); b.appendChild(note("เลือกฟิล์มก่อนใส่กล้อง แต่ละยี่ห้อให้สีภาพต่างกัน — ชื่อฟิล์มเป็นของ MoonCam เอง"));
  const g = el("div", "pick-grid");
  AN.FILMS.forEach(f => { const c = el("button", "pick film" + (f.id === prefs.film ? " on" : ""), `<span class="fbox big wide" style="background:${f.box}"><em style="color:${f.boxInk}">${f.short[0]}<br>${f.short[1]}</em><strong style="color:${f.isoInk}">${f.iso}</strong></span><b>${f.name}</b><span class="sw3">${f.swatch.map(c => `<i style="background:${c}"></i>`).join("")}<small>${f.tone}</small></span>`);
    if (f.id === prefs.film) c.style.borderColor = f.accent;
    c.onclick = () => pickFilm(f); g.appendChild(c); });
  b.appendChild(g);
  b.appendChild(label("จำนวนรูปต่อม้วน"));
  b.appendChild(chips([[24, "24 รูป"], [36, "36 รูป"]], prefs.rollSize, async k => { if ((camState.rollCount || 0) > 0 && k !== prefs.rollSize) return toast("เปลี่ยนจำนวนรูปได้ตอนใส่ม้วนใหม่", 1500); prefs.rollSize = k; savePrefs(); setSkin(); renderSkin(); openFilmSheet(); }));
  openSheet("เลือกม้วนฟิล์ม", b);
}
function pickFilm(f) {
  haptic();
  const go = () => { prefs.film = f.id; prefs.advanced = true; savePrefs(); applySkinLook(); setSkin(); applyLivePreview(); renderSkin(); closeSheet(); toast(`ใส่ฟิล์ม ${f.name} แล้ว · ${f.tone}`, 1600); };
  if (f.id === prefs.film) return closeSheet();
  const n = camState.rollCount || 0; if (!n) return go();
  const b = el("div"); b.appendChild(note(`ม้วน ${AN.filmOf(prefs.film).name} ถ่ายไปแล้ว ${n} รูป — เปลี่ยนฟิล์มตอนนี้ จะล้างม้วนเดิมก่อน (ได้รูป ${n} รูป)`));
  b.appendChild(button("ล้างม้วนนี้ แล้วใส่ฟิล์มใหม่", "big gold", async () => { closeSheet(); await showDarkroom(); prefs.film = f.id; savePrefs(); applySkinLook(); setSkin(); applyLivePreview(); }));
  b.appendChild(button("ยกเลิก", "big ghost", closeSheet));
  openSheet("เปลี่ยนฟิล์ม", b);
}
function openPackSheet() {
  const b = el("div"); b.appendChild(note("ฟิล์มในแพ็คหมดแล้ว 📷 ใส่แพ็คใหม่เพื่อถ่ายต่อ"));
  b.appendChild(button("ใส่แพ็คใหม่ (10 แผ่น)", "big gold", () => { prefs.pack = 10; savePrefs(); renderSkin(); closeSheet(); haptic([10, 60, 10]); toast("ใส่แพ็คใหม่แล้ว · 10 แผ่น"); }));
  openSheet("แพ็คฟิล์มหมด", b);
}
$("#c-skin").onclick = () => camState.mode === "visa" ? openVisaSheet() : camState.mode === "instant" ? openModelSheet() : openFilmSheet();

// ---------------------------------------------------------------- instant print: eject → develop → done
const IV = {photo: null, meta: null, settings: null, model: null, p: 0, raf: 0, boost: 0, done: false, saved: false, caption: "", date: true, frame: 0, fmt: "card"};
async function renderWith(img, settings, max, meta = {}) {
  const keepS = snap(), keepSession = {...session};
  try {
    Object.assign(S, JSON.parse(settings)); session.full = scaled(img, max); session.prev = null;
    Object.assign(session, {faces: null, fromCamera: true, exif: meta.exif || null, gps: meta.gps || null, when: meta.when || new Date()}); memo.clear();
    if (F.hasBeauty(S.beauty)) { try { session.faces = await F.detectFaces(scaled(session.full, device.preview)); } catch (e) {} }
    return renderPipeline(session.full, false);
  } finally { Object.assign(session, keepSession); Object.assign(S, JSON.parse(keepS)); memo.clear(); }
}
function motorSound(sec) {
  if (!prefs.sound) return;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = 74; f.type = "lowpass"; f.frequency.value = 900; g.gain.setValueAtTime(0, actx.currentTime); g.gain.linearRampToValueAtTime(.16, actx.currentTime + .08);
    g.gain.setValueAtTime(.16, actx.currentTime + sec - .15); g.gain.linearRampToValueAtTime(0, actx.currentTime + sec);
    o.frequency.linearRampToValueAtTime(92, actx.currentTime + sec); o.connect(f).connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + sec + .05); } catch (e) {}
}
const fmtDate = d => `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
function sizeCard() {
  const m = IV.model, b = m.border, vw = innerWidth, cw = Math.min(vw - 70, 330, (innerHeight - 330) * (1 + b[0] + b[2]) / (1 / m.ratio + b[1] + b[3]));
  const pw = cw / (1 + b[0] + b[2]), ph = pw / m.ratio;
  const card = $("#iov-card"); Object.assign(card.style, {width: cw + "px", padding: `${pw * b[1]}px ${pw * b[2]}px 0 ${pw * b[0]}px`, background: (m.frames[IV.frame] || m.frames[0])[1]});
  Object.assign($("#iov-photo").style, {width: pw + "px", height: ph + "px"});
  Object.assign($("#iov-cap").style, {height: pw * b[3] + "px", fontSize: Math.max(14, pw * b[3] * .3) + "px"});
  const fc = (m.frames[IV.frame] || m.frames[0])[1], dark = parseInt(fc.slice(1, 3), 16) < 90;
  $("#iov-cap").style.color = dark ? "#f2efe8" : m.ink;
  return {cw, ch: ph + pw * (b[1] + b[3])};
}
async function startInstant(shot, meta, settings) {
  const m = AN.instantOf(prefs.instantModel);
  Object.assign(IV, {photo: null, shot: null, prevImg: null, meta, settings, model: m, p: 0, boost: 0, done: false, saved: false, caption: "", date: true, frame: prefs.instantFrame || 0, fmt: prefs.instantFmt || "card"});
  const ov = $("#iov"); ov.hidden = false; ov.className = "iov eject"; $("#iov-done").hidden = true; $("#iov-title").textContent = "DEVELOPING"; $("#iov-skip").textContent = "ข้ามการรอ";
  $("#iov-capt").textContent = ""; $("#iov-date").textContent = fmtDate(meta.when);
  const {cw, ch} = sizeCard(), clip = $("#iov-clip"), card = $("#iov-card");
  const slotY = skinGeo ? skinGeo.slotY + 4 + (parseFloat(getComputedStyle($("#v-cam")).top) || 0) : innerHeight * .6;
  Object.assign(clip.style, {top: slotY + "px", height: ch + 30 + "px", width: cw + 40 + "px", marginLeft: -(cw + 40) / 2 + "px"});
  card.style.transition = "none"; card.style.transform = `translateY(${-ch - 10}px)`;
  const cv = $("#iov-canvas"); cv.width = 8; cv.height = 8; cv.getContext("2d").fillStyle = "#2c2d31"; cv.getContext("2d").fillRect(0, 0, 8, 8);
  setVeil(0);
  void card.offsetWidth; motorSound(2); haptic([30, 40, 30, 40, 30, 40, 30]);
  card.style.transition = "transform 2s cubic-bezier(.35,.05,.4,1)"; card.style.transform = "translateY(0)";
  await new Promise(r => setTimeout(r, 2150));
  ov.className = "iov dev";
  clip.style.transition = "top .7s var(--ease)"; clip.style.top = Math.max(70, (innerHeight - ch) / 2 - 90) + "px"; clip.style.overflow = "visible";
  card.style.transition = "transform .7s var(--ease)"; card.style.transform = "rotate(1.5deg)";
  await new Promise(r => setTimeout(r, 750));
  // quick preview render (the print is still "undeveloped", so the short wait is invisible); full-res happens on save
  try { const img = await renderWith(shot, settings, 900, meta); IV.prevImg = img; const r = $("#iov-photo").getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr) || 600; cv.height = Math.round(r.height * dpr) || 600; const x = cv.getContext("2d"), s = img.width / img.height, t = cv.width / cv.height;
    let sw = img.width, sh = img.height; if (s > t) sw = sh * t; else sh = sw / t; x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, cv.width, cv.height); }
  catch (e) { toast("เรนเดอร์ไม่สำเร็จ: " + e.message); }
  IV.shot = shot;
  let last = performance.now();
  const DUR = 40000;
  const tick = now => {
    const dt = now - last; last = now;
    IV.p = Math.min(1, IV.p + dt / DUR * (1 + IV.boost)); IV.boost *= .96;
    setVeil(IV.p); $("#iov-pct").textContent = Math.round(IV.p * 100) + "%"; $("#iov-bar").style.width = IV.p * 100 + "%";
    if (IV.p >= 1) return instantDone();
    IV.raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(IV.raf); IV.raf = requestAnimationFrame(tick);
  window.addEventListener("devicemotion", onShakeDev);
}
function setVeil(p) {
  const e = Math.pow(p, .8);
  $("#iov-veil").style.opacity = (1 - e) * .97;
  $("#iov-canvas").style.filter = `saturate(${(.15 + .85 * e).toFixed(3)}) contrast(${(.55 + .45 * e).toFixed(3)}) brightness(${(1.25 - .25 * e).toFixed(3)}) blur(${((1 - e) * 1.2).toFixed(2)}px)`;
}
let lastShake = 0;
function onShakeDev(e) { const a = e.accelerationIncludingGravity || {}; const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0); if (Math.abs(m - lastShake) > 9 && !IV.done) { IV.boost = Math.min(10, IV.boost + 2.5); haptic(6); } lastShake = m; }
(() => { const card = $("#iov-card"); let pt = null;
  card.addEventListener("pointermove", e => { if (IV.done || $("#iov").className.indexOf("dev") < 0) return; if (pt) { const d = Math.hypot(e.clientX - pt.x, e.clientY - pt.y); IV.p = Math.min(1, IV.p + d * .00035); } pt = {x: e.clientX, y: e.clientY}; });
  card.addEventListener("pointerleave", () => pt = null); card.addEventListener("pointerup", () => pt = null);
})();
function instantDone() {
  cancelAnimationFrame(IV.raf); window.removeEventListener("devicemotion", onShakeDev);
  IV.done = true; IV.p = 1; setVeil(1); haptic([10, 30, 10]);
  $("#iov").className = "iov done"; $("#iov-title").textContent = "พร้อมแล้ว ✦"; $("#iov-skip").textContent = "ทิ้งรูปนี้";
  $("#iov-done").hidden = false; renderInstantTools();
}
function renderInstantTools() {
  const m = IV.model, t = $("#iov-tools"); t.textContent = "";
  const tool = (ic, l, fn, on) => { const b = el("button", "tool" + (on ? " on" : ""), `<i>${icon(ic)}</i>${l}`); b.onclick = () => { haptic(); fn(); }; t.appendChild(b); };
  tool("adjust", "เขียนข้อความ", () => { const v = prompt("เขียนบนขอบรูป", IV.caption || ""); if (v !== null) { IV.caption = v.slice(0, 32); $("#iov-capt").textContent = IV.caption; IV.saved = false; syncSaveBtn(); } }, !!IV.caption);
  tool("timer", IV.date ? "ซ่อนวันที่" : "ใส่วันที่", () => { IV.date = !IV.date; $("#iov-date").hidden = !IV.date; IV.saved = false; renderInstantTools(); });
  tool("layers", "กำแพงรูป", () => { closeInstant(true).then(openWall); });
  tool("share", "แชร์", async () => { const it = await instantExport(); shareBlobs([it]); });
  const fr = $("#iov-frames"); fr.textContent = ""; fr.appendChild(chips(m.frames.map(([n], i) => [i, n]), IV.frame, k => { IV.frame = k; prefs.instantFrame = k; savePrefs(); sizeCard(); IV.saved = false; renderInstantTools(); }));
  const fm = $("#iov-fmt"); fm.textContent = ""; fm.appendChild(chips([["card", "ทั้งใบมีขอบ"], ["photo", "เฉพาะรูป"], ["story", "สตอรี่ 9:16"]], IV.fmt, k => { IV.fmt = k; prefs.instantFmt = k; savePrefs(); IV.saved = false; renderInstantTools(); }));
  syncSaveBtn();
}
function syncSaveBtn() { const b = $("#iov-save"); b.textContent = IV.saved ? "บันทึกแล้ว ✓" : "บันทึกลงเครื่อง"; b.classList.toggle("gold", !IV.saved); b.classList.toggle("ghost", IV.saved); }
function cardCanvas(w = 1600) { return AN.makeCard(IV.photo, IV.model, {frame: IV.frame, caption: IV.caption, date: IV.date ? fmtDate(IV.meta.when) : "", w}); }
async function fullPhoto() { if (!IV.photo) IV.photo = await renderWith(IV.shot, IV.settings, 2000, IV.meta); return IV.photo; }
async function instantExport() {
  await fullPhoto();
  let c;
  if (IV.fmt === "photo") c = IV.photo;
  else if (IV.fmt === "story") {
    const card = cardCanvas(860); c = newCanvas(1080, 1920); const x = c.getContext("2d");
    x.filter = "blur(40px) brightness(.55)"; x.drawImage(IV.photo, -100, -100, 1280, 2120); x.filter = "none";
    x.save(); x.translate(540, 900); x.rotate(-.035); x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = 50; x.shadowOffsetY = 24; x.drawImage(card, -card.width / 2, -card.height / 2); x.restore();
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = "600 30px 'Cormorant Garamond', serif"; x.textAlign = "center"; x.fillText("M O O N C A M", 540, 1800);
  } else c = cardCanvas(1600);
  let blob = await new Promise(r => c.toBlob(r, "image/jpeg", prefs.quality));
  blob = await EX.writeExif(blob, {source: prefs.keepExif ? IV.meta.exif : null, gps: prefs.gps ? IV.meta.gps : null, keepGps: prefs.gps, when: IV.meta.when});
  return {blob, name: `MoonCam_instant_${IV.model.id}_${Date.now()}.jpg`};
}
async function saveInstant() {
  if (IV.saved || !IV.shot) return;
  const it = await instantExport(); await saveBlobs([it], {quiet: true}); IV.saved = true; syncSaveBtn();
  const card = cardCanvas(900), thumb = await new Promise(r => card.toBlob(r, "image/jpeg", .9));
  await DB.instantAdd({id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), time: IV.meta.when.getTime(), blob: thumb, model: IV.model.id}).catch(() => {});
  setAlbumThumb(card);
}
async function closeInstant(save) {
  cancelAnimationFrame(IV.raf); window.removeEventListener("devicemotion", onShakeDev);
  if (save) { if (!IV.done) { IV.done = true; IV.p = 1; } await saveInstant(); }
  $("#iov").hidden = true; const clip = $("#iov-clip"); clip.style.transition = "none"; clip.style.overflow = "hidden";
}
$("#iov-save").onclick = () => saveInstant();
$("#iov-again").onclick = () => closeInstant(true);
$("#iov-skip").onclick = () => { haptic(); if (!IV.done) { IV.p = 1; } else closeInstant(false).then(() => toast("ทิ้งรูปแล้ว", 1000)); };

// ---------------------------------------------------------------- instant wall
async function openWall() {
  show("#v-wall"); const cards = (await DB.instantAll().catch(() => [])).sort((a, b) => b.time - a.time), g = $("#w-grid"); g.textContent = "";
  $("#w-count").textContent = cards.length ? cards.length + " รูป · แตะเพื่อแชร์/บันทึก" : "ยังไม่มีรูป";
  if (!cards.length) g.appendChild(note("ยังไม่มีรูปโพลารอยด์ — เลือกโหมดโพลารอยด์ในหน้ากล้องแล้วถ่ายเลย"));
  cards.forEach((c, i) => { const im = el("img"); im.src = URL.createObjectURL(c.blob); im.style.setProperty("--r", ((i * 37) % 9 - 4) + "deg"); im.alt = "รูปโพลารอยด์";
    im.onclick = () => { const b = el("div"), big = el("img"); big.src = im.src; big.style.cssText = "display:block;max-width:100%;max-height:46vh;margin:0 auto 10px;border-radius:4px"; b.appendChild(big);
      b.appendChild(button(`${icon("share")} แชร์`, "big gold", () => shareBlobs([{blob: c.blob, name: `MoonCam_instant_${c.time}.jpg`}])));
      b.appendChild(button(`${icon("download")} บันทึกอีกครั้ง`, "big ghost", () => saveBlobs([{blob: c.blob, name: `MoonCam_instant_${c.time}.jpg`}])));
      b.appendChild(button("ลบออกจากกำแพง", "big ghost", async () => { await DB.instantDelete(c.id); closeSheet(); openWall(); }));
      openSheet(new Date(c.time).toLocaleDateString("th-TH"), b); };
    g.appendChild(im); });
}
$("#w-back").onclick = () => show("#v-cam");

// ---------------------------------------------------------------- darkroom (full roll)
async function showDarkroom() {
  const shots = (await DB.rollAll().catch(() => [])).filter(s => !s.developed).sort((a, b) => a.time - b.time);
  if (!shots.length) return;
  const f = AN.filmOf(shots[0].film || prefs.film), ov = $("#darkroom"); ov.hidden = false; $("#dr-btns").hidden = true;
  $("#dr-can").innerHTML = `<span class="fbox can-box" style="background:${f.box}"><em style="color:${f.boxInk}">${f.short[0]}<br>${f.short[1]}</em></span>`;
  $("#dr-title").textContent = shots.length >= prefs.rollSize ? `ครบ ${shots.length} รูปแล้ว!` : `ล้างม้วนนี้ ${shots.length} รูป`;
  $("#dr-msg").textContent = "กรอฟิล์มกลับ… กำลังล้างภาพในห้องมืด"; $("#dr-film").textContent = `${f.name.toUpperCase()} · ${shots.length} EXP`; $("#dr-date").textContent = new Date().toLocaleDateString("en-GB").replace(/\//g, ".");
  const grid = $("#dr-grid"); grid.textContent = "";
  const cells = shots.map(() => { const c = el("i"); grid.appendChild(c); return c; });
  haptic([20, 30, 20, 30, 20]); motorSound(1.4);
  await developRoll(); prefs.advanced = true; savePrefs(); camState.rollCount = 0;
  const bar = $("#dr-bar"); bar.style.width = "0";
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]; try {
      const bmp = await createImageBitmap(s.blob); const t = scaled(bmp, 220), id = pixels(t), st = s.settings;
      if (st.ref) E.applyTransfer(id.data, st.ref, st.strength / 100); E.applyGrade(id.data, t.width, t.height, E.effective(st.adj, st.strength / 100)); t.getContext("2d").putImageData(id, 0, 0);
      cells[i].appendChild(t); requestAnimationFrame(() => cells[i].classList.add("show"));
    } catch (e) {}
    bar.style.width = ((i + 1) / shots.length * 100) + "%";
    await new Promise(r => setTimeout(r, 160));
  }
  $("#dr-msg").textContent = "ล้างเสร็จแล้ว — ภาพทั้งม้วนพร้อมดู"; $("#dr-btns").hidden = false; haptic([10, 40, 10]);
  refreshRollChip().then(renderSkin);
}
$("#dr-view").onclick = () => { $("#darkroom").hidden = true; openRoll(); };
$("#dr-new").onclick = () => { $("#darkroom").hidden = true; renderSkin(); openFilmSheet(); };

// ================================================================== EDITOR
async function openEditor(img, {blob = null, exif = null, gps = null, when = new Date(), fromCamera = false, name = "MoonCam"} = {}) {
  if (!fromCamera) S.cam = {exposure: 0, temp: 0};
  session.full = scaled(img, device.exportMax); session.prev = scaled(session.full, device.preview);
  session.blob = blob; session.exif = exif; session.gps = gps || EX.gpsFromExif(exif); session.when = when; session.fromCamera = fromCamera; session.name = name; session.faces = null;
  memo.clear(); thumbCache.clear(); session.analysis = null;
  hist.u = []; hist.r = []; hist.last = null; commit();
  viewZoom(1, 0, 0); show("#v-edit"); renderPanel(); requestRender();
  if (F.hasBeauty(S.beauty)) ensureFaces();
}
async function ensureFaces() {
  if (session.faces || !session.prev) return session.faces;
  try { session.faces = await F.detectFaces(session.prev); memo.clear(); requestRender(); if (tab === "beauty" || tab === "makeup") renderPanel(); }
  catch (e) { session.faces = []; if (tab === "beauty" || tab === "makeup") renderPanel(); }
  return session.faces;
}

let dirty = false, rendering = false, showOriginal = false;
function requestRender() { dirty = true; if (!rendering) { rendering = true; requestAnimationFrame(doRender); } }
function doRender() {
  if (!session.prev || $("#v-edit").hidden) { rendering = false; return; }
  dirty = false;
  const view = $("#view");
  const img = showOriginal ? session.prev : finalCompose(renderPipeline(session.prev, true), Math.max(session.prev.width, session.prev.height));
  view.width = img.width; view.height = img.height; view.getContext("2d").drawImage(img, 0, 0);
  $("#st-tag").textContent = showOriginal ? "ORIGINAL" : [S.lookName, S.lens !== "natural" ? lensOf().name : "", S.body !== "none" ? bodyOf().name : ""].filter(Boolean).join(" · ").toUpperCase();
  if (dirty) requestAnimationFrame(doRender); else rendering = false;
}

/** Full-resolution export as a JPEG blob with EXIF. */
async function exportBlob({forShare = false} = {}) {
  $("#busy").hidden = false; await new Promise(r => setTimeout(r, 30));
  try {
    if (F.hasBeauty(S.beauty)) await ensureFaces();
    const img = finalCompose(renderPipeline(session.full, false), Math.max(session.full.width, session.full.height));
    let blob = await new Promise(r => img.toBlob(r, "image/jpeg", prefs.quality));
    const keepGps = forShare ? !prefs.stripGpsOnShare : true;
    const gps = prefs.gps ? session.gps : null;
    blob = await EX.writeExif(blob, {source: prefs.keepExif ? session.exif : null, gps, keepGps: keepGps && (prefs.gps || !!(prefs.keepExif && EX.gpsFromExif(session.exif))), when: session.when});
    return blob;
  } finally { $("#busy").hidden = true; }
}
const fileName = () => `MoonCam_${S.lookName.replace(/[^A-Za-z0-9ก-๙]+/g, "")}_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.jpg`;
function blobToB64(blob) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); }); }

async function saveBlobs(items, {quiet = false} = {}) { // items: [{blob,name}]
  if (bridge && bridge.saveImage) { let ok = 0; for (const it of items) if (bridge.saveImage(await blobToB64(it.blob), it.name)) ok++; toast(ok !== items.length ? "บันทึกบางรูปไม่สำเร็จ" : quiet ? "บันทึกลงแกลเลอรีแล้ว ✓" : `บันทึกลงแกลเลอรีแล้ว ${ok} รูป (Pictures/MoonCam)`, quiet ? 1200 : 2600); return; }
  for (const it of items) { const a = el("a"); a.href = URL.createObjectURL(it.blob); a.download = it.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); await new Promise(r => setTimeout(r, 250)); }
  toast(items.length > 1 ? `ดาวน์โหลด ${items.length} รูปแล้ว` : quiet ? "บันทึกแล้ว ✓" : "บันทึกรูปแล้ว (โฟลเดอร์ดาวน์โหลด)", quiet ? 1200 : 2600);
}
async function shareBlobs(items, pkg = "") {
  if (bridge && bridge.shareImages) { const arr = []; for (const it of items) arr.push({b64: await blobToB64(it.blob), name: it.name}); if (!bridge.shareImages(JSON.stringify(arr), pkg)) toast(pkg ? "ไม่พบแอปนี้ในเครื่อง — ลองปุ่ม 'แอปอื่น ๆ'" : "แชร์ไม่สำเร็จ"); return; }
  if (bridge && bridge.shareImage && items.length === 1) { bridge.shareImage(await blobToB64(items[0].blob), items[0].name); return; }
  const files = items.map(it => new File([it.blob], it.name, {type: "image/jpeg"}));
  if (navigator.canShare && navigator.canShare({files})) { try { await navigator.share({files, title: "MoonCam"}); } catch (e) { if (e.name !== "AbortError") toast("แชร์ไม่สำเร็จ"); } return; }
  toast("เบราว์เซอร์นี้แชร์ไฟล์ตรงไม่ได้ — บันทึกรูปแล้วแชร์จากแกลเลอรีแทน"); saveBlobs(items);
}

// ---------------------------------------------------------------- thumbnails
const thumbCache = new Map();
let _sample = null;
function sampleThumb() { if (_sample) return _sample; const c = newCanvas(96, 128), x = c.getContext("2d"); let g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, "#2b3a55"); g.addColorStop(.6, "#b8735a"); g.addColorStop(1, "#f2b266"); x.fillStyle = g; x.fillRect(0, 0, 96, 128); x.fillStyle = "#ffe9c2"; x.beginPath(); x.arc(60, 70, 8, 0, 7); x.fill(); x.fillStyle = "#3a2c2a"; x.fillRect(0, 88, 96, 40); x.fillStyle = "#0e0b0a"; x.beginPath(); x.arc(30, 66, 6, 0, 7); x.fill(); x.fillRect(22, 74, 16, 30); x.fillStyle = "#3d6b8c"; x.fillRect(0, 118, 96, 10); return _sample = c; }
function thumbFor(look, src, size) {
  const key = look.id + "|" + src.__id + "|" + size + "|" + (look.ref ? "r" : "") + JSON.stringify(look.adj).length;
  if (thumbCache.has(key)) return thumbCache.get(key).cloneNode ? cloneThumb(thumbCache.get(key)) : thumbCache.get(key);
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height; const x = c.getContext("2d", {willReadFrequently: true}); x.drawImage(src, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height); if (look.ref) E.applyTransfer(id.data, look.ref, 1); E.applyGrade(id.data, c.width, c.height, look.adj); x.putImageData(id, 0, 0);
  thumbCache.set(key, c); return cloneThumb(c);
}
function cloneThumb(c) { const o = document.createElement("canvas"); o.width = c.width; o.height = c.height; o.getContext("2d").drawImage(c, 0, 0); return o; }
function editorThumbSrc() { if (!session.prev) return sampleThumb(); if (!session.thumb || session.thumb.__base !== session.prev.__id) { const t = scaled(session.prev, 150); t.__base = session.prev.__id; session.thumb = t; } return session.thumb; }

// ---------------------------------------------------------------- panel widgets
const fmt = (v, signed) => { const i = Math.round(v); return signed && i > 0 ? "+" + i : String(i); };
const GRAD = {temp: "linear-gradient(90deg,#4a7bd8,#e6e0d2,#e8b23a)", tint: "linear-gradient(90deg,#4caf6a,#e6e0d2,#d45db0)", vibrance: "linear-gradient(90deg,#8a8a8a,#e59a3a,#e0493c)", saturation: "linear-gradient(90deg,#7a7a7a,#c77d5a,#e23d3d)", hue: "linear-gradient(90deg,#ff4040,#ffc040,#80ff40,#40ffc0,#4080ff,#c040ff,#ff4040)"};
function track(v, min, max, grad) { if (grad) return grad; const p = (v - min) / (max - min) * 100, from = min < 0 ? 50 : 0, lo = Math.min(p, from), hi = Math.max(p, from); return `linear-gradient(90deg,var(--line2) ${lo}%,var(--gold) ${lo}%,var(--gold2) ${hi}%,var(--line2) ${hi}%)`; }
function slider(label, id, v, min, max, onInput, o = {}) {
  const row = el("div", "row"), signed = min < 0, disp = o.disp || (x => fmt(x, signed));
  row.innerHTML = `<label for="s_${id}">${label}</label><input type="range" id="s_${id}" min="${min}" max="${max}" step="${o.step || 1}" value="${v}"><output class="num">${disp(v)}</output>`;
  const inp = row.querySelector("input"), out = row.querySelector("output"); inp.style.setProperty("--track", track(v, min, max, o.grad));
  if (o.disabled) inp.disabled = true;
  inp.addEventListener("input", () => { const x = +inp.value; out.textContent = disp(x); inp.style.setProperty("--track", track(x, min, max, o.grad)); onInput(x); if (!o.noRender) requestRender(); });
  inp.addEventListener("change", () => { commit(); o.onChange && o.onChange(); });
  return row;
}
function chips(items, cur, onPick, cls = "") { const d = el("div", "chips " + cls); items.forEach(([k, l]) => { const b = el("button", "chip" + (k === cur ? " on" : ""), l); b.onclick = () => { haptic(); onPick(k); }; d.appendChild(b); }); return d; }
const label = t => el("div", "label", t);
const note = t => el("p", "note", t);
function toggle(text, on, onChange, sub) { const d = el("div", "toggle"); d.innerHTML = `<span>${text}${sub ? `<small>${sub}</small>` : ""}</span><button class="sw" role="switch" aria-checked="${!!on}" aria-label="${text}"></button>`;
  d.querySelector(".sw").onclick = e => { haptic(); const v = e.currentTarget.getAttribute("aria-checked") !== "true"; e.currentTarget.setAttribute("aria-checked", v); onChange(v); }; return d; }
function button(text, cls, onClick) { const b = el("button", cls, text); b.onclick = onClick; return b; }
function lookCard(l, src, onClick, onDelete) {
  const b = el("button", "lk" + (l.id === S.lookId ? " on" : "")); b.title = l.desc || l.name; b.appendChild(thumbFor(l, src)); b.appendChild(el("span", null, l.name)); b.onclick = onClick;
  if (onDelete) { const x = el("span", "x", "×"); x.onclick = e => { e.stopPropagation(); onDelete(); }; b.appendChild(x); } return b;
}

// ---------------------------------------------------------------- editor panels
let tab = "looks", lookCat = "trend", adjTab = "color", band = 0, beautyTool = "auto";
function renderPanel() {
  const p = $("#panel"); p.textContent = ""; p.scrollTop = 0;
  ({looks: pLooks, adjust: pAdjust, beauty: pBeauty, makeup: pMakeup, weather: pWeather, lens: pLens, social: pSocial, share: pShare})[tab](p);
}

function suggestLooks() {
  if (!session.analysis) { const t = editorThumbSrc(), d = pixels(t).data; session.analysis = E.analyze(d, t.width, t.height); }
  const a = session.analysis, score = {};
  const add = (ids, w) => ids.forEach((id, i) => score[id] = (score[id] || 0) + w * (1 - i * .08));
  if (a.skin > .1) add(["bright_skin", "korean_clear", "soft_portrait", "peach_soft", "warm_film"], 2 + a.skin * 5);
  if (a.sky > .12 || a.blue > .18) add(["clear_sea", "teal_orange", "golden_hour", "japan_film", "blockbuster"], 2 + a.sky * 6);
  if (a.dark > .4 || a.lum < .3) add(["city_night", "night_film", "neon_after_dark", "neon_2049", "jazz_club"], 2 + a.dark * 4);
  if (a.green > .18) add(["japan_film", "indie_film", "paris_cafe", "indie_folk"], 2 + a.green * 5);
  if (a.warm > .1 && a.sat > .3) add(["food_pop", "cafe", "golden_hour", "warm_film"], 1.5 + a.warm * 6);
  if (a.lum > .58) add(["minimal_white", "korean_clear", "dream_pop", "pastel_hotel"], 1.5 + a.lum * 2);
  add(["teal_orange", "warm_film", "korean_clear", "in_the_mood", "japan_film"], .6);
  return Object.entries(score).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([id]) => PRESETS.find(l => l.id === id)).filter(Boolean);
}

function pLooks(p) {
  const src = editorThumbSrc();
  const top = el("div", "chips"); top.style.alignItems = "center";
  top.appendChild(button(`${icon("dice")}`, "chip on", () => { const pool = PRESETS.filter(l => l.id !== "original" && l.id !== S.lookId), l = pool[Math.floor(Math.random() * pool.length)]; S.strength = Math.round(90 + Math.random() * 40); lookCat = l.cat; applyLook(l); renderPanel(); requestRender(); toast(`🎲 ${l.name} · ${S.strength}%`); }));
  top.appendChild(button(`${icon("copy")} Copy Look`, "chip", () => $("#f-ref").click()));
  top.appendChild(button(`${icon("qr")} แชร์ Look`, "chip", openLookShare));
  p.appendChild(top);
  p.appendChild(slider("ความแรง", "strength", S.strength, 0, 150, v => { S.strength = v; prefs.strength = v; savePrefs(); }, {disp: v => Math.round(v) + "%"}));
  const cur = lookOf(); if (cur && cur.desc) p.appendChild(note(`<b style="color:var(--gold2)">${cur.name}</b> — ${cur.desc}`));
  p.appendChild(label("✨ แนะนำสำหรับรูปนี้"));
  const sg = el("div", "suggest"); suggestLooks().forEach(l => sg.appendChild(lookCard(l, src, () => { applyLook(l); renderPanel(); requestRender(); }))); p.appendChild(sg);
  p.appendChild(chips(CATS, lookCat, k => { lookCat = k; renderPanel(); }, "scroll"));
  const list = lookCat === "mine" ? mine : PRESETS.filter(l => l.cat === lookCat);
  if (!list.length) { p.appendChild(note("ยังไม่มี Look ของคุณ — กด Copy Look เพื่อถอดสีจากรูปที่ชอบ หรือปรับสีในแท็บ 'ปรับ' แล้วกดบันทึก Look")); return; }
  const g = el("div", "grid-looks");
  list.forEach(l => g.appendChild(lookCard(l, src, () => { applyLook(l); renderPanel(); requestRender(); }, lookCat === "mine" ? () => { mine = mine.filter(m => m.id !== l.id); saveMine(); renderPanel(); toast(`ลบ "${l.name}" แล้ว`); } : null)));
  p.appendChild(g);
}

function pAdjust(p) {
  p.appendChild(chips([["light", "แสง"], ["color", "สี"], ["hsl", "HSL"], ["grain", "เกรน"], ["effects", "เอฟเฟกต์"]], adjTab, k => { adjTab = k; renderPanel(); }));
  const a = S.adj, set = k => v => { a[k] = v; };
  if (adjTab === "light") [["Exposure", "exposure"], ["S-Curve", "curve"], ["Density", "density"], ["Contrast", "contrast"], ["Highlights", "highlights"], ["Shadows", "shadows"], ["Blacks", "blacks"]].forEach(([l, k]) => p.appendChild(slider(l, k, a[k], (k === "curve" || k === "density") ? 0 : -100, 100, set(k))));
  if (adjTab === "color") [["Temp", "temp"], ["Tint", "tint"], ["Vibrance", "vibrance"], ["Saturation", "saturation"]].forEach(([l, k]) => p.appendChild(slider(l, k, a[k], -100, 100, set(k), {grad: GRAD[k]})));
  if (adjTab === "hsl") {
    const names = ["แดง", "ส้ม", "เหลือง", "เขียว", "น้ำเงิน", "ม่วง"], cols = ["#e5484d", "#f08a3a", "#f2d046", "#4caf6a", "#3d7fe0", "#9b59d0"];
    const sw = el("div", "swatches"); sw.style.marginBottom = "8px";
    cols.forEach((c, i) => { const b = el("button", "swatch" + (i === band ? " on" : "")); b.style.background = c; b.title = names[i]; b.onclick = () => { band = i; renderPanel(); }; sw.appendChild(b); }); p.appendChild(sw);
    const hb = a.hsl[band]; p.appendChild(label(names[band]));
    p.appendChild(slider("Hue", "h" + band, hb.hue, -100, 100, v => hb.hue = v, {grad: GRAD.hue}));
    p.appendChild(slider("Saturation", "s" + band, hb.sat, -100, 100, v => hb.sat = v));
    p.appendChild(slider("Luminance", "l" + band, hb.lum, -100, 100, v => hb.lum = v));
  }
  if (adjTab === "grain") { p.appendChild(slider("Amount", "grain", a.grain, 0, 100, set("grain"))); p.appendChild(slider("Size", "grainSize", a.grainSize, 0, 100, set("grainSize"))); }
  if (adjTab === "effects") {
    [["Halation", "halation"], ["Bloom", "bloom"], ["Vignette", "vignette"], ["Fade", "fade"], ["Light Leak", "lightLeak"]].forEach(([l, k]) => p.appendChild(slider(l, k, a[k], 0, 100, set(k))));
    p.appendChild(label("Split tone"));
    [["Shadow", "shadowTint"], ["Midtone", "midTint"], ["Highlight", "highlightTint"]].forEach(([l, k]) => { p.appendChild(slider(l + " hue", k + "Hue", a[k + "Hue"], 0, 360, set(k + "Hue"), {grad: GRAD.hue, disp: v => Math.round(v) + "°"})); p.appendChild(slider(l + " amt", k + "Amt", a[k + "Amt"], 0, 100, set(k + "Amt"))); });
    p.appendChild(toggle("ขาวดำ", a.mono, v => { a.mono = v; commit(); requestRender(); }));
  }
  const f = el("div", "chips"); f.style.marginTop = "12px";
  f.appendChild(button("รีเซ็ต", "chip", () => { const l = lookOf(); S.adj = E.clone(l ? l.adj : E.defAdj()); commit(); renderPanel(); requestRender(); }));
  f.appendChild(button("บันทึกเป็น My Look", "chip on", () => saveAsMyLook()));
  p.appendChild(f);
}
function saveAsMyLook(name) {
  name = name || prompt("ตั้งชื่อ Look", "My " + S.lookName.replace(/^My /, "")) || ""; // prompt works on GitHub Pages / app
  if (!name.trim()) return;
  const l = {id: "custom_" + Date.now().toString(36), name: name.trim().slice(0, 28), cat: "mine", desc: "Look ของคุณ", adj: E.clone(S.adj), ref: S.ref};
  mine.unshift(l); saveMine(); S.lookId = l.id; S.lookName = l.name; commit(); toast(`บันทึก "${l.name}" ใน My Looks แล้ว`); renderPanel();
}

const BEAUTY_TOOLS = [["auto", "ธรรมชาติ", "✦"], ["smooth", "ผิวเนียน", "◌"], ["acne", "ลบสิว", "✚"], ["clear", "หน้าใส", "☀"], ["even", "สีผิวเสมอ", "◐"], ["underEye", "ใต้ตา", "◡"], ["teeth", "ฟันขาว", "▭"], ["eyes", "ตาสดใส", "◉"]];
function faceStatus(p) {
  const st = el("p", "note");
  if (!session.faces) { st.textContent = F.faceState.status === "error" ? "โหลดโมเดลใบหน้าไม่สำเร็จ: " + F.faceState.error : "กำลังตรวจหาใบหน้าด้วย AI บนเครื่อง…"; ensureFaces(); }
  else st.textContent = session.faces.length ? `พบใบหน้า ${session.faces.length} คน · ประมวลผลบนเครื่อง ไม่อัปโหลด` : "ไม่พบใบหน้าในรูปนี้ — เครื่องมือนี้ต้องเห็นใบหน้าชัดเจน";
  p.appendChild(st);
}
function pBeauty(p) {
  faceStatus(p);
  const b = S.beauty, tools = el("div", "tools");
  BEAUTY_TOOLS.forEach(([k, l, ic]) => { const t = el("button", "tool" + (k === beautyTool ? " on" : ""), `<i>${ic}</i>${l}`); t.onclick = () => { beautyTool = k; renderPanel(); }; tools.appendChild(t); });
  p.appendChild(tools);
  if (beautyTool === "auto") {
    const v = Math.min(100, (b.smooth || 0) / .35);
    p.appendChild(slider("ความเข้ม", "b_auto", v, 0, 100, x => { Object.assign(b, {smooth: x * .35, acne: x * .6, clear: x * .2, even: x * .25, underEye: x * .3, eyes: x * .15}); }));
    p.appendChild(note("โหมดธรรมชาติ: เนียนแต่ยังเห็นผิวจริง ไม่เปลี่ยนรูปหน้า"));
  } else p.appendChild(slider("ความเข้ม", "b_" + beautyTool, b[beautyTool] || 0, 0, 100, x => { b[beautyTool] = x; }));
  p.appendChild(label("ปรับรูปหน้า (เบา ๆ)"));
  p.appendChild(slider("หน้าเรียว", "slim", b.slim || 0, 0, 100, x => b.slim = x));
  p.appendChild(slider("ตาโต", "bigEyes", b.bigEyes || 0, 0, 100, x => b.bigEyes = x));
  p.appendChild(slider("จมูกเล็ก", "nose", b.nose || 0, 0, 100, x => b.nose = x));
  p.appendChild(button("รีเซ็ตหน้าใส", "chip", () => { ["smooth", "acne", "clear", "even", "underEye", "teeth", "eyes", "slim", "bigEyes", "nose"].forEach(k => delete b[k]); commit(); renderPanel(); requestRender(); }));
}
function pMakeup(p) {
  faceStatus(p);
  const b = S.beauty;
  p.appendChild(label("ชุดแต่งหน้า"));
  p.appendChild(chips(F.MAKEUP_PRESETS.map(m => [m.id, m.name]), b.makeupPreset || "none", k => {
    ["lip", "lipColor", "lipMode", "blush", "blushColor", "shadow", "shadowColor", "liner", "lash", "brow", "contour", "highlight"].forEach(x => delete b[x]);
    Object.assign(b, F.MAKEUP_PRESETS.find(m => m.id === k).m); b.makeupPreset = k; commit(); renderPanel(); requestRender();
  }, "scroll"));
  const sw = (key, list) => { const d = el("div", "swatches"); d.style.margin = "4px 0 8px"; list.forEach((c, i) => { const s = el("button", "swatch" + ((b[key] | 0) === i ? " on" : "")); s.style.background = c; s.onclick = () => { b[key] = i; commit(); renderPanel(); requestRender(); }; d.appendChild(s); }); return d; };
  p.appendChild(label("ลิป"));
  p.appendChild(slider("ลิป", "lip", b.lip || 0, 0, 100, x => b.lip = x)); p.appendChild(sw("lipColor", F.MAKEUP_COLORS.lip));
  p.appendChild(chips([["matte", "แมท"], ["gloss", "กลอส"], ["tint", "ทินท์ไล่สี"]], b.lipMode || "matte", k => { b.lipMode = k; commit(); renderPanel(); requestRender(); }));
  p.appendChild(label("แก้ม"));
  p.appendChild(slider("บลัชออน", "blush", b.blush || 0, 0, 100, x => b.blush = x)); p.appendChild(sw("blushColor", F.MAKEUP_COLORS.blush));
  p.appendChild(slider("คอนทัวร์", "contour", b.contour || 0, 0, 100, x => b.contour = x));
  p.appendChild(slider("ไฮไลต์", "highlight", b.highlight || 0, 0, 100, x => b.highlight = x));
  p.appendChild(label("ตาและคิ้ว"));
  p.appendChild(slider("อายแชโดว์", "shadow", b.shadow || 0, 0, 100, x => b.shadow = x)); p.appendChild(sw("shadowColor", F.MAKEUP_COLORS.shadow));
  p.appendChild(slider("อายไลเนอร์", "liner", b.liner || 0, 0, 100, x => b.liner = x));
  p.appendChild(slider("ขนตา", "lash", b.lash || 0, 0, 100, x => b.lash = x));
  p.appendChild(slider("คิ้ว", "brow", b.brow || 0, 0, 100, x => b.brow = x));
}
function pWeather(p) {
  p.appendChild(chips(FX.WEATHER, S.weather.mode, k => { S.weather.mode = k; commit(); renderPanel(); requestRender(); }));
  if (S.weather.mode !== "none") p.appendChild(slider("ความแรง", "weather", S.weather.amt, 0, 100, v => S.weather.amt = v));
  p.appendChild(note("เปลี่ยนบรรยากาศบนเครื่อง ฟรี: แดดใส/เย็นทองจะหาท้องฟ้าในรูปแล้วเปลี่ยนเป็นฟ้าใหม่ พร้อมแสงแดดและแฟลร์ · หิมะ ฝน หมอก เป็นเอฟเฟกต์ซ้อนบนรูป ได้ผลดีที่สุดกับรูปที่เห็นท้องฟ้า"));
}
function pLens(p) {
  p.appendChild(label("เลนส์จำลอง"));
  p.appendChild(chips(LENSES.map(l => [l.id, l.name]), S.lens, k => { S.lens = k; commit(); renderPanel(); requestRender(); }, "scroll"));
  p.appendChild(note(lensOf().desc));
  p.appendChild(label("กล้องจำลอง"));
  p.appendChild(chips(BODIES.map(b => [b.id, b.name]), S.body, k => { S.body = k; commit(); renderPanel(); requestRender(); }, "scroll"));
  p.appendChild(note(bodyOf().desc));
}
function pSocial(p) {
  const s = S.social, re = () => { commit(); renderPanel(); requestRender(); };
  p.appendChild(label("สัดส่วน"));
  p.appendChild(chips(SO.ASPECTS.map(([l]) => [l, l]), (SO.ASPECTS.find(a => a[1] === s.aspect) || SO.ASPECTS[0])[0], k => { s.aspect = SO.ASPECTS.find(a => a[0] === k)[1]; s.cx = s.cy = .5; re(); }, "scroll"));
  p.appendChild(label("กรอบ")); p.appendChild(chips(SO.FRAMES.map(([l], i) => [i, l]), s.frame, k => { s.frame = k; re(); }, "scroll"));
  p.appendChild(label("พื้นหลัง")); p.appendChild(chips(SO.BGS.map(([l], i) => [i, l]), s.bg, k => { s.bg = k; re(); }, "scroll"));
  p.appendChild(label("แคปชัน"));
  const t = el("input", "text"); t.id = "caption"; t.maxLength = 60; t.placeholder = "พิมพ์แคปชันบนรูป…"; t.value = s.caption; t.oninput = () => { s.caption = t.value; requestRender(); }; t.onchange = commit; p.appendChild(t);
  p.appendChild(label("Cinema"));
  p.appendChild(toggle("แถบดำโรงหนัง 2.39:1", s.letterbox, v => { s.letterbox = v; re(); }));
  p.appendChild(toggle("แคปชันแบบซับหนัง", s.subtitle, v => { s.subtitle = v; if (v && !s.caption) s.caption = "บางความรู้สึก… ก็สวยเกินกว่าจะพูดออกมา"; re(); }));
  p.appendChild(toggle("วันที่แบบกล้องฟิล์ม", s.date, v => { s.date = v; re(); }));
  p.appendChild(label("สถานที่"));
  p.appendChild(toggle("แสตมป์ชื่อสถานที่ 📍", s.place, async v => { s.place = v; if (v && !s.placeName) await fillPlaceName(); re(); }, session.gps ? "ใช้ตำแหน่งจากรูปนี้" : "ใช้ตำแหน่งปัจจุบัน (ต้องอนุญาตตำแหน่ง)"));
  if (s.place) { const pn = el("input", "text"); pn.id = "placeName"; pn.placeholder = "ชื่อสถานที่"; pn.value = s.placeName; pn.style.marginTop = "6px"; pn.oninput = () => { s.placeName = pn.value; requestRender(); }; pn.onchange = commit; p.appendChild(pn); }
  p.appendChild(label("Music card"));
  p.appendChild(toggle("การ์ด Now Playing", s.music, v => { s.music = v; re(); }));
  if (s.music) [["song", "ชื่อเพลง"], ["artist", "ศิลปิน"]].forEach(([k, ph]) => { const i = el("input", "text"); i.id = k; i.placeholder = ph; i.value = s[k]; i.style.marginTop = "6px"; i.oninput = () => { s[k] = i.value; requestRender(); }; i.onchange = commit; p.appendChild(i); });
}
async function fillPlaceName() {
  let pos = session.gps;
  if (!pos) { if (!prefs.gps) { toast("เปิด 'ฝังตำแหน่ง' ในตั้งค่าก่อน หรือพิมพ์ชื่อสถานที่เอง"); return; }
    pos = await new Promise(r => navigator.geolocation.getCurrentPosition(q => r({lat: q.coords.latitude, lon: q.coords.longitude}), () => r(null), {timeout: 8000})); }
  if (!pos) { toast("หาตำแหน่งไม่ได้ — พิมพ์ชื่อสถานที่เองได้"); return; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.lat}&lon=${pos.lon}&zoom=14&accept-language=th`);
    const j = await r.json(), a = j.address || {};
    S.social.placeName = [a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.city_district, a.city || a.state || a.province].filter(Boolean).slice(0, 2).join(", ") || j.name || "";
  } catch (e) { toast("ค้นชื่อสถานที่ไม่ได้ — พิมพ์เองได้"); }
}
const SHARE_APPS = [["com.instagram.android", "IG", "Instagram", "linear-gradient(45deg,#f9a825,#e91e63,#7b1fa2)"], ["com.zhiliaoapp.musically", "TT", "TikTok", "#111"], ["com.facebook.katana", "f", "Facebook", "#1877f2"], ["jp.naver.line.android", "LINE", "LINE", "#06c755"], ["com.twitter.android", "X", "X", "#000"], ["com.facebook.orca", "M", "Messenger", "linear-gradient(45deg,#0099ff,#a033ff,#ff5c87)"], ["com.ss.android.ugc.trill", "TT", "TikTok Lite", "#222"], ["", "•••", "แอปอื่น ๆ", "#2a2a30"]];
function pShare(p) {
  p.appendChild(label("บันทึก"));
  p.appendChild(chips([[.95, "คุณภาพสูงสุด"], [.88, "มาตรฐาน"]], prefs.quality, k => { prefs.quality = k; savePrefs(); renderPanel(); }));
  p.appendChild(toggle("เก็บข้อมูลกล้อง (EXIF)", prefs.keepExif, v => { prefs.keepExif = v; savePrefs(); }, "รุ่นกล้อง เลนส์ ค่ารับแสง วันที่ถ่าย"));
  p.appendChild(toggle("ฝังหมุดตำแหน่งที่ถ่าย", prefs.gps, v => setGps(v), session.gps ? `มีตำแหน่งในรูปนี้ (${session.gps.lat.toFixed(4)}, ${session.gps.lon.toFixed(4)})` : "ไม่มีตำแหน่งในรูปนี้"));
  p.appendChild(toggle("ลบหมุดตำแหน่งก่อนแชร์", prefs.stripGpsOnShare, v => { prefs.stripGpsOnShare = v; savePrefs(); }, "แนะนำ เมื่อแชร์ให้คนที่ไม่รู้จัก"));
  p.appendChild(button(`${icon("download")} บันทึกลงเครื่อง`, "big gold", async () => saveBlobs([{blob: await exportBlob(), name: fileName()}])));
  p.appendChild(label("แชร์ไปโซเชียล — ไม่มีลายน้ำ ไม่ต้องสมัคร"));
  if (bridge && bridge.shareImages) {
    const g = el("div", "apps");
    SHARE_APPS.forEach(([pkg, s, n, bg]) => { const b = el("button", "app", `<i style="background:${bg}">${s}</i>${n}`); b.onclick = async () => shareBlobs([{blob: await exportBlob({forShare: true}), name: fileName()}], pkg); g.appendChild(b); });
    p.appendChild(g);
  } else p.appendChild(button(`${icon("share")} แชร์ไป IG · TikTok · LINE · Facebook · X`, "big ghost", async () => shareBlobs([{blob: await exportBlob({forShare: true}), name: fileName()}])));
  p.appendChild(button(`${icon("layers")} Photo Dump หลายรูปพร้อม Look นี้`, "big ghost", () => $("#f-many").click()));
  p.appendChild(button(`${icon("qr")} แชร์ Look นี้เป็น QR`, "big ghost", openLookShare));
  p.appendChild(note("ฟรีทุกฟีเจอร์ ไม่มี paywall · บันทึกความละเอียดเต็มจากต้นฉบับ"));
}

// ---------------------------------------------------------------- Look sharing (code / QR / link)
function compactAdj(a) { const d = E.defAdj(), o = {}; for (const k in a) { if (k === "hsl") { if (a.hsl.some(b => b.hue || b.sat || b.lum)) o.hsl = a.hsl.map(b => [b.hue, b.sat, b.lum].map(Math.round)); } else if (a[k] !== d[k]) o[k] = typeof a[k] === "number" ? Math.round(a[k] * 10) / 10 : a[k]; } return o; }
function lookCode() {
  const j = {n: S.lookName, a: compactAdj(S.adj), s: S.strength}; if (S.ref) j.r = {m: S.ref.m.map(v => +v.toFixed(4)), s: S.ref.s.map(v => +v.toFixed(4))};
  return btoa(unescape(encodeURIComponent(JSON.stringify(j)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function importLookCode(code) {
  const j = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, "+").replace(/_/g, "/")))));
  const adj = E.A(Object.assign({}, j.a, j.a && j.a.hsl ? {hsl: j.a.hsl.map(([hue, sat, lum]) => ({hue, sat, lum}))} : {}));
  const l = {id: "custom_" + Date.now().toString(36), name: (j.n || "Shared Look").slice(0, 28), cat: "mine", desc: "Look ที่ได้รับจากเพื่อน", adj, ref: j.r || null};
  mine.unshift(l); saveMine(); applyLook(l); if (j.s) S.strength = j.s; return l;
}
function openLookShare() {
  const url = APP_URL + "#look=" + lookCode();
  const b = el("div");
  try { const q = window.qrcode(0, "L"); q.addData(url); q.make(); b.appendChild(el("div", "qr", `<img alt="QR Look" src="${q.createDataURL(6, 0)}">`)); } catch (e) { b.appendChild(note("Look นี้ยาวเกินกว่าจะทำ QR — ใช้ลิงก์ด้านล่างแทน")); }
  b.appendChild(note(`ให้เพื่อนสแกนด้วยกล้องมือถือ หรือส่งลิงก์นี้ → เปิดแล้วได้ Look "${S.lookName}" ทันที`));
  const c = el("div", "code"); c.textContent = url; b.appendChild(c);
  b.appendChild(button("คัดลอกลิงก์", "big gold", () => { navigator.clipboard.writeText(url).then(() => toast("คัดลอกลิงก์แล้ว")).catch(() => toast("คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอก")); }));
  if (navigator.share) b.appendChild(button("ส่งลิงก์", "big ghost", () => navigator.share({title: "MoonCam Look: " + S.lookName, url}).catch(() => {})));
  b.appendChild(label("รับ Look จากเพื่อน"));
  const inp = el("input", "text"); inp.placeholder = "วางลิงก์หรือโค้ด Look"; b.appendChild(inp);
  b.appendChild(button("เพิ่ม Look", "big ghost", () => { try { const v = inp.value.trim(), code = v.includes("#look=") ? v.split("#look=")[1] : v; const l = importLookCode(code); closeSheet(); toast(`เพิ่ม "${l.name}" ใน My Looks แล้ว`); if (!$("#v-edit").hidden) { renderPanel(); requestRender(); } else applyLivePreview(); } catch (e) { toast("โค้ดไม่ถูกต้อง"); } }));
  openSheet("แชร์ Look", b);
}

// ---------------------------------------------------------------- sheets
function openSheet(title, body) { $("#sheet-title").textContent = title; const sb = $("#sheet-body"); sb.textContent = ""; sb.appendChild(body); $("#sheet").classList.add("open"); $("#scrim").classList.add("open"); }
function closeSheet() { $("#sheet").classList.remove("open"); $("#scrim").classList.remove("open"); }
$("#scrim").onclick = closeSheet; $("#sheet-close").onclick = closeSheet;

function openLensSheet() {
  const b = el("div");
  b.appendChild(label("เลนส์จำลอง")); b.appendChild(chips(LENSES.map(l => [l.id, l.name]), S.lens, k => { S.lens = k; applyLivePreview(); updateHud(); renderQbar(); openLensSheet(); }, "scroll")); b.appendChild(note(lensOf().desc));
  b.appendChild(label("กล้องจำลอง")); b.appendChild(chips(BODIES.map(x => [x.id, x.name]), S.body, k => { S.body = k; applyLivePreview(); updateHud(); renderQbar(); openLensSheet(); }, "scroll")); b.appendChild(note(bodyOf().desc));
  if (CAM.cam.lenses.length > 1) { b.appendChild(label("กล้องจริงของมือถือ")); b.appendChild(chips(CAM.cam.lenses.map(L => [L.id, L.tag + " · " + L.label.slice(0, 24)]), CAM.cam.deviceId, k => { closeSheet(); startCamera({deviceId: k}); })); }
  b.appendChild(note("ภาพสดเป็นค่าประมาณ — ภาพที่ถ่ายได้ใส่เลนส์/กล้องจำลองเต็มรูปแบบ"));
  openSheet("เลนส์ & กล้อง", b);
}
function openAlbumSheet() {
  const b = el("div");
  if (camState.last && !$("#v-cam").hidden) b.appendChild(button(`${icon("adjust")} แต่งรูปล่าสุด`, "big gold", () => { closeSheet(); editLast(); }));
  b.appendChild(button(`${icon("album")} แต่งรูปจากอัลบั้ม`, camState.last && !$("#v-cam").hidden ? "big ghost" : "big gold", () => { closeSheet(); $("#f-one").click(); }));
  b.appendChild(button(`${icon("layers")} Photo Dump (เลือกหลายรูป)`, "big ghost", () => { closeSheet(); $("#f-many").click(); }));
  b.appendChild(button(`${icon("roll")} ม้วนฟิล์มของฉัน`, "big ghost", () => { closeSheet(); openRoll(); }));
  openSheet("อัลบั้ม", b);
}
function setGps(v) {
  prefs.gps = v; savePrefs(); const c = LS.get("consent", {}); c.gps = v; LS.set("consent", c);
  if (v) navigator.geolocation && navigator.geolocation.getCurrentPosition(q => { camState.lastPos = {lat: q.coords.latitude, lon: q.coords.longitude, alt: q.coords.altitude}; }, () => toast("ไม่ได้รับอนุญาตตำแหน่ง — เปิดในการตั้งค่าเครื่อง"));
  watchGps(v && !$("#v-cam").hidden); updateHud();
}
function openSettings() {
  const b = el("div");
  b.appendChild(label("กล้อง"));
  b.appendChild(toggle("เส้นตาราง 9 ช่อง", prefs.grid, v => { prefs.grid = v; savePrefs(); applyLivePreview(); }));
  b.appendChild(toggle("จุดกึ่งกลาง", prefs.center, v => { prefs.center = v; savePrefs(); applyLivePreview(); }));
  b.appendChild(toggle("Device Sync — ปรับตามรุ่นมือถือ", prefs.deviceProfile, v => { prefs.deviceProfile = v; savePrefs(); applyLivePreview(); }, device.profile ? device.profile.note : ""));
  b.appendChild(chips([[24, "ม้วน 24 รูป"], [36, "ม้วน 36 รูป"]], prefs.rollSize, k => { prefs.rollSize = k; savePrefs(); refreshRollChip(); openSettings(); }));
  b.appendChild(label("ความเป็นส่วนตัว (PDPA)"));
  b.appendChild(toggle("ฝังหมุดตำแหน่งที่ถ่าย", prefs.gps, v => setGps(v), "ปิดเป็นค่าเริ่มต้น"));
  b.appendChild(toggle("ลบหมุดตำแหน่งก่อนแชร์", prefs.stripGpsOnShare, v => { prefs.stripGpsOnShare = v; savePrefs(); }));
  b.appendChild(toggle("เก็บข้อมูลกล้อง (EXIF)", prefs.keepExif, v => { prefs.keepExif = v; savePrefs(); }));
  b.appendChild(button(`${icon("shield")} นโยบายความเป็นส่วนตัว`, "big ghost", openPolicy));
  b.appendChild(button(`${icon("chip")} เครื่องของคุณ (Device Sync)`, "big ghost", openDeviceSheet));
  b.appendChild(button(`${icon("pro")} เช็กมือถือ · โหมดภาพยนตร์ / 10-bit`, "big ghost", openCinemaSheet));
  b.appendChild(button("ถอนความยินยอม", "big ghost", () => { LS.set("consent", null); prefs.gps = false; savePrefs(); watchGps(false); closeSheet(); CAM.stop(); showConsent(); }));
  b.appendChild(button("ลบข้อมูลทั้งหมดในแอป", "big ghost", async () => {
    if (!confirm("ลบ My Looks, ม้วนฟิล์ม, การตั้งค่า และแคชทั้งหมดในเครื่องนี้? (รูปที่บันทึกในแกลเลอรีจะไม่ถูกลบ)")) return;
    try { localStorage.clear(); } catch (e) {} await DB.deleteDatabase(); try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
    toast("ลบข้อมูลทั้งหมดแล้ว"); setTimeout(() => location.reload(), 800);
  }));
  b.appendChild(note(`MoonCam ${VERSION} · ฟรีทุกฟีเจอร์ · ประมวลผลบนเครื่อง · ติดต่อผู้ดูแลข้อมูล LINE ID: mengfrog`));
  openSheet("ตั้งค่า", b);
}
function openDeviceSheet() {
  const mc = CAM.manualCaps(), b = el("div"), dl = el("dl", "kv");
  const rows = [["ยี่ห้อ", device.brandName], ["รุ่น", device.model || "ไม่ทราบ"], ["ระบบ", device.os || ""], ["CPU", device.cores ? device.cores + " คอร์" : "ไม่ทราบ"], ["RAM", device.memory ? "≈" + device.memory + " GB" : "ไม่ทราบ"],
    ["ระดับเครื่อง", {low: "ประหยัด", mid: "มาตรฐาน", high: "แรง"}[device.tier] || "-"], ["พรีวิวแต่งรูป", device.preview + " px"], ["บันทึกสูงสุด", device.exportMax + " px"],
    ["กล้อง", mc.maxW ? `${mc.maxW}×${mc.maxH}` : "ยังไม่ได้เปิดกล้อง"], ["เลนส์ที่เห็น", CAM.cam.lenses.length ? CAM.cam.lenses.map(l => l.tag).join(", ") : "-"],
    ["แมนนวล", [mc.ev && "EV", mc.iso && "ISO", mc.shutter && "Shutter", mc.wb && "WB", mc.focus && "Focus", mc.zoom && "Zoom", mc.torch && "ไฟฉาย"].filter(Boolean).join(" · ") || "ไม่รองรับ"],
    ["โปรไฟล์สี", device.profile ? device.profile.note : "-"], ["ถ่ายเต็มความละเอียด", CAM.cam.imageCapture ? "ใช่ (ImageCapture)" : "ใช้เฟรมวิดีโอ"]];
  rows.forEach(([k, v]) => { dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, String(v))); });
  b.appendChild(dl);
  b.appendChild(note("ตรวจจากข้อมูลที่เบราว์เซอร์/แอปเปิดให้ — ระบบประมวลผลภาพเฉพาะยี่ห้อ (เช่น HDR หรือโหมดกลางคืนของกล้องในเครื่อง) ใช้ผ่านแอปนี้ไม่ได้"));
  openSheet("เครื่องของคุณ", b);
}

// ---------------------------------------------------------------- PDPA
function policyHTML() {
  return `<button class="ib" id="policy-close" aria-label="ปิด" style="float:right">${icon("close")}</button>
  <h1 style="font-size:30px">นโยบายความเป็นส่วนตัว</h1><p>MoonCam · ปรับปรุงล่าสุด 28 ตุลาคม 2569 · เป็นไปตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
  <h2>1. ข้อมูลที่ใช้และวัตถุประสงค์</h2><ul>
  <li><b>ภาพจากกล้อง</b> — แสดงภาพสดและถ่ายรูป ประมวลผลบนเครื่องเท่านั้น</li>
  <li><b>รูปที่คุณเลือกจากอัลบั้ม</b> — เพื่อแต่งและบันทึก ไม่ถูกอัปโหลด</li>
  <li><b>ใบหน้าในรูป</b> — ใช้ตำแหน่งจุดบนใบหน้าเพื่อรีทัช/แต่งหน้า คำนวณบนเครื่องแล้วทิ้งทันที ไม่เก็บ ไม่ใช้ยืนยันตัวตน</li>
  <li><b>ตำแหน่ง (ไม่บังคับ)</b> — ฝังพิกัดในไฟล์รูปและแสตมป์ชื่อสถานที่ เมื่อคุณเปิดใช้เท่านั้น การค้นชื่อสถานที่จะส่งพิกัดไปยังบริการแผนที่ OpenStreetMap (Nominatim) เฉพาะตอนที่คุณกดใช้แสตมป์สถานที่</li>
  <li><b>ข้อมูลรุ่นเครื่อง</b> — ใช้ปรับคุณภาพภาพ (Device Sync) บนเครื่องเท่านั้น</li></ul>
  <h2>2. การเก็บและการเปิดเผย</h2><p>ไม่มีบัญชีผู้ใช้ ไม่มีเซิร์ฟเวอร์เก็บข้อมูล ไม่มีโฆษณาหรือตัวติดตาม ไม่ขายหรือเปิดเผยข้อมูลแก่บุคคลที่สาม การตั้งค่า My Looks และม้วนฟิล์มเก็บในเครื่องของคุณเท่านั้น รูปที่คุณบันทึกหรือแชร์อยู่ในความควบคุมของคุณ — ข้อมูลตำแหน่งในไฟล์อาจถูกเห็นโดยผู้รับ เลือก "ลบหมุดตำแหน่งก่อนแชร์" ได้</p>
  <h2>3. สิทธิของคุณ</h2><p>คุณมีสิทธิเข้าถึง แก้ไข ลบ ถอนความยินยอม และคัดค้านการประมวลผล ทำได้ทันทีที่ ตั้งค่า → ความเป็นส่วนตัว (ถอนความยินยอม / ลบข้อมูลทั้งหมดในแอป) และปิดสิทธิ์กล้อง/ตำแหน่งได้ในการตั้งค่าเครื่อง</p>
  <h2>4. ผู้ควบคุมข้อมูลและการติดต่อ</h2><p>ผู้พัฒนา MoonCam · LINE ID: <b>mengfrog</b></p>
  <h2>5. การเปลี่ยนแปลงนโยบาย</h2><p>หากมีการเปลี่ยนแปลงสาระสำคัญ แอปจะขอความยินยอมใหม่</p>`;
}
function openPolicy() { const o = $("#policy"); $("#policy-body").innerHTML = policyHTML(); o.hidden = false; $("#policy-close").onclick = () => o.hidden = true; }
function showConsent() {
  const o = $("#consent"); o.hidden = false; const sw = $("#consent-gps"); sw.setAttribute("aria-checked", "false");
  sw.onclick = () => sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") !== "true");
  $("#consent-policy").onclick = e => { e.preventDefault(); openPolicy(); };
  $("#consent-ok").onclick = () => { const gps = sw.getAttribute("aria-checked") === "true"; LS.set("consent", {v: 1, at: Date.now(), gps}); prefs.gps = gps; savePrefs(); o.hidden = true; if (gps) setGps(true); show("#v-cam"); };
}

// ================================================================== FILM ROLL
async function refreshRollChip() {
  const shots = await DB.rollAll().catch(() => []), un = shots.filter(s => !s.developed).length, dev = shots.filter(s => s.developed).length;
  const chip = $("#roll-chip");
  chip.hidden = skinOn() || (!un && !dev);
  chip.innerHTML = `${icon("roll")} <span class="num">${un}/${prefs.rollSize}</span>${dev ? ` · ล้างแล้ว ${dev}` : ""}`;
  $("#shutter").classList.toggle("roll", camState.mode === "roll");
  camState.rollCount = un;
  return {un, dev};
}
async function developRoll() { const shots = await DB.rollAll(); for (const s of shots.filter(x => !x.developed)) { s.developed = true; await DB.rollAdd(s); } }
async function openRoll() {
  show("#v-roll"); const shots = (await DB.rollAll().catch(() => [])).sort((a, b) => a.time - b.time), dev = shots.filter(s => s.developed), un = shots.filter(s => !s.developed);
  $("#r-count").textContent = `ล้างแล้ว ${dev.length} · รอล้าง ${un.length}/${prefs.rollSize}`;
  const g = $("#r-grid"); g.textContent = "";
  for (const s of dev) {
    const bmp = await createImageBitmap(s.blob).catch(() => null); if (!bmp) continue;
    const t = scaled(bmp, 360), id = pixels(t), st = s.settings; if (st.ref) E.applyTransfer(id.data, st.ref, st.strength / 100); E.applyGrade(id.data, t.width, t.height, E.effective(st.adj, st.strength / 100)); t.getContext("2d").putImageData(id, 0, 0);
    t.onclick = async () => { Object.assign(S, st); const ex = await EX.readExif(s.blob); await openEditor(bmp, {blob: s.blob, exif: ex, gps: s.gps, when: new Date(s.time), fromCamera: true}); };
    g.appendChild(t);
  }
  const p = $("#r-panel"); p.textContent = "";
  if (!dev.length) p.appendChild(note(un.length ? `ถ่ายไปแล้ว ${un.length} รูป — ฟิล์มจะล้างเองเมื่อครบ ${prefs.rollSize} รูป เหมือนกล้องฟิล์มจริง` : "ยังไม่มีรูปในม้วน — เลือกโหมด ROLL ในหน้ากล้องแล้วเริ่มถ่าย"));
  if (un.length) p.appendChild(button("ล้างฟิล์มตอนนี้เลย", "big gold", async () => { await developRoll(); openRoll(); }));
  if (dev.length) {
    p.appendChild(button(`${icon("download")} บันทึกทั้งหมด ${dev.length} รูป`, "big gold", async () => { const items = []; for (const s of dev) items.push({blob: await renderShot(s), name: `MoonCam_roll_${s.time}.jpg`}); saveBlobs(items); }));
    p.appendChild(button(`${icon("share")} แชร์ทั้งหมด`, "big ghost", async () => { const items = []; for (const s of dev.slice(0, 20)) items.push({blob: await renderShot(s), name: `MoonCam_roll_${s.time}.jpg`}); shareBlobs(items); }));
    p.appendChild(button("เริ่มม้วนใหม่ (ลบรูปในม้วน)", "big ghost", async () => { if (!confirm("ลบรูปในม้วนนี้? (รูปที่บันทึกแล้วไม่หาย)")) return; await DB.rollClear(); openRoll(); }));
  }
}
async function renderShot(s) {
  const bmp = await createImageBitmap(s.blob), saved = snap(); Object.assign(S, s.settings);
  const old = {...session}; session.full = scaled(bmp, device.exportMax); session.prev = null; session.faces = null; session.exif = await EX.readExif(s.blob); session.gps = s.gps; session.when = new Date(s.time); session.fromCamera = true;
  const img = finalCompose(renderPipeline(session.full, false), Math.max(session.full.width, session.full.height));
  let blob = await new Promise(r => img.toBlob(r, "image/jpeg", prefs.quality));
  blob = await EX.writeExif(blob, {source: prefs.keepExif ? session.exif : null, gps: prefs.gps ? s.gps : null, keepGps: !prefs.stripGpsOnShare, when: session.when});
  Object.assign(session, old); Object.assign(S, JSON.parse(saved)); return blob;
}

// ================================================================== PHOTO DUMP
const dump = {items: [], mode: "single", gap: false};
async function addDumpFiles(files) {
  for (const f of [...files].slice(0, 20 - dump.items.length)) {
    const bmp = await createImageBitmap(f, {imageOrientation: "from-image"}).catch(() => null); if (!bmp) continue;
    dump.items.push({canvas: scaled(bmp, device.exportMax), exif: await EX.readExif(f), name: f.name});
  }
  if (files.length + dump.items.length > 20) toast("Photo Dump ได้สูงสุด 20 รูป");
  renderDump();
}
function renderDump() {
  show("#v-dump"); $("#d-count").textContent = `${dump.items.length} รูป · Look: ${S.lookName} ${S.strength}%`;
  const g = $("#d-grid"); g.textContent = "";
  dump.items.forEach((it, i) => { const t = scaled(it.canvas, 360), id = pixels(t); if (S.ref) E.applyTransfer(id.data, S.ref, S.strength / 100); E.applyGrade(id.data, t.width, t.height, E.effective(S.adj, S.strength / 100)); t.getContext("2d").putImageData(id, 0, 0); t.title = "แตะเพื่อเอาออก"; t.onclick = () => { dump.items.splice(i, 1); renderDump(); }; g.appendChild(t); });
  const p = $("#d-panel"); p.textContent = "";
  p.appendChild(label("Look ทั้งชุด")); const strip = el("div", "suggest"); const src = dump.items[0] ? scaled(dump.items[0].canvas, 120) : sampleThumb();
  PRESETS.filter(l => l.cat === "trend" || l.cat === "film").concat(mine).forEach(l => strip.appendChild(lookCard(l, src, () => { applyLook(l); renderDump(); }))); p.appendChild(strip);
  p.appendChild(slider("ความแรง", "dstr", S.strength, 0, 150, v => { S.strength = v; }, {disp: v => Math.round(v) + "%", noRender: true, onChange: renderDump}));
  p.appendChild(label("รูปแบบ"));
  p.appendChild(chips([["single", "แยกทีละรูป"], ["c45", "สไลด์ต่อเนื่อง 4:5"], ["c11", "สไลด์ต่อเนื่อง 1:1"]], dump.mode, k => { dump.mode = k; renderDump(); }));
  if (dump.mode !== "single") p.appendChild(toggle("เว้นขอบระหว่างรูป", dump.gap, v => { dump.gap = v; }));
  p.appendChild(button(`${icon("share")} แชร์ทั้งหมดไปโซเชียล`, "big gold", async () => shareBlobs(await dumpExport(true))));
  p.appendChild(button(`${icon("download")} บันทึกทั้งหมด`, "big ghost", async () => saveBlobs(await dumpExport(false))));
}
async function dumpExport(forShare) {
  toast("กำลังเรนเดอร์ทั้งชุด…", 1500); await new Promise(r => setTimeout(r, 30));
  const graded = dump.items.map(it => { const c = copyCanvas(scaled(it.canvas, dump.mode === "single" ? device.exportMax : 1600)), id = pixels(c); if (S.ref) E.applyTransfer(id.data, S.ref, S.strength / 100); E.applyGrade(id.data, c.width, c.height, gradeAdj()); FX.lensOptics(id.data, c.width, c.height, lensOf()); FX.bodyFx(id.data, c.width, c.height, bodyOf()); c.getContext("2d").putImageData(id, 0, 0); return {c, it}; });
  const out = [], stamp = Date.now();
  if (dump.mode === "single") { for (const [i, {c, it}] of graded.entries()) { let b = await new Promise(r => c.toBlob(r, "image/jpeg", prefs.quality)); b = await EX.writeExif(b, {source: prefs.keepExif ? it.exif : null, keepGps: forShare ? !prefs.stripGpsOnShare : true}); out.push({blob: b, name: `MoonCam_dump_${stamp}_${i + 1}.jpg`}); } }
  else { const panels = SO.carousel(graded.map(g => g.c), dump.mode === "c45" ? .8 : 1, 1350, dump.gap ? 40 : 0); for (const [i, c] of panels.entries()) out.push({blob: await new Promise(r => c.toBlob(r, "image/jpeg", prefs.quality)), name: `MoonCam_carousel_${stamp}_${i + 1}.jpg`}); }
  return out;
}

// ================================================================== events
$("#shutter").onclick = shoot;
$("#c-flip").onclick = () => { haptic(); const b = $("#c-flip"); b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin"); startCamera({facing: CAM.cam.facing === "user" ? "environment" : "user"}); };
$("#c-album").onclick = () => camState.mode === "instant" ? openWall() : camState.mode === "roll" ? openRoll() : openAlbumSheet();
$("#c-settings").onclick = () => { toggleQS(false); openSettings(); };
$("#c-qs").onclick = () => { haptic(); toggleQS(); };
$("#c-looks").onclick = () => { haptic(); setTray(camState.tray === "looks" ? "none" : "looks"); };
$("#c-grid").onclick = () => { haptic(); // off → 3×3 → 3×3 + centre → off
  if (!prefs.grid && !prefs.center) prefs.grid = true; else if (prefs.grid && !prefs.center) prefs.center = true; else { prefs.grid = false; prefs.center = false; }
  savePrefs(); applyLivePreview(); };
$("#c-timer").onclick = () => { haptic(); prefs.timer = prefs.timer === 0 ? 3 : prefs.timer === 3 ? 10 : 0; savePrefs(); updateHud(); toast(prefs.timer ? `ตั้งเวลา ${prefs.timer} วินาที` : "ปิดตั้งเวลา", 1000); };
$("#c-ratio").onclick = () => { haptic(); const ks = Object.keys(RATIOS); prefs.ratio = ks[(ks.indexOf(prefs.ratio) + 1) % ks.length]; savePrefs(); applyLivePreview(); };
$("#c-flash").onclick = async () => { haptic();
  const torch = CAM.manualCaps().torch, order = torch ? ["off", "on", "torch"] : ["off", "on"]; prefs.flash = order[(order.indexOf(prefs.flash) + 1) % order.length]; savePrefs();
  if (torch) await CAM.setTorch(prefs.flash === "torch"); updateHud(); toast({off: "ปิดแฟลช", on: "แฟลชตอนถ่าย", torch: "เปิดไฟฉาย"}[prefs.flash], 900);
};
const MODES = ["roll", "instant", "digicam", "photo", "pro"];
// ---------------------------------------------------------------- cinema (native Android screen) + LUTs
function openCinema() {
  haptic();
  if (bridge && bridge.openCinema) { bridge.openCinema(); return; }
  openCinemaSheet();
}
function cameraInfo() { try { return bridge && bridge.getCameraInfo ? JSON.parse(bridge.getCameraInfo()) : null; } catch (e) { return null; } }
function openCinemaSheet() {
  const b = el("div"), info = cameraInfo();
  if (!info) {
    b.appendChild(note(bridge ? "แอปเวอร์ชันนี้ยังไม่มีโหมดภาพยนตร์ — ติดตั้ง APK ตัวใหม่จากลิงก์เดิม" : "โหมดภาพยนตร์ (log / 10-bit) ใช้กล้องของ Android โดยตรง จึงใช้ได้ในแอป MoonCam สำหรับ Android เท่านั้น — เว็บและ iPhone ยังไม่รองรับ"));
    if (!bridge) b.appendChild(button(`${icon("download")} ดาวน์โหลดแอป Android (APK)`, "big gold", () => { location.href = "MoodCam.apk"; }));
  } else {
    const back = (info.cameras || []).filter(c => c.facing === "หลัง"), main = back[0] || (info.cameras || [])[0] || {};
    const yes = v => v ? "✅" : "—";
    b.appendChild(note(`${info.model} · Android API ${info.android}`));
    const rows = [["10-bit HLG (HEVC)", yes(main.tenBit) + (main.hdrProfiles && main.hdrProfiles.length ? " " + main.hdrProfiles.join(" · ") : "")], ["MoonLog (โค้ง log ใน ISP)", yes(main.logCurve)], ["ปรับ ISO / Shutter เอง", yes(main.manualSensor)], ["ระดับกล้อง", main.level || "?"], ["ความละเอียดวิดีโอ", (main.video || []).join(" · ")], ["ช่วง fps", (main.fps || []).join(" · ")], ["ISO", main.iso || "—"], ["Shutter", main.shutter || "—"], ["กันสั่น OIS", yes(main.ois)], ["เลนส์ที่เจอ (Android)", (info.lenses || []).map(l => `${l.label}× ${l.eq}mm${l.via === "id" ? "*" : ""}`).join(" · ") || "—"], ["เลนส์ที่โหมดถ่ายรูปเปิดได้", CAM.cam.lenses.map(l => l.tag).join(" · ") || "—"], ["ช่วงซูมกล้องหลัก", main.zoom || "—"]];
    const t = el("div", "spec"); rows.forEach(([k, v]) => t.appendChild(el("div", "spec-row", `<span>${k}</span><b>${v}</b>`))); b.appendChild(t);
    b.appendChild(note(main.tenBit ? "เครื่องนี้ถ่าย 10-bit ได้ — เลือกโปรไฟล์ HLG 10-bit ในโหมดภาพยนตร์" : main.logCurve ? "เครื่องนี้ไม่เปิด 10-bit ให้แอปอื่น แต่ใช้ MoonLog (8-bit โค้ง log จากชิปกล้อง) ได้" : "เครื่องนี้ใช้ได้เฉพาะโปรไฟล์ Natural"));
    b.appendChild(button(`${icon("pro")} เปิดโหมดภาพยนตร์`, "big gold", () => { closeSheet(); bridge.openCinema(); }));
  }
  b.appendChild(label("LUT สำหรับตัดต่อ (CapCut · Premiere · DaVinci · LumaFusion)"));
  b.appendChild(button(`${icon("download")} LUT MoonLog → ปกติ (.cube)`, "big ghost", () => saveBlobs([{blob: new Blob([makeCube("moonlog")], {type: "text/plain"}), name: "MoonCam_MoonLog_to_Rec709.cube"}])));
  b.appendChild(button(`${icon("download")} LUT HLG 10-bit → ปกติ (.cube)`, "big ghost", () => saveBlobs([{blob: new Blob([makeCube("hlg")], {type: "text/plain"}), name: "MoonCam_HLG_to_Rec709.cube"}])));
  openSheet("โหมดภาพยนตร์", b);
}
function makeCube(kind, N = 33) {
  const oetf = L => { L = Math.max(0, Math.min(1, L)); return L < .018 ? 4.5 * L : 1.099 * Math.pow(L, .45) - .099; };
  const moonInv = y => Math.max(0, Math.expm1((y - .075) / .86 * Math.log1p(38)) / 38);
  const a = .17883277, bb = .28466892, c = .55991073, hlgInv = v => v <= .5 ? v * v / 3 : (Math.exp((v - c) / a) + bb) / 12;
  const tm = x => Math.max(0, x) * 1.25 / (1 + .25 * Math.max(0, x));
  let out = `TITLE "MoonCam ${kind === "hlg" ? "HLG10" : "MoonLog"} to Rec.709"\nLUT_3D_SIZE ${N}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    let r = ri / (N - 1), g = gi / (N - 1), b = bi / (N - 1), R, G, B;
    if (kind === "hlg") {
      const lr = hlgInv(r), lg = hlgInv(g), lb = hlgInv(b);
      R = 1.6605 * lr - .5876 * lg - .0728 * lb; G = -.1246 * lr + 1.1329 * lg - .0083 * lb; B = -.0182 * lr - .1006 * lg + 1.1187 * lb;
      R = oetf(tm(R * 3.4)); G = oetf(tm(G * 3.4)); B = oetf(tm(B * 3.4));
    } else { R = oetf(tm(moonInv(r) * 1.1)); G = oetf(tm(moonInv(g) * 1.1)); B = oetf(tm(moonInv(b) * 1.1)); }
    out += `${R.toFixed(6)} ${G.toFixed(6)} ${B.toFixed(6)}\n`;
  }
  return out;
}
const SPECIAL = {digicam: 1, instant: 1, roll: 1, visa: 1};
function setMode(mode) {
  if (mode === "cinema") return openCinema();
  if (mode === "more") return openMoreSheet();
  if (mode === camState.mode) return; haptic();
  document.querySelectorAll("#cam-modes button").forEach(x => x.classList.toggle("on", x.dataset.mode === mode));
  const was = camState.mode;
  if (SPECIAL[was]) { S.body = camState.prevBody || "none"; const l = allLooks().find(x => x.id === camState.prevLook); if (l) applyLook(l, {commit: false}); }
  if (SPECIAL[mode]) { camState.prevBody = S.body; camState.prevLook = S.lookId; }
  camState.mode = mode;
  if (mode === "digicam") { S.body = "ccd"; applyLook(PRESETS.find(l => l.id === "y2k_flash"), {commit: false}); toast("ดิจิคอม — กล้อง CCD ยุค 2000 แฟลชจัด วันที่สีส้ม", 1600); }
  if (mode === "instant" || mode === "roll") { S.body = "none"; applySkinLook(); }
  if (mode === "visa") { S.body = "none"; S.lens = "natural"; applyLook(allLooks().find(l => l.id === "original"), {commit: false}); }
  visaMode(mode === "visa");
  if (mode === "instant") toast(`โพลารอยด์ ${AN.instantOf(prefs.instantModel).name} — ถ่ายแล้วรูปค่อย ๆ ออกมา`, 1800);
  if (mode === "roll") toast(`ม้วนฟิล์ม ${AN.filmOf(prefs.film).name} — ถ่ายครบ ${prefs.rollSize} รูปถึงจะล้างดูได้`, 2000);
  if (mode === "pro") toast("โปร — ปรับ ISO · Shutter · Focus · WB · EV ที่แถบด้านล่าง", 1600);
  if (mode !== "pro" && ["iso", "sh", "focus"].includes(ruler.k) && camState.tray === "ruler") setTray("none");
  setSkin(); applyLivePreview(); renderCamLooks(); renderQbar(); updateHud(); refreshRollChip().then(renderSkin);
}
$("#cam-modes").onclick = e => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); };
$("#roll-chip").onclick = openRoll;
$("#nocam-retry").onclick = () => startCamera();
$("#nocam-album").onclick = () => $("#f-one").click();
// viewfinder gestures: pinch = zoom · tap = focus/exposure point · drag up/down = EV · swipe left/right = mode · long-press = AE/AF lock · double-tap = flip
(() => {
  const vf = $("#vf"), pts = new Map(); let g = null, lastTap = 0, lpT = null;
  const showFocus = (cx, cy) => { const f = $("#vf-focus"); f.style.left = cx + "px"; f.style.top = cy + "px"; f.classList.remove("show"); void f.offsetWidth; f.classList.add("show"); clearTimeout(showFocus.t); showFocus.t = setTimeout(() => f.classList.remove("show"), 1600); };
  const sun = () => { $("#vf-sun").textContent = camState.ev ? "☀ " + fmtEV(camState.ev) : "☀"; };
  vf.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    vf.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pts.size === 2) { clearTimeout(lpT); const [a, b] = [...pts.values()]; g = {pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), z: camState.zoom}; return; }
    if (pts.size === 1) {
      g = {x: e.clientX, y: e.clientY, t: Date.now(), ev: camState.ev, kind: null};
      lpT = setTimeout(() => { if (g && !g.kind) { g.kind = "lock"; const r = vf.getBoundingClientRect(); showFocus(g.x - r.left, g.y - r.top); focusAt((g.x - r.left) / r.width, (g.y - r.top) / r.height, true); haptic(30); } }, 650);
    }
  });
  vf.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (g.pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); setZoomLevel(g.z * Math.pow(d / g.d, 1.15)); return; }
    if (g.pinch) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.kind && Math.hypot(dx, dy) > 14) { clearTimeout(lpT); g.kind = Math.abs(dx) > Math.abs(dy) * 1.3 ? "swipe" : "ev"; if (g.kind === "ev") { const r = vf.getBoundingClientRect(); const f = $("#vf-focus"); if (!f.classList.contains("show")) showFocus(r.width / 2, r.height / 2); } }
    if (g.kind === "ev") {
      const mc = CAM.manualCaps(), r = mc.ev || {min: -3, max: 3, step: .1}, st = r.step || .1;
      let v = Math.round((g.ev - dy / 120) / st) * st; v = +Math.max(r.min, Math.min(r.max, v)).toFixed(2);
      if (v !== camState.ev) { camState.ev = v; if (mc.ev) hwEV(v); applyLivePreview(); sun(); renderQbarSoon(); updateHud(); if (ruler.k === "ev" && camState.tray === "ruler") { ruler.p = r2p(ruler.o, v); drawRuler(); } }
      const f = $("#vf-focus"); f.classList.add("show"); clearTimeout(showFocus.t); showFocus.t = setTimeout(() => f.classList.remove("show"), 1600);
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); clearTimeout(lpT);
    if (!g) return;
    if (g.pinch) { if (!pts.size) { g = null; renderZoom(); } return; }
    const dx = e.clientX - g.x, now = Date.now();
    if (g.kind === "swipe" && Math.abs(dx) > 50) { const i = MODES.indexOf(camState.mode) + (dx < 0 ? 1 : -1); if (MODES[i]) setMode(MODES[i]); }
    else if (!g.kind && now - g.t < 400) {
      const r = vf.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (now - lastTap < 300) { lastTap = 0; $("#c-flip").click(); g = null; return; }
      lastTap = now; $("#vf-lock").hidden = true; toggleQS(false);
      showFocus(cx, cy); sun(); focusAt(cx / r.width, cy / r.height, false);
      if (prefs.tapShoot) setTimeout(shoot, 250);
    }
    if (g.kind === "ev") savePrefs();
    g = null;
  };
  vf.addEventListener("pointerup", up); vf.addEventListener("pointercancel", up);
})();
async function focusAt(x, y, lock) {
  camState.focusAt = {x, y}; $("#vf-lock").hidden = !lock;
  if (!CAM.cam.track) return;
  // translate the on-screen point into the sensor frame (zoom/mirror aware)
  const k = camState.digital * (lensOf().crop || 1), front = $("#vf").classList.contains("front");
  let px = .5 + (x - .5) / k, py = .5 + (y - .5) / k; if (front) px = 1 - px;
  try { await CAM.cam.track.applyConstraints({advanced: [{pointsOfInterest: [{x: px, y: py}], focusMode: lock ? "manual" : "single-shot", exposureMode: lock ? "manual" : "continuous"}]}); }
  catch (err) { try { await CAM.cam.track.applyConstraints({advanced: [{pointsOfInterest: [{x: px, y: py}]}]}); } catch (e2) {} }
  if (!lock) setTimeout(() => { CAM.cam.track && CAM.cam.track.applyConstraints({advanced: [{focusMode: "continuous"}]}).catch(() => {}); }, 2500);
}
document.addEventListener("keydown", e => { if ($("#v-cam").hidden || e.repeat) return; if (e.key === "AudioVolumeUp" || e.key === "AudioVolumeDown" || e.key === " " || e.key === "Enter") { if (e.target.closest && e.target.closest("input")) return; e.preventDefault(); shoot(); } });

$("#e-back").onclick = () => show("#v-cam");
$("#e-album").onclick = openAlbumSheet;
$("#e-undo").onclick = () => { if (!hist.u.length) return; hist.r.push(hist.last); restore(hist.u.pop()); };
$("#e-redo").onclick = () => { if (!hist.r.length) return; hist.u.push(hist.last); restore(hist.r.pop()); };
$("#e-save").onclick = async () => saveBlobs([{blob: await exportBlob(), name: fileName()}]);
const cmp = $("#e-compare"); cmp.addEventListener("pointerdown", e => { e.preventDefault(); showOriginal = true; requestRender(); }); ["pointerup", "pointerleave", "pointercancel"].forEach(t => cmp.addEventListener(t, () => { if (showOriginal) { showOriginal = false; requestRender(); } }));
$("#tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; haptic(); tab = b.dataset.tab; document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b)); renderPanel(); };
// editor stage: pinch to zoom, drag to pan, double-tap 1× ↔ 2.5× · in Social with a crop: drag moves the crop
const vz = {s: 1, x: 0, y: 0};
function viewZoom(s, x, y) {
  const st = $("#stage"), W = st.clientWidth, H = st.clientHeight; s = Math.max(1, Math.min(8, s));
  const mx = W * (s - 1) / 2, my = H * (s - 1) / 2; vz.s = s; vz.x = Math.max(-mx, Math.min(mx, x)); vz.y = Math.max(-my, Math.min(my, y));
  if (s === 1) vz.x = vz.y = 0;
  $("#view").style.transform = `translate(${vz.x}px,${vz.y}px) scale(${vz.s})`;
  const z = $("#st-zoom"); z.hidden = s <= 1.01; z.textContent = Math.round(s * 100) + "%";
}
(() => {
  const st = $("#stage"), pts = new Map(); let g = null, lastTap = 0;
  const cropMode = () => tab === "social" && S.social.aspect !== null && S.social.bg === 0 && vz.s === 1;
  st.addEventListener("pointerdown", e => {
    st.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const r = st.getBoundingClientRect(); g = {pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), s: vz.s, x: vz.x, y: vz.y, cx: (a.x + b.x) / 2 - r.left - r.width / 2, cy: (a.y + b.y) / 2 - r.top - r.height / 2}; return; }
    g = {x: e.clientX, y: e.clientY, vx: vz.x, vy: vz.y, crop: cropMode(), moved: false, t: Date.now()};
  });
  st.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (g.pinch) { if (pts.size < 2) return; const [a, b] = [...pts.values()], k = Math.hypot(a.x - b.x, a.y - b.y) / g.d, s = Math.max(1, Math.min(8, g.s * k)), f = s / g.s;
      viewZoom(s, g.cx - (g.cx - g.x) * f, g.cy - (g.cy - g.y) * f); return; }
    const dx = e.clientX - g.x, dy = e.clientY - g.y; if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (g.crop) { const r = st.getBoundingClientRect(); S.social.cx = Math.min(1, Math.max(0, S.social.cx - (e.clientX - g.x) / r.width * .8)); S.social.cy = Math.min(1, Math.max(0, S.social.cy - (e.clientY - g.y) / r.height * .8)); g.x = e.clientX; g.y = e.clientY; requestRender(); return; }
    if (vz.s > 1) viewZoom(vz.s, g.vx + dx, g.vy + dy);
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (!g) return;
    if (g.pinch) { if (!pts.size) g = null; return; }
    if (g.crop && g.moved) commit();
    if (!g.moved && Date.now() - g.t < 300) { const now = Date.now();
      if (now - lastTap < 300) { lastTap = 0; const r = st.getBoundingClientRect(); if (vz.s > 1) viewZoom(1, 0, 0); else { const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2; viewZoom(2.5, -cx * 1.5, -cy * 1.5); } }
      else lastTap = now; }
    g = null;
  };
  st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
  st.addEventListener("wheel", e => { e.preventDefault(); viewZoom(vz.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), vz.x, vz.y); }, {passive: false});
})();
$("#d-back").onclick = () => { dump.items = []; show("#v-cam"); };
$("#d-add").onclick = () => $("#f-many").click();
$("#r-back").onclick = () => show("#v-cam");

$("#f-one").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const bmp = await createImageBitmap(f, {imageOrientation: "from-image"}).catch(() => null); if (!bmp) return toast("เปิดไฟล์นี้ไม่ได้ ลองใช้ JPG หรือ PNG");
  const exif = await EX.readExif(f); let when = new Date(f.lastModified || Date.now());
  await openEditor(bmp, {blob: f, exif, when, fromCamera: false, name: f.name});
};
$("#f-many").onchange = async e => { const files = [...e.target.files]; e.target.value = ""; if (!files.length) return; if ($("#v-dump").hidden) dump.items = []; await addDumpFiles(files); };
$("#f-ref").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const bmp = await createImageBitmap(f).catch(() => null); if (!bmp) return toast("เปิดรูปตัวอย่างไม่ได้");
  const t = scaled(bmp, 320), stats = E.colorStats(pixels(t).data);
  const n = mine.filter(l => l.ref).length + 1;
  const l = {id: "custom_" + Date.now().toString(36), name: "Copy Look " + n, cat: "mine", desc: "ถอดสีจากรูปตัวอย่าง", adj: E.A({curve: 30, density: 12, keepBright: 90}), ref: stats};
  mine.unshift(l); saveMine(); applyLook(l); lookCat = "mine";
  toast(`สร้าง "${l.name}" จากรูปตัวอย่างแล้ว ✨ ปรับความแรงได้`);
  if (!$("#v-edit").hidden) { renderPanel(); requestRender(); } else { applyLivePreview(); renderCamLooks(); }
};
window.addEventListener("resize", () => { if (!$("#v-cam").hidden) applyLivePreview(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { CAM.stop(); watchGps(false); } else if (!$("#v-cam").hidden) startCamera(); });

// ================================================================== boot
(async () => {
  try { const ci = cameraInfo(); if (ci) window.__camInfo = ci; } catch (e) {}
  showAlbumThumb(LS.get("thumb", null)); setTray(camState.tray === "ruler" ? "looks" : camState.tray); if (prefs.level) level(true);
  device = await detectDevice().catch(() => device);
  const l = allLooks().find(x => x.id === prefs.lastLook) || PRESETS.find(x => x.id === "teal_orange"); applyLook(l, {commit: false});
  const takeHash = () => { if (location.hash.startsWith("#look=")) { try { const imp = importLookCode(location.hash.slice(6)); setTimeout(() => toast(`ได้รับ Look "${imp.name}" แล้ว ✨ อยู่ใน My Looks`), 600); applyLivePreview(); renderCamLooks(); if (!$("#v-edit").hidden) { renderPanel(); requestRender(); } } catch (e) { toast("ลิงก์ Look ไม่ถูกต้อง"); } history.replaceState(null, "", location.pathname); } };
  takeHash(); window.addEventListener("hashchange", takeHash);
  renderCamLooks(); refreshRollChip();
  if (!LS.get("consent", null)) showConsent(); else show("#v-cam");
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js", {updateViaCache: "none"}).then(r => r.update().catch(() => {})).catch(() => {});
    let reloaded = false; navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  }
})();

// expose for automated tests
window.__mc = {S, session, openEditor, renderPipeline, finalCompose, exportBlob, applyLook, PRESETS, LENSES, BODIES, prefs, dump, renderDump, addDumpFiles};
