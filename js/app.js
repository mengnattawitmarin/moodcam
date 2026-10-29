// MoonCam v4 — app controller (camera, editor, photo dump, film roll, privacy, device sync).
import * as E from "./engine.js";
import {PRESETS, CATS, LENSES, BODIES} from "./looks.js";
import * as FX from "./fx.js";
import * as F from "./face.js";
import * as SO from "./social.js";
import * as EX from "./exif.js";
import * as CAM from "./camera.js";
import {detectDevice} from "./device.js";
import * as DB from "./store.js";

const VERSION = "v5";
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
const prefs = Object.assign({grid: true, center: false, gps: false, stripGpsOnShare: false, keepExif: true, quality: .95, deviceProfile: true, rollSize: 24, ratio: "3:4", timer: 0, flash: "off", lastLook: "teal_orange", strength: 100, level: false, histo: false, sound: true, mirror: true, tapShoot: false, tray: "looks"}, LS.get("prefs", {}));
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
const views = ["#v-cam", "#v-edit", "#v-dump", "#v-roll"];
function show(v) { views.forEach(q => $(q).hidden = q !== v); if (v === "#v-cam") { startCamera(); if (prefs.level) level(true); } else { CAM.stop(); histo(false); level(false); toggleQS(false); } }

// ================================================================== CAMERA
const RATIOS = {"3:4": 3 / 4, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "full": 0};
const camState = {mode: "photo", prevBody: null, prevLook: null, lastPos: null, watch: null, starting: false, thumbSrc: null,
  ev: 0, wb: 0, zoom: 1, digital: 1, ultra: false, focusAt: {x: .5, y: .5}, tray: prefs.tray || "looks"};
