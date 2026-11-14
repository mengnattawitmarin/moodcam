// MoonCam ID / visa photo: country specs, face measurement, auto-fit crop, checks and a 4×6" print sheet.
// head = chin → top of head (incl. hair) in mm. Values follow each authority's published spec; always double-check before applying.
export const SPECS = [
  {id: "schengen", flag: "🇪🇺", name: "วีซ่าเชงเก้น (ยุโรป)", w: 35, h: 45, head: [32, 36], bg: "ขาว / เทาอ่อน"},
  {id: "us", flag: "🇺🇸", name: "วีซ่า / พาสปอร์ต อเมริกา", w: 51, h: 51, head: [25, 35], eye: [28, 35], bg: "ขาว", dpi: 600, note: "ห้ามใส่แว่นตา"},
  {id: "uk", flag: "🇬🇧", name: "วีซ่าอังกฤษ", w: 35, h: 45, head: [29, 34], bg: "ครีม / เทาอ่อน"},
  {id: "jp", flag: "🇯🇵", name: "วีซ่าญี่ปุ่น", w: 45, h: 45, head: [28, 34], bg: "ขาว / สีอ่อน", note: "สถานทูตไม่ระบุขนาดศีรษะ — ใช้ค่าแนะนำ"},
  {id: "kr", flag: "🇰🇷", name: "วีซ่าเกาหลีใต้", w: 35, h: 45, head: [32, 36], bg: "ขาว"},
  {id: "cn", flag: "🇨🇳", name: "วีซ่าจีน", w: 33, h: 48, head: [28, 33], headW: [15, 22], bg: "ขาว"},
  {id: "ca", flag: "🇨🇦", name: "วีซ่าแคนาดา", w: 35, h: 45, head: [31, 36], bg: "ขาว / สีอ่อน"},
  {id: "au", flag: "🇦🇺", name: "วีซ่าออสเตรเลีย", w: 35, h: 45, head: [32, 36], bg: "สีอ่อนเรียบ"},
  {id: "tw", flag: "🇹🇼", name: "วีซ่าไต้หวัน", w: 35, h: 45, head: [32, 36], bg: "ขาว"},
  {id: "in", flag: "🇮🇳", name: "วีซ่าอินเดีย", w: 51, h: 51, head: [25, 35], bg: "ขาว"},
  {id: "th1", flag: "🇹🇭", name: "รูป 1 นิ้ว (ไทย)", w: 25, h: 30, head: [19, 23], bg: "ขาว / ฟ้า", note: "ขนาดทั่วไปของร้านถ่ายรูป — เช็กกับหน่วยงานอีกครั้ง"},
  {id: "th2", flag: "🇹🇭", name: "รูป 2 นิ้ว (ไทย)", w: 38, h: 45, head: [29, 34], bg: "ขาว / ฟ้า", note: "ขนาดทั่วไปของร้านถ่ายรูป — เช็กกับหน่วยงานอีกครั้ง"},
];
export const specOf = id => SPECS.find(s => s.id === id) || SPECS[0];
export const headTarget = s => (s.head[0] + s.head[1]) / 2;
export const topMargin = s => s.eye ? Math.max(3, s.h - (s.eye[0] + s.eye[1]) / 2 - headTarget(s) * .47) : (s.h - headTarget(s)) * .42;

/** Face geometry from MediaPipe landmarks (normalised to the image). crown = estimated top of head incl. hair. */
export function measure(f) {
  const P = i => f[i];
  const chin = P(152), brow = P(10), nose = P(1), L = P(234), R = P(454), eL = P(33), eR = P(263);
  const faceLen = chin.y - brow.y, crownY = brow.y - faceLen * .3;
  const eyeY = (eL.y + eR.y) / 2, cx = (L.x + R.x) / 2, faceW = Math.hypot(R.x - L.x, R.y - L.y);
  const roll = Math.atan2(eR.y - eL.y, eR.x - eL.x) * 180 / Math.PI;
  const yaw = (nose.x - cx) / Math.max(1e-3, faceW);
  const ear = (a, b, c, d) => Math.hypot(P(a).x - P(b).x, P(a).y - P(b).y) / Math.max(1e-4, Math.hypot(P(c).x - P(d).x, P(c).y - P(d).y));
  const eyesOpen = Math.min(ear(159, 145, 33, 133), ear(386, 374, 362, 263));
  const mouth = Math.hypot(P(13).x - P(14).x, P(13).y - P(14).y) / Math.max(1e-3, faceLen);
  return {crownY, chinY: chin.y, eyeY, cx, faceW, roll, yaw, eyesOpen, mouth, head: chin.y - crownY, L, R};
}

/** Crop the full-res shot so the head lands at the spec's size and position. Returns {canvas, outside, dpi, m}. */
export function fit(img, m, spec, dpi = spec.dpi || 600) {
  const W = img.width, H = img.height, headPx = m.head * H, ppm = headPx / headTarget(spec);
  const cw = spec.w * ppm, ch = spec.h * ppm, x = m.cx * W - cw / 2, y = m.crownY * H - topMargin(spec) * ppm;
  const ow = Math.round(spec.w / 25.4 * dpi), oh = Math.round(spec.h / 25.4 * dpi);
  const c = document.createElement("canvas"); c.width = ow; c.height = oh; const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, ow, oh); g.imageSmoothingQuality = "high";
  g.drawImage(img, x, y, cw, ch, 0, 0, ow, oh);
  const outside = x < -2 || y < -2 || x + cw > W + 2 || y + ch > H + 2;
  return {canvas: c, outside, srcDpi: ppm * 25.4, ppm, crop: {x, y, cw, ch}};
}

