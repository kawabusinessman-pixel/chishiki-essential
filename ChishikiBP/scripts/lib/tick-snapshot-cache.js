export function createTickSnapshotCache() {
 let cachedTick = Number.NaN;
 let cachedValue;

 return {
  get(tick, createValue) {
   if (cachedTick !== tick) {
    cachedTick = tick;
    cachedValue = createValue();
   }
   return cachedValue;
  },
  clear() {
   cachedTick = Number.NaN;
   cachedValue = undefined;
  },
 };
}
