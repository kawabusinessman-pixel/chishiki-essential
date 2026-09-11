import { world, system } from '../core.js';

export class QIDB {
    #validNamespace;
    #queuedKeys = [];
    #queuedValues = [];
    #settings;
    #quickAccess = new Map();
    #cacheSize = 50;
    #saveRate = 1;
    #runnerId;
    #dimension;
    #sL;

    constructor(namespace = "", cacheSize = 50, saveRate = 1) {
        this.#settings = { namespace };
        this.#cacheSize = Math.max(1, Number(cacheSize) || 50);
        this.#saveRate = Math.max(1, Number(saveRate) || 1);
        this.#validNamespace = /^[A-Za-z0-9_]*$/.test(namespace);

        const VALID_NAMESPACE_ERROR = new Error(`QIDB > ${namespace} isn't a valid namespace. accepted char: A-Z a-z 0-9 _`);
        if (!this.#validNamespace) throw VALID_NAMESPACE_ERROR;

        system.run(() => {
            try { this.#dimension = world.getDimension("overworld"); } catch { }
            let sl = world.scoreboard.getObjective('qidb');
            const player = world.getPlayers()[0];
            
            const setupLocation = (p) => {
                if (!sl) {
                    try { sl = world.scoreboard.addObjective('qidb'); } catch { sl = world.scoreboard.getObjective('qidb'); }
                }
                if (!sl) return;
                if (sl.hasParticipant('x') === false) {
                    sl.setScore('x', Math.floor(p.location.x));
                    sl.setScore('z', Math.floor(p.location.z));
                }
                const sx = sl.getScore('x'), sz = sl.getScore('z');
                this.#sL = { x: sx, y: 318, z: sz };
                try { this.#dimension?.runCommand(`/tickingarea add ${sx} 319 ${sz} ${sx} 318 ${sz} storagearea`); } catch { }
            };

            if (player) setupLocation(player);
            world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
                if (!initialSpawn) return;
                if (!this.#sL) setupLocation(player);
            });

            system.beforeEvents?.shutdown?.subscribe(() => {
                if (this.#queuedKeys.length) {
                    console.error(`QIDB > World closed too early. Namespace: ${this.#settings.namespace}, Lost: ${this.#queuedKeys.length}`);
                }
            });
        });
    }

    #getVec() {
        if (!this.#sL) {
            const sl = world.scoreboard.getObjective('qidb');
            if (sl && sl.hasParticipant('x') && sl.hasParticipant('z')) {
                this.#sL = { x: sl.getScore('x'), y: 318, z: sl.getScore('z') };
            } else {
                this.#sL = { x: 0, y: 318, z: 0 };
            }
        }
        return { x: this.#sL.x, y: this.#sL.y, z: this.#sL.z };
    }

    #remember(key, value) {
        this.#quickAccess.set(key, value);
        while (this.#quickAccess.size > this.#cacheSize) {
            const firstKey = this.#quickAccess.keys().next()?.value;
            if (firstKey !== undefined) this.#quickAccess.delete(firstKey);
            else break;
        }
    }

    #startRunner() {
        if (this.#runnerId !== undefined || this.#queuedKeys.length === 0) return;
        this.#runnerId = system.runInterval(() => {
            if (this.#queuedKeys.length === 0) {
                if (this.#runnerId !== undefined) {
                    system.clearRun(this.#runnerId);
                    this.#runnerId = undefined;
                }
                return;
            }
            const count = Math.min(this.#saveRate, this.#queuedKeys.length);
            for (let i = 0; i < count; i++) {
                const k = this.#queuedKeys.shift();
                const v = this.#queuedValues.shift();
                if (k !== undefined) this.#romSave(k, v);
            }
            if (this.#queuedKeys.length === 0) {
                if (this.#runnerId !== undefined) {
                    system.clearRun(this.#runnerId);
                    this.#runnerId = undefined;
                }
            }
        }, 1);
    }

    #load(key, length) {
        if (key.length > 30) throw new Error(`QIDB > Out of range: <${key}> has more than 30 characters`);
        if (!this.#dimension) {
            try { this.#dimension = world.getDimension("overworld"); } catch { }
        }
        const loc = this.#getVec();
        let canStr = false;
        try {
            world.structureManager.place(key, this.#dimension, loc, { includeEntities: true });
            canStr = true;
        } catch {
            for (let i = 0; i < length; i++)
                this.#dimension.spawnEntity("qidb:storage", loc);
        }
        const entities = this.#dimension.getEntities({ location: loc, maxDistance: 1, type: "qidb:storage" });
        if (entities.length < length) {
            for (let i = entities.length; i < length; i++)
                entities.push(this.#dimension.spawnEntity("qidb:storage", loc));
        }
        if (entities.length > length) {
            for (let i = entities.length; i > length; i--) {
                entities[i - 1].remove();
                entities.pop();
            }
        }
        const invs = [];
        entities.forEach(entity => {
            invs.push(entity.getComponent("inventory").container);
        });
        return { canStr, invs };
    }

    async #save(key, canStr) {
        const loc = this.#getVec();
        if (canStr) world.structureManager.delete(key);
        world.structureManager.createFromWorld(key, this.#dimension, loc, loc, { saveMode: "World", includeEntities: true });
        const entities = this.#dimension.getEntities({ location: loc, maxDistance: 1, type: "qidb:storage" });
        entities.forEach(e => e.remove());
    }

    async #queueSaving(key, value) {
        this.#queuedKeys.push(key);
        this.#queuedValues.push(value);
        this.#startRunner();
    }

    async #romSave(key, value) {
        const { canStr, invs } = this.#load(key, (Math.floor((value?.length - 1) / 256) + 1) || 1);
        invs.forEach((inv, index) => {
            const sz = inv.size;
            if (!value) {
                for (let s = 0; s < sz; s++) inv.setItem(s, undefined);
                world.setDynamicProperty(key, null);
                return;
            }
            if (Array.isArray(value)) {
                const base = sz * index;
                for (let s = 0; s < sz; s++) inv.setItem(s, value[base + s] ?? undefined);
                world.setDynamicProperty(key, (Math.floor((value?.length - 1) / sz) + 1) || 1);
            } else {
                inv.setItem(0, value);
                world.setDynamicProperty(key, false);
            }
        });
        this.#save(key, canStr);
    }

    set(key, value) {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`QIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _`);
        key = this.#settings.namespace + ":" + key;
        if (Array.isArray(value)) {
            if (value.length > 1024) throw new Error(`QIDB > Out of range: <${key}> has more than 1024 ItemStacks`);
            world.setDynamicProperty(key, true);
        } else {
            world.setDynamicProperty(key, false);
        }
        this.#remember(key, value);
        if (this.#queuedKeys.includes(key)) {
            const i = this.#queuedKeys.indexOf(key);
            this.#queuedValues.splice(i, 1);
            this.#queuedKeys.splice(i, 1);
        }
        this.#queueSaving(key, value);
        return true;
    }

    setNow(key, value) {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`QIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _`);
        const fullKey = this.#settings.namespace + ":" + key;
        if (Array.isArray(value)) {
            if (value.length > 1024) throw new Error(`QIDB > Out of range: <${fullKey}> has more than 1024 ItemStacks`);
            world.setDynamicProperty(fullKey, true);
        } else {
            world.setDynamicProperty(fullKey, false);
        }
        this.#remember(fullKey, value);
        const idx = this.#queuedKeys.indexOf(fullKey);
        if (idx !== -1) {
            this.#queuedKeys.splice(idx, 1);
            this.#queuedValues.splice(idx, 1);
        }
        this.#romSave(fullKey, value);
        return true;
    }

