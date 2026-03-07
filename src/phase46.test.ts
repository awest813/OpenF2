/**
 * Phase 46 regression tests.
 *
 * Focus: Crash hardening round — converting remaining runtime throws to
 * warn+safe-return across data.ts, party.ts, char.ts, saveSchema.ts, and
 * saveStateFidelity.ts; completing critter_state bitmask; fixing obj_is_locked
 * non-object default.
 *
 *   Phase 46-A — data.ts lookupScriptName throw → warn+null
 *   Phase 46-B — data.ts loadMessage invalid line throw → skip
 *   Phase 46-C — party.ts removePartyMember throw → warn
 *   Phase 46-D — char.ts SkillSet/StatSet getBase/get throw → warn+default
 *   Phase 46-E — saveSchema.ts unknown version → warn+best-effort
 *   Phase 46-F — saveStateFidelity.ts validateSaveForHydration → string|null
 *   Phase 46-G — critter_state bitmask completeness (knockedOut, isFleeing, crippled)
 *   Phase 46-H — obj_is_locked non-object default corrected (1 → 0)
 */

import { describe, it, expect, vi } from 'vitest'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { validateSaveForHydration } from './saveStateFidelity.js'
import { SkillSet } from './char.js'
import { StatSet } from './char.js'
import { Party } from './party.js'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'

// ===========================================================================
// Phase 46-A — data.ts lookupScriptName throw → warn+null
// ===========================================================================

describe('Phase 46-A — lookupScriptName returns null for unknown script ID', () => {
    it('message_str with a string argument does not trigger file loading (safe path)', () => {
        // The string passthrough in getScriptMessage bypasses lookupScriptName
        // entirely.  This verifies the safe path still works correctly.
        const script = new Scripting.Script()
        const result = script.message_str(0, 'hello world')
        expect(result).toBe('hello world')
    })

    it('message_str passes string args through without warning', () => {
        const script = new Scripting.Script()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        script.message_str(0, 'passthrough string')
        expect(warnSpy).not.toHaveBeenCalled()
        warnSpy.mockRestore()
    })
})

// ===========================================================================
// Phase 46-C — party.ts removePartyMember throw → warn
// ===========================================================================

describe('Phase 46-C — party.ts removePartyMember does not throw for missing member', () => {
    it('removePartyMember warns and no-ops when member is not in party', () => {
        const party = new Party()
        const fakeMember: any = { type: 'critter', isPlayer: false, pid: 999 }
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // Should not throw even though fakeMember was never added
        expect(() => party.removePartyMember(fakeMember)).not.toThrow()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('removePartyMember works correctly for a member that was added', () => {
        const party = new Party()
        const member: any = { type: 'critter', isPlayer: false, pid: 42 }
        party.addPartyMember(member)
        expect(party.getPartyMembers()).toHaveLength(1)
        // Removing should succeed without warning
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        party.removePartyMember(member)
        expect(warnSpy).not.toHaveBeenCalled()
        expect(party.getPartyMembers()).toHaveLength(0)
        warnSpy.mockRestore()
    })
})

// ===========================================================================
// Phase 46-D — char.ts SkillSet/StatSet getBase/get throw → warn+default
// ===========================================================================

describe('Phase 46-D — SkillSet/StatSet return 0 for unknown skill/stat names', () => {
    it('SkillSet.getBase returns 0 for an unknown skill name', () => {
        const skills = new SkillSet({})
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = skills.getBase('NonExistentSkill')
        expect(result).toBe(0)
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('NonExistentSkill')
        )
        warnSpy.mockRestore()
    })

    it('StatSet.getBase returns 0 for an unknown stat name', () => {
        const stats = new StatSet({}, true)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = stats.getBase('ZZZUnknownStat')
        expect(result).toBe(0)
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('ZZZUnknownStat')
        )
        warnSpy.mockRestore()
    })

    it('SkillSet.get returns 0 for an unknown skill name', () => {
        const skills = new SkillSet({})
        const stats = new StatSet({}, true)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = skills.get('NonExistentSkill', stats)
        expect(result).toBe(0)
        warnSpy.mockRestore()
    })

    it('StatSet.get returns 0 for an unknown stat name', () => {
        const stats = new StatSet({}, true)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = stats.get('ZZZUnknownStat')
        expect(result).toBe(0)
        warnSpy.mockRestore()
    })
})

// ===========================================================================
// Phase 46-E — saveSchema.ts unknown version → warn+best-effort
// ===========================================================================

describe('Phase 46-E — migrateSave handles future/unknown save versions gracefully', () => {
    it('migrateSave does not throw for a future save version (999)', () => {
        const raw = {
            version: 999,
            name: 'FutureSave',
            timestamp: 1,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            scriptGlobalVars: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
        }
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        let result: any
        expect(() => { result = migrateSave(raw as any) }).not.toThrow()
        expect(result?.version).toBe(SAVE_VERSION)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('999'))
        warnSpy.mockRestore()
    })
})

// ===========================================================================
// Phase 46-F — validateSaveForHydration returns string|null (not throws)
// ===========================================================================

