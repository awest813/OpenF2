/**
 * Phase 56 regression tests.
 *
 * Covers:
 *   A. BLK-048 — Player name and gender persisted in save schema v17
 *   B. BLK-049 — Level-up via critterKill() consistency (Educated perk + perk credits)
 *   C. BLK-050 — set_name(obj, name) opcode (0x80A8) implementation
 *   D. New sfall opcodes 0x81E0–0x81E7
 *   E. Save schema v17 migration and normalization
 *   F. Checklist integrity — all Phase 56 entries present and implemented/partial
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { SAVE_VERSION, migrateSave } from './saveSchema.js'
import globalState from './globalState.js'
import { Player } from './player.js'
import { critterKill } from './critter.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'NPC',
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => 5,
        perkRanks: {},
        ...overrides,
    }
}

function makePlayerObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestPlayer',
        isPlayer: true,
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 1,
        xp: 0,
        level: 1,
        karma: 0,
        gender: 'male',
        perkRanks: {},
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: (s: string) => (s === 'HP' ? 20 : 5), baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => 5,
        charTraits: new Set<number>(),
        ...overrides,
    }
}

// ===========================================================================
// Phase 56-A — BLK-048: Player name and gender save schema v17
// ===========================================================================

describe('Phase 56-A — BLK-048: Player name/gender save schema v17', () => {
    it('SAVE_VERSION is 18', () => {
        expect(SAVE_VERSION).toBe(18)
    })

    it('migrateSave adds playerName="Player" for saves without the field', () => {
        const raw = {
            version: 16,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerName).toBe('Player')
    })

    it('migrateSave preserves existing playerName', () => {
        const raw = {
            version: 16,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            playerName: 'Sulik',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerName).toBe('Sulik')
    })

    it('migrateSave adds playerGender="male" for saves without the field', () => {
        const raw = {
            version: 16,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerGender).toBe('male')
    })

    it('migrateSave preserves playerGender="female"', () => {
        const raw = {
            version: 16,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            playerGender: 'female',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerGender).toBe('female')
    })

    it('normalization rejects invalid playerName (empty string) → "Player"', () => {
        const raw = {
            version: 17,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            playerName: '   ',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerName).toBe('Player')
    })

    it('normalization rejects invalid playerGender → "male"', () => {
        const raw = {
            version: 17,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            playerGender: 'attack_helicopter',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerGender).toBe('male')
    })

    it('migrateSave from version 1 reaches v18 with playerName/playerGender defaults', () => {
        const raw = {
            version: 1,
            name: 'ancient',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: undefined, level: undefined, karma: undefined },
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.version).toBe(18)
        expect(migrated.playerName).toBe('Player')
        expect(migrated.playerGender).toBe('male')
    })
})

// ===========================================================================
// Phase 56-B — BLK-049: critterKill() level-up consistency
// ===========================================================================

describe('Phase 56-B — BLK-049: critterKill level-up consistency', () => {
    beforeEach(() => {
        globalState.playerPerksOwed = 0
    })

    it('critterKill XP path awards perk credit at level 3', () => {
        // Starting at level 1, xp=2999. Adding 1 XP → 3000 total.
        // Threshold at level 1: 1*2/2*1000=1000 → level up to 2
        // Threshold at level 2: 2*3/2*1000=3000 → level up to 3 (3%3==0 → perk)
        // Threshold at level 3: 3*4/2*1000=6000 → 3000<6000 → stop
        const player = makePlayerObj({ xp: 2999, level: 1, skills: { skillPoints: 0, getBase: () => 0, setBase: () => {}, baseSkills: {} } })
        const victim = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            outline: null,
            killType: null,
            pro: { extra: { XPValue: 1 } },
            hasAnimation: () => true,
            staticAnimation: (name: string, cb: () => void) => { if (cb) cb() },
            frame: 0,
            anim: undefined,
        } as any
        critterKill(victim, player as any, false)
        expect(player.level).toBe(3)
        expect(globalState.playerPerksOwed).toBe(1)
    })

    it('critterKill XP path applies Educated perk bonus (+2 pts/rank)', () => {
        // Player with INT=5 and Educated rank 1 should get max(1, 10+2+2)=14 pts
        const player = makePlayerObj({
            xp: 999,
            level: 1,
            perkRanks: { 47: 1 }, // Educated rank 1
            getStat: (s: string) => s === 'INT' ? 5 : 5,
            skills: { skillPoints: 0, getBase: () => 0, setBase: () => {}, baseSkills: {} },
        })
        const victim = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            outline: null,
            killType: null,
            pro: { extra: { XPValue: 1 } }, // pushes to 1000 → level 2
            hasAnimation: () => true,
            staticAnimation: (name: string, cb: () => void) => { if (cb) cb() },
            frame: 0,
            anim: undefined,
        } as any
        critterKill(victim, player as any, false)
        expect(player.level).toBe(2)
        // Expected: 10 + floor(5/2) + 2*1 = 10+2+2 = 14 points
        expect(player.skills.skillPoints).toBe(14)
    })

    it('critterKill XP path does not award perk credit at non-multiple-of-3 level', () => {
        // Player reaching level 2 (not divisible by 3)
        const player = makePlayerObj({
            xp: 999,
            level: 1,
            skills: { skillPoints: 0, getBase: () => 0, setBase: () => {}, baseSkills: {} },
        })
        const victim = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            outline: null,
            killType: null,
            pro: { extra: { XPValue: 1 } },
            hasAnimation: () => true,
            staticAnimation: (name: string, cb: () => void) => { if (cb) cb() },
            frame: 0,
            anim: undefined,
        } as any
        critterKill(victim, player as any, false)
        expect(player.level).toBe(2)
        expect(globalState.playerPerksOwed).toBe(0)
    })

    it('critterKill XP path awards two perk credits when levelling through levels 3 and 6', () => {
        // Starting at level 1, xp=0. Adding 20999 XP → levels up to level 6 exactly.
        // Level 3: 3%3==0 → perk credit 1
        // Level 6: 6%3==0 → perk credit 2
        // Level 7 threshold: 7*8/2*1000=28000 → 20999<28000 → stops at level 6
        const player = makePlayerObj({
            xp: 0,
            level: 1,
            skills: { skillPoints: 0, getBase: () => 0, setBase: () => {}, baseSkills: {} },
        })
        const victim = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            outline: null,
            killType: null,
            pro: { extra: { XPValue: 20999 } },
            hasAnimation: () => true,
            staticAnimation: (name: string, cb: () => void) => { if (cb) cb() },
            frame: 0,
            anim: undefined,
        } as any
        critterKill(victim, player as any, false)
        expect(player.level).toBe(6)
        // Levels 3 and 6 are divisible by 3 → 2 perk credits
        expect(globalState.playerPerksOwed).toBe(2)
    })
})

// ===========================================================================
// Phase 56-C — BLK-050: set_name opcode
// ===========================================================================

describe('Phase 56-C — BLK-050: set_name(obj, name) opcode', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        script._didOverride = false
    })

    it('set_name changes the name of a game object', () => {
        const obj = makeObj({ name: 'OldName' })
        script.set_name(obj, 'NewName')
        expect(obj.name).toBe('NewName')
    })

    it('set_name on player object changes player name', () => {
        const player = makeObj({ name: 'Stranger', isPlayer: true })
        script.set_name(player, 'Chosen One')
        expect(player.name).toBe('Chosen One')
    })

    it('set_name on non-game-object emits warning and is a no-op', () => {
        const notObj = null
        // Should not throw
        expect(() => script.set_name(notObj as any, 'Foo')).not.toThrow()
    })

    it('set_name coerces numeric name to string', () => {
        const obj = makeObj({ name: 'OldName' })
        script.set_name(obj, 42 as any)
        expect(obj.name).toBe('42')
    })

    it('set_name does not generate a stub hit', () => {
        const obj = makeObj({ name: 'OldName' })
        script.set_name(obj, 'NewName')
        const hits = drainStubHits()
        expect(hits.length).toBe(0)
    })
})

// ===========================================================================
// Phase 56-D — New sfall opcodes 0x81E0–0x81E7
// ===========================================================================

describe('Phase 56-D — sfall opcodes 0x81E0–0x81E7', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        script._didOverride = false
    })

    it('get_current_map_id_sfall (0x81E0) returns 0 when no map loaded', () => {
        const result = script.get_current_map_id_sfall()
        expect(typeof result).toBe('number')
        // No map loaded → 0
        expect(result).toBe(0)
    })

    it('get_object_dude_distance (0x81E1) returns -1 for non-game-object', () => {
        const result = script.get_object_dude_distance(null as any)
        expect(result).toBe(-1)
    })

    it('get_object_dude_distance (0x81E1) returns -1 when no player', () => {
        const savedPlayer = globalState.player
        ;(globalState as any).player = null
        const obj = makeObj()
        const result = script.get_object_dude_distance(obj)
        expect(result).toBe(-1)
        ;(globalState as any).player = savedPlayer
    })

    it('get_object_dude_distance (0x81E1) returns 0 when obj is at same position as player', () => {
        const savedPlayer = globalState.player
        const fakePlayer = makeObj({ position: { x: 5, y: 10 } })
        ;(globalState as any).player = fakePlayer
        const obj = makeObj({ position: { x: 5, y: 10 } })
        const result = script.get_object_dude_distance(obj)
        expect(result).toBe(0)
        ;(globalState as any).player = savedPlayer
    })

    it('get_critter_attack_mode_sfall (0x81E2) returns 0 (stub)', () => {
        const obj = makeObj()
        const result = script.get_critter_attack_mode_sfall(obj)
        expect(result).toBe(0)
    })

    it('set_critter_attack_mode_sfall (0x81E3) is a no-op and does not throw', () => {
        const obj = makeObj()
        expect(() => script.set_critter_attack_mode_sfall(obj, 2)).not.toThrow()
    })

    it('get_map_first_run_sfall (0x81E4) returns 0 or 1', () => {
        const result = script.get_map_first_run_sfall()
        expect(result === 0 || result === 1).toBe(true)
    })

    it('get_script_type_sfall (0x81E5) returns 0 (partial)', () => {
        const result = script.get_script_type_sfall()
        expect(result).toBe(0)
    })

    it('get_tile_pid_sfall (0x81E6) returns 0 when no map is loaded', () => {
        const result = script.get_tile_pid_sfall(0, 0)
        expect(result).toBe(0)
    })

    it('get_critter_skill_points (0x81E7) returns 0 for non-critter', () => {
        const item = { type: 'item', pid: 99, name: 'thing', position: { x: 0, y: 0 } }
        const result = script.get_critter_skill_points(item as any, 0)
        expect(result).toBe(0)
    })

    it('get_critter_skill_points (0x81E7) returns base skill for critter', () => {
        const critter = makeObj({
            skills: {
                getBase: (name: string) => name === 'Small Guns' ? 30 : 0,
                setBase: () => {},
                baseSkills: {},
                skillPoints: 0,
            },
        })
        // skill 0 = Small Guns
        const result = script.get_critter_skill_points(critter, 0)
        expect(result).toBe(30)
    })
})

// ===========================================================================
// Phase 56-E — Save schema v17 migration completeness
// ===========================================================================

describe('Phase 56-E — Save schema v17 migration completeness', () => {
    it('migrating from v15 reaches v18 with all expected new fields', () => {
        const raw = {
            version: 15,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.version).toBe(18)
        expect(migrated.playerPerksOwed).toBe(0) // from v16
        expect(migrated.playerName).toBe('Player')  // from v17
        expect(migrated.playerGender).toBe('male')  // from v17
    })

    it('v17 save migrates to v18 preserving existing fields', () => {
        const raw = {
            version: 17,
            name: 'current',
            timestamp: 0,
            currentMap: 'klamath',
            currentElevation: 0,
            playerName: 'Cassidy',
            playerGender: 'female',
            playerPerksOwed: 2,
            player: { position: { x: 5, y: 10 }, orientation: 2, inventory: [], xp: 3000, level: 3, karma: 50 },
            party: [],
            savedMaps: { klamath: { name: 'klamath', objects: [], mapScript: null } },
        }
        const migrated = migrateSave(raw as any)
        expect(migrated.playerName).toBe('Cassidy')
        expect(migrated.playerGender).toBe('female')
        expect(migrated.playerPerksOwed).toBe(2)
        expect(migrated.carFuel).toBe(0) // from v18 migration
        expect(migrated.version).toBe(18)
    })
})

// ===========================================================================
// Phase 56-F — Checklist integrity
// ===========================================================================

describe('Phase 56-F — Checklist integrity', () => {
    const phase56Ids = [
        'blk_048_player_name_gender_save',
        'blk_049_critter_kill_level_up_consistency',
        'blk_050_set_name_opcode',
        'sfall_get_current_map_id_sfall',
        'sfall_get_object_dude_distance',
        'sfall_get_critter_attack_mode',
        'sfall_set_critter_attack_mode',
        'sfall_get_map_first_run_sfall',
        'sfall_get_script_type',
        'sfall_get_tile_pid',
        'sfall_get_critter_skill_points',
    ]

    it('all Phase 56 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase56Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_048_player_name_gender_save',
            'blk_049_critter_kill_level_up_consistency',
            'blk_050_set_name_opcode',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
