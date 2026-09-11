import { system, world } from "../core";
function parseStored(raw) {
 return JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}
class Database extends Map {
 static instances = new Map();
 static propIds = null;
 static _flushRun = null;
 static getDatabase(name) {
 if (!Database.instances.has(name)) {
 Database.instances.set(name, new Database(name));
 }
 return Database.instances.get(name);
 }
 static resetAllMigrations() {
 world.setDynamicProperty("isDbMigrated", false);
 }
 static getPropIds() {
 if (Database.propIds === null) Database.propIds = new Set(world.getDynamicPropertyIds() ?? []);
 return Database.propIds;
 }
 static _scheduleFlush() {
 if (Database._flushRun !== null) return;
 Database._flushRun = system.runInterval(() => Database._flushDirty(), 40);
 }
 static _flushDirty() {
 let dirty = false;
 for (const db of Database.instances.values()) {
 if (!db._pendingWrites.size) continue;
 db._flushWrites();
 dirty = true;
 }
 if (!dirty) {
 system.clearRun(Database._flushRun);
 Database._flushRun = null;
 }
 }
 constructor(name) {
 super();
 this.id = `${name}\uE812`;
 this.isInitialized = false;
 this._pendingWrites = new Map();
 this._readyPromise = new Promise((resolve) => {
 this._resolveReady = resolve;
 });
 system.run(() => this._initialize());
 }
 _initialize() {
 if (!world.getDynamicProperty("isDbMigrated")) {
 this._migrateFromScoreboard();
 world.setDynamicProperty("isDbMigrated", true);
 }
 for (const propId of Database.getPropIds()) {
 if (!propId.startsWith(this.id)) continue;
 const key = propId.slice(this.id.length);
 super.set(key, parseStored(world.getDynamicProperty(propId)));
 }
 this.isInitialized = true;
 if (this._resolveReady) this._resolveReady();
 }
 _migrateFromScoreboard() {
 const objName = `DB_${this.id}`;
 const obj = world.scoreboard.getObjective(objName);
 if (!obj) return;
 for (const p of obj.getParticipants()) {
 const dn = p.displayName;
 const idx = dn.indexOf("_");
 if (idx < 0) continue;
 const key = dn.slice(0, idx);
 super.set(key, parseStored(dn.slice(idx + 1)));
 this._pendingWrites.set(key, super.get(key));
 }
 world.getDimension("overworld").runCommand(`scoreboard objectives remove "${objName}"`);
 if (this._pendingWrites.size) Database._scheduleFlush();
 }
 _flushWrites() {
 if (!this._pendingWrites.size) return;
 for (const [k, v] of this._pendingWrites) {
 world.setDynamicProperty(this.id + k, JSON.stringify(v).replace(/[\\"]/g, "\\$&"));
 Database.propIds?.add(this.id + k);
 }
 this._pendingWrites.clear();
 }
 ready() {
 if (this.isInitialized) return Promise.resolve();
 return this._readyPromise;
 }
 	set(key, value) {
		super.set(key, value);
		try {
			world.setDynamicProperty(this.id + key, JSON.stringify(value).replace(/[\\"]/g, "\\$&"));
			Database.propIds?.add(this.id + key);
			this._pendingWrites.delete(key);
		} catch {
			this._pendingWrites.set(key, value);
			Database._scheduleFlush();
		}
		return this;
	}
 get(key, defaultValue) {
 return super.has(key) ? super.get(key) : defaultValue;
 }
 delete(key) {
 const existed = super.delete(key);
 this._pendingWrites.delete(key);
 world.setDynamicProperty(this.id + key, null);
 Database.propIds?.delete(this.id + key);
 return existed;
 }
 clear() {
 for (const k of super.keys()) {
 world.setDynamicProperty(this.id + k, null);
 Database.propIds?.delete(this.id + k);
 }
 this._pendingWrites.clear();
 super.clear();
 }
}
export { Database };
