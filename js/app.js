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

const VERSION = "v4";
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
const prefs = Object.assign({grid: true, center: false, gps: false, stripGpsOnShare: false, keepExif: true, quality: .95, deviceProfile: true, rollSize: 24, ratio: "3:4", timer: 0, flash: "off", lastLook: "teal_orange", strength: 100}, LS.get("prefs", {}));
const savePrefs = () => LS.set("prefs", prefs);
let mine = LS.get("looks", []).map(l => Object.assign(l, {adj: E.A(l.adj)}));
const saveMine = () => LS.set("looks", mine);
const allLooks = () => mine.concat(PRESETS);
let device = {preview: 1400, exportMax: 4000, profile: {adj: {}, note: ""}, brandName: "", model: ""};

const S = {lookId: "original", lookName: "Original", adj: E.defAdj(), ref: null, strength: prefs.strength, beauty: {}, weather: {mode: "none", amt: 80}, lens: "natural", body: "none", social: SO.defaultSocial()};
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
function gradeAdj() {
  let a = E.effective(S.adj, S.strength / 100);
  a = mergeAdj(a, FX.bodyAdj(bodyOf()));
  if (prefs.deviceProfile && device.profile && session.fromCamera) a = mergeAdj(a, device.profile.adj);
  return a;
}

// ------------------------------------------------------------------ undo / redo
const hist = {u: [], r: [], last: null};
const snap = () => JSON.stringify({lookId: S.lookId, lookName: S.lookName, adj: S.adj, ref: S.ref, strength: S.strength, beauty: S.beauty, weather: S.weather, lens: S.lens, body: S.body, social: S.social});
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
function show(v) { views.forEach(q => $(q).hidden = q !== v); if (v === "#v-cam") startCamera(); else CAM.stop(); }

// ================================================================== CAMERA
const RATIOS = {"3:4": 3 / 4, "4:5": 4 / 5, "1:1": 1, "9:16": 9 / 16};
const camState = {mode: "photo", prevBody: null, prevLook: null, lastPos: null, watch: null, starting: false, thumbSrc: null};

async function startCamera(opts = {}) {
  if (!LS.get("consent", null) || camState.starting) return;
  if (!CAM.supported()) return noCam("เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องใช้ https และเบราว์เซอร์รุ่นใหม่)");
  camState.starting = true;
  try {
    await CAM.start($("#video"), Object.assign({facing: CAM.cam.facing}, opts));
    $("#vf-nocam").hidden = true;
    $("#vf").classList.toggle("front", CAM.cam.facing === "user" && !opts.deviceId);
    renderLensRow(); applyLivePreview(); renderCamLooks(); updateHud();
    setTimeout(snapshotThumbs, 600);
    if (prefs.gps) watchGps(true);
  } catch (e) {
    const msg = e && e.name === "NotAllowedError" ? "ยังไม่ได้อนุญาตกล้อง — เปิดสิทธิ์กล้องให้ MoonCam ในการตั้งค่าเบราว์เซอร์/แอป แล้วกดลองอีกครั้ง" : "เปิดกล้องไม่ได้: " + (e && e.message || e);
    noCam(msg);
  } finally { camState.starting = false; }
}
function noCam(msg) { $("#vf-nocam").hidden = false; $("#nocam-msg").textContent = msg; }

function renderLensRow() {
  const row = $("#lens-row"); row.textContent = "";
  const lenses = CAM.cam.lenses;
  if (CAM.cam.facing !== "user" && lenses.length > 1) {
    lenses.forEach(L => { const b = el("button", "pill glass" + ((CAM.cam.deviceId === L.id || (!CAM.cam.deviceId && L.tag === "1×")) ? " on" : ""), L.tag); b.title = L.label;
      b.onclick = () => { haptic(); startCamera({deviceId: L.id}); }; row.appendChild(b); });
  } else {
    const z = CAM.manualCaps().zoom;
    if (z) [1, 2, 3, 5].filter(v => v >= z.min && v <= z.max).forEach(v => { const b = el("button", "pill glass" + ((CAM.cam.manual.zoom || 1) === v ? " on" : ""), v + "×");
      b.onclick = () => { haptic(); CAM.setZoom(v); renderLensRow(); }; row.appendChild(b); });
  }
}

