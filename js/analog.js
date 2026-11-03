// MoonCam analog modes: instant camera models and film stocks (names are MoonCam's own, not real brands).
import {L, H} from "./engine.js";
const adj = (o) => L("x", "", "", "", o).adj;

// ---------------------------------------------------------------- instant cameras
// ratio = photo w/h · border = frame insets relative to photo width [left, top, right, bottom]
export const INSTANT = [
  {id: "classic", name: "Classic Box", format: "สี่เหลี่ยม 1:1", desc: "สีอุ่น ขอบขาวหนา แบบดั้งเดิม", ratio: 1, border: [.06, .06, .06, .26],
    frames: [["ขาว", "#f6f3ec"], ["ดำ", "#141414"], ["ครีม", "#efe4cc"], ["พาสเทล", "#f4d9e2"]], ink: "#2b2a4a",
    skin: {body: "linear-gradient(170deg,#f3ede0 0%,#e4dccb 55%,#d3c9b4 100%)", radius: 34, logo: "#8a7d62", ring: "#d8b87a", lcd: "#c9e39a", btn: "radial-gradient(circle at 35% 30%,#ff9a8a,#d9483b 60%,#8e2a22)", btnRing: "conic-gradient(from 210deg,#f1dcae,#a8864b,#f1dcae,#d8b87a,#f1dcae)", bg: "#050506", accent: "#e3c78f", flash: "repeating-linear-gradient(90deg,#f8f6f0 0 3px,#d9d4c8 3px 5px)"},
    adj: adj({fade: 20, saturation: -10, contrast: 8, temp: 8, shadowTintHue: 185, shadowTintAmt: 24, highlightTintHue: 45, highlightTintAmt: 24, grain: 12, vignette: 18, bloom: 10, keepBright: 95})},
  {id: "mini", name: "Mini Pastel", format: "ฟิล์มมินิ แนวตั้ง", desc: "สีพาสเทลสว่าง ผิวใส แฟลชนุ่ม", ratio: 46 / 62, border: [.08, .1, .08, .3],
    frames: [["ขาว", "#fbfbf8"], ["มิ้นต์", "#d8f3e8"], ["ชมพู", "#ffdbe4"], ["ฟ้า", "#d9e8fb"]], ink: "#3f6b5e",
    skin: {body: "linear-gradient(165deg,#dcf6ec 0%,#b5e6d4 50%,#93d0bb 100%)", radius: 60, logo: "#4f8f7a", ring: "#ffffff", lcd: "#d6ffef", btn: "radial-gradient(circle at 35% 30%,#fff1f4,#ffc2cf 60%,#e893a6)", btnRing: "#dcf6ec", bg: "radial-gradient(120% 70% at 50% 20%,#12221d 0%,#060908 70%)", accent: "#9fd8c4", flash: "#fbfffd"},
    adj: adj({exposure: 14, contrast: -6, curve: 20, density: 6, saturation: -12, temp: 2, tint: 8, fade: 16, bloom: 22, highlights: -18, shadows: 18, highlightTintHue: 340, highlightTintAmt: 18, keepBright: 100, hsl: H({orange: {lum: 14, sat: -10}, blue: {lum: 10, sat: -12}})})},
  {id: "wide", name: "Wide 90", format: "ฟิล์มกว้าง 3:2", desc: "เก็บวิวกว้าง คอนทราสต์ชัด สีเย็น", ratio: 1.55, border: [.04, .045, .04, .14],
    frames: [["ขาว", "#f5f5f2"], ["ดำ", "#121212"], ["เทา", "#cfd0cc"]], ink: "#26303a",
    skin: {body: "linear-gradient(170deg,#3a3b40 0%,#26272b 60%,#1b1c1f 100%)", radius: 22, logo: "#9aa0a8", ring: "#9aa0a8", lcd: "#9fe1ff", btn: "radial-gradient(circle at 35% 30%,#ffd0a0,#ff8a3a 60%,#a8501a)", btnRing: "conic-gradient(from 210deg,#cfd3d8,#5c6066,#cfd3d8,#8a8f96,#cfd3d8)", bg: "#050608", accent: "#c3c8d0", flash: "repeating-linear-gradient(90deg,#eee 0 2px,#aaa 2px 3px)"},
    adj: adj({contrast: 22, temp: -10, tint: -2, saturation: -4, vibrance: 14, fade: 10, shadowTintHue: 200, shadowTintAmt: 30, highlights: -12, grain: 10, vignette: 14})},
  {id: "folding", name: "Folding 70s", format: "สี่เหลี่ยม 1:1", desc: "สีซีดอบอุ่นยุค 70 เงาออกน้ำตาล", ratio: 1, border: [.06, .06, .06, .26],
    frames: [["ครีม", "#efe6d2"], ["ขาวเก่า", "#f2ede2"], ["น้ำตาล", "#5a4030"]], ink: "#4a3626",
    skin: {body: "repeating-linear-gradient(45deg,#2b211c 0 3px,#33271f 3px 6px)", radius: 12, logo: "#d6d2c8", ring: "#d6d2c8", lcd: "#ffcf8a", btn: "radial-gradient(circle at 35% 30%,#ffe1a8,#e08a2a 60%,#8a4a12)", btnRing: "conic-gradient(from 210deg,#e8e4da,#8a857a,#e8e4da,#b9b4aa,#e8e4da)", bg: "radial-gradient(120% 70% at 50% 20%,#21170f 0%,#070504 70%)", accent: "#d9b48a", flash: "#c8c3b8", trim: "#b9b4aa"},
    adj: adj({temp: 22, tint: 4, saturation: -24, fade: 30, contrast: 4, shadowTintHue: 28, shadowTintAmt: 34, highlightTintHue: 45, highlightTintAmt: 34, grain: 24, vignette: 30, lightLeak: 14, keepBright: 92})},
  {id: "neon", name: "Neon Y2K", format: "สี่เหลี่ยม 1:1", desc: "แฟลชจัด สีสด ขอบสีนีออน", ratio: 1, border: [.06, .06, .06, .26],
    frames: [["ม่วง", "#d9c2ff"], ["ชมพู", "#ffc4ec"], ["ขาว", "#ffffff"], ["ดำ", "#111111"]], ink: "#3b1f6e",
    skin: {body: "linear-gradient(160deg,rgba(186,140,255,.95),rgba(110,70,200,.9))", radius: 40, logo: "#fff0ff", ring: "#ff8fe1", lcd: "#fff6b0", btn: "radial-gradient(circle at 35% 30%,#fff6b0,#ffd23f 60%,#c48a00)", btnRing: "conic-gradient(from 210deg,#ff8fe1,#7a4bd8,#ff8fe1,#b48cff,#ff8fe1)", bg: "radial-gradient(120% 70% at 50% 20%,#1d0f33 0%,#07040c 70%)", accent: "#d3b4ff", flash: "#fffbe0"},
    adj: adj({exposure: 8, contrast: 30, saturation: 24, vibrance: 20, temp: -10, tint: 10, highlights: 10, bloom: 20, vignette: 24, grain: 8, shadowTintHue: 280, shadowTintAmt: 30})},
  {id: "sepia", name: "Sepia Studio", format: "สี่เหลี่ยม 1:1", desc: "ภาพโทนซีเปียแบบสตูดิโอเก่า", ratio: 1, border: [.06, .06, .06, .26],
    frames: [["ครีม", "#ece0c8"], ["ขาว", "#f6f2ea"], ["ดำ", "#1a1410"]], ink: "#4a3020",
    skin: {body: "linear-gradient(90deg,#7a5232,#a1714a 30%,#7a5232 60%,#9a6a44)", radius: 14, logo: "#f0d9b5", ring: "#c9a36a", lcd: "#ffd99a", btn: "radial-gradient(circle at 35% 30%,#fff0d0,#c9a36a 60%,#6a4a24)", btnRing: "conic-gradient(from 210deg,#f0d9b5,#8a6a44,#f0d9b5,#c9a36a,#f0d9b5)", bg: "radial-gradient(120% 70% at 50% 20%,#241608 0%,#080503 70%)", accent: "#d6b07a", flash: "#1a120c"},
    adj: adj({mono: true, contrast: 24, fade: 18, grain: 28, vignette: 36, shadowTintHue: 30, shadowTintAmt: 55, highlightTintHue: 42, highlightTintAmt: 45, keepBright: 90})},
];