    get(key) {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`QIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _`);
        key = this.#settings.namespace + ":" + key;
        if (this.#quickAccess.has(key)) {
            return this.#quickAccess.get(key);
        }
        const structure = world.structureManager.get(key);
        if (!structure) return null;
        const { canStr, invs } = this.#load(key);
        const items = [];
        invs.forEach((inv) => {
            const sz = inv.size;
            for (let s = 0; s < sz; s++) items.push(inv.getItem(s));
        });
        while (items.length > 0 && !items[items.length - 1]) items.pop();
        this.#save(key, canStr);
        const res = world.getDynamicProperty(key) ? items : items[0];
        this.#remember(key, res);
        return res;
    }

    has(key) {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`QIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _`);
        key = this.#settings.namespace + ":" + key;
        const exist = this.#quickAccess.has(key) || world.structureManager.get(key);
        return !!exist;
    }

    delete(key) {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`QIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _`);
        key = this.#settings.namespace + ":" + key;
        if (this.#quickAccess.has(key)) this.#quickAccess.delete(key);
        const structure = world.structureManager.get(key);
        if (structure) world.structureManager.delete(key), world.setDynamicProperty(key, null);
    }

    keys() {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        const allIds = world.getDynamicPropertyIds();
        const ids = [];
        allIds.filter(id => id.startsWith(this.#settings.namespace + ":")).forEach(id => ids.push(id.replace(this.#settings.namespace + ":", "")));
        return ids;
    }

    values() {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        const allIds = world.getDynamicPropertyIds();
        const values = [];
        const filtered = allIds.filter(id => id.startsWith(this.#settings.namespace + ":")).map(id => id.replace(this.#settings.namespace + ":", ""));
        for (const key of filtered) {
            values.push(this.get(key));
        }
        return values;
    }

    clear() {
        if (!this.#validNamespace) throw new Error(`QIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _`);
        const allIds = world.getDynamicPropertyIds();
        const filtered = allIds.filter(id => id.startsWith(this.#settings.namespace + ":")).map(id => id.replace(this.#settings.namespace + ":", ""));
        for (const key of filtered) {
            this.delete(key);
        }
    }
}

export function invalidatePageScanCache() {}
