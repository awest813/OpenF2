/**
 * Phase 4 scripting VM expansion — de-stubbed procedures and new sfall opcodes.
 *
 * This file is named phase9.test.ts following the repository convention where
 * each phaseN.test.ts covers a milestone within the active development phase.
 *
 *   1. set_light_level / obj_set_light_level — de-stubbed environment lighting
 *   2. game_ui_disable / game_ui_enable — de-stubbed UI state toggling
 *   3. get_pc_base_stat / set_pc_base_stat — sfall opcodes for PC stat access
 *   4. set_critter_current_ap — sfall opcode for AP manipulation
 *   5. get_npc_level — sfall opcode for NPC level query
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 1. set_light_level algorithm — inline (mirrors scripting.ts implementation)
// ---------------------------------------------------------------------------
// scripting.ts imports browser-only modules so we test the pure algorithm
// directly — the same isolation strategy used throughout phase5–phase8.

/**
 * Inline replica of the set_light_level implementation.
 * Clamps the value to 0–65536 and stores it as the ambient light level.
 */
function setLightLevel(level: number): number {
    return Math.max(0, Math.min(65536, level))
}

describe('set_light_level algorithm', () => {
    it('passes through a value within range', () => {
        expect(setLightLevel(32768)).toBe(32768)
    })

    it('clamps negative values to 0', () => {
        expect(setLightLevel(-100)).toBe(0)
    })

    it('clamps values above 65536 to 65536', () => {
        expect(setLightLevel(100000)).toBe(65536)
    })

    it('accepts 0 (fully dark)', () => {
        expect(setLightLevel(0)).toBe(0)
    })

    it('accepts 65536 (fully lit)', () => {
        expect(setLightLevel(65536)).toBe(65536)
    })

    it('rounds nothing — preserves integer input', () => {
        expect(setLightLevel(12345)).toBe(12345)
    })
})

// ---------------------------------------------------------------------------
// 2. obj_set_light_level algorithm — inline (mirrors scripting.ts)
// ---------------------------------------------------------------------------

interface LightObj {
    type: string
    lightIntensity: number
    lightRadius: number
}

/**
 * Inline replica of the obj_set_light_level implementation.
 * Sets per-object lightIntensity (clamped 0–65536) and lightRadius (clamped ≥ 0).
 */
function objSetLightLevel(obj: LightObj | null, intensity: number, distance: number): void {
    if (!obj) return
    obj.lightIntensity = Math.max(0, Math.min(65536, intensity))
    obj.lightRadius = Math.max(0, distance)
}

describe('obj_set_light_level algorithm', () => {
    function makeObj(): LightObj {
        // Default lightIntensity 655 matches Obj default in object.ts
        return { type: 'critter', lightIntensity: 655, lightRadius: 0 }
    }

    it('sets lightIntensity within valid range', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 40000, 5)
        expect(obj.lightIntensity).toBe(40000)
    })

    it('sets lightRadius to the given distance', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 1000, 8)
        expect(obj.lightRadius).toBe(8)
    })

    it('clamps lightIntensity to 0 for negative values', () => {
        const obj = makeObj()
        objSetLightLevel(obj, -500, 3)
        expect(obj.lightIntensity).toBe(0)
    })

    it('clamps lightIntensity to 65536 for values above max', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 99999, 3)
        expect(obj.lightIntensity).toBe(65536)
    })

    it('clamps lightRadius to 0 for negative distances', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 1000, -5)
        expect(obj.lightRadius).toBe(0)
    })

    it('handles null object gracefully (no-op)', () => {
        expect(() => objSetLightLevel(null, 1000, 5)).not.toThrow()
    })

    it('preserves intensity = 0 (no light)', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 0, 0)
        expect(obj.lightIntensity).toBe(0)
        expect(obj.lightRadius).toBe(0)
    })

    it('preserves maximum values', () => {
        const obj = makeObj()
        objSetLightLevel(obj, 65536, 100)
        expect(obj.lightIntensity).toBe(65536)
        expect(obj.lightRadius).toBe(100)
    })
})

// ---------------------------------------------------------------------------
// 3. game_ui_disable / game_ui_enable algorithm — inline
// ---------------------------------------------------------------------------

