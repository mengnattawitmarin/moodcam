// Device Sync: identify the phone and pick the best quality / colour settings for it.
const BRANDS = [
  ["samsung", /samsung|SM-[A-Z0-9]+|Galaxy/i, "Samsung"],
  ["xiaomi", /xiaomi|redmi|poco|\bMi \d|2\d{3}[A-Z0-9]{3,}[CGY]/i, "Xiaomi"],
  ["oppo", /oppo|CPH\d{4}/i, "OPPO"],
  ["realme", /realme|RMX\d{4}/i, "realme"],
  ["oneplus", /oneplus|[A-Z]{2}\d{4}/i, "OnePlus"],
  ["vivo", /vivo|V2\d{3}/i, "vivo"],
  ["huawei", /huawei|honor|[A-Z]{3}-[A-Z]{1,2}\d{2}/i, "Huawei / Honor"],
  ["google", /pixel/i, "Google Pixel"],
  ["apple", /iphone|ipad|macintosh/i, "Apple"],
];

// Small colour corrections so a Look renders alike on every brand's camera pipeline
const PROFILES = {
  samsung: {adj: {saturation: -6, contrast: -3}, note: "ลดความอิ่มสีลงเล็กน้อย (กล้อง Samsung สีจัดอยู่แล้ว)"},
  xiaomi: {adj: {saturation: -4, temp: -2}, note: "ลดสีจัดและโทนอุ่นเล็กน้อย"},
  oppo: {adj: {saturation: -4, tint: -2}, note: "ลดสีจัด ปรับโทนผิวให้เป็นธรรมชาติ"},
  realme: {adj: {saturation: -4, tint: -2}, note: "ลดสีจัด ปรับโทนผิวให้เป็นธรรมชาติ"},
  oneplus: {adj: {saturation: -3}, note: "ลดความอิ่มสีเล็กน้อย"},
  vivo: {adj: {saturation: -5, temp: -3}, note: "ลดสีจัดและโทนอุ่น"},
  huawei: {adj: {saturation: -3, contrast: -2}, note: "ลดสีและคอนทราสต์เล็กน้อย"},
  google: {adj: {contrast: 2}, note: "เพิ่มคอนทราสต์เล็กน้อย (กล้อง Pixel ภาพแฟลต)"},
  apple: {adj: {temp: -3}, note: "ลดโทนอุ่นเล็กน้อย"},
  other: {adj: {}, note: "ใช้ค่ามาตรฐาน"},
};

export async function detectDevice() {
  const info = {brand: "other", brandName: "ไม่ทราบยี่ห้อ", model: "", os: "", cores: navigator.hardwareConcurrency || 0, memory: navigator.deviceMemory || 0, dpr: window.devicePixelRatio || 1, source: "browser"};
  try { // Android app bridge knows the exact manufacturer / model
    if (window.MoodCamAndroid && window.MoodCamAndroid.getDeviceInfo) {
      const j = JSON.parse(window.MoodCamAndroid.getDeviceInfo());
      info.model = `${j.manufacturer || ""} ${j.model || ""}`.trim(); info.os = "Android " + (j.release || ""); info.source = "app";
      if (j.memoryMB) info.memory = Math.round(j.memoryMB / 1024);
    }
  } catch (e) {}
  if (!info.model && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try { const h = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]); info.model = h.model || ""; info.os = (navigator.userAgentData.platform || "") + " " + (h.platformVersion || ""); } catch (e) {}
  }
  const ua = navigator.userAgent;
  if (!info.model) { const m = ua.match(/Android [\d.]+; ([^;)]+)/); if (m) info.model = m[1].replace(/Build.*/, "").trim(); }
  if (!info.os) { const m = ua.match(/Android [\d.]+|iPhone OS [\d_]+/); info.os = m ? m[0].replace(/_/g, ".") : navigator.platform; }
  const hay = info.model + " " + ua;
  for (const [id, re, name] of BRANDS) if (re.test(id === "oneplus" ? info.model : hay)) { info.brand = id; info.brandName = name; break; }
  // performance tier → preview / export sizes
  const strong = (info.memory >= 6 || info.memory === 0) && info.cores >= 8;
  const weak = (info.memory && info.memory <= 3) || (info.cores && info.cores <= 4);
  info.tier = weak ? "low" : strong ? "high" : "mid";
  info.preview = {low: 1080, mid: 1400, high: 1600}[info.tier];
  info.exportMax = {low: 3000, mid: 4000, high: 4096}[info.tier];
  info.profile = PROFILES[info.brand] || PROFILES.other;
  return info;
}
