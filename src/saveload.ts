/*
Copyright 2017 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import globalState from './globalState.js'
import { deserializeObj } from './object.js'
import { SAVE_VERSION, SaveGame, migrateSave } from './saveSchema.js'
import { hydrateStateFromSave, snapshotSaveData } from './saveStateFidelity.js'
import { Scripting } from './scripting.js'
import { serializeSfallGlobals, deserializeSfallGlobals } from './sfallGlobals.js'

export { SAVE_VERSION, SaveGame, migrateSave }

function applyLoadedMapAreaStates(mapAreaStates: Record<number, boolean> | undefined): void {
    if (!mapAreaStates || !globalState.mapAreas) return

    for (const areaID in mapAreaStates) {
        const area = globalState.mapAreas[areaID]
        if (!area) continue
        area.state = mapAreaStates[areaID] === true
    }
}

/**
 * Apply all per-save extended fields that are not covered by `hydrateStateFromSave`.
 *
 * Both the IDB and in-memory load paths are identical from this point onward.
 * Extracting the logic here prevents the two paths from diverging when new
 * save fields are added (e.g. BLK-034 through BLK-047).
 */
function applyExtraSaveState(save: SaveGame): void {
    // BLK-111: Mark this map entry as a save-load so game_loaded() returns 1.
    // The flag is cleared by Scripting.clearMapLoadedFromSave() after the
    // map_enter_p_proc has run (so subsequent enterMap calls see it as fresh).
    globalState.mapLoadedFromSave = true
    // Restore script global variables (GVAR_*) so quest flags and
    // world state set before the save are fully intact on resume.
    if (save.scriptGlobalVars) {
        Scripting.setGlobalVars(save.scriptGlobalVars)
    }
    // Restore per-map script variables (MVAR_*) so map state
    // (e.g. "water pump repaired") is preserved across reloads.
    if (save.mapVars) {
        Scripting.setMapVars(save.mapVars)
    }
    applyLoadedMapAreaStates(save.mapAreaStates)
    // Restore player character-creation traits so trait-based
    // script checks return correct values after loading.
    if (globalState.player && Array.isArray(save.playerCharTraits)) {
        globalState.player.charTraits = new Set(save.playerCharTraits)
    }
    // Restore player perk ranks so perk-based stat bonuses survive reload.
    if (globalState.player && save.playerPerkRanks) {
        globalState.player.perkRanks = { ...save.playerPerkRanks }
    }
    // Restore sfall global variables so that sfall-global-based quest
    // state and mod tracking survive save/load cycles.
    if (save.sfallGlobals) {
        deserializeSfallGlobals(save.sfallGlobals)
    }
    // Restore player character state flags (sneak mode, etc.).
    if (globalState.player && typeof save.playerPcFlags === 'number') {
        globalState.player.pcFlags = save.playerPcFlags
    }
    // Restore active hand selection (BLK-034).
    if (globalState.player && typeof save.playerActiveHand === 'number') {
        ;(globalState.player as any).activeHand = save.playerActiveHand
    }
    // Restore player base stats so current HP and SPECIAL survive reload (BLK-035).
    if (globalState.player && save.playerBaseStats && Object.keys(save.playerBaseStats).length > 0) {
        for (const [statName, statValue] of Object.entries(save.playerBaseStats)) {
            globalState.player.stats.setBase(statName, statValue)
        }
    }
    // Restore player base skill values so skill investments survive reload (BLK-035).
    if (globalState.player && save.playerSkillValues && Object.keys(save.playerSkillValues).length > 0) {
        for (const [skillName, skillValue] of Object.entries(save.playerSkillValues)) {
            globalState.player.skills.setBase(skillName, skillValue)
        }
    }
    // Restore unspent skill points (BLK-035).
    if (globalState.player && typeof save.playerSkillPoints === 'number') {
        globalState.player.skills.skillPoints = save.playerSkillPoints
    }
    // BLK-042: Restore player equipped weapon slots from persisted PIDs.
    // Weapons equipped via drag-drop are removed from inventory and must be
    // re-equipped after the inventory is restored from the save.
    if (globalState.player && typeof save.playerLeftHandPID === 'number') {
        const leftIdx = globalState.player.inventory.findIndex((i: any) => i.pid === save.playerLeftHandPID)
        if (leftIdx !== -1) {
            ;(globalState.player as any).leftHand = globalState.player.inventory[leftIdx]
            globalState.player.inventory.splice(leftIdx, 1)
        }
    }
    if (globalState.player && typeof save.playerRightHandPID === 'number') {
        const rightIdx = globalState.player.inventory.findIndex((i: any) => i.pid === save.playerRightHandPID)
        if (rightIdx !== -1) {
            ;(globalState.player as any).rightHand = globalState.player.inventory[rightIdx]
            globalState.player.inventory.splice(rightIdx, 1)
        }
    }
    // BLK-045: Restore player equipped armor from persisted PID.
    if (globalState.player && typeof save.playerArmorPID === 'number') {
        const armorIdx = globalState.player.inventory.findIndex((i: any) => i.pid === save.playerArmorPID)
        if (armorIdx !== -1) {
            ;(globalState.player as any).equippedArmor = globalState.player.inventory[armorIdx]
            globalState.player.inventory.splice(armorIdx, 1)
        }
    }
    // BLK-047: Restore pending perk-selection credits.
    if (typeof save.playerPerksOwed === 'number') {
        globalState.playerPerksOwed = save.playerPerksOwed
    }
    // BLK-048: Restore player name and gender so character identity survives reload.
    if (globalState.player && typeof save.playerName === 'string') {
        globalState.player.name = save.playerName
    }
    if (globalState.player && (save.playerGender === 'male' || save.playerGender === 'female')) {
        ;(globalState.player as any).gender = save.playerGender
    }
    // BLK-071: Restore car fuel level so the vehicle remains fueled after reload.
    globalState.carFuel = typeof save.carFuel === 'number' ? save.carFuel : 0
    // BLK-075: Restore player injury flags so crippled limbs survive reload.
    // Bit mapping: 0x01=crippledLeftLeg, 0x02=crippledRightLeg,
    //              0x04=crippledLeftArm, 0x08=crippledRightArm, 0x10=blinded.
    if (globalState.player && typeof save.playerInjuryFlags === 'number') {
        const flags = save.playerInjuryFlags
        const p = globalState.player as any
        p.crippledLeftLeg = !!(flags & 0x01)
        p.crippledRightLeg = !!(flags & 0x02)
        p.crippledLeftArm = !!(flags & 0x04)
        p.crippledRightArm = !!(flags & 0x08)
        p.blinded = !!(flags & 0x10)
    }
    // BLK-138: Restore player current HP so a save made at low HP loads at the
    // correct HP rather than being re-derived from base stats (which gives full HP).
    if (globalState.player && typeof save.playerCurrentHp === 'number' && save.playerCurrentHp >= 0) {
        globalState.player.stats.setBase('HP', save.playerCurrentHp)
    }
    // BLK-138: Restore party member current HP so injured companions load at the
    // correct reduced HP.  Keyed by critter name.
    if (save.partyMembersHp && globalState.gParty &&
        typeof globalState.gParty.getPartyMembers === 'function') {
        for (const member of globalState.gParty.getPartyMembers()) {
            const name: string | undefined = member?.name
            if (name && typeof save.partyMembersHp[name] === 'number') {
                const hp = save.partyMembersHp[name]
                if (typeof (member as any).stats?.setBase === 'function') {
                    (member as any).stats.setBase('HP', hp)
                } else if (typeof (member as any).HP === 'number') {
                    (member as any).HP = hp
                }
            }
        }
    }
}

