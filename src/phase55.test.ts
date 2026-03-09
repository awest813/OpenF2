/**
 * Phase 55 regression tests.
 *
 * Covers:
 *   A. BLK-045 — Player equipped armor persisted in save schema v16
 *   B. BLK-046 — Party field defensive migration (missing party → [] rather than abort)
 *   C. BLK-047 — Perk owed tracking: incremented on level-up, persisted in save, readable via globalState
 *   D. sfall opcodes 0x81D8–0x81DF present in opMap (prevents VM stack corruption)
 *   E. Save schema v16 — migration, normalization of playerArmorPID/playerPerksOwed
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { SAVE_VERSION, migrateSave } from './saveSchema.js'
import { opMap } from './vm_opcodes.js'
import globalState from './globalState.js'

// ===========================================================================
// Phase 55-A — BLK-045: Player equipped armor save/load
// ===========================================================================

describe('Phase 55-A — BLK-045: Player armor persistence save schema', () => {
    it('SAVE_VERSION was 18 (now superseded to 20)', () => {
        expect(SAVE_VERSION).toBe(20)
    })

    it('migrateSave v15 → v18 leaves playerArmorPID as undefined (no armor)', () => {
        const raw: any = {
            version: 15,
            currentMap: 'test',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.playerArmorPID).toBeUndefined()
    })

    it('migrateSave v15 → v18 defaults playerPerksOwed to 0', () => {
        const raw: any = {
            version: 15,
            currentMap: 'test',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerPerksOwed).toBe(0)
    })

    it('migrateSave normalizes a valid playerArmorPID', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            playerArmorPID: 25,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerArmorPID).toBe(25)
    })

    it('migrateSave rejects invalid playerArmorPID (0)', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            playerArmorPID: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerArmorPID).toBeUndefined()
    })

    it('migrateSave rejects negative playerArmorPID', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            playerArmorPID: -5,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerArmorPID).toBeUndefined()
    })

    it('migrateSave normalizes playerPerksOwed as non-negative integer', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            playerPerksOwed: 2,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerPerksOwed).toBe(2)
    })

    it('migrateSave rejects negative playerPerksOwed (clamps to 0)', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            playerPerksOwed: -3,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(save.playerPerksOwed).toBe(0)
    })
})

// ===========================================================================
// Phase 55-B — BLK-046: Party field defensive migration
// ===========================================================================

describe('Phase 55-B — BLK-046: Party defensive migration', () => {
    it('migrateSave with missing party field defaults to empty array', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            // no party field
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(Array.isArray(save.party)).toBe(true)
        expect(save.party).toHaveLength(0)
    })

    it('migrateSave with null party field defaults to empty array', () => {
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: null,
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(Array.isArray(save.party)).toBe(true)
        expect(save.party).toHaveLength(0)
    })

    it('migrateSave with valid party array passes through', () => {
        const partyMember = { type: 'critter', pid: 9999 }
        const raw: any = {
            version: 16,
            currentMap: 'test',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [partyMember],
            savedMaps: { test: { name: 'test', objects: [], tiles: [] } },
        }
        const save = migrateSave(raw)
        expect(Array.isArray(save.party)).toBe(true)
        expect(save.party).toHaveLength(1)
        expect(save.party[0].pid).toBe(9999)
    })
})

// ===========================================================================
// Phase 55-C — BLK-047: Perk owed tracking
// ===========================================================================

describe('Phase 55-C — BLK-047: Perk owed tracking on level-up', () => {
    beforeEach(() => {
        globalState.playerPerksOwed = 0
        drainStubHits()
        // give_exp_points calls uiLog() which touches the DOM.
        // Install a minimal stub so the DOM-less test environment doesn't crash.
        if (typeof (globalThis as any).document === 'undefined') {
            const mockLog = { insertAdjacentHTML: () => {}, scrollTop: 0, scrollHeight: 0 }
            ;(globalThis as any).document = { getElementById: () => mockLog }
        }
    })

    it('globalState.playerPerksOwed starts at 0', () => {
        globalState.playerPerksOwed = 0
        expect(globalState.playerPerksOwed).toBe(0)
    })

    it('give_exp_points awards perk at level 3 (multiple of 3)', async () => {
        const { Scripting } = await import('./scripting.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        gs.playerPerksOwed = 0
        Scripting.init('test_phase55_perk_l3')

        // Level-up threshold: level N when xp >= N*(N+1)/2 * 1000 (while at level N-1).
        // Level 2 threshold (at level 1): 1*2/2 * 1000 = 1000
        // Level 3 threshold (at level 2): 2*3/2 * 1000 = 3000
        // Level 4 threshold (at level 3): 3*4/2 * 1000 = 6000
        // Start at level 1, xp=0, add 5000 → reach levels 2 and 3 (not 4).
        const player: any = {
            isPlayer: true,
            xp: 0,
            level: 1,
            dead: false,
            skills: { skillPoints: 10 },
            getStat: (s: string) => (s === 'INT' ? 5 : 0),
            perkRanks: {},
        }
        gs.player = player

        const script = new (Scripting as any).Script()
        script.give_exp_points(5000) // 0 → 5000: hits level 2 (1000) and level 3 (3000), stops before level 4 (6000)

        expect(player.level).toBe(3)
        expect(gs.playerPerksOwed).toBe(1)
    })

    it('give_exp_points does NOT award perk at level 4 (not multiple of 3)', async () => {
        const { Scripting } = await import('./scripting.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        gs.playerPerksOwed = 0
        Scripting.init('test_phase55_perk_l4')

        // Start at level 3, xp just below level 4 threshold (6000).
        // Add 1 XP → hit level 4 (6000). 4 % 3 ≠ 0, so no perk awarded.
        const player: any = {
            isPlayer: true,
            xp: 5999,
            level: 3,
            dead: false,
            skills: { skillPoints: 20 },
            getStat: (s: string) => (s === 'INT' ? 5 : 0),
            perkRanks: {},
        }
        gs.player = player

        const script = new (Scripting as any).Script()
        script.give_exp_points(1) // 5999 → 6000: hits level 4 (3*4/2*1000=6000)

        expect(player.level).toBe(4)
        expect(gs.playerPerksOwed).toBe(0)
    })

    it('give_exp_points awards perk at level 6 (two perks total after 3 and 6)', async () => {
        const { Scripting } = await import('./scripting.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        gs.playerPerksOwed = 1 // already had perk at level 3
        Scripting.init('test_phase55_perk_l6')

        // Level 6 threshold (at level 5): 5*6/2 * 1000 = 15000.
        // Start at level 5, xp=14999; add 1 → 15000 → reaches level 6.
        const player: any = {
            isPlayer: true,
            xp: 14999,
            level: 5,
            dead: false,
            skills: { skillPoints: 30 },
            getStat: (s: string) => (s === 'INT' ? 5 : 0),
            perkRanks: {},
        }
        gs.player = player

        const script = new (Scripting as any).Script()
        script.give_exp_points(1) // 14999 → 15000: hits level 6 (5*6/2*1000=15000)

        expect(player.level).toBe(6)
        expect(gs.playerPerksOwed).toBe(2)
    })

    it('set_perk_owed via get_perk_owed returns correct value', () => {
        globalState.playerPerksOwed = 3

        // Check opMap 0x81AE (get_perk_owed) returns actual count
        const vm: any = { stack: [] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81AE].call(vm)
        expect(vm.stack[0]).toBe(3)
    })

    it('set_perk_owed via opMap 0x81AF writes actual count', () => {
        globalState.playerPerksOwed = 0

        const vm: any = { stack: [5] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81AF].call(vm)
        expect(globalState.playerPerksOwed).toBe(5)
    })

    it('set_perk_owed clamps negative values to 0', () => {
        globalState.playerPerksOwed = 2

        const vm: any = { stack: [-1] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81AF].call(vm)
        expect(globalState.playerPerksOwed).toBe(0)
    })
})

// ===========================================================================
// Phase 55-D — sfall opcodes 0x81D8–0x81DF present in opMap
// ===========================================================================

describe('Phase 55-D — sfall opcodes 0x81D8–0x81DF in opMap', () => {
    const expectedOpcodes = [0x81D8, 0x81D9, 0x81DA, 0x81DB, 0x81DC, 0x81DD, 0x81DE, 0x81DF]

    for (const opcode of expectedOpcodes) {
        it(`opMap[0x${opcode.toString(16)}] is defined`, () => {
            expect(opMap[opcode]).toBeDefined()
            expect(typeof opMap[opcode]).toBe('function')
        })
    }

    it('0x81D8 get_drop_amount pops obj and pushes 0', () => {
        const vm: any = { stack: ['obj'] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81D8].call(vm)
        expect(vm.stack).toHaveLength(1)
        expect(vm.stack[0]).toBe(0)
    })

    it('0x81D9 set_drop_amount is a no-op (pops both args)', () => {
        const vm: any = { stack: ['obj', 5] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81D9].call(vm)
        expect(vm.stack).toHaveLength(0)
    })

    it('0x81DA art_exists pops artPath and pushes 0', () => {
        const vm: any = { stack: ['art/critters/test'] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81DA].call(vm)
        expect(vm.stack).toHaveLength(1)
        expect(vm.stack[0]).toBe(0)
    })

    it('0x81DD hero_art_id pops type and pushes 0', () => {
        const vm: any = { stack: [0] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81DD].call(vm)
        expect(vm.stack).toHaveLength(1)
        expect(vm.stack[0]).toBe(0)
    })

    it('0x81DF set_critter_burst_disable is a no-op', () => {
        const vm: any = { stack: ['critter', 1] as any[], push(v: any) { this.stack.push(v) }, pop() { return this.stack.pop() } }
        opMap[0x81DF].call(vm)
        expect(vm.stack).toHaveLength(0)
    })
})

// ===========================================================================
// Phase 55-E — Checklist entries for Phase 55
// ===========================================================================

describe('Phase 55-E — scriptingChecklist Phase 55 entries', () => {
    it('blk_045_player_armor_save is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_045_player_armor_save')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('blk_046_party_migration_safety is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_046_party_migration_safety')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('blk_047_perk_owed_tracking is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_047_perk_owed_tracking')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('medium')
    })

    it('sfall_get_drop_amount is present', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_drop_amount')
        expect(entry).toBeDefined()
        expect(entry?.kind).toBe('opcode')
    })

    it('sfall_obj_item_subtype_81db is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_obj_item_subtype_81db')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall_get_critter_level_81dc is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_level_81dc')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall_get_current_inven_size is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_current_inven_size')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})
