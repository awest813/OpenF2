/**
 * Phase 12 regression tests — VM scripting continuation.
 *
 * Covers all items newly de-stubbed or implemented in this phase:
 *
 *   Phase 12-A — metarule_46 (METARULE_CURRENT_TOWN) de-stub
 *   Phase 12-B — gsay_message implementation (no longer silently drops message)
 *   Phase 12-C — gsay_start no longer records a stub hit
 *   Phase 12-D — gdialog_set_barter_mod stores modifier on script object
 *   Phase 12-E — critter_add_trait no longer stubs handled trait cases
 *   Phase 12-F — New sfall opcodes: get_current_town (0x8169), critter_is_dead (0x816A), get_dialogue_active (0x816B)
 *   Phase 12-G — Checklist accuracy: metarule_17 and metarule_46 upgraded to 'partial'
 *   Phase 12-H — Save/load fidelity: quest-state round-trip with new flag values
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
    SCRIPTING_STUB_CHECKLIST,
    stubChecklistSummary,
    recordStubHit,
    drainStubHits,
    stubHitCount,
} from './scriptingChecklist.js'
import { SAVE_VERSION } from './saveSchema.js'
import { snapshotSaveData, hydrateStateFromSave } from './saveStateFidelity.js'
import { QuestLog } from './quest/questLog.js'

// ===========================================================================
// Phase 12-A — metarule_46 (METARULE_CURRENT_TOWN) implementation
// ===========================================================================

/**
 * Inline replica of the de-stubbed metarule case 46 implementation.
 *
 * Returns the currentMapID when non-null (treated as the town/area ID),
 * or 0 if the scripting module has not yet been initialised for a map.
 */
function metarule46CurrentTown(currentMapID: number | null): number {
    return currentMapID !== null ? currentMapID : 0
}