// ---------------------------------------------------------------- film stocks (35mm, 24/36 exposures)
export const FILMS = [
  {id: "sunny_gold", name: "Sunny Gold 200", short: ["SUNNY", "GOLD"], iso: "200", tone: "อุ่น ทอง สด", swatch: ["#f0a83a", "#d9643a", "#6aa0b8"],
    box: "linear-gradient(90deg,#f2c230 0 68%,#d8322b 68%)", boxInk: "#5a1a10", isoInk: "#fff", accent: "#f2c230", accent2: "#ffd75a", body: "silver", bg: "radial-gradient(120% 60% at 50% 0%,#2a1f08 0%,#070604 65%)", btn: "radial-gradient(circle at 35% 30%,#fff3c4,#f2c230 60%,#b38612)", shot: "#c98a4c",
    adj: adj({temp: 20, tint: 4, vibrance: 26, saturation: 10, contrast: 24, blacks: -10, highlights: -10, grain: 22, vignette: 14, halation: 16, highlightTintHue: 40, highlightTintAmt: 38, shadowTintHue: 20, shadowTintAmt: 14, hsl: H({yellow: {sat: 16}, orange: {sat: 14, lum: 4}, blue: {sat: -6}})})},
  {id: "velvet_portrait", name: "Velvet Portrait 400", short: ["VELVET", "PORTRAIT"], iso: "400", tone: "ผิวนวล ละมุน", swatch: ["#f1c8b0", "#d9b38c", "#9fb3b0"],
    box: "linear-gradient(180deg,#efe3cc 0 62%,#a8743e 62%)", boxInk: "#5a3a1c", isoInk: "#5a3a1c", accent: "#e8c9a0", accent2: "#f5dfc2", body: "silver", bg: "radial-gradient(120% 60% at 50% 0%,#2a2016 0%,#080605 65%)", btn: "radial-gradient(circle at 35% 30%,#fff6ea,#e8c9a0 60%,#a8743e)", shot: "#d9b38c",
    adj: adj({exposure: 8, contrast: 6, shadows: 16, highlights: -18, temp: 8, tint: 4, saturation: -10, fade: 10, grain: 14, bloom: 12, highlightTintHue: 30, highlightTintAmt: 22, shadowTintHue: 200, shadowTintAmt: 10, keepBright: 100, hsl: H({orange: {lum: 12, sat: -10}, red: {sat: -10}, green: {sat: -16}})})},
  {id: "green_leaf", name: "Green Leaf 400", short: ["GREEN", "LEAF"], iso: "400", tone: "เขียวเย็น ใส", swatch: ["#5aa070", "#c9d6c2", "#b86a8a"],
    box: "linear-gradient(90deg,#1f8a4c 0 72%,#f4f4f0 72%)", boxInk: "#fff", isoInk: "#1f8a4c", accent: "#3fbf74", accent2: "#8fe0a8", body: "black", bg: "radial-gradient(120% 60% at 50% 0%,#0c2416 0%,#040806 65%)", btn: "radial-gradient(circle at 35% 30%,#d8ffe4,#3fbf74 60%,#1a6a3a)", shot: "#5aa070",
    adj: adj({temp: -6, tint: -8, contrast: 16, saturation: -4, fade: 10, grain: 18, shadowTintHue: 160, shadowTintAmt: 30, highlightTintHue: 320, highlightTintAmt: 10, hsl: H({green: {hue: 10, sat: 10, lum: 4}, blue: {hue: -8, sat: 8}, red: {hue: 6}})})},
  {id: "cine_800t", name: "Cine 800T", short: ["CINE", "TUNGSTEN"], iso: "800T", tone: "หนัง กลางคืน", swatch: ["#2e6f86", "#e0563a", "#f2c38a"],
    box: "linear-gradient(135deg,#1c2f3f 0 55%,#b8232c 55%)", boxInk: "#8fe0e0", isoInk: "#fff", accent: "#ff6a52", accent2: "#8fe0e0", body: "black", bg: "radial-gradient(120% 60% at 50% 0%,#0d2a33 0%,#05080a 65%)", btn: "radial-gradient(circle at 35% 30%,#ffb3a6,#e0402f 60%,#8e1f17)", shot: "#1f5a68",
    adj: adj({temp: -22, tint: 4, contrast: 30, blacks: -16, saturation: 6, grain: 26, halation: 60, bloom: 20, vignette: 20, shadowTintHue: 195, shadowTintAmt: 50, highlightTintHue: 25, highlightTintAmt: 30, hsl: H({orange: {sat: 10}, red: {sat: 14}})})},
  {id: "noir_400", name: "Noir 400", short: ["NOIR", "B&W"], iso: "400", tone: "ขาวดำ เข้ม", swatch: ["#111111", "#777777", "#eeeeee"],
    box: "repeating-linear-gradient(90deg,#111 0 10px,#1b1b1b 10px 20px)", boxInk: "#fff", isoInk: "#fff", accent: "#e8e8e8", accent2: "#ffffff", body: "black", bg: "radial-gradient(120% 60% at 50% 0%,#1c1c1c 0%,#050505 65%)", btn: "radial-gradient(circle at 35% 30%,#ffffff,#bdbdbd 60%,#555)", shot: "#8a8a8a",
    adj: adj({mono: true, contrast: 44, blacks: -18, grain: 36, vignette: 24, halation: 8, keepBright: 85})},
  {id: "ultra_vivid", name: "Ultra Vivid 100", short: ["ULTRA", "VIVID"], iso: "100", tone: "สีจัดจ้าน", swatch: ["#1e6fd9", "#e2264d", "#2fbf5a"],
    box: "linear-gradient(90deg,#5b2a8c,#c2338a)", boxInk: "#fff", isoInk: "#ffe066", accent: "#d64fa8", accent2: "#ffe066", body: "silver", bg: "radial-gradient(120% 60% at 50% 0%,#24103a 0%,#07040c 65%)", btn: "radial-gradient(circle at 35% 30%,#ffd6f0,#d64fa8 60%,#6a1e58)", shot: "#9a3a9a",
    adj: adj({contrast: 34, blacks: -14, saturation: 30, vibrance: 30, highlights: -8, grain: 8, vignette: 16, hsl: H({blue: {sat: 24, lum: -8}, green: {sat: 20}, red: {sat: 16}, yellow: {sat: 12}})})},
  {id: "expired_1998", name: "Expired 1998", short: ["EXPIRED", "1998"], iso: "200", tone: "ซีด สีเพี้ยน", swatch: ["#c9a98a", "#b88aa0", "#8fa6a0"],
    box: "radial-gradient(circle at 75% 35%,rgba(150,110,60,.45),transparent 40%),linear-gradient(180deg,#d9cba8,#b9a57c)", boxInk: "#6a4f2c", isoInk: "#6a4f2c", accent: "#d9b98a", accent2: "#f0dcb8", body: "silver", bg: "radial-gradient(120% 60% at 50% 0%,#2a2014 0%,#080604 65%)", btn: "radial-gradient(circle at 35% 30%,#fff2dc,#d9b98a 60%,#8a6a3c)", shot: "#b89a7a",
    adj: adj({fade: 34, saturation: -26, contrast: 8, temp: 10, tint: 14, grain: 40, vignette: 30, lightLeak: 34, shadowTintHue: 300, shadowTintAmt: 30, highlightTintHue: 55, highlightTintAmt: 34, keepBright: 92})},
  {id: "daily_color", name: "Daily Color 200", short: ["DAILY", "COLOR"], iso: "200", tone: "ฟิล์มบ้าน ๆ ยุค 90", swatch: ["#4fa36a", "#e6c45a", "#4a7fc2"],
    box: "linear-gradient(180deg,#2c6fd6 0 50%,#ffffff 50%)", boxInk: "#ffffff", isoInk: "#2c6fd6", accent: "#4a8fe8", accent2: "#a8ccff", body: "silver", bg: "radial-gradient(120% 60% at 50% 0%,#0c1a33 0%,#04060b 65%)", btn: "radial-gradient(circle at 35% 30%,#e0eeff,#4a8fe8 60%,#1a4a96)", shot: "#4a7fc2",
    adj: adj({contrast: 20, saturation: 12, tint: -6, temp: 2, grain: 22, vignette: 12, fade: 6, shadowTintHue: 150, shadowTintAmt: 18, hsl: H({green: {sat: 16}, yellow: {sat: 10}})})},
];
export const instantOf = id => INSTANT.find(m => m.id === id) || INSTANT[0];
export const filmOf = id => FILMS.find(f => f.id === id) || FILMS[0];

