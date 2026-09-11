function getPlaceholder(text, data) {
 let result = text;
 const allData = Object.assign({}, ...data);
 const MAX_DEPTH = 5;
 for (const [key, value] of Object.entries(allData)) {
 const placeholder = new RegExp(`@${key}`, "g");
 result = result.replace(placeholder, value);
 }
 let depth = 0;
 while (depth < MAX_DEPTH) {
 let changed = false;
 if (!result.includes("@")) break;
 for (const [key, value] of Object.entries(allData)) {
 if (!result.includes(`@${key}`)) continue;
 const placeholder = new RegExp(`@${key}`, "g");
 const newResult = result.replace(placeholder, value);
 if (newResult !== result) {
 result = newResult;
 changed = true;
 }
 }
 if (!changed) break;
 depth++;
 }
 return result;
}
export { getPlaceholder };