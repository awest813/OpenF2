/**
 * Phase 54 regression tests.
 *
 * Covers:
 *   A. BLK-041 — XP auto-award on critter kill (engine awards XP from proto.XPValue)
 *   B. BLK-042 — Player weapon slots (leftHand/rightHand) persisted in save schema v15
 *   C. BLK-043 — Skill points awarded on level-up in give_exp_points (10 + INT/2)
 *   D. BLK-044 — inven_unwield respects activeHand: clears leftHand for activeHand=0,
 *                 rightHand for activeHand=1
 *   E. sfall opcodes 0x81D0–0x81D7 present in opMap (prevents VM stack corruption)
 *   F. Save schema v15 — migration, normalization of playerLeftHandPID/playerRightHandPID
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { SAVE_VERSION, migrateSave } from './saveSchema.js'
import { opMap } from './vm_opcodes.js'
import { SkillSet, StatSet } from './char.js'
import globalState from './globalState.js'

// ===========================================================================
// Phase 54-A — BLK-041: XP auto-award on critter kill
// ===========================================================================

describe('Phase 54-A — BLK-041: XP auto-award on critter kill', () => {
    it('critterKill awards XP from pro.extra.XPValue when source is player', async () => {
        const { critterKill } = await import('./critter.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        // Minimal player stub
        const player: any = {
            isPlayer: true,
            xp: 0,
            level: 1,
            dead: false,
            skills: { skillPoints: 10 },
            getStat: (s: string) => (s === 'INT' ? 5 : 0),
        }
        gs.player = player
        gs.critterKillCounts = {}

        // Minimal victim stub with XP reward
        const victim: any = {
            isPlayer: false,
            dead: false,
            killType: 0,
            outline: null,
            pro: { extra: { XPValue: 150, killType: 0 } },
            hasAnimation: () => false,
            staticAnimation: (_name: string, cb?: () => void) => { if (cb) cb() },
        }

        critterKill(victim, player, false)

        expect(player.xp).toBe(150)
    })

    it('critterKill does not award XP when source is not player', async () => {
        const { critterKill } = await import('./critter.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        const npcAttacker: any = {
            isPlayer: false,
            xp: 0,
            level: 1,
        }
        gs.player = null as any

        const victim: any = {
            isPlayer: false,
            dead: false,
            killType: 0,
            outline: null,
            pro: { extra: { XPValue: 100, killType: 0 } },
            hasAnimation: () => false,
            staticAnimation: (_name: string, cb?: () => void) => { if (cb) cb() },
        }

        critterKill(victim, npcAttacker, false)

        // NPC attacker should not receive XP
        expect(npcAttacker.xp).toBe(0)
    })

    it('critterKill handles missing pro data gracefully (XPValue defaults to 0)', async () => {
        const { critterKill } = await import('./critter.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        const player: any = {
            isPlayer: true,
            xp: 0,
            level: 1,
            dead: false,
            skills: { skillPoints: 0 },
            getStat: () => 5,
        }
        gs.player = player
        gs.critterKillCounts = {}

        // Victim with no pro data
        const victim: any = {
            isPlayer: false,
            dead: false,
            killType: null,
            outline: null,
            pro: undefined,
            hasAnimation: () => false,
            staticAnimation: (_name: string, cb?: () => void) => { if (cb) cb() },
        }

        expect(() => critterKill(victim, player, false)).not.toThrow()
        expect(player.xp).toBe(0) // No XP awarded when pro is missing
    })

    it('critterKill triggers level-up when XP crosses threshold', async () => {
        const { critterKill } = await import('./critter.js')
        const globalStateModule = await import('./globalState.js')
        const gs = globalStateModule.default

        const player: any = {
            isPlayer: true,
            xp: 950,   // 50 XP away from level 2 (requires 1000 XP)
            level: 1,
            dead: false,
            skills: { skillPoints: 10 },
            getStat: (s: string) => (s === 'INT' ? 8 : 0),
        }
        gs.player = player
        gs.critterKillCounts = {}

        const victim: any = {
            isPlayer: false,
            dead: false,
            killType: 0,
            outline: null,
            pro: { extra: { XPValue: 100, killType: 0 } },
            hasAnimation: () => false,
            staticAnimation: (_name: string, cb?: () => void) => { if (cb) cb() },
        }

        critterKill(victim, player, false)

        expect(player.xp).toBe(1050)
        expect(player.level).toBe(2) // Level-up triggered
        // Skill points: 10 + floor(8/2) = 14; initial 10 + 14 = 24
        expect(player.skills.skillPoints).toBe(10 + 14)
    })
})

// ===========================================================================
// Phase 54-B — BLK-042: Save schema v15 — player weapon slot PIDs
// ===========================================================================

describe('Phase 54-B — BLK-042: Save schema v15 — player weapon slot persistence', () => {
    it('SAVE_VERSION was 18 (now superseded to 19)', () => {
        expect(SAVE_VERSION).toBe(19)
    })

    it('v14 save migrates toward v15 with undefined playerLeftHandPID/playerRightHandPID', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerBaseStats: {},
            playerSkillValues: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerLeftHandPID).toBeUndefined()
        expect(migrated.playerRightHandPID).toBeUndefined()
    })

    it('v1 save migrates all the way to v18', () => {
        const raw = {
            name: 'ancient',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerLeftHandPID).toBeUndefined()
        expect(migrated.playerRightHandPID).toBeUndefined()
    })

    it('playerLeftHandPID valid PID is preserved through migration', () => {
        const raw = {
            version: 15,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerLeftHandPID: 42,
            playerRightHandPID: 99,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerLeftHandPID).toBe(42)
        expect(migrated.playerRightHandPID).toBe(99)
    })

    it('playerLeftHandPID of 0 is sanitized to undefined (invalid PID)', () => {
        const raw = {
            version: 15,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerLeftHandPID: 0,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerLeftHandPID).toBeUndefined()
    })

    it('playerRightHandPID negative value is sanitized to undefined', () => {
        const raw = {
            version: 15,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerRightHandPID: -5,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerRightHandPID).toBeUndefined()
    })

    it('playerLeftHandPID non-integer is sanitized to undefined', () => {
        const raw = {
            version: 15,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerLeftHandPID: 3.7,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerLeftHandPID).toBeUndefined()
    })
})

// ===========================================================================
// Phase 54-C — BLK-043: Skill points awarded on level-up
// ===========================================================================

describe('Phase 54-C — BLK-043: Skill points on level-up in give_exp_points', () => {
    // give_exp_points calls uiLog() which touches the DOM.  Install a minimal
    // stub so the DOM-less test environment doesn't crash.
    beforeEach(() => {
        if (typeof (globalThis as any).document === 'undefined') {
            const mockLog = { insertAdjacentHTML: () => {}, scrollTop: 0, scrollHeight: 0 }
            ;(globalThis as any).document = { getElementById: () => mockLog }
        }
    })

    it('give_exp_points awards skill points on level-up (10 + INT/2)', () => {
        Scripting.init('test_phase54_skillpts')
        const script = new (Scripting as any).Script()
        drainStubHits()

        const player: any = {
            xp: 0,
            level: 1,
            skills: new SkillSet(),
            stats: new StatSet({ INT: 8 }),
            getStat: function(s: string) { return this.stats.get(s) },
            perkRanks: {},
        }
        player.skills.skillPoints = 0
        ;(globalState as any).player = player

        // 1000 XP brings level 1 → level 2
        script.give_exp_points(1000)

        expect(player.level).toBe(2)
        // Skill points: 10 + floor(8/2) = 14
        expect(player.skills.skillPoints).toBe(14)
    })

    it('give_exp_points awards correct skill points for INT=5 (10 + 2 = 12)', () => {
        Scripting.init('test_phase54_skillpts2')
        const script = new (Scripting as any).Script()
        drainStubHits()

        const player: any = {
            xp: 0,
            level: 1,
            skills: new SkillSet(),
            stats: new StatSet({ INT: 5 }),
            getStat: function(s: string) { return this.stats.get(s) },
            perkRanks: {},
        }
        player.skills.skillPoints = 0
        ;(globalState as any).player = player

        script.give_exp_points(1000)

        expect(player.level).toBe(2)
        // 10 + floor(5/2) = 12
        expect(player.skills.skillPoints).toBe(12)
    })

    it('give_exp_points applies Educated perk bonus (+2 per rank)', () => {
        Scripting.init('test_phase54_educated')
        const script = new (Scripting as any).Script()
        drainStubHits()

        const player: any = {
            xp: 0,
            level: 1,
            skills: new SkillSet(),
            stats: new StatSet({ INT: 8 }),
            getStat: function(s: string) { return this.stats.get(s) },
            perkRanks: { 47: 1 }, // Educated perk rank 1
        }
        player.skills.skillPoints = 0
        ;(globalState as any).player = player

        script.give_exp_points(1000)

        expect(player.level).toBe(2)
        // 10 + floor(8/2) + 2*1 = 16
        expect(player.skills.skillPoints).toBe(16)
    })
})

// ===========================================================================
// Phase 54-D — BLK-044: inven_unwield respects activeHand
// ===========================================================================

describe('Phase 54-D — BLK-044: inven_unwield respects activeHand', () => {
    beforeEach(() => {
        Scripting.init('test_phase54')
        drainStubHits()
    })

    it('inven_unwield clears leftHand for NPC (always uses rightHand logic)', () => {
        const script = new (Scripting as any).Script()
        drainStubHits()

        const weapon = { type: 'item', subtype: 'weapon', pid: 50 }
        const npc: any = {
            type: 'critter',
            isPlayer: false,
            position: { x: 0, y: 0 },
            rightHand: weapon,
            leftHand: undefined,
            inventory: [],
        }

        script.inven_unwield(npc)
        expect(npc.rightHand).toBeUndefined()
    })

    it('inven_unwield clears leftHand for player when activeHand=0 (primary)', () => {
        const script = new (Scripting as any).Script()
        drainStubHits()

        const weapon = { type: 'item', subtype: 'weapon', pid: 51 }
        const player: any = {
            type: 'critter',
            isPlayer: true,
            activeHand: 0, // primary = leftHand
            position: { x: 0, y: 0 },
            leftHand: weapon,
            rightHand: undefined,
            inventory: [],
        }

        script.inven_unwield(player)
        expect(player.leftHand).toBeUndefined()
        expect(player.rightHand).toBeUndefined() // rightHand unchanged
    })

    it('inven_unwield clears rightHand for player when activeHand=1 (secondary)', () => {
        const script = new (Scripting as any).Script()
        drainStubHits()

        const weapon = { type: 'item', subtype: 'weapon', pid: 52 }
        const player: any = {
            type: 'critter',
            isPlayer: true,
            activeHand: 1, // secondary = rightHand
            position: { x: 0, y: 0 },
            leftHand: { type: 'item', subtype: 'weapon', pid: 9 }, // punch in leftHand
            rightHand: weapon,
            inventory: [],
        }

        script.inven_unwield(player)
        expect(player.rightHand).toBeUndefined()
        expect(player.leftHand?.pid).toBe(9) // punch unchanged
    })
})

// ===========================================================================
// Phase 54-E — sfall opcodes 0x81D0–0x81D7 in opMap
// ===========================================================================

describe('Phase 54-E — sfall opcodes 0x81D0–0x81D7 in opMap', () => {
    const newOpcodes: number[] = [
        0x81D0, // get_game_mode
        0x81D1, // force_encounter
        0x81D2, // force_encounter_with_flags
        0x81D3, // get_last_pers_obj
        0x81D4, // obj_is_disabled
        0x81D5, // obj_remove_script
        0x81D6, // obj_add_script
        0x81D7, // obj_run_proc
    ]

    for (const opcode of newOpcodes) {
        it(`opcode 0x${opcode.toString(16)} is registered in opMap`, () => {
            expect(opMap[opcode]).toBeDefined()
        })
    }

    it('get_game_mode (0x81D0) scripting procedure returns non-negative integer', () => {
        Scripting.init('test_phase54_gamemode')
        const script = new (Scripting as any).Script()
        drainStubHits()
        const mode = script.get_game_mode_sfall()
        expect(typeof mode).toBe('number')
        expect(mode).toBeGreaterThanOrEqual(0)
    })

    it('obj_is_disabled_sfall (0x81D4) returns 0 (partial: no disable tracking)', () => {
        Scripting.init('test_phase54_disabled')
        const script = new (Scripting as any).Script()
        drainStubHits()
        const mockObj = { type: 'critter', position: { x: 0, y: 0 } }
        expect(script.obj_is_disabled_sfall(mockObj)).toBe(0)
    })
})