function liveFilter(a) {
  const b = Math.pow(2, a.exposure / 100 * 1.5) * (1 + a.fade / 100 * .06) * (1 - a.density / 100 * .18);
  const c = (a.contrast >= 0 ? 1 + a.contrast / 100 * .9 : 1 + a.contrast / 100 * .5) * (1 - a.fade / 100 * .2) * (1 - a.blacks / 100 * .25) * (1 + a.curve / 100 * .35 + a.density / 100 * .15);
  const s = a.mono ? 0 : Math.max(0, (1 + a.saturation / 100) * (1 + a.vibrance / 100 * .3));
  const warm = Math.max(0, a.temp) / 100 * .45 + a.highlightTintAmt / 100 * .12, hue = -a.tint / 100 * 12 + (a.temp < 0 ? a.temp / 100 * 25 : 0);
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) sepia(${warm.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)` + (a.mono ? " grayscale(1)" : "");
}
function applyLivePreview() {
  const a = gradeAdj(), lens = lensOf(), body = bodyOf(), v = $("#video");
  let f = liveFilter(a); if (lens.soft || body.soft) f += " blur(.4px)";
  v.style.filter = f;
  const mirror = $("#vf").classList.contains("front") ? -1 : 1, crop = lens.crop || 1;
  v.style.transform = `scale(${mirror * crop},${crop})`;
  const vig = Math.max(a.vignette / 100, lens.vig || 0);
  $("#vf-vig").style.background = lens.circle ? "radial-gradient(circle at center,transparent 47%,#000 48%)" : vig > 0 ? `radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,${(vig * .7).toFixed(2)}) 100%)` : "none";
  $("#vf-scan").hidden = !body.scan;
  $("#vf-grid").hidden = !prefs.grid; $("#vf-center").hidden = !prefs.center;
  $("#c-grid").classList.toggle("on", prefs.grid); $("#c-center").classList.toggle("on", prefs.center);
  // ratio frame
  const fr = $("#vf-frame"), vf = $("#vf").getBoundingClientRect(), r = RATIOS[prefs.ratio];
  let fw = vf.width, fh = vf.width / r; if (fh > vf.height) { fh = vf.height; fw = fh * r; }
  fr.style.width = fw + "px"; fr.style.height = fh + "px";
  $("#c-ratio").title = prefs.ratio;
}
function updateHud() {
  const hud = $("#cam-hud"); hud.textContent = "";
  const m = CAM.cam.manual, add = t => hud.appendChild(el("span", "pill glass num", t));
  if (prefs.ratio !== "3:4") add(prefs.ratio);
  if (prefs.timer) add(prefs.timer + "s");
  if (prefs.flash !== "off") add(prefs.flash === "torch" ? "ไฟฉาย" : "แฟลช");
  if (m.iso) add("ISO " + m.iso); if (m.shutter) add(CAM.formatShutter(m.shutter)); if (m.wb) add(m.wb + "K"); if (m.ev) add((m.ev > 0 ? "+" : "") + m.ev + " EV");
  if (S.lens !== "natural") add(lensOf().name); if (S.body !== "none") add(bodyOf().name);
  if (prefs.gps && camState.lastPos) add("📍");
  $("#c-flash").classList.toggle("on", prefs.flash !== "off"); $("#c-timer").classList.toggle("on", !!prefs.timer);
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
    b.onclick = () => { haptic(); if (l.id === S.lookId && l.id !== "original") { $("#cam-strength").hidden = !$("#cam-strength").hidden; return; } applyLook(l); applyLivePreview(); renderCamLooks(); updateHud(); toast(l.name + (l.desc ? " — " + l.desc : ""), 1800); };
    strip.appendChild(b);
  });
  const on = strip.querySelector(".on"); if (on) on.scrollIntoView({inline: "center", block: "nearest"});
  $("#cam-str").value = S.strength; $("#cam-str-o").textContent = S.strength + "%";
}

function watchGps(on) {
  if (!navigator.geolocation) return;
  if (on && camState.watch == null) camState.watch = navigator.geolocation.watchPosition(p => { camState.lastPos = {lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude}; updateHud(); }, () => {}, {enableHighAccuracy: true, maximumAge: 30000});
  if (!on && camState.watch != null) { navigator.geolocation.clearWatch(camState.watch); camState.watch = null; camState.lastPos = null; }
}

async function shoot() {
  if (!CAM.cam.stream) return;
  haptic(15);
  if (prefs.timer) { const c = $("#vf-count"); c.hidden = false; for (let i = prefs.timer; i > 0; i--) { c.textContent = i; await new Promise(r => setTimeout(r, 1000)); } c.hidden = true; }
  const f = $("#vf-flash"); f.style.opacity = ".85"; setTimeout(() => f.style.opacity = "0", 70);
  const mirror = $("#vf").classList.contains("front");
  const {blob, canvas} = await CAM.capture({flash: prefs.flash === "on", mirror});
  const shot = cropToRatio(canvas, RATIOS[prefs.ratio]);
  const when = new Date(), gps = prefs.gps ? camState.lastPos : null;
  if (camState.mode === "roll") {
    const jpeg = blob && shot === canvas ? blob : await new Promise(r => shot.toBlob(r, "image/jpeg", .95));
    await DB.rollAdd({id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), time: when.getTime(), blob: jpeg, gps, settings: JSON.parse(snap()), developed: false});
    await refreshRollChip(); toast("เก็บลงม้วนฟิล์มแล้ว 🎞 ยังไม่เห็นภาพจนกว่าจะล้างฟิล์ม", 1800);
    return;
  }
  const exif = blob && shot === canvas ? await EX.readExif(blob) : null;
  await openEditor(shot, {blob: blob && shot === canvas ? blob : null, exif, gps, when, fromCamera: true, name: "MoonCam"});
}

// ================================================================== EDITOR
async function openEditor(img, {blob = null, exif = null, gps = null, when = new Date(), fromCamera = false, name = "MoonCam"} = {}) {
  session.full = scaled(img, device.exportMax); session.prev = scaled(session.full, device.preview);
  session.blob = blob; session.exif = exif; session.gps = gps || EX.gpsFromExif(exif); session.when = when; session.fromCamera = fromCamera; session.name = name; session.faces = null;
  memo.clear(); thumbCache.clear(); session.analysis = null;
  hist.u = []; hist.r = []; hist.last = null; commit();
  show("#v-edit"); renderPanel(); requestRender();
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

function openProSheet() {
  const mc = CAM.manualCaps(), m = CAM.cam.manual, b = el("div");
  const na = "เครื่องนี้ไม่รองรับ";
  const row = (title, cap, val, min, max, step, disp, set, auto) => {
    b.appendChild(slider(title, "pro_" + title, val, min, max, v => set(v), {step, disp, noRender: true, disabled: !cap, onChange: updateHud}));
    if (!cap) b.lastChild.querySelector("output").textContent = "—";
    if (cap && auto) { const a = button("อัตโนมัติ", "chip", async () => { await auto(); updateHud(); openProSheet(); }); a.style.margin = "-4px 0 8px"; b.appendChild(a); }
  };
  b.appendChild(note(`โหมดโปร: ปรับค่ากล้องจริงตามที่มือถือ+เบราว์เซอร์อนุญาต · ความละเอียดสูงสุด ${mc.maxW && mc.maxH ? mc.maxW + "×" + mc.maxH : "ไม่ทราบ"}`));
  row("EV", mc.ev, m.ev || 0, mc.ev ? mc.ev.min : -2, mc.ev ? mc.ev.max : 2, mc.ev ? mc.ev.step || .1 : .1, v => (v > 0 ? "+" : "") + (+v).toFixed(1), v => { CAM.setEV(v); }, () => CAM.setEV(0));
  row("ISO", mc.iso && mc.exposureManual, m.iso || (mc.iso ? mc.iso.min : 100), mc.iso ? mc.iso.min : 100, mc.iso ? mc.iso.max : 3200, 1, v => Math.round(v), v => CAM.setISO(v), CAM.autoExposure);
  const sh = mc.shutter; row("Shutter", sh && mc.exposureManual, m.shutter || (sh ? Math.min(sh.max, 80) : 80), sh ? sh.min : 1, sh ? Math.min(sh.max, 5000) : 5000, 1, v => CAM.formatShutter(v), v => CAM.setShutter(v), CAM.autoExposure);
  row("WB", mc.wb && mc.wbManual, m.wb || 5500, mc.wb ? mc.wb.min : 2500, mc.wb ? mc.wb.max : 7500, 50, v => Math.round(v) + "K", v => CAM.setWB(v), CAM.autoWB);
  const fc = mc.focus; row("Focus", fc && mc.focusManual, m.focus != null ? m.focus : (fc ? fc.min : 0), fc ? fc.min : 0, fc ? fc.max : 1, fc ? (fc.step || .01) : .01, v => (+v).toFixed(2), v => CAM.setFocus(v), CAM.autoFocus);
  row("Zoom", mc.zoom, m.zoom || 1, mc.zoom ? mc.zoom.min : 1, mc.zoom ? mc.zoom.max : 1, mc.zoom ? (mc.zoom.step || .1) : .1, v => (+v).toFixed(1) + "×", v => CAM.setZoom(v));
  b.appendChild(note("ค่าที่ขึ้น “—” คือมือถือ/เบราว์เซอร์นี้ไม่เปิดให้ปรับเอง แอปจะไม่แกล้งทำว่าปรับได้"));
  openSheet("Pro · แมนนวล", b);
}
function openLensSheet() {
  const b = el("div");
  b.appendChild(label("เลนส์จำลอง")); b.appendChild(chips(LENSES.map(l => [l.id, l.name]), S.lens, k => { S.lens = k; applyLivePreview(); updateHud(); openLensSheet(); }, "scroll")); b.appendChild(note(lensOf().desc));
  b.appendChild(label("กล้องจำลอง")); b.appendChild(chips(BODIES.map(x => [x.id, x.name]), S.body, k => { S.body = k; applyLivePreview(); updateHud(); openLensSheet(); }, "scroll")); b.appendChild(note(bodyOf().desc));
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
$("#c-flip").onclick = () => { haptic(); startCamera({facing: CAM.cam.facing === "user" ? "environment" : "user"}); };
$("#c-album").onclick = openAlbumSheet;
$("#c-lenses").onclick = openLensSheet;
$("#c-settings").onclick = openSettings;
$("#c-grid").onclick = () => { prefs.grid = !prefs.grid; savePrefs(); applyLivePreview(); };
$("#c-center").onclick = () => { prefs.center = !prefs.center; savePrefs(); applyLivePreview(); };
$("#c-timer").onclick = () => { prefs.timer = prefs.timer === 0 ? 3 : prefs.timer === 3 ? 10 : 0; savePrefs(); updateHud(); toast(prefs.timer ? `ตั้งเวลา ${prefs.timer} วินาที` : "ปิดตั้งเวลา", 1200); };
$("#c-ratio").onclick = () => { const ks = Object.keys(RATIOS); prefs.ratio = ks[(ks.indexOf(prefs.ratio) + 1) % ks.length]; savePrefs(); applyLivePreview(); updateHud(); toast("สัดส่วน " + prefs.ratio, 1000); };
$("#c-flash").onclick = async () => {
  const torch = CAM.manualCaps().torch, order = torch ? ["off", "on", "torch"] : ["off", "on"]; prefs.flash = order[(order.indexOf(prefs.flash) + 1) % order.length]; savePrefs();
  if (torch) await CAM.setTorch(prefs.flash === "torch"); updateHud(); toast({off: "ปิดแฟลช", on: "แฟลชตอนถ่าย", torch: "เปิดไฟฉาย"}[prefs.flash], 1000);
};
$("#cam-str").oninput = e => { S.strength = +e.target.value; prefs.strength = S.strength; $("#cam-str-o").textContent = S.strength + "%"; applyLivePreview(); };
$("#cam-str").onchange = savePrefs;
$("#cam-modes").onclick = e => {
  const b = e.target.closest("[data-mode]"); if (!b) return; haptic();
  const mode = b.dataset.mode; document.querySelectorAll("#cam-modes button").forEach(x => x.classList.toggle("on", x === b));
  if (camState.mode === "digicam" && mode !== "digicam") { S.body = camState.prevBody || "none"; const l = allLooks().find(x => x.id === camState.prevLook); if (l) applyLook(l, {commit: false}); }
  if (mode === "digicam") { camState.prevBody = S.body; camState.prevLook = S.lookId; S.body = "ccd"; applyLook(PRESETS.find(l => l.id === "y2k_flash"), {commit: false}); toast("DIGICAM — ดิจิคอม CCD ยุค 2000 แฟลชจัด วันที่สีส้ม", 1800); }
  camState.mode = mode;
  if (mode === "pro") openProSheet();
  if (mode === "roll") toast(`ROLL — ถ่ายได้ ${prefs.rollSize} รูป ยังไม่เห็นภาพจนกว่าจะล้างฟิล์ม 🎞`, 2200);
  applyLivePreview(); renderCamLooks(); updateHud(); refreshRollChip();
};
$("#roll-chip").onclick = openRoll;
$("#nocam-retry").onclick = () => startCamera();
$("#nocam-album").onclick = () => $("#f-one").click();
// tap to focus / pinch zoom
(() => {
  const vf = $("#vf"); let pinch = null;
  vf.addEventListener("click", async e => {
    if (e.target.closest("button") || !CAM.cam.track) return;
    const r = vf.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, f = $("#vf-focus");
    f.style.left = e.clientX - r.left + "px"; f.style.top = e.clientY - r.top + "px"; f.classList.add("show"); setTimeout(() => f.classList.remove("show"), 900);
    try { await CAM.cam.track.applyConstraints({advanced: [{pointsOfInterest: [{x, y}], focusMode: "single-shot", exposureMode: "continuous"}]}); } catch (err) {}
  });
  vf.addEventListener("touchmove", e => {
    if (e.touches.length !== 2) return; const z = CAM.manualCaps().zoom; if (!z) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (!pinch) pinch = {d, z: CAM.cam.manual.zoom || 1}; else CAM.setZoom(Math.min(z.max, Math.max(z.min, pinch.z * d / pinch.d)));
  }, {passive: true});
  vf.addEventListener("touchend", () => { pinch = null; renderLensRow(); });
})();

$("#e-back").onclick = () => show("#v-cam");
$("#e-album").onclick = openAlbumSheet;
$("#e-undo").onclick = () => { if (!hist.u.length) return; hist.r.push(hist.last); restore(hist.u.pop()); };
$("#e-redo").onclick = () => { if (!hist.r.length) return; hist.u.push(hist.last); restore(hist.r.pop()); };
$("#e-save").onclick = async () => saveBlobs([{blob: await exportBlob(), name: fileName()}]);
const cmp = $("#e-compare"); cmp.addEventListener("pointerdown", e => { e.preventDefault(); showOriginal = true; requestRender(); }); ["pointerup", "pointerleave", "pointercancel"].forEach(t => cmp.addEventListener(t, () => { if (showOriginal) { showOriginal = false; requestRender(); } }));
$("#tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; haptic(); tab = b.dataset.tab; document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b)); renderPanel(); };
// drag to move crop in Social
(() => { const st = $("#stage"); let d = null; st.addEventListener("pointerdown", e => { if (tab !== "social" || S.social.aspect === null || S.social.bg !== 0) return; d = {x: e.clientX, y: e.clientY}; st.setPointerCapture(e.pointerId); });
  st.addEventListener("pointermove", e => { if (!d) return; const r = st.getBoundingClientRect(); S.social.cx = Math.min(1, Math.max(0, S.social.cx - (e.clientX - d.x) / r.width * .8)); S.social.cy = Math.min(1, Math.max(0, S.social.cy - (e.clientY - d.y) / r.height * .8)); d = {x: e.clientX, y: e.clientY}; requestRender(); });
  st.addEventListener("pointerup", () => { if (d) { d = null; commit(); } }); })();
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
  if (bridge) $("#edition").textContent = "FILM · PRO · APP " + VERSION;
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