const ratioVal = () => prefs.ratio === "full" ? ($("#v-cam").clientWidth || innerWidth) / ($("#v-cam").clientHeight || innerHeight) : RATIOS[prefs.ratio] || 3 / 4;
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
    camState.ultra = !!(opts.deviceId && CAM.cam.lenses.find(l => l.id === opts.deviceId && l.tag.startsWith("0.5")));
    if (!opts.keepZoom) { camState.zoom = camState.ultra ? .5 : 1; camState.digital = 1; }
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
  const z = CAM.manualCaps().zoom, ultra = CAM.cam.facing !== "user" && CAM.cam.lenses.find(l => l.tag.startsWith("0.5"));
  const min = camState.ultra ? .5 : z && z.min < 1 ? z.min : ultra ? .5 : 1;
  const max = Math.max(z ? z.max : 1, 10);
  return {z, ultra, min, max};
}
function setZoomLevel(v, {show = true} = {}) {
  const L = zoomLimits();
  v = Math.max(L.min, Math.min(L.max, v));
  if (camState.ultra) { // on the ultra-wide lens: digital only, relative to 0.5×
    camState.digital = Math.max(1, v / .5); camState.zoom = .5 * camState.digital;
  } else if (L.z) {
    const hz = Math.max(L.z.min, Math.min(L.z.max, v)); hwZoom(hz); camState.digital = Math.max(1, v / hz); camState.zoom = Math.max(v, L.z.min);
  } else { camState.digital = Math.max(1, v); camState.zoom = camState.digital; }
  applyLivePreview(); renderZoom();
  if (show) { const t = $("#vf-zoom"); t.textContent = camState.zoom.toFixed(1).replace(/\.0$/, "") + "×"; t.hidden = false; clearTimeout(setZoomLevel.t); setZoomLevel.t = setTimeout(() => t.hidden = true, 700); }
}
function renderZoom() {
  const L = zoomLimits(), pill = $("#zoom-pill"); pill.textContent = "";
  const stops = [];
  if (L.min < 1) stops.push(+L.min.toFixed(1));
  stops.push(1, 2); if (L.max >= 4) stops.push(4);
  if (CAM.cam.facing === "user") stops.splice(0, stops.length, 1, 2);
  const cur = camState.zoom;
  // the stop the current zoom belongs to shows the live value (like the phone's own camera)
  let active = 0; stops.forEach((s, i) => { if (cur >= s - .05) active = i; });
  stops.forEach((s, i) => {
    if (i) pill.appendChild(el("span", "dots", "···"));
    const on = i === active, txt = on ? (Math.abs(cur - s) < .05 ? s + "x" : cur.toFixed(1) + "x") : String(s);
    const b = el("button", on ? "on" : "", txt.replace(".0x", "x"));
    b.onclick = e => { e.stopPropagation(); haptic();
      if (s < 1 && !(L.z && L.z.min <= s) && L.ultra && !camState.ultra) return startCamera({deviceId: L.ultra.id});
      if (s >= 1 && camState.ultra) return startCamera({facing: "environment"}).then(() => setZoomLevel(s));
      setZoomLevel(s);
    };
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
  if (!CAM.cam.stream || shoot.busy) return;
  shoot.busy = true; haptic(15);
  try {
    if (prefs.timer) { const c = $("#vf-count"); c.hidden = false; for (let i = prefs.timer; i > 0; i--) { c.textContent = i; await new Promise(r => setTimeout(r, 1000)); } c.hidden = true; }
    clickSound();
    const f = $("#vf-flash"); f.style.opacity = ".85"; setTimeout(() => f.style.opacity = "0", 70);
    const front = $("#vf").classList.contains("front"), mirror = front && prefs.mirror !== false;
    const {blob, canvas} = await CAM.capture({flash: prefs.flash === "on", mirror});
    let shot = cropToRatio(canvas, ratioVal());
    if (camState.digital > 1.01) { const k = camState.digital, w = Math.round(shot.width / k), h = Math.round(shot.height / k), o = newCanvas(w, h); o.getContext("2d").drawImage(shot, (shot.width - w) / 2, (shot.height - h) / 2, w, h, 0, 0, w, h); shot = o; }
    const untouched = blob && shot === canvas;
    const when = new Date(), gps = prefs.gps ? camState.lastPos : null;
    S.cam = camSoft();
    setAlbumThumb(shot);
    if (camState.mode === "roll") {
      const jpeg = untouched ? blob : await new Promise(r => shot.toBlob(r, "image/jpeg", .95));
      await DB.rollAdd({id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), time: when.getTime(), blob: jpeg, gps, settings: JSON.parse(snap()), developed: false});
      await refreshRollChip(); toast("เก็บลงม้วนฟิล์มแล้ว 🎞 ยังไม่เห็นภาพจนกว่าจะล้างฟิล์ม", 1800);
      return;
    }
    const exif = untouched ? await EX.readExif(blob) : null;
    await openEditor(shot, {blob: untouched ? blob : null, exif, gps, when, fromCamera: true, name: "MoonCam"});
  } finally { shoot.busy = false; }
}
window.__mcShutter = () => { if (!$("#v-cam").hidden) shoot(); };

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

async function saveBlobs(items) { // items: [{blob,name}]
  if (bridge && bridge.saveImage) { let ok = 0; for (const it of items) if (bridge.saveImage(await blobToB64(it.blob), it.name)) ok++; toast(ok === items.length ? `บันทึกลงแกลเลอรีแล้ว ${ok} รูป (Pictures/MoonCam)` : "บันทึกบางรูปไม่สำเร็จ"); return; }
  for (const it of items) { const a = el("a"); a.href = URL.createObjectURL(it.blob); a.download = it.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); await new Promise(r => setTimeout(r, 250)); }
  toast(items.length > 1 ? `ดาวน์โหลด ${items.length} รูปแล้ว` : "บันทึกรูปแล้ว (โฟลเดอร์ดาวน์โหลด)");
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
  b.appendChild(button(`${icon("album")} แต่งรูปจากอัลบั้ม`, "big gold", () => { closeSheet(); $("#f-one").click(); }));
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
  chip.hidden = camState.mode !== "roll" && !un && !dev;
  chip.innerHTML = `${icon("roll")} <span class="num">${un}/${prefs.rollSize}</span>${dev ? ` · ล้างแล้ว ${dev}` : ""}`;
  $("#shutter").classList.toggle("roll", camState.mode === "roll");
  if (un >= prefs.rollSize) { toast("ม้วนฟิล์มเต็มแล้ว 🎞 กำลังล้างฟิล์ม…"); await developRoll(); }
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
$("#c-album").onclick = openAlbumSheet;
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
const MODES = ["roll", "digicam", "photo", "pro"];
function setMode(mode) {
  if (mode === camState.mode) return; haptic();
  document.querySelectorAll("#cam-modes button").forEach(x => x.classList.toggle("on", x.dataset.mode === mode));
  if (camState.mode === "digicam" && mode !== "digicam") { S.body = camState.prevBody || "none"; const l = allLooks().find(x => x.id === camState.prevLook); if (l) applyLook(l, {commit: false}); }
  if (mode === "digicam") { camState.prevBody = S.body; camState.prevLook = S.lookId; S.body = "ccd"; applyLook(PRESETS.find(l => l.id === "y2k_flash"), {commit: false}); toast("ดิจิคอม — กล้อง CCD ยุค 2000 แฟลชจัด วันที่สีส้ม", 1600); }
  camState.mode = mode;
  if (mode === "roll") toast(`ม้วนฟิล์ม — ถ่ายได้ ${prefs.rollSize} รูป ยังไม่เห็นภาพจนกว่าจะล้างฟิล์ม 🎞`, 2000);
  if (mode === "pro") toast("โปร — ปรับ ISO · Shutter · Focus · WB · EV ที่แถบด้านล่าง", 1600);
  if (mode !== "pro" && ["iso", "sh", "focus"].includes(ruler.k) && camState.tray === "ruler") setTray("none");
  applyLivePreview(); renderCamLooks(); renderQbar(); updateHud(); refreshRollChip();
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
