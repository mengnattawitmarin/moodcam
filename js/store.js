// Tiny IndexedDB helper (film roll shots stay on this device only).
const DB = "mooncam", STORE = "roll";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, {keyPath: "id"});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
}
export const rollAdd = shot => tx("readwrite", s => s.put(shot));
export const rollAll = () => tx("readonly", s => s.getAll());
export const rollDelete = id => tx("readwrite", s => s.delete(id));
export const rollClear = () => tx("readwrite", s => s.clear());
export function deleteDatabase() { return new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); }); }