/** Pass / warn list shown after the shot. */
export function checks(out, m, spec, fitInfo) {
  const res = [], ok = (pass, t, hint) => res.push({pass, t, hint});
  const headMM = headTarget(spec);
  ok(true, `ขนาดศีรษะ ${headMM.toFixed(1)} มม. (กำหนด ${spec.head[0]}–${spec.head[1]})`, "");
  if (spec.headW) { const wmm = m.faceW / m.head * headMM * 1.05; ok(wmm >= spec.headW[0] - 1 && wmm <= spec.headW[1] + 1, `ความกว้างใบหน้า ~${wmm.toFixed(0)} มม. (กำหนด ${spec.headW[0]}–${spec.headW[1]})`, "หันหน้าตรงเข้ากล้อง"); }
  if (spec.eye) { const eyeFromBottom = spec.h - (topMargin(spec) + (m.eyeY - m.crownY) / m.head * headMM); ok(eyeFromBottom >= spec.eye[0] && eyeFromBottom <= spec.eye[1], `ระดับตา ${eyeFromBottom.toFixed(1)} มม. จากขอบล่าง (กำหนด ${spec.eye[0]}–${spec.eye[1]})`, "ถ่ายใหม่ให้ศีรษะตรง"); }
  ok(!fitInfo.outside, "ภาพครบกรอบ ไม่มีขอบขาวเติม", "ถอยห่างกล้องอีกนิด ให้เห็นไหล่และเหนือศีรษะ");
  ok(fitInfo.srcDpi >= 280, "ความละเอียดพอสำหรับพิมพ์", "เข้าใกล้กล้องอีกนิด หรือใช้กล้องหลัง");
  ok(Math.abs(m.roll) < 4, "ศีรษะตั้งตรง ไม่เอียง", `ศีรษะเอียง ${Math.abs(m.roll).toFixed(0)}° — ตั้งตรง`);
  ok(Math.abs(m.yaw) < .07, "หน้าตรง มองกล้อง", "หันหน้าตรงเข้ากล้อง");
  ok(m.eyesOpen > .18, "ลืมตา", "ลืมตาให้เห็นชัด");
  ok(m.mouth < .045, "ปากปิด สีหน้าปกติ", "ปิดปาก ไม่ยิ้มเห็นฟัน");
  // background + lighting from the fitted photo
  const g = out.getContext("2d"), w = out.width, h = out.height, sample = (x, y, sw, sh) => { const d = g.getImageData(x, y, sw, sh).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 16) { const l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255; s += l; s2 += l * l; n++; } const mu = s / n; return {mu, sd: Math.sqrt(Math.max(0, s2 / n - mu * mu))}; };
  const a = sample(2, 2, Math.round(w * .18), Math.round(h * .22)), b = sample(Math.round(w * .8), 2, Math.round(w * .18), Math.round(h * .22));
  ok(Math.min(a.mu, b.mu) > .72 && Math.max(a.sd, b.sd) < .09, "พื้นหลังสว่าง เรียบ", `พื้นหลังต้องเป็น${spec.bg} เรียบ ไม่มีลาย/เงา`);
  const fy = Math.round(((m.eyeY - m.crownY) / m.head * headMM + topMargin(spec) + 6) / spec.h * h);
  const fx1 = Math.round((.5 - .17) * w), fx2 = Math.round((.5 + .07) * w), fw = Math.round(.1 * w), fh = Math.round(.08 * h);
  const lc = sample(fx1, fy, fw, fh), rc = sample(fx2, fy, fw, fh);
  ok(Math.abs(lc.mu - rc.mu) < .12, "แสงบนใบหน้าสม่ำเสมอ", "หันหน้าเข้าหาแสง ไม่ให้มีเงาครึ่งหน้า");
  if (spec.note) res.push({pass: null, t: spec.note});
  return res;
}

/** 4×6 inch print sheet (300 dpi) filled with copies + cut marks. */
export function sheet(photo, spec) {
  const dpi = 300, W = 1800, H = 1200, pw = Math.round(spec.w / 25.4 * dpi), ph = Math.round(spec.h / 25.4 * dpi), gap = 24;
  const cols = Math.max(1, Math.floor((W - gap) / (pw + gap))), rows = Math.max(1, Math.floor((H - gap - 40) / (ph + gap)));
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const ox = (W - cols * pw - (cols - 1) * gap) / 2, oy = (H - 40 - rows * ph - (rows - 1) * gap) / 2;
  g.strokeStyle = "#bbb"; g.lineWidth = 1;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = ox + k * (pw + gap), y = oy + r * (ph + gap); g.drawImage(photo, x, y, pw, ph);
    [[x, y], [x + pw, y], [x, y + ph], [x + pw, y + ph]].forEach(([a, b]) => { g.beginPath(); g.moveTo(a - 10, b); g.lineTo(a + 10, b); g.moveTo(a, b - 10); g.lineTo(a, b + 10); g.stroke(); });
  }
  g.fillStyle = "#888"; g.font = "22px sans-serif"; g.textAlign = "center";
  g.fillText(`${spec.name} · ${spec.w}×${spec.h} มม. · ${rows * cols} รูป · พิมพ์ขนาด 4×6 นิ้ว (10×15 ซม.) แบบ 100% ไม่ย่อขยาย · MoonCam`, W / 2, H - 16);
  return c;
}

/** Write the print resolution into the JPEG (JFIF density) so printers keep the real size. */
export async function withDpi(blob, dpi) {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[2] === 0xFF && b[3] === 0xE0 && b[6] === 0x4A && b[7] === 0x46) { b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255; }
  return new Blob([b], {type: "image/jpeg"});
}