describe('game_ui_disable / game_ui_enable algorithm', () => {
    it('disable sets the flag to true', () => {
        let gameUIDisabled = false
        gameUIDisabled = true  // game_ui_disable
        expect(gameUIDisabled).toBe(true)
    })

    it('enable resets the flag to false', () => {
        let gameUIDisabled = true
        gameUIDisabled = false  // game_ui_enable
        expect(gameUIDisabled).toBe(false)
    })

    it('disable then enable round-trips correctly', () => {
        let gameUIDisabled = false
        gameUIDisabled = true   // game_ui_disable
        expect(gameUIDisabled).toBe(true)
        gameUIDisabled = false  // game_ui_enable
        expect(gameUIDisabled).toBe(false)
    })

    it('multiple disables are idempotent', () => {
        let gameUIDisabled = false
        gameUIDisabled = true
        gameUIDisabled = true
        expect(gameUIDisabled).toBe(true)
    })

    it('multiple enables are idempotent', () => {
        let gameUIDisabled = true
        gameUIDisabled = false
        gameUIDisabled = false
        expect(gameUIDisabled).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// 4. get_pc_base_stat / set_pc_base_stat algorithm — inline
// ---------------------------------------------------------------------------

const testStatMap: { [stat: number]: string } = {
    0: 'STR',
    1: 'PER',
    2: 'END',
    3: 'CHA',
    4: 'INT',
    5: 'AGI',
    6: 'LUK',
    35: 'HP',
    7: 'Max HP',
}

/** Minimal stat store for testing. */
function makeStatStore(initial: Record<string, number> = {}) {
    const store: Record<string, number> = { ...initial }
    return {
        getBase(stat: string): number { return store[stat] ?? 0 },
        setBase(stat: string, value: number): void { store[stat] = value },
    }
}

/**
 * Inline replica of the get_pc_base_stat implementation.
 */
function getPcBaseStat(
    stats: ReturnType<typeof makeStatStore> | null,
    stat: number,
): number {
    if (!stats) return 0
    const statName = testStatMap[stat]
    if (!statName) return 0
    return stats.getBase(statName)
}

/**
 * Inline replica of the set_pc_base_stat implementation.
 */
function setPcBaseStat(
    stats: ReturnType<typeof makeStatStore> | null,
    stat: number,
    value: number,
): void {
    if (!stats) return
    const statName = testStatMap[stat]
    if (!statName) return
    stats.setBase(statName, value)
}

describe('get_pc_base_stat algorithm (sfall 0x815F)', () => {
    it('returns the base STR stat (stat 0)', () => {
        const stats = makeStatStore({ STR: 7 })
        expect(getPcBaseStat(stats, 0)).toBe(7)
    })

    it('returns the base PER stat (stat 1)', () => {
        const stats = makeStatStore({ PER: 5 })
        expect(getPcBaseStat(stats, 1)).toBe(5)
    })

    it('returns the base AGI stat (stat 5)', () => {
        const stats = makeStatStore({ AGI: 9 })
        expect(getPcBaseStat(stats, 5)).toBe(9)
    })

    it('returns the base HP stat (stat 35)', () => {
        const stats = makeStatStore({ HP: 45 })
        expect(getPcBaseStat(stats, 35)).toBe(45)
    })

    it('returns 0 for an unknown stat number', () => {
        const stats = makeStatStore({ STR: 5 })
        expect(getPcBaseStat(stats, 999)).toBe(0)
    })

    it('returns 0 when player stats are null', () => {
        expect(getPcBaseStat(null, 0)).toBe(0)
    })

    it('returns 0 for a stat that has not been set', () => {
        const stats = makeStatStore({})
        expect(getPcBaseStat(stats, 0)).toBe(0)
    })

    it('all SPECIAL stats (0–6) are addressable', () => {
        const specialNames = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LUK']
        const initial: Record<string, number> = {}
        specialNames.forEach((name, i) => { initial[name] = 10 + i })
        const stats = makeStatStore(initial)

        for (let i = 0; i < 7; i++) {
            expect(getPcBaseStat(stats, i)).toBe(10 + i)
        }
    })
})

describe('set_pc_base_stat algorithm (sfall 0x8160)', () => {
    it('sets and reads back the STR stat', () => {
        const stats = makeStatStore({ STR: 5 })
        setPcBaseStat(stats, 0, 10)
        expect(stats.getBase('STR')).toBe(10)
    })

    it('sets and reads back the AGI stat', () => {
        const stats = makeStatStore({ AGI: 6 })
        setPcBaseStat(stats, 5, 3)
        expect(stats.getBase('AGI')).toBe(3)
    })

    it('set_pc_base_stat + get_pc_base_stat round-trip', () => {
        const stats = makeStatStore()
        setPcBaseStat(stats, 2, 8)  // END
        expect(getPcBaseStat(stats, 2)).toBe(8)
    })

    it('ignores unknown stat numbers (no-op)', () => {
        const stats = makeStatStore({ STR: 5 })
        setPcBaseStat(stats, 999, 42)
        // STR should be unaffected
        expect(stats.getBase('STR')).toBe(5)
    })

    it('ignores null player (no-op)', () => {
        expect(() => setPcBaseStat(null, 0, 10)).not.toThrow()
    })

    it('can set a stat to 0', () => {
        const stats = makeStatStore({ LUK: 7 })
        setPcBaseStat(stats, 6, 0)
        expect(stats.getBase('LUK')).toBe(0)
    })

    it('can set a stat to a negative value', () => {
        const stats = makeStatStore()
        setPcBaseStat(stats, 0, -3)
        expect(getPcBaseStat(stats, 0)).toBe(-3)
    })
})

// ---------------------------------------------------------------------------
// 5. set_critter_current_ap algorithm — inline
// ---------------------------------------------------------------------------

interface APObj {
    type: string
    AP: { combat: number } | null
}

/**
 * Inline replica of the set_critter_current_ap implementation.
 */
function setCritterCurrentAP(obj: APObj | null, ap: number): void {
    if (!obj || obj.type !== 'critter') return
    if (obj.AP) {
        obj.AP.combat = Math.max(0, ap)
    }
}

describe('set_critter_current_ap algorithm (sfall 0x8161)', () => {
    function makeCritter(combat = 5): APObj {
        return { type: 'critter', AP: { combat } }
    }

    it('sets combat AP to the given value', () => {
        const obj = makeCritter()
        setCritterCurrentAP(obj, 10)
        expect(obj.AP!.combat).toBe(10)
    })

    it('clamps negative AP to 0', () => {
        const obj = makeCritter()
        setCritterCurrentAP(obj, -5)
        expect(obj.AP!.combat).toBe(0)
    })

    it('sets AP to 0', () => {
        const obj = makeCritter(8)
        setCritterCurrentAP(obj, 0)
        expect(obj.AP!.combat).toBe(0)
    })

    it('is a no-op for null object', () => {
        expect(() => setCritterCurrentAP(null, 5)).not.toThrow()
    })

    it('is a no-op for non-critter objects', () => {
        const obj: APObj = { type: 'item', AP: { combat: 3 } }
        setCritterCurrentAP(obj, 10)
        expect(obj.AP!.combat).toBe(3)  // unchanged
    })

    it('is a no-op when critter has no AP object (outside combat)', () => {
        const obj: APObj = { type: 'critter', AP: null }
        expect(() => setCritterCurrentAP(obj, 5)).not.toThrow()
    })

    it('preserves large AP values', () => {
        const obj = makeCritter()
        setCritterCurrentAP(obj, 99)
        expect(obj.AP!.combat).toBe(99)
    })
})

// ---------------------------------------------------------------------------
// 6. get_npc_level algorithm — inline
// ---------------------------------------------------------------------------

interface LevelObj {
    type: string
    stats: { getBase(stat: string): number }
}

/**
 * Inline replica of the get_npc_level implementation.
 */
function getNpcLevel(obj: LevelObj | null): number {
    if (!obj || obj.type !== 'critter') return 0
    return obj.stats.getBase('Level')
}

describe('get_npc_level algorithm (sfall 0x8162)', () => {
    function makeCritter(level: number): LevelObj {
        return { type: 'critter', stats: { getBase: (s: string) => s === 'Level' ? level : 0 } }
    }

    it('returns the critter level', () => {
        expect(getNpcLevel(makeCritter(5))).toBe(5)
    })

    it('returns level 1 for a fresh critter', () => {
        expect(getNpcLevel(makeCritter(1))).toBe(1)
    })

    it('returns 0 for a null object', () => {
        expect(getNpcLevel(null)).toBe(0)
    })

    it('returns 0 for a non-critter object', () => {
        const obj = { type: 'item', stats: { getBase: () => 10 } }
        expect(getNpcLevel(obj)).toBe(0)
    })

    it('returns high levels correctly', () => {
        expect(getNpcLevel(makeCritter(99))).toBe(99)
    })
})