/** Instant print: photo + frame (+ handwritten caption & date). Returns a canvas. */
export function makeCard(photo, model, {frame = 0, caption = "", date = "", w = 1600} = {}) {
  const b = model.border, pw = w / (1 + b[0] + b[2]), ph = pw / model.ratio;
  const W = Math.round(w), Hh = Math.round(ph * (1 + 0) + pw * (b[1] + b[3]));
  const c = document.createElement("canvas"); c.width = W; c.height = Hh; const x = c.getContext("2d");
  const fc = (model.frames[frame] || model.frames[0])[1];
  x.fillStyle = fc; x.fillRect(0, 0, W, Hh);
  // paper texture: faint noise
  const dark = luminance(fc) < .4;
  x.globalAlpha = .05; for (let i = 0; i < 1400; i++) { x.fillStyle = dark ? "#fff" : "#000"; x.fillRect(Math.random() * W, Math.random() * Hh, 1.5, 1.5); } x.globalAlpha = 1;
  const px = pw * b[0], py = pw * b[1];
  // cover-crop the photo into the window
  const r = photo.width / photo.height; let sw = photo.width, sh = photo.height; if (r > model.ratio) sw = sh * model.ratio; else sh = sw / model.ratio;
  x.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
  x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(px, py, pw, 1.5); // inner edge
  const ink = dark ? "#f2efe8" : model.ink, by = py + ph, bh = Hh - by;
  if (caption) { x.fillStyle = ink; x.font = `${Math.round(bh * .3)}px Itim, "Noto Sans Thai", cursive`; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(caption, px + pw * .02, by + bh * .5, pw * (date ? .72 : .96)); }
  if (date) { x.fillStyle = ink; x.globalAlpha = .75; x.font = `${Math.round(bh * .18)}px Itim, cursive`; x.textAlign = "right"; x.textBaseline = "middle"; x.fillText(date, px + pw * .98, by + bh * .5); x.globalAlpha = 1; }
  return c;
}
function luminance(hex) { const n = parseInt(hex.slice(1), 16); return (.299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255)) / 255; }