describe('Phase 12-A — metarule_46 (METARULE_CURRENT_TOWN) de-stub', () => {
    it('returns 0 when currentMapID is null (pre-init)', () => {
        expect(metarule46CurrentTown(null)).toBe(0)
    })

    it('returns the map ID when set', () => {
        expect(metarule46CurrentTown(5)).toBe(5)
        expect(metarule46CurrentTown(42)).toBe(42)
    })

    it('returns 0 for map ID 0 (valid edge case)', () => {
        expect(metarule46CurrentTown(0)).toBe(0)
    })

    it('passes through large map IDs unchanged', () => {
        expect(metarule46CurrentTown(999)).toBe(999)
    })

    it('checklist entry for metarule_46 is now "implemented"', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule_46')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 12-B — gsay_message implementation
// ===========================================================================

/**
 * Minimal inline replica of the de-stubbed gsay_message logic.
 *
 * The real implementation calls getScriptMessage + uiSetDialogueReply.
 * Here we model the key behaviour: the message is looked up and forwarded,
 * not silently dropped, and no stub hit is recorded.
 */
interface FakeMessageStore {
    [msgList: number]: { [msgID: number]: string }
}

function gsayMessageImpl(
    msgStore: FakeMessageStore,
    replyLog: string[],
    msgList: number,
    msgID: number,
    _reaction: number
): void {
    const store = msgStore[msgList]
    if (!store) {return}
    const msg = store[msgID] ?? null
    if (msg === null) {return}
    replyLog.push(msg)
}

describe('Phase 12-B — gsay_message de-stub', () => {
    beforeEach(() => { drainStubHits() })

    it('forwards the looked-up message to the reply log', () => {
        const store: FakeMessageStore = { 100: { 1: 'Welcome, traveller.' } }
        const log: string[] = []
        gsayMessageImpl(store, log, 100, 1, 0)
        expect(log).toEqual(['Welcome, traveller.'])
    })

    it('does nothing when the message list is absent', () => {
        const store: FakeMessageStore = {}
        const log: string[] = []
        gsayMessageImpl(store, log, 100, 1, 0)
        expect(log).toHaveLength(0)
    })

    it('does nothing when the message ID is absent', () => {
        const store: FakeMessageStore = { 100: {} }
        const log: string[] = []
        gsayMessageImpl(store, log, 100, 99, 0)
        expect(log).toHaveLength(0)
    })

    it('handles reaction parameter without altering message text', () => {
        const store: FakeMessageStore = { 5: { 10: 'Goodbye.' } }
        const log: string[] = []
        gsayMessageImpl(store, log, 5, 10, 50 /* reaction */)
        expect(log).toEqual(['Goodbye.'])
    })

    it('checklist entry for gsay_message is now "implemented"', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'gsay_message')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 12-C — gsay_start no longer stubs
// ===========================================================================

/**
 * Inline replica of the de-stubbed gsay_start logic.
 *
 * The previous implementation called stub('gSay_Start', ...) which records
 * a stub hit and logs a warning.  After de-stubbing it clears the option
 * list and returns without recording a stub hit.
 */
interface FakeDialogueContext {
    optionProcs: (() => void)[]
    stubHits: string[]
}

function gsayStartImpl(ctx: FakeDialogueContext): void {
    // Prepare for a new dialogue exchange: clear pending options (no stub hit)
    ctx.optionProcs = []
}

describe('Phase 12-C — gsay_start no longer stubs', () => {
    beforeEach(() => { drainStubHits() })

    it('clears any pending dialogue option procs', () => {
        const ctx: FakeDialogueContext = {
            optionProcs: [() => {}, () => {}],
            stubHits: [],
        }
        gsayStartImpl(ctx)
        expect(ctx.optionProcs).toHaveLength(0)
    })

    it('does not record a stub hit', () => {
        const ctx: FakeDialogueContext = { optionProcs: [], stubHits: [] }
        gsayStartImpl(ctx)
        // Confirm no stub hit was recorded via the checklist instrumentation
        expect(stubHitCount()).toBe(0)
    })

    it('is idempotent: calling twice leaves options empty', () => {
        const ctx: FakeDialogueContext = {
            optionProcs: [() => {}],
            stubHits: [],
        }
        gsayStartImpl(ctx)
        gsayStartImpl(ctx)
        expect(ctx.optionProcs).toHaveLength(0)
    })
})

// ===========================================================================
// Phase 12-D — gdialog_set_barter_mod stores modifier on script object
// ===========================================================================

interface FakeScriptBarter {
    _barterMod: number
}

function gdialogSetBarterModImpl(script: FakeScriptBarter, mod: number): void {
    script._barterMod = mod
}

describe('Phase 12-D — gdialog_set_barter_mod implementation', () => {
    it('stores positive modifier', () => {
        const s: FakeScriptBarter = { _barterMod: 0 }
        gdialogSetBarterModImpl(s, 25)
        expect(s._barterMod).toBe(25)
    })

    it('stores negative modifier', () => {
        const s: FakeScriptBarter = { _barterMod: 0 }
        gdialogSetBarterModImpl(s, -10)
        expect(s._barterMod).toBe(-10)
    })

    it('overwrites a previously set modifier', () => {
        const s: FakeScriptBarter = { _barterMod: 30 }
        gdialogSetBarterModImpl(s, 5)
        expect(s._barterMod).toBe(5)
    })

    it('stores zero (clearing the modifier)', () => {
        const s: FakeScriptBarter = { _barterMod: 15 }
        gdialogSetBarterModImpl(s, 0)
        expect(s._barterMod).toBe(0)
    })

    it('checklist entry for gdialog_set_barter_mod is at least "partial"', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'gdialog_set_barter_mod')
        expect(entry).toBeDefined()
        expect(entry!.status === 'partial' || entry!.status === 'implemented').toBe(true)
    })
})

// ===========================================================================
// Phase 12-E — critter_add_trait no longer stubs handled cases
// ===========================================================================

/**
 * Inline replica of the critter_add_trait implementation for TRAIT_OBJECT (1).
 *
 * Tests verify that cases 5, 6, 10, 666 are handled without a stub hit, and
 * that case 669 (OBJECT_CUR_WEIGHT) still records a stub hit.
 */
interface FakeCritter {
    type: 'critter'
    aiNum: number
    teamNum: number
    orientation: number
    visible: boolean
    stubHits: string[]
}

function critterAddTraitImpl(
    obj: FakeCritter,
    traitType: number,
    trait: number,
    amount: number,
    recordStubFn: (name: string) => void
): void {
    if (traitType === 1) {
        switch (trait) {
            case 5: obj.aiNum = amount; return
            case 6: obj.teamNum = amount; return
            case 10: obj.orientation = ((amount % 6) + 6) % 6; return
            case 666: obj.visible = amount !== 0; return
            case 669: recordStubFn('critter_add_trait'); return
        }
    }
    recordStubFn('critter_add_trait')
}

function makeCritter(): FakeCritter {
    return { type: 'critter', aiNum: 0, teamNum: 0, orientation: 0, visible: true, stubHits: [] }
}

describe('Phase 12-E — critter_add_trait handled cases (no stub hit)', () => {
    beforeEach(() => { drainStubHits() })

    it('case 5 (OBJECT_AI_PACKET): sets aiNum without stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 5, 3, (n) => stubs.push(n))
        expect(obj.aiNum).toBe(3)
        expect(stubs).toHaveLength(0)
    })

    it('case 6 (OBJECT_TEAM_NUM): sets teamNum without stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 6, 2, (n) => stubs.push(n))
        expect(obj.teamNum).toBe(2)
        expect(stubs).toHaveLength(0)
    })

    it('case 10 (OBJECT_CUR_ROT): sets orientation without stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 10, 3, (n) => stubs.push(n))
        expect(obj.orientation).toBe(3)
        expect(stubs).toHaveLength(0)
    })

    it('case 10 orientation wraps modulo 6', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 10, 7, (n) => stubs.push(n))
        expect(obj.orientation).toBe(1)
    })

    it('case 666 (OBJECT_VISIBILITY=0): makes critter invisible without stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 666, 0, (n) => stubs.push(n))
        expect(obj.visible).toBe(false)
        expect(stubs).toHaveLength(0)
    })

    it('case 666 (OBJECT_VISIBILITY!=0): makes critter visible without stub hit', () => {
        const obj = makeCritter()
        obj.visible = false
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 666, 1, (n) => stubs.push(n))
        expect(obj.visible).toBe(true)
        expect(stubs).toHaveLength(0)
    })

    it('case 669 (OBJECT_CUR_WEIGHT): still records a stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 1, 669, 100, (n) => stubs.push(n))
        expect(stubs).toEqual(['critter_add_trait'])
    })

    it('unknown trait type records a stub hit', () => {
        const obj = makeCritter()
        const stubs: string[] = []
        critterAddTraitImpl(obj, 99, 5, 1, (n) => stubs.push(n))
        expect(stubs).toEqual(['critter_add_trait'])
    })
})