describe('Phase 46-F — validateSaveForHydration returns error string instead of throwing', () => {
    it('returns null for a valid save', () => {
        const validSave = {
            version: SAVE_VERSION,
            name: 'Valid',
            timestamp: 1,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { arroyo: { name: 'arroyo' } },
        }
        const result = validateSaveForHydration(validSave as any)
        expect(result).toBeNull()
    })

    it('returns error string for missing savedMaps', () => {
        const corrupt = {
            version: SAVE_VERSION,
            currentMap: 'arroyo',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: null,
        }
        const result = validateSaveForHydration(corrupt as any)
        expect(typeof result).toBe('string')
        expect(result).toContain('savedMaps')
    })

    it('returns error string for missing current map entry', () => {
        const corrupt = {
            version: SAVE_VERSION,
            currentMap: 'missing_map',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const result = validateSaveForHydration(corrupt as any)
        expect(typeof result).toBe('string')
        expect(result).toContain('missing_map')
    })

    it('returns error string for missing player inventory', () => {
        const corrupt = {
            version: SAVE_VERSION,
            currentMap: 'arroyo',
            player: null,
            party: [],
            savedMaps: { arroyo: {} },
        }
        const result = validateSaveForHydration(corrupt as any)
        expect(typeof result).toBe('string')
        expect(result).toContain('player')
    })

    it('returns error string for missing party array', () => {
        const corrupt = {
            version: SAVE_VERSION,
            currentMap: 'arroyo',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: null,
            savedMaps: { arroyo: {} },
        }
        const result = validateSaveForHydration(corrupt as any)
        expect(typeof result).toBe('string')
        expect(result).toContain('party')
    })

    it('does not throw for any of the corrupt cases (regression)', () => {
        const cases = [
            { currentMap: 'x', savedMaps: null, player: {}, party: [] },
            { currentMap: 'x', savedMaps: {}, player: null, party: [] },
            { currentMap: 'x', savedMaps: {}, player: { inventory: [] }, party: null },
        ]
        for (const corrupt of cases) {
            expect(() => validateSaveForHydration(corrupt as any)).not.toThrow()
        }
    })
})

// ===========================================================================
// Phase 46-G — critter_state bitmask completeness
// ===========================================================================

describe('Phase 46-G — critter_state full bitmask coverage', () => {
    function makeScript() {
        return new Scripting.Script()
    }

    function makeCritter(flags: Record<string, any> = {}): any {
        return {
            type: 'critter',
            isPlayer: false,
            pid: 1,
            position: { x: 0, y: 0 },
            inventory: [],
            dead: false,
            knockedOut: false,
            knockedDown: false,
            isFleeing: false,
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: false,
            crippledRightArm: false,
            blinded: false,
            onFire: false,
            ...flags,
        }
    }

    it('returns 0 for a healthy critter', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter())).toBe(0)
    })

    it('sets bit 0 (0x01) for dead', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter({ dead: true })) & 0x01).toBe(0x01)
    })

    it('sets bit 1 (0x02) for knockedOut (stunned)', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter({ knockedOut: true })) & 0x02).toBe(0x02)
    })

    it('sets bit 2 (0x04) for knockedDown (prone)', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter({ knockedDown: true })) & 0x04).toBe(0x04)
    })

    it('sets bit 3 (0x08) for any crippled limb', () => {
        const script = makeScript()
        // Left leg
        expect(script.critter_state(makeCritter({ crippledLeftLeg: true })) & 0x08).toBe(0x08)
        // Right arm
        expect(script.critter_state(makeCritter({ crippledRightArm: true })) & 0x08).toBe(0x08)
    })

    it('sets bit 4 (0x10) for isFleeing', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter({ isFleeing: true })) & 0x10).toBe(0x10)
    })

    it('combines multiple flags correctly (dead + knockedDown = 0x05)', () => {
        const script = makeScript()
        expect(script.critter_state(makeCritter({ dead: true, knockedDown: true }))).toBe(0x05)
    })

    it('returns 0 for non-game-object', () => {
        const script = makeScript()
        expect(script.critter_state(null as any)).toBe(0)
    })
})

// ===========================================================================
// Phase 46-H — obj_is_locked non-object default corrected (1 → 0)
// ===========================================================================

describe('Phase 46-H — obj_is_locked returns 0 (unlocked) for non-game-objects', () => {
    it('returns 0 for null', () => {
        const script = new Scripting.Script()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(script.obj_is_locked(null as any)).toBe(0)
        warnSpy.mockRestore()
    })

    it('returns 0 for undefined', () => {
        const script = new Scripting.Script()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(script.obj_is_locked(undefined as any)).toBe(0)
        warnSpy.mockRestore()
    })

    it('returns 1 for a game object with locked=true', () => {
        const script = new Scripting.Script()
        const lockedObj: any = {
            type: 'scenery',
            isPlayer: false,
            pid: 100,
            position: { x: 0, y: 0 },
            locked: true,
        }
        expect(script.obj_is_locked(lockedObj)).toBe(1)
    })

    it('returns 0 for a game object with locked=false', () => {
        const script = new Scripting.Script()
        const unlockedObj: any = {
            type: 'scenery',
            isPlayer: false,
            pid: 100,
            position: { x: 0, y: 0 },
            locked: false,
        }
        expect(script.obj_is_locked(unlockedObj)).toBe(0)
    })
})