// Saving and loading support

let db: IDBDatabase | null = null
let dbReady = false
let usingMemoryStore = false
let pendingOps: Array<() => void> = []
const memorySaves = new Map<number, SaveGame>()
let nextMemorySaveId = 1

function flushPendingOps(): void {
    const ops = pendingOps
    pendingOps = []
    for (const op of ops) {
        op()
    }
}

function runWhenStorageReady(op: () => void): void {
    if (dbReady || usingMemoryStore) {
        op()
        return
    }

    pendingOps.push(op)
}

function switchToMemoryStore(reason: string): void {
    if (usingMemoryStore) {
        return
    }

    usingMemoryStore = true
    dbReady = false
    db = null
    console.warn(`[SaveLoad] ${reason}. Falling back to in-memory save storage for this session.`)
    flushPendingOps()
}

export function formatSaveDate(save: SaveGame): string {
    const date = new Date(save.timestamp)
    return `${
        date.getMonth() + 1
    }/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
}

function withTransaction(f: (trans: IDBTransaction) => void, finished?: () => void) {
    if (!dbReady || db === null) {
        console.error('[SaveLoad] IndexedDB transaction attempted before DB was ready')
        return
    }

    const trans = db.transaction('saves', 'readwrite')
    if (finished) {
        trans.oncomplete = finished
    }
    trans.onerror = (e: any) => {
        console.error('Database error: ' + (<any>e.target).errorCode)
    }
    f(trans)
}

function nextAvailableMemorySlot(): number {
    while (memorySaves.has(nextMemorySaveId)) {
        nextMemorySaveId += 1
    }

    return nextMemorySaveId
}

function memorySaveList(callback: (saves: SaveGame[]) => void): void {
    const saves = Array.from(memorySaves.values()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    callback(saves)
}

function memorySave(save: SaveGame, slot = -1, callback?: () => void): void {
    const id = slot !== -1 ? slot : nextAvailableMemorySlot()
    save.id = id
    memorySaves.set(id, save)
    if (id >= nextMemorySaveId) {
        nextMemorySaveId = id + 1
    }
    callback?.()
}

function getAll<T>(store: IDBObjectStore, callback?: (result: T[]) => void) {
    const out: T[] = []

    store.openCursor().onsuccess = function (e) {
        const cursor = (<any>e.target).result
        if (cursor) {
            out.push(cursor.value)
            cursor.continue()
        } else if (callback) {
            callback(out)
        }
    }
}

export function saveList(callback: (saves: SaveGame[]) => void): void {
    runWhenStorageReady(() => {
        if (usingMemoryStore) {
            memorySaveList(callback)
            return
        }

        withTransaction((trans) => {
            getAll(trans.objectStore('saves'), callback)
        })
    })
}

export function debugSaveList(): void {
    saveList((saves: SaveGame[]) => {
        console.log('Save List:')
        for (const savegame of saves) {
            console.log('  -', savegame.name, formatSaveDate(savegame), savegame)
        }
    })
}

export function debugSave(): void {
    save('debug', undefined, () => {
        console.log('[SaveLoad] Done')
    })
}

export function save(name: string, slot = -1, callback?: () => void): void {
    // Sync player's charTraits Set → globalState.playerCharTraits array before snapshot.
    if (globalState.player) {
        const traits = globalState.player.charTraits
        globalState.playerCharTraits = traits
            ? Array.from(traits).sort((a, b) => a - b)
            : []
        // Sync player's perkRanks → globalState.playerPerkRanks before snapshot.
        globalState.playerPerkRanks = globalState.player.perkRanks
            ? { ...globalState.player.perkRanks }
            : {}
    }

    const save = snapshotSaveData(name, Date.now(), SAVE_VERSION, globalState)

    // Snapshot Fallout 2 script global variables (GVAR_*) so that quest flags,
    // faction states, and world-event flags survive across save/load cycles.
    save.scriptGlobalVars = { ...Scripting.getGlobalVars() }

    // Snapshot per-map script variables (MVAR_*) so that map state
    // (e.g. "water pump repaired", "enemies cleared") survives reloads.
    save.mapVars = Scripting.getMapVars()

    // Snapshot sfall extended global variables so that mods and scripts using
    // set_sfall_global / get_sfall_global survive across save/load cycles.
    save.sfallGlobals = serializeSfallGlobals()

    // Snapshot player character state flags (pc_flag_on/pc_flag_off) so that
    // sneak mode and other PC flags survive save/load cycles.
    save.playerPcFlags = globalState.player.pcFlags ?? 0

    // Snapshot active hand state (BLK-034) so the player's current weapon slot
    // selection survives across save/load cycles.
    save.playerActiveHand = (globalState.player as any).activeHand ?? 0

    // Snapshot player base stats (HP, radiation, etc.) so that the player's
    // current health and any script-driven SPECIAL changes survive reload (BLK-035).
    if (globalState.player && globalState.player.stats) {
        save.playerBaseStats = { ...globalState.player.stats.baseStats }
    }

    // Snapshot player base skill values so skill-point investments persist (BLK-035).
    if (globalState.player && globalState.player.skills) {
        save.playerSkillValues = { ...globalState.player.skills.baseSkills }
        save.playerSkillPoints = globalState.player.skills.skillPoints
    }

    // BLK-042: Snapshot player equipped weapon slots (leftHand / rightHand).
    // When the player drags a weapon from inventory to an equipment slot, the item
    // is removed from inventory and only accessible via player.leftHand / rightHand.
    // Without this snapshot those weapons would be lost across save/load cycles.
    const playerForWeapon = globalState.player as any
    const leftHand = playerForWeapon.leftHand
    const rightHand = playerForWeapon.rightHand
    if (leftHand && typeof leftHand.pid === 'number' && leftHand.pid >= 1) {
        save.playerLeftHandPID = leftHand.pid
        // Include the serialized weapon in the inventory save so it can be found
        // on load (equipped items are removed from inventory when dragged to slot).
        const alreadyInLeft = save.player.inventory.some((i: any) => i.pid === leftHand.pid)
        if (!alreadyInLeft && typeof leftHand.serialize === 'function') {
            save.player.inventory.push(leftHand.serialize())
        }
    }
    if (rightHand && typeof rightHand.pid === 'number' && rightHand.pid >= 1) {
        save.playerRightHandPID = rightHand.pid
        const alreadyInRight = save.player.inventory.some((i: any) => i.pid === rightHand.pid)
        if (!alreadyInRight && typeof rightHand.serialize === 'function') {
            save.player.inventory.push(rightHand.serialize())
        }
    }

    // BLK-045: Snapshot player equipped armor.
    // Like weapon slots, equipped armor is removed from inventory and stored only
    // in player.equippedArmor, so it would be lost without an explicit snapshot.
    const equippedArmor = (globalState.player as any).equippedArmor
    if (equippedArmor && typeof equippedArmor.pid === 'number' && equippedArmor.pid >= 1) {
        save.playerArmorPID = equippedArmor.pid
        const alreadyInArmor = save.player.inventory.some((i: any) => i.pid === equippedArmor.pid)
        if (!alreadyInArmor && typeof equippedArmor.serialize === 'function') {
            save.player.inventory.push(equippedArmor.serialize())
        }
    }

    // BLK-047: Snapshot pending perk-selection credits.
    save.playerPerksOwed = globalState.playerPerksOwed ?? 0

    // BLK-048: Snapshot player name and gender so character identity survives reload.
    // These fields are set during character creation and may be modified by scripts
    // (e.g. set_name(dude_obj, name)); without persistence they revert to class defaults.
    if (globalState.player) {
        save.playerName = globalState.player.name ?? 'Player'
        save.playerGender = (globalState.player as any).gender ?? 'male'
    }

    // BLK-071: Snapshot car fuel level so the vehicle remains fueled after reload.
    // The car is acquired mid-game and its fuel is managed by sfall opcodes 0x8229/0x822A.
    save.carFuel = globalState.carFuel ?? 0

    // BLK-075: Snapshot player injury flags so crippled limbs survive reload.
    // Bit mapping: 0x01=crippledLeftLeg, 0x02=crippledRightLeg,
    //              0x04=crippledLeftArm, 0x08=crippledRightArm, 0x10=blinded.
    if (globalState.player) {
        const p = globalState.player as any
        let injuryFlags = 0
        if (p.crippledLeftLeg) injuryFlags |= 0x01
        if (p.crippledRightLeg) injuryFlags |= 0x02
        if (p.crippledLeftArm) injuryFlags |= 0x04
        if (p.crippledRightArm) injuryFlags |= 0x08
        if (p.blinded) injuryFlags |= 0x10
        save.playerInjuryFlags = injuryFlags
    }

    // BLK-138: Snapshot player current HP so a save made at low HP loads at
    // the correct HP rather than being re-derived from base stats (full HP).
    if (globalState.player) {
        const currentHP = typeof globalState.player.getStat === 'function'
            ? globalState.player.getStat('HP')
            : (globalState.player as any).HP
        if (typeof currentHP === 'number' && isFinite(currentHP) && currentHP >= 0) {
            save.playerCurrentHp = Math.round(currentHP)
        }
    }

    // BLK-138: Snapshot current HP for each named party member so injured
    // companions load at the correct reduced HP after save/load.
    if (globalState.gParty && typeof globalState.gParty.getPartyMembers === 'function') {
        const members = globalState.gParty.getPartyMembers()
        if (members.length > 0) {
            const partyMembersHp: Record<string, number> = {}
            for (const member of members) {
                const name: string | undefined = member?.name
                if (!name) continue
                const hp = typeof (member as any).getStat === 'function'
                    ? (member as any).getStat('HP')
                    : (member as any).HP
                if (typeof hp === 'number' && isFinite(hp) && hp >= 0) {
                    partyMembersHp[name] = Math.round(hp)
                }
            }
            save.partyMembersHp = partyMembersHp
        }
    }

    const dirtyMapNames = Object.keys(globalState.dirtyMapCache)
    // BLK-080: Guard against null gMap in the log message — save() can be called
    // from tests or edge cases where no map has been loaded yet.
    const currentMapName = globalState.gMap?.name ?? '(none)'
    console.log(
        `[SaveLoad] Saving ${1 + dirtyMapNames.length} maps (current: ${
            currentMapName
        } plus dirty maps: ${dirtyMapNames.join(', ')})`
    )

    if (slot !== -1) {
        save.id = slot
    }

    runWhenStorageReady(() => {
        if (usingMemoryStore) {
            memorySave(save, slot, callback)
            console.log("[SaveLoad] Saving game data in memory as '%s'", name)
            return
        }

        withTransaction((trans) => {
            trans.objectStore('saves').put(save)

            console.log("[SaveLoad] Saving game data as '%s'", name)
        }, callback)
    })
}

export function load(id: number): void {
    // Load stored savegame with id

    runWhenStorageReady(() => {
        if (usingMemoryStore) {
            const rawSave = memorySaves.get(id)
            if (!rawSave) {
                console.error(`[SaveLoad] Save #${id} was not found`)
                return
            }

            try {
                const save: SaveGame = migrateSave(rawSave)

                console.log("[SaveLoad] Loading save #%d ('%s') from %s", id, save.name, formatSaveDate(save))
                hydrateStateFromSave(save, globalState, deserializeObj)
                applyExtraSaveState(save)
            } catch (error) {
                console.error(`[SaveLoad] Could not load save #${id}; leaving current game state unchanged`, {
                    error,
                    saveVersion: rawSave.version,
                    saveName: rawSave.name,
                })
            }
            return
        }

        withTransaction((trans) => {
            const request = trans.objectStore('saves').get(id)

            request.onerror = function () {
                console.error(`[SaveLoad] Failed to read save #${id} from storage`)
            }

            request.onsuccess = function (e) {
                const rawSave = (<any>e.target).result
                if (!rawSave) {
                    console.error(`[SaveLoad] Save #${id} was not found`)
                    return
                }

                try {
                    const save: SaveGame = migrateSave(rawSave)

                    console.log("[SaveLoad] Loading save #%d ('%s') from %s", id, save.name, formatSaveDate(save))
                    hydrateStateFromSave(save, globalState, deserializeObj)
                    applyExtraSaveState(save)
                } catch (error) {
                    console.error(`[SaveLoad] Could not load save #${id}; leaving current game state unchanged`, {
                        error,
                        saveVersion: rawSave.version,
                        saveName: rawSave.name,
                    })
                }
            }
        })
    })
}

export function saveLoadInit(): void {
    if (dbReady || usingMemoryStore) {
        return
    }

    if (typeof indexedDB === 'undefined') {
        switchToMemoryStore('IndexedDB is unavailable in this browser environment')
        return
    }

    const request = indexedDB.open('darkfo', 1)

    request.onupgradeneeded = function () {
        const db = request.result
        db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true })
    }

    request.onsuccess = function () {
        db = request.result
        dbReady = true

        db.onerror = function (e) {
            console.error('Database error: ' + (<any>e.target).errorCode)
        }

        console.log('Established DB connection')
        flushPendingOps()
    }

    request.onerror = function () {
        switchToMemoryStore('IndexedDB failed to initialize')
    }
}

export function resetSaveBackendForTests(): void {
    db = null
    dbReady = false
    usingMemoryStore = false
    pendingOps = []
    memorySaves.clear()
    nextMemorySaveId = 1
}
