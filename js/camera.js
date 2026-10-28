// MoonCam live camera: stream, real lenses, manual controls (where the phone allows), capture.
export const cam = {
  stream: null, track: null, video: null, facing: "environment", deviceId: null,
  caps: {}, settings: {}, photoCaps: null, imageCapture: null, lenses: [], manual: {}, error: "",
};

export function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext); }

export async function start(video, {facing = cam.facing, deviceId = null, ratio = 4 / 3} = {}) {
  stop();
  cam.video = video; cam.facing = facing; cam.deviceId = deviceId; cam.error = "";
  const portraitRatio = ratio; // width/height of the sensor stream (landscape numbers)
  const video_c = deviceId ? {deviceId: {exact: deviceId}} : {facingMode: {ideal: facing}};
  Object.assign(video_c, {width: {ideal: 4096}, height: {ideal: Math.round(4096 / portraitRatio)}, frameRate: {ideal: 30}});
  cam.stream = await navigator.mediaDevices.getUserMedia({audio: false, video: video_c});
  video.srcObject = cam.stream; video.muted = true; video.playsInline = true;
  await video.play().catch(() => {});
  cam.track = cam.stream.getVideoTracks()[0];
  cam.caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
  cam.settings = cam.track.getSettings ? cam.track.getSettings() : {};
  cam.imageCapture = null; cam.photoCaps = null;
  if ("ImageCapture" in window) {
    try { cam.imageCapture = new ImageCapture(cam.track); cam.photoCaps = await cam.imageCapture.getPhotoCapabilities(); } catch (e) { cam.imageCapture = null; }
  }
  cam.manual = {};
  await listLenses();
  return cam;
}

export function stop() {
  if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
  cam.stream = null; cam.track = null; cam.imageCapture = null;
}

/** The phone's real cameras the browser can see, with a best-guess label (0.5× / 1× / 2×…). */
export async function listLenses() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    const back = devs.filter(d => !/front|user|facing front|หน้า/i.test(d.label));
    cam.lenses = back.map((d, i) => {
      const l = d.label.toLowerCase();
      let tag = "1×"; if (/ultra|wide|0\.5|uw/.test(l)) tag = "0.5×"; else if (/tele|zoom|2x|3x|5x/.test(l)) tag = /5x/.test(l) ? "5×" : /3x/.test(l) ? "3×" : "2×";
      return {id: d.deviceId, label: d.label || `กล้อง ${i + 1}`, tag};
    });
    // Same tag twice → number them so the user can still tell them apart
    const seen = {}; cam.lenses.forEach(L => { seen[L.tag] = (seen[L.tag] || 0) + 1; if (seen[L.tag] > 1) L.tag += " " + seen[L.tag]; });
  } catch (e) { cam.lenses = []; }
  return cam.lenses;
}

// ------------------------------------------------------------------ manual controls
/** Which manual controls this camera actually supports. */
export function manualCaps() {
  const c = cam.caps || {}, has = k => c[k] !== undefined;
  return {
    ev: has("exposureCompensation") ? c.exposureCompensation : null,
    iso: has("iso") && c.iso.max > c.iso.min ? c.iso : null,
    shutter: has("exposureTime") && c.exposureTime.max > c.exposureTime.min ? c.exposureTime : null, // units: 100 µs
    exposureManual: (c.exposureMode || []).includes("manual"),
    wb: has("colorTemperature") && c.colorTemperature.max > c.colorTemperature.min ? c.colorTemperature : null,
    wbManual: (c.whiteBalanceMode || []).includes("manual"),
    focus: has("focusDistance") && c.focusDistance.max > c.focusDistance.min ? c.focusDistance : null,
    focusManual: (c.focusMode || []).includes("manual"),
    zoom: has("zoom") && c.zoom.max > c.zoom.min ? c.zoom : null,
    torch: !!c.torch,
    maxW: (cam.photoCaps && cam.photoCaps.imageWidth && cam.photoCaps.imageWidth.max) || (c.width && c.width.max) || cam.settings.width || 0,
    maxH: (cam.photoCaps && cam.photoCaps.imageHeight && cam.photoCaps.imageHeight.max) || (c.height && c.height.max) || cam.settings.height || 0,
  };
}

async function apply(advanced) {
  if (!cam.track) return false;
  try { await cam.track.applyConstraints({advanced: [advanced]}); cam.settings = cam.track.getSettings(); return true; }
  catch (e) { console.warn("constraint", advanced, e); return false; }
}
export function setEV(v) { cam.manual.ev = v; return apply({exposureCompensation: v}); }
export function setISO(v) { cam.manual.iso = v; return apply({exposureMode: "manual", iso: v, ...(cam.manual.shutter ? {exposureTime: cam.manual.shutter} : {})}); }
export function setShutter(v) { cam.manual.shutter = v; return apply({exposureMode: "manual", exposureTime: v, ...(cam.manual.iso ? {iso: cam.manual.iso} : {})}); }
export function autoExposure() { cam.manual.iso = cam.manual.shutter = null; return apply({exposureMode: "continuous"}); }
export function setWB(k) { cam.manual.wb = k; return apply({whiteBalanceMode: "manual", colorTemperature: k}); }
export function autoWB() { cam.manual.wb = null; return apply({whiteBalanceMode: "continuous"}); }
export function setFocus(v) { cam.manual.focus = v; return apply({focusMode: "manual", focusDistance: v}); }
export function autoFocus() { cam.manual.focus = null; return apply({focusMode: "continuous"}); }
export function setZoom(v) { cam.manual.zoom = v; return apply({zoom: v}); }
export function setTorch(on) { cam.manual.torch = on; return apply({torch: on}); }

export function formatShutter(t100us) { const s = t100us / 10000; return s >= .3 ? s.toFixed(1) + "s" : "1/" + Math.round(1 / s); }

// ------------------------------------------------------------------ capture
/**
 * Full-quality still: ImageCapture.takePhoto() gives the sensor's full resolution JPEG on
 * most Android phones; otherwise grab the highest-resolution video frame.
 * Returns {blob|null, canvas}.
 */
export async function capture({flash = false, mirror = false} = {}) {
  const v = cam.video;
  if (cam.imageCapture) {
    try {
      const opts = {};
      const pc = cam.photoCaps;
      if (pc && pc.imageWidth) opts.imageWidth = pc.imageWidth.max;
      if (pc && pc.imageHeight) opts.imageHeight = pc.imageHeight.max;
      if (flash && pc && (pc.fillLightMode || []).includes("flash")) opts.fillLightMode = "flash";
      const blob = await cam.imageCapture.takePhoto(opts);
      const bmp = await createImageBitmap(blob, {imageOrientation: "from-image"}).catch(() => null);
      if (bmp) {
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const x = c.getContext("2d");
        if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
        x.drawImage(bmp, 0, 0);
        return {blob: mirror ? null : blob, canvas: c};
      }
    } catch (e) { console.warn("takePhoto failed, using video frame", e); }
  }
  const w = v.videoWidth, h = v.videoHeight, c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
  x.drawImage(v, 0, 0, w, h);
  return {blob: null, canvas: c};
}
