// MoonCam Social Studio: aspect crop / fit, frames, cinema bars, subtitles, stamps, music card.
export const ASPECTS = [["ต้นฉบับ", null], ["1:1", 1], ["4:5", .8], ["9:16", 9 / 16], ["16:9", 16 / 9], ["3:4", .75]];
export const FRAMES = [["ไม่มี", null], ["Film", "#0d0d0c"], ["ดำ", "#0d0d0c"], ["ขาว", "#fafaf7"], ["Polaroid", "#f6f3ec"], ["ครีม", "#ede3cf"]];
export const BGS = [["ครอป", null], ["เบลอ", null], ["ครีม", "#ede3cf"], ["ทราย", "#d9c29a"], ["ฟ้าเทา", "#7c93ad"], ["คอรัล", "#d9826a"], ["ดำ", "#0b0b0b"]];
export const defaultSocial = () => ({aspect: null, cx: .5, cy: .5, frame: 0, bg: 0, caption: "", letterbox: false, subtitle: false, date: false, place: false, placeName: "", music: false, song: "", artist: ""});

function drawCropped(c, img, dx, dy, dw, dh, cx, cy) {
  const ratio = dw / dh, bw = img.width, bh = img.height; let sw = bw, sh = bw / ratio; if (sh > bh) { sh = bh; sw = bh * ratio; }
  const l = Math.min(bw - sw, Math.max(0, cx * bw - sw / 2)), t = Math.min(bh - sh, Math.max(0, cy * bh - sh / 2));
  c.drawImage(img, l, t, sw, sh, dx, dy, dw, dh);
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

/** body: simulated camera ({date:"film"|"digital"|"vhs", frame}) adds its own stamp / frame. */
export function compose(src, p, maxLong, body, when = new Date()) {
  const ratio = p.aspect ?? src.width / src.height; let ow, oh;
  if (ratio >= 1) { ow = maxLong; oh = Math.round(maxLong / ratio); } else { oh = maxLong; ow = Math.round(maxLong * ratio); }
  const out = document.createElement("canvas"); out.width = ow; out.height = oh; const c = out.getContext("2d"); c.imageSmoothingQuality = "high";
  const u = Math.min(ow, oh);
  let frameIdx = p.frame; if (!frameIdx && body && body.frame === "Polaroid") frameIdx = 4;
  const f = FRAMES[frameIdx][0];
  const ins = f === "ไม่มี" ? [0, 0, 0, 0] : f === "Film" ? [u * .05, u * .09, u * .05, u * .09] : f === "Polaroid" ? [u * .05, u * .05, u * .05, u * .2] : [u * .045, u * .045, u * .045, u * .045];
  if (FRAMES[frameIdx][1]) { c.fillStyle = FRAMES[frameIdx][1]; c.fillRect(0, 0, ow, oh); }
  const ix = ins[0], iy = ins[1], iw = ow - ins[0] - ins[2], ih = oh - ins[1] - ins[3];
  const bg = BGS[p.bg];
  if (bg[0] === "ครอป") drawCropped(c, src, ix, iy, iw, ih, p.cx, p.cy);
  else {
    if (bg[0] === "เบลอ") { const t = document.createElement("canvas"); t.width = Math.max(1, src.width >> 5); t.height = Math.max(1, src.height >> 5);
      t.getContext("2d").drawImage(src, 0, 0, t.width, t.height); drawCropped(c, t, ix, iy, iw, ih, .5, .5); c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(ix, iy, iw, ih); }
    else { c.fillStyle = bg[1]; c.fillRect(ix, iy, iw, ih); }
    const m = u * .06, s = Math.min((iw - 2 * m) / src.width, (ih - 2 * m) / src.height), dw = src.width * s, dh = src.height * s;
    c.drawImage(src, ix + iw / 2 - dw / 2, iy + ih / 2 - dh / 2, dw, dh);
  }
  if (f === "Film") { c.fillStyle = "#2c2a26"; const hw = u * .035, hh = ins[1] * .32; for (let x = u * .03; x < ow - hw; x += hw * 2) { c.fillRect(x, ins[1] * .12, hw, hh); c.fillRect(x, oh - ins[3] * .12 - hh, hw, hh); }
    c.fillStyle = "#d8b87a"; c.font = `${ins[1] * .28}px "JetBrains Mono", monospace`; c.textAlign = "left"; c.fillText("MOONCAM 400", u * .05, ins[1] * .86); c.textAlign = "right"; c.fillText("▸ 12A", ow - u * .05, oh - ins[3] * .32); }
  let lb = 0;
  if (p.letterbox && iw / ih < 2.39) { lb = (ih - iw / 2.39) / 2; c.fillStyle = "#000"; c.fillRect(ix, iy, iw, lb); c.fillRect(ix, iy + ih - lb, iw, lb); }
  const cap = (p.caption || "").trim();
  if (cap && p.subtitle) {
    const fs = Math.max(12, u * (lb ? .045 : .05)); c.font = `600 ${fs}px "Noto Sans Thai", sans-serif`; c.textAlign = "center";
    const y = lb ? iy + ih - lb / 2 + fs * .35 : iy + ih - u * .08; c.lineJoin = "round"; c.lineWidth = fs * .18; c.strokeStyle = "rgba(0,0,0,.85)";
    c.strokeText(cap, ow / 2, y); c.fillStyle = "#fff3a8"; c.fillText(cap, ow / 2, y);
  } else if (cap) {
    c.textAlign = "center";
    if (f === "Polaroid") { c.fillStyle = "#2a2622"; c.font = `italic ${u * .055}px "Cormorant Garamond", serif`; c.fillText(cap, ow / 2, iy + ih + ins[3] * .55); }
    else { c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = u * .015; c.font = `${u * .05}px "Cormorant Garamond", serif`; c.fillText(cap, ow / 2, iy + ih - u * .07 - lb); c.shadowBlur = 0; }
  }
  const bottom = iy + ih - lb;
  const dateStyle = p.date ? "film" : (body && body.date) || null;
  if (dateStyle) {
    const pad = (n, l = 2, ch = "0") => String(n).padStart(l, ch);
    if (dateStyle === "film") {
      const txt = `'${String(when.getFullYear()).slice(2)} ${pad(when.getMonth() + 1, 2, " ")} ${pad(when.getDate())}`, fs = u * .042;
      c.font = `500 ${fs}px "JetBrains Mono", monospace`; c.textAlign = "right"; c.shadowColor = "rgba(255,120,40,.9)"; c.shadowBlur = fs * .45; c.fillStyle = "#ff9a3c";
      c.fillText(txt, ix + iw - u * .04, bottom - u * .04 - (p.music ? u * .2 : 0)); c.shadowBlur = 0;
    } else if (dateStyle === "digital") {
      const txt = `${when.getFullYear()}/${pad(when.getMonth() + 1)}/${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`, fs = u * .034;
      c.font = `600 ${fs}px "JetBrains Mono", monospace`; c.textAlign = "right"; c.fillStyle = "#ffb347"; c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = fs * .2;
      c.fillText(txt, ix + iw - u * .035, bottom - u * .035 - (p.music ? u * .2 : 0)); c.shadowBlur = 0;
    } else if (dateStyle === "vhs") {
      const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][when.getMonth()], fs = u * .045;
      c.font = `600 ${fs}px "JetBrains Mono", monospace`; c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.8)"; c.shadowBlur = fs * .25;
      c.textAlign = "left"; c.fillText("PLAY ▶", ix + u * .05, iy + lb + u * .09);
      c.fillText(`${mon}.${pad(when.getDate())} ${when.getFullYear()}`, ix + u * .05, bottom - u * .1);
      c.fillText(`${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`, ix + u * .05, bottom - u * .045); c.shadowBlur = 0;
    }
  }
  if (p.place && p.placeName) {
    const fs = u * .032; c.font = `500 ${fs}px "Noto Sans Thai", sans-serif`; c.textAlign = "left";
    const txt = "📍 " + p.placeName, tw = c.measureText(txt).width;
    c.fillStyle = "rgba(10,10,12,.45)"; roundRect(c, ix + u * .035, iy + lb + u * .035, tw + fs * 1.1, fs * 1.8, fs * .9); c.fill();
    c.fillStyle = "#fff"; c.fillText(txt, ix + u * .035 + fs * .55, iy + lb + u * .035 + fs * 1.22);
  }
  if (p.music) {
    const cw = Math.min(iw * .86, u * .9), chh = u * .15, cx = ix + (iw - cw) / 2, cy = bottom - chh - u * .04, r = chh * .22;
    c.fillStyle = "rgba(12,12,12,.55)"; roundRect(c, cx, cy, cw, chh, r); c.fill();
    const pad = chh * .18, art = chh - pad * 2, gr = c.createLinearGradient(cx + pad, cy + pad, cx + pad + art, cy + pad + art);
    gr.addColorStop(0, "#d8b87a"); gr.addColorStop(1, "#5b3b6c"); c.fillStyle = gr; roundRect(c, cx + pad, cy + pad, art, art, art * .18); c.fill();
    c.fillStyle = "rgba(255,255,255,.92)"; c.font = `${art * .5}px sans-serif`; c.textAlign = "center"; c.fillText("☾", cx + pad + art / 2, cy + pad + art * .68);
    const tx = cx + pad * 2 + art; c.textAlign = "left"; c.fillStyle = "#fff"; c.font = `600 ${chh * .22}px "Noto Sans Thai", sans-serif`;
    c.fillText(p.song || "Untitled", tx, cy + chh * .36, cw - art - pad * 4); c.fillStyle = "rgba(255,255,255,.7)"; c.font = `${chh * .17}px "Noto Sans Thai", sans-serif`;
    c.fillText(p.artist || "MoonCam", tx, cy + chh * .58, cw - art - pad * 4);
    const bw = cw - art - pad * 4, by = cy + chh * .76; c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(tx, by, bw, chh * .035); c.fillStyle = "#fff"; c.fillRect(tx, by, bw * .38, chh * .035);
    c.beginPath(); c.arc(tx + bw * .38, by + chh * .0175, chh * .05, 0, 7); c.fill();
  }
  return out;
}

/** Seamless carousel: photos side by side, sliced into equal 4:5 (or 1:1) panels for Instagram. */
export function carousel(images, ratio = .8, panelH = 1350, gap = 0, bgColor = "#0b0b0b") {
  const panelW = Math.round(panelH * ratio), n = images.length;
  const totalW = panelW * n, strip = document.createElement("canvas"); strip.width = totalW; strip.height = panelH;
  const c = strip.getContext("2d"); c.fillStyle = bgColor; c.fillRect(0, 0, totalW, panelH); c.imageSmoothingQuality = "high";
  images.forEach((img, i) => drawCropped(c, img, i * panelW + gap / 2, gap / 2, panelW - gap, panelH - gap, .5, .5));
  const out = [];
  for (let i = 0; i < n; i++) { const p = document.createElement("canvas"); p.width = panelW; p.height = panelH; p.getContext("2d").drawImage(strip, i * panelW, 0, panelW, panelH, 0, 0, panelW, panelH); out.push(p); }
  return out;
}
