import { system } from '../core.js';
import { T, LANGS, LANG_META } from "./locales.js";

const IDX = Object.create(null);
for (let i = 0; i < LANGS.length; i++) IDX[LANGS[i]] = i;

const cache = new Map();

const fill = (s, a) => {
 let out = "";
 let i = 0;
 let n = 0;
 let p;
 while (n < a.length && (p = s.indexOf("%s", i)) !== -1) {
  out += s.slice(i, p) + a[n++];
  i = p + 2;
 }
 out += s.slice(i);
 if (out.indexOf("{") === -1) return out;
 for (let j = 0; j < a.length; j++) {
  const tok = "{" + j + "}";
  if (out.indexOf(tok) !== -1) out = out.split(tok).join(a[j]);
 }
 return out;
};

const readTag = (p) => {
 const tag = p.getTags?.().find((t) => t.startsWith("lang:"))?.split(":")[1];
 return tag !== undefined && IDX[tag] !== undefined ? tag : "en";
};

const langOf = (p) => {
 if (!p?.id) return "en";
 let l = cache.get(p.id);
 if (l === undefined) {
  l = readTag(p);
  cache.set(p.id, l);
 }
 return l;
};

export { LANGS, LANG_META };

export const Lang = {
 t: (p, k, ...a) => {
  const row = T[k];
  if (!Array.isArray(row)) return k;
  const s = row[IDX[langOf(p)]] ?? row[0];
  return a.length ? fill(s, a) : s;
 },
 get: langOf,
 set: (p, l) => {
  if (IDX[l] === undefined) return false;
  cache.set(p.id, l);
  system.run(() => {
   try {
    const tags = p.getTags();
    for (const t of tags) {
     if (t.startsWith("lang:")) {
      p.removeTag(t);
     }
    }
    p.addTag(`lang:${l}`);
   } catch (e) {
    console.warn("Failed to set language tag:", e);
   }
  });
  return true;
 },
 load: (p) => {
  if (!p?.id || cache.has(p.id)) return;
  cache.set(p.id, readTag(p));
 },
};
