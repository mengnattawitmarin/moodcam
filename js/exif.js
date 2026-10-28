// EXIF keep / GPS embed using piexifjs (vendor/piexif.js, global `piexif`).
const P = () => window.piexif;

function blobToBinary(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); }
function dataUrlToBlob(url) { const [h, b] = url.split(","), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], {type: (h.match(/:(.*?);/) || [])[1] || "image/jpeg"}); }

/** Reads EXIF from a JPEG blob; returns piexif object or null. */
export async function readExif(blob) {
  try { if (!P() || !blob || !/jpe?g/i.test(blob.type || "image/jpeg")) return null; return P().load(await blobToBinary(blob)); } catch (e) { return null; }
}

function toRational(x) { const d = 1000000; return [Math.round(Math.abs(x) * d), d]; }
function dms(deg) { const a = Math.abs(deg), d = Math.floor(a), mFloat = (a - d) * 60, m = Math.floor(mFloat), s = (mFloat - m) * 60; return [[d, 1], [m, 1], [Math.round(s * 1000), 1000]]; }

export function gpsFromExif(ex) {
  try {
    const g = ex && ex.GPS; if (!g || !g[P().GPSIFD.GPSLatitude]) return null;
    const conv = v => v[0][0] / v[0][1] + v[1][0] / v[1][1] / 60 + v[2][0] / v[2][1] / 3600;
    let lat = conv(g[P().GPSIFD.GPSLatitude]), lon = conv(g[P().GPSIFD.GPSLongitude]);
    if (g[P().GPSIFD.GPSLatitudeRef] === "S") lat = -lat; if (g[P().GPSIFD.GPSLongitudeRef] === "W") lon = -lon;
    return {lat, lon};
  } catch (e) { return null; }
}

/**
 * Writes EXIF into an exported JPEG: keeps the camera's original tags (if any), resets
 * orientation (pixels are already upright), adds software tag and, if allowed, GPS.
 */
export async function writeExif(jpegBlob, {source = null, gps = null, keepGps = true, when = new Date()} = {}) {
  if (!P()) return jpegBlob;
  try {
    const px = P(), ex = source ? JSON.parse(JSON.stringify(source)) : {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": null};
    ex["0th"] = ex["0th"] || {}; ex.Exif = ex.Exif || {}; ex.GPS = ex.GPS || {};
    ex["1st"] = {}; ex.thumbnail = null; // old thumbnail would show the unedited photo
    ex["0th"][px.ImageIFD.Orientation] = 1;
    ex["0th"][px.ImageIFD.Software] = "MoonCam";
    const pad = n => String(n).padStart(2, "0"), stamp = `${when.getFullYear()}:${pad(when.getMonth() + 1)}:${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
    if (!ex.Exif[px.ExifIFD.DateTimeOriginal]) ex.Exif[px.ExifIFD.DateTimeOriginal] = stamp;
    ex["0th"][px.ImageIFD.DateTime] = stamp;
    if (!keepGps) ex.GPS = {};
    else if (gps) ex.GPS = {
      [px.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [px.GPSIFD.GPSLatitudeRef]: gps.lat >= 0 ? "N" : "S", [px.GPSIFD.GPSLatitude]: dms(gps.lat),
      [px.GPSIFD.GPSLongitudeRef]: gps.lon >= 0 ? "E" : "W", [px.GPSIFD.GPSLongitude]: dms(gps.lon),
      ...(gps.alt != null ? {[px.GPSIFD.GPSAltitudeRef]: 0, [px.GPSIFD.GPSAltitude]: toRational(gps.alt)} : {}),
    };
    // drop tags piexif cannot re-serialise safely
    delete ex.Exif[px.ExifIFD.MakerNote]; delete ex.Exif[41728]; delete ex.Exif[41729];
    const bytes = px.dump(ex);
    return dataUrlToBlob(px.insert(bytes, await blobToBinary(jpegBlob)));
  } catch (e) { console.warn("EXIF write failed", e); return jpegBlob; }
}