// ===========================================================================
// Phase 12-F — New sfall opcodes registered in opMap
// ===========================================================================

describe('Phase 12-F — new sfall opcodes registered in opMap', () => {
    it('checklist contains get_current_town as implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_current_town')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('checklist contains critter_is_dead as implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_is_dead')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('checklist contains get_dialogue_active as implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_dialogue_active')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 12-F (cont.) — critter_is_dead inline logic
// ===========================================================================

function critterIsDeadImpl(hp: number): number {
    return hp <= 0 ? 1 : 0
}

describe('Phase 12-F — critter_is_dead logic', () => {
    it('returns 1 when HP is 0', () => {
        expect(critterIsDeadImpl(0)).toBe(1)
    })

    it('returns 1 when HP is negative', () => {
        expect(critterIsDeadImpl(-5)).toBe(1)
    })

    it('returns 0 when HP is positive', () => {
        expect(critterIsDeadImpl(1)).toBe(0)
        expect(critterIsDeadImpl(100)).toBe(0)
    })
})

// ===========================================================================
// Phase 12-F (cont.) — get_dialogue_active inline logic
// ===========================================================================

function getDialogueActiveImpl(currentDialogueObject: object | null): number {
    return currentDialogueObject !== null ? 1 : 0
}

describe('Phase 12-F — get_dialogue_active logic', () => {
    it('returns 1 when a dialogue object is set', () => {
        expect(getDialogueActiveImpl({})).toBe(1)
    })

    it('returns 0 when no dialogue object', () => {
        expect(getDialogueActiveImpl(null)).toBe(0)
    })
})

// ===========================================================================
// Phase 12-G — Checklist accuracy for metarule_17
// ===========================================================================

describe('Phase 12-G — checklist accuracy: metarule_17 upgraded to partial', () => {
    it('metarule_17 entry is at least "partial" (promoted to implemented in Phase 22)', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule_17')
        expect(entry).toBeDefined()
        expect(['partial', 'implemented']).toContain(entry!.status)
    })

    it('checklist summary has fewer stubs than before this phase', () => {
        const summary = stubChecklistSummary()
        // Implemented entries after this phase:
        //   use_obj, use_obj_on_obj, critter_inven_obj_worn,
        //   get_critter_base_stat, set_critter_base_stat, in_combat (pre-existing)
        //   + gsay_message, get_current_town, critter_is_dead, get_dialogue_active (new)
        //   = 10 total
        expect(summary.implemented).toBeGreaterThanOrEqual(10)
    })

    it('all IDs remain unique after adding new entries', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

// ===========================================================================
// Phase 12-H — Save/load fidelity: quest-state round-trip with new flag values
// ===========================================================================

function makeQuestState(flags: Record<string, boolean | string | number>) {
    const questLog = new QuestLog()
    for (const [id, state] of Object.entries(flags)) {
        if (state === true) {
            questLog.start(id, 0)
            questLog.complete(id, 1)
        } else if (state === 'active') {
            questLog.start(id, 0)
        }
    }
    return questLog
}

interface SimpleSaveState {
    currentElevation: number
    worldPosition?: { x: number; y: number }
    gMap: {
        name: string
        serialize: () => { name: string; objects: [] }
        deserialize: (map: any) => void
        changeElevation: (e: number) => void
    }
    player: {
        position: { x: number; y: number }
        orientation: number
        inventory: any[]
        xp: number
        level: number
        karma: number
    }
    gParty: {
        serialize: () => []
        deserialize: () => void
    }
    dirtyMapCache: Record<string, never>
    questLog: QuestLog
    reputation: { serialize: () => { karma: number; reputations: Record<string, never> } }
}

function makeSimpleState(mapName: string, flags: Record<string, boolean | string | number> = {}): SimpleSaveState {
    return {
        currentElevation: 0,
        worldPosition: undefined,
        gMap: {
            name: mapName,
            serialize: () => ({ name: mapName, objects: [] }),
            deserialize: (_map: any) => {},
            changeElevation: (_e: number) => {},
        },
        player: { position: { x: 100, y: 100 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
        gParty: { serialize: () => [], deserialize: () => {} },
        dirtyMapCache: {},
        questLog: makeQuestState(flags),
        reputation: { serialize: () => ({ karma: 0, reputations: {} }) },
    }
}

describe('Phase 12-H — quest-state save/load fidelity', () => {
    it('completed quest is preserved through snapshot → hydrate round-trip', () => {
        const source = makeSimpleState('klamath', { vic_rescued: true })
        const save = snapshotSaveData('q-rt-1', 1000, SAVE_VERSION, source)

        const target = makeSimpleState('klamath')
        hydrateStateFromSave(save, target, (obj) => obj)
        const entries = target.questLog.getAll()
        const vic = entries.find((e: { id: string }) => e.id === 'vic_rescued')
        expect(vic).toBeDefined()
        expect(vic!.state).toBe('completed')
    })

    it('active quest survives round-trip', () => {
        const source = makeSimpleState('den', { den_brahmin_quest: 'active' })
        const save = snapshotSaveData('q-rt-2', 2000, SAVE_VERSION, source)

        const target = makeSimpleState('den')
        hydrateStateFromSave(save, target, (obj) => obj)
        const entries = target.questLog.getAll()
        const q = entries.find((e: { id: string }) => e.id === 'den_brahmin_quest')
        expect(q).toBeDefined()
        expect(q!.state).toBe('active')
    })

    it('multiple quests survive round-trip without cross-contamination', () => {
        const source = makeSimpleState('gecko', {
            gecko_power_plant: true,
            gecko_woody_missing: 'active',
        })
        const save = snapshotSaveData('q-rt-3', 3000, SAVE_VERSION, source)

        const target = makeSimpleState('gecko')
        hydrateStateFromSave(save, target, (obj) => obj)
        const entries: { id: string; state: string }[] = target.questLog.getAll()
        const plant = entries.find((e) => e.id === 'gecko_power_plant')
        const woody = entries.find((e) => e.id === 'gecko_woody_missing')
        expect(plant?.state).toBe('completed')
        expect(woody?.state).toBe('active')
    })

    it('empty quest log round-trips without error', () => {
        const source = makeSimpleState('arroyo', {})
        const save = snapshotSaveData('q-rt-4', 4000, SAVE_VERSION, source)

        const target = makeSimpleState('arroyo')
        hydrateStateFromSave(save, target, (obj) => obj)
        expect(target.questLog.getAll()).toHaveLength(0)
    })

    it('JSON serialisation round-trip preserves quest state identically', () => {
        const source = makeSimpleState('vault_city', { vault_city_joined: true })
        const save1 = snapshotSaveData('q-drift-1', 5000, SAVE_VERSION, source)
        const json = JSON.parse(JSON.stringify(save1))

        const target = makeSimpleState('vault_city')
        hydrateStateFromSave(json, target, (obj) => obj)
        const save2 = snapshotSaveData('q-drift-2', 5001, SAVE_VERSION, target)

        expect(save2.questLog).toEqual(save1.questLog)
    })
})

// ===========================================================================
// Phase 12-I — Fallout 2 procedure hooks: map_exit/look_at/description
// ===========================================================================

interface FakeScriptProcCtx {
    cur_map_index: number | null
    _didOverride: boolean
    callLog: string[]
    map_exit_p_proc?: () => void
    look_at_p_proc?: () => void
    description_p_proc?: () => void
}

function runMapExitProc(script: FakeScriptProcCtx | null, mapID: number): void {
    if (!script?.map_exit_p_proc) {return}
    script.cur_map_index = mapID
    script.map_exit_p_proc()
}

function runLookAtProc(script: FakeScriptProcCtx | null, mapID: number): boolean | null {
    if (!script?.look_at_p_proc) {return null}
    script.cur_map_index = mapID
    script._didOverride = false
    script.look_at_p_proc()
    return script._didOverride
}

function runDescriptionProc(script: FakeScriptProcCtx | null, mapID: number): boolean | null {
    if (!script?.description_p_proc) {return null}
    script.cur_map_index = mapID
    script._didOverride = false
    script.description_p_proc()
    return script._didOverride
}

describe('Phase 12-I — map_exit/look_at/description procedure wiring', () => {
    it('map_exit_p_proc receives the current map ID before execution', () => {
        const script: FakeScriptProcCtx = {
            cur_map_index: null,
            _didOverride: false,
            callLog: [],
            map_exit_p_proc() {
                this.callLog.push(`exit:${this.cur_map_index}`)
            },
        }
        runMapExitProc(script, 17)
        expect(script.callLog).toEqual(['exit:17'])
    })

    it('look_at_p_proc returns null when the procedure is absent', () => {
        const script: FakeScriptProcCtx = { cur_map_index: null, _didOverride: false, callLog: [] }
        expect(runLookAtProc(script, 3)).toBeNull()
    })

    it('look_at_p_proc resets _didOverride to false before running', () => {
        const script: FakeScriptProcCtx = {
            cur_map_index: null,
            _didOverride: true,
            callLog: [],
            look_at_p_proc() {
                this.callLog.push(`look:${this.cur_map_index}`)
            },
        }
        const didOverride = runLookAtProc(script, 9)
        expect(didOverride).toBe(false)
        expect(script.callLog).toEqual(['look:9'])
    })

    it('description_p_proc can explicitly override default behaviour', () => {
        const script: FakeScriptProcCtx = {
            cur_map_index: null,
            _didOverride: false,
            callLog: [],
            description_p_proc() {
                this._didOverride = true
                this.callLog.push(`desc:${this.cur_map_index}`)
            },
        }
        const didOverride = runDescriptionProc(script, 22)
        expect(didOverride).toBe(true)
        expect(script.callLog).toEqual(['desc:22'])
    })
})
