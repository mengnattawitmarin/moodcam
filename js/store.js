// Tiny IndexedDB helper (film roll shots and instant prints stay on this device only).
const DB = "mooncam";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("roll")) d.createObjectStore("roll", {keyPath: "id"}); if (!d.objectStoreNames.contains("instant")) d.createObjectStore("instant", {keyPath: "id"}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
}
export const rollAdd = shot => tx("roll", "readwrite", s => s.put(shot));
export const rollAll = () => tx("roll", "readonly", s => s.getAll());
export const rollDelete = id => tx("roll", "readwrite", s => s.delete(id));
export const rollClear = () => tx("roll", "readwrite", s => s.clear());
export const instantAdd = card => tx("instant", "readwrite", s => s.put(card));
export const instantAll = () => tx("instant", "readonly", s => s.getAll());
export const instantDelete = id => tx("instant", "readwrite", s => s.delete(id));
export function deleteDatabase() { return new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); }); }
