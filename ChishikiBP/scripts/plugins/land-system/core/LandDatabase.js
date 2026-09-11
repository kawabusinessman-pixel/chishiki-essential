/**
 * @author kiwo
 * @watermark This code is protected. Redistribution without permission is prohibited.
 */

import { system, world } from '../../../core.js';
import { getProtectedRegions, isInProtectedRegion } from '../../../admin_menu/lobby_protect/config.js';
import { isActiveClaimPropertyKey } from "./ClaimSpatialIndex.js";
const claimCache = new Map();
const playerNameCache = new Map();
const corruptWarned = new Set();
const CACHE_LIFETIME = 300000;
export class LandDatabase {
    static CLAIMS_PREFIX = "land_claims_";
    static SAFE_PREFIX = "land_claims_safe_";
    static CORRUPT_PREFIX = "land_claims_corrupt_";
    static PLAYER_NAMES_KEY = "land_player_names";
    static CLAIM_COUNTER_KEY = "land_claim_counter";
    static OLD_CLAIMS_KEY = "land_claims";
    static CACHE_BUST_KEY = "land_claims_revision";
    static init() {
        system.run(async () => {
            if (!world.getDynamicProperty(this.PLAYER_NAMES_KEY)) {
                world.setDynamicProperty(this.PLAYER_NAMES_KEY, "{}");
            }
            if (!world.getDynamicProperty(this.CLAIM_COUNTER_KEY)) {
                world.setDynamicProperty(this.CLAIM_COUNTER_KEY, "0");
            }
            this._cleanupPollutedClaimKeys();
        });
    }
    static async migrateOldData() {
        try {
            const oldClaimsData = world.getDynamicProperty(this.OLD_CLAIMS_KEY);
            if (!oldClaimsData) return;
            const oldClaims = JSON.parse(oldClaimsData);
            if (!oldClaims || Object.keys(oldClaims).length === 0) return;
            console.warn("[Land System] Starting data migration...");
            const claimsByOwner = {};
            for (const [claimId, claim] of Object.entries(oldClaims)) {
                if (!claim.owner) continue;
                if (!claimsByOwner[claim.owner]) {
                    claimsByOwner[claim.owner] = [];
                }
                claimsByOwner[claim.owner].push({
                    ...claim,
                    claimId
                });
            }
            for (const [ownerId, claims] of Object.entries(claimsByOwner)) {
                this._persistClaims(ownerId, claims);
            }
            const backupKey = `${this.OLD_CLAIMS_KEY}_backup_${Date.now()}`;
            world.setDynamicProperty(backupKey, oldClaimsData);
            world.setDynamicProperty(this.OLD_CLAIMS_KEY, null);
            console.warn("[Land System] Data migration completed successfully!");
            console.warn(`[Land System] Backup saved as: ${backupKey}`);
        } catch (e) {
            console.warn("[Land System] Migration error:", e);
        }
    }
    static getPlayerClaimKey(playerId) {
        return `${this.CLAIMS_PREFIX}${playerId}`;
    }
    static isPlayerClaimKey(propId) {
        return isActiveClaimPropertyKey(propId);
    }
    static playerIdFromClaimKey(propId) {
        return this.isPlayerClaimKey(propId) ? propId.substring(this.CLAIMS_PREFIX.length) : null;
    }
    static _cleanupPollutedClaimKeys() {
        try {
            if (!world.getDynamicProperty(this.CACHE_BUST_KEY)) this.touchRevision();
        } catch (e) {
            console.warn("[Land System] Cleanup error:", e);
        }
    }
    static generateClaimId(playerId) {
        const counter = parseInt(world.getDynamicProperty(this.CLAIM_COUNTER_KEY) || "0");
        const newCounter = counter + 1;
        world.setDynamicProperty(this.CLAIM_COUNTER_KEY, newCounter.toString());
        return `claim_${playerId}_${Date.now()}_${newCounter}`;
    }
    static touchRevision() {
        try {
            const revision = `${Date.now()}_${Math.random()}`;
            world.setDynamicProperty(this.CACHE_BUST_KEY, revision);
            return revision;
        } catch { return ""; }
    }
    static getRevision() {
        try {
            return String(world.getDynamicProperty(this.CACHE_BUST_KEY) ?? "");
        } catch {
            return "";
        }
    }
    static cleanupCache() {
        const now = Date.now();
        for (const [key, data] of claimCache.entries()) {
            if (now - data.timestamp > CACHE_LIFETIME) {
                claimCache.delete(key);
            }
        }
        for (const [key, data] of playerNameCache.entries()) {
            if (now - data.timestamp > CACHE_LIFETIME) {
                playerNameCache.delete(key);
            }
        }
    }
    static getPlayerName(playerId) {
        const cachedName = playerNameCache.get(playerId);
        if (cachedName && Date.now() - cachedName.timestamp < CACHE_LIFETIME) {
            return cachedName.name;
        }
        try {
            const namesData = JSON.parse(world.getDynamicProperty(this.PLAYER_NAMES_KEY) || "{}");
            const name = namesData[playerId] || playerId;
            playerNameCache.set(playerId, {
                name,
                timestamp: Date.now()
            });
            return name;
        } catch {
            return playerId;
        }
    }
    static updatePlayerName(playerId, playerName) {
        try {
            const now = Date.now();
            const cached = playerNameCache.get(playerId);
            if (cached?.name === playerName) {
                cached.timestamp = now;
                return true;
            }
            const namesData = JSON.parse(world.getDynamicProperty(this.PLAYER_NAMES_KEY) || "{}");
            if (namesData[playerId] === playerName) {
                playerNameCache.set(playerId, { name: playerName, timestamp: now });
                return true;
            }
            namesData[playerId] = playerName;
            world.setDynamicProperty(this.PLAYER_NAMES_KEY, JSON.stringify(namesData));
            playerNameCache.set(playerId, { name: playerName, timestamp: now });
            return true;
        } catch {
            return false;
        }
    }
    static async getAllClaims() {
        try {
            const allClaims = [];
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                allClaims.push(...claims);
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        const playerId = this.playerIdFromClaimKey(propId);
                        if (!playerId || processedPlayerIds.has(playerId)) continue;
                        processedPlayerIds.add(playerId);
                        const claims = await this.getPlayerClaims(playerId);
                        allClaims.push(...claims);
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return allClaims;
        } catch (e) {
            console.warn("Error getting all claims:", e);
            return [];
        }
    }
    static _toRaw(data) {
        if (data == null) return "";
        return typeof data === "string" ? data : JSON.stringify(data);
    }
    static _persistClaims(playerId, claims) {
        const json = JSON.stringify(claims);
        world.setDynamicProperty(this.getPlayerClaimKey(playerId), json);
        try { world.setDynamicProperty(`${this.SAFE_PREFIX}${playerId}`, json); } catch { }
        claimCache.delete(playerId);
        this.touchRevision();
    }
    static _backupCorrupt(playerId, raw) {
        try { world.setDynamicProperty(`${this.CORRUPT_PREFIX}${playerId}_${Date.now()}`, this._toRaw(raw)); } catch { }
    }
    static _parseClaims(raw) {
        if (!raw) return { claims: [], dirty: false };
        if (Array.isArray(raw)) return { claims: raw, dirty: false };
        if (typeof raw !== "string") return { claims: [], dirty: false };
        try { return { claims: JSON.parse(raw), dirty: false }; } catch {
            const s = raw.trim(), a = s.indexOf("["), b = s.lastIndexOf("]");
            if (a >= 0 && b > a) { try { return { claims: JSON.parse(s.slice(a, b + 1)), dirty: true }; } catch { } }
            return null;
        }
    }
    static async getPlayerClaims(playerId) {
        const claimKey = this.getPlayerClaimKey(playerId);
        const rev = world.getDynamicProperty(this.CACHE_BUST_KEY) ?? "";
        const cached = claimCache.get(playerId);
        if (cached?.rev === rev && Date.now() - cached.timestamp < CACHE_LIFETIME) return cached.claims;
        const claimsData = world.getDynamicProperty(claimKey);
        const parsed = this._parseClaims(claimsData);
        let claims;
        if (parsed === null) {
            if (!corruptWarned.has(playerId)) {
                corruptWarned.add(playerId);
                this._backupCorrupt(playerId, claimsData);
                console.warn(`[Land System] Corrupted active claims for ${this.getPlayerName(playerId)}; original data preserved and backed up. Manual recovery is required.`);
            }
            claims = [];
        } else {
            claims = parsed.claims;
            if (parsed.dirty) {
                this._backupCorrupt(playerId, claimsData);
                console.warn(`[Land System] Parsed damaged claims for ${this.getPlayerName(playerId)} in memory; active data was not overwritten.`);
            } else if (claims.length && !world.getDynamicProperty(`${this.SAFE_PREFIX}${playerId}`)) {
                try { world.setDynamicProperty(`${this.SAFE_PREFIX}${playerId}`, JSON.stringify(claims)); } catch { }
            }
        }
        if (!Array.isArray(claims)) claims = [];
        claimCache.set(playerId, { claims, timestamp: Date.now(), rev });
        return claims;
    }
    static async getClaimAtPosition(location) {
        if (!location || typeof location.x !== 'number' || typeof location.z !== 'number') {
            return null;
        }
        const claims = await this.getAllClaims();
        if (!claims || claims.length === 0) {
            return null;
        }
        for (const claim of claims) {
            if (this.isPositionInClaim(location, claim)) {
                return claim;
            }
        }
        return null;
    }
    static isPositionInClaim(pos, claim) {
        if (!claim?.pos1 || !claim?.pos2) return false;
        const pos1 = {
            x: Math.floor(claim.pos1.x),
            z: Math.floor(claim.pos1.z)
        };
        const pos2 = {
            x: Math.floor(claim.pos2.x),
            z: Math.floor(claim.pos2.z)
        };
        const minX = Math.min(pos1.x, pos2.x);
        const maxX = Math.max(pos1.x, pos2.x);
        const minZ = Math.min(pos1.z, pos2.z);
        const maxZ = Math.max(pos1.z, pos2.z);
        const x = Math.floor(pos.x);
        const z = Math.floor(pos.z);
        return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    }
    static async checkClaimOverlap(pos1, pos2, excludeClaimId = null) {
        const claims = await this.getAllClaims();
        const minX = Math.min(pos1.x, pos2.x);
        const maxX = Math.max(pos1.x, pos2.x);
        const minZ = Math.min(pos1.z, pos2.z);
        const maxZ = Math.max(pos1.z, pos2.z);
        for (const claim of claims) {
            if (claim.pos1?.dimension !== pos1.dimension) continue;
            if (excludeClaimId && claim.claimId === excludeClaimId) continue;
            const claimMinX = Math.min(claim.pos1.x, claim.pos2.x);
            const claimMaxX = Math.max(claim.pos1.x, claim.pos2.x);
            const claimMinZ = Math.min(claim.pos1.z, claim.pos2.z);
            const claimMaxZ = Math.max(claim.pos1.z, claim.pos2.z);
            if (!(maxX < claimMinX || minX > claimMaxX || maxZ < claimMinZ || minZ > claimMaxZ)) {
                return {
                    overlaps: true,
                    withClaim: claim,
                    overlapType: 'land_claim'
                };
            }
        }
        const lobbyRegions = getProtectedRegions();
        for (const region of lobbyRegions) {
            if (region.pos1?.dimension && region.pos1.dimension !== pos1.dimension) continue;
            const regionMinX = Math.min(region.pos1.x, region.pos2.x);
            const regionMaxX = Math.max(region.pos1.x, region.pos2.x);
            const regionMinZ = Math.min(region.pos1.z, region.pos2.z);
            const regionMaxZ = Math.max(region.pos1.z, region.pos2.z);
            if (!(maxX < regionMinX || minX > regionMaxX || maxZ < regionMinZ || minZ > regionMaxZ)) {
                return {
                    overlaps: true,
                    withClaim: region,
                    overlapType: 'lobby_protection'
                };
            }
        }
        return {
            overlaps: false,
            withClaim: null,
            overlapType: null
        };
    }
    static async saveLandClaim(playerId, claimData) {
        try {
            const claims = await this.getPlayerClaims(playerId);
            const claimId = this.generateClaimId(playerId);
            const allClaims = await this.getAllClaims();
            if (this.checkOverlap(claimData, allClaims)) {
                throw new Error("overlaps");
            }
            const newClaim = {
                ...claimData,
                claimId,
                owner: playerId,
                createdAt: Date.now()
            };
            claims.push(newClaim);
            this._persistClaims(playerId, claims);
            return claimId;
        } catch (e) {
            console.warn("Error saving land claim:", e);
            throw e;
        }
    }
    static async updateClaim(claimId, updatedData) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims[claimIndex] = {
                        ...claims[claimIndex],
                        ...updatedData,
                        lastModified: Date.now()
                    };
                    this._persistClaims(player.id, claims);
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        const playerId = this.playerIdFromClaimKey(propId);
                        if (!playerId || processedPlayerIds.has(playerId)) continue;
                        processedPlayerIds.add(playerId);
                        const claims = await this.getPlayerClaims(playerId);
                        const claimIndex = claims.findIndex(c => c.claimId === claimId);
                        if (claimIndex !== -1) {
                            claims[claimIndex] = {
                                ...claims[claimIndex],
                                ...updatedData,
                                lastModified: Date.now()
                            };
                            this._persistClaims(playerId, claims);
                            return true;
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (e) {
            console.warn("Error updating claim:", e);
            return false;
        }
    }
    static async removeClaim(claimId) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims.splice(claimIndex, 1);
                    this._persistClaims(player.id, claims);
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        const playerId = this.playerIdFromClaimKey(propId);
                        if (!playerId || processedPlayerIds.has(playerId)) continue;
                        processedPlayerIds.add(playerId);
                        const claims = await this.getPlayerClaims(playerId);
                        const claimIndex = claims.findIndex(c => c.claimId === claimId);
                        if (claimIndex !== -1) {
                            claims.splice(claimIndex, 1);
                            this._persistClaims(playerId, claims);
                            return true;
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (e) {
            console.warn("Error removing claim:", e);
            return false;
        }
    }
    static async removeMember(claimId, memberId) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims[claimIndex].members = claims[claimIndex].members.filter(m => m.id !== memberId);
                    this._persistClaims(player.id, claims);
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        const playerId = this.playerIdFromClaimKey(propId);
                        if (!playerId || processedPlayerIds.has(playerId)) continue;
                        processedPlayerIds.add(playerId);
                        const claims = await this.getPlayerClaims(playerId);
                        const claimIndex = claims.findIndex(c => c.claimId === claimId);
                        if (claimIndex !== -1) {
                            claims[claimIndex].members = claims[claimIndex].members.filter(m => m.id !== memberId);
                            this._persistClaims(playerId, claims);
                            return true;
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (error) {
            console.warn("Error removing member:", error);
            return false;
        }
    }
    static checkOverlap(newClaim, existingClaims) {
        for (const claim of existingClaims) {
            if (this.doClaimsOverlap(newClaim, claim)) {
                return true;
            }
        }
        return false;
    }
    static doClaimsOverlap(claim1, claim2) {
        if (claim1.pos1.dimension !== claim2.pos1.dimension) {
            return false;
        }
        const aLeft = Math.min(claim1.pos1.x, claim1.pos2.x);
        const aRight = Math.max(claim1.pos1.x, claim1.pos2.x);
        const aTop = Math.min(claim1.pos1.z, claim1.pos2.z);
        const aBottom = Math.max(claim1.pos1.z, claim1.pos2.z);
        const bLeft = Math.min(claim2.pos1.x, claim2.pos2.x);
        const bRight = Math.max(claim2.pos1.x, claim2.pos2.x);
        const bTop = Math.min(claim2.pos1.z, claim2.pos2.z);
        const bBottom = Math.max(claim2.pos1.z, claim2.pos2.z);
        return !(aLeft > bRight || aRight < bLeft || aTop > bBottom || aBottom < bTop);
    }
}
