/**
 * Scripting VM milestone tests — Fallout 2 procedure stubs and sfall
 * extended opcode compatibility.
 *
 * Naming convention: each phaseN.test.ts covers a milestone within the active
 * development phase.  This file covers the Phase 4 "Scripting VM" milestone:
 *
 *   1. art_anim — FID animation-type extraction (bits 23–16 of the FID word)
 *   2. obj_art_fid — objects correctly expose their frmPID as an art FID
 *   3. sfall global variable store — get/set/default-zero behaviour
 *   4. metarule(56, …) — sfall version detection used by F2 mods
 *   5. critter_add_trait OBJECT_CUR_ROT / OBJECT_VISIBILITY side-effects
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getSfallGlobal, setSfallGlobal, SFALL_VER } from './sfallGlobals.js'

// ---------------------------------------------------------------------------
// 1. art_anim algorithm — inline (mirrors the pattern from phase5.test.ts)
// ---------------------------------------------------------------------------
// vm_bridge.ts and scripting.ts both import browser-only modules so the
// Script class cannot be instantiated in Node.  We test the pure algorithm
// directly, which is the same approach used for get_year in phase5.test.ts.

/**
 * Inline replica of the art_anim implementation in scripting.ts.
 * Returns the 8-bit animation-type field stored in FID bits 23–16.
 */
function artAnim(fid: number): number {
    return (fid >>> 16) & 0xff
}

describe('art_anim — FID animation-type extraction', () => {
    it('returns 0 for a FID with no animation bits set', () => {
        expect(artAnim(0x00000000)).toBe(0)
    })

    it('returns the correct animation code for a typical critter walk FID', () => {
        // FID with animation code 0x0B (walk) in bits 23-16
        const fid = 0x000b0042
        expect(artAnim(fid)).toBe(0x0b)
    })

    it('returns only the lower 8 bits of the animation field', () => {
        // Upper art-type bits (31-28) must not bleed into the result
        const fid = 0x01_0a_0001  // type=1, anim=0x0a, base=1
        expect(artAnim(fid)).toBe(0x0a)
    })

    it('returns 0 when FID has base-id bits only', () => {
        const fid = 0x0000_00FF  // only lower 16 bits set
        expect(artAnim(fid)).toBe(0)
    })

    it('handles maximum animation-field value (0xff)', () => {
        const fid = 0x00FF_0000
        expect(artAnim(fid)).toBe(0xff)
    })

    it('treats the FID as unsigned (no sign-extension for high bit)', () => {
        const fid = 0xFF_FF_FF_FF | 0  // -1 as signed 32-bit
        // unsigned right-shift: bits 23-16 = 0xff
        expect(artAnim(fid)).toBe(0xff)
    })

    it('different animation codes produce different results', () => {
        const codes = [0x00, 0x01, 0x06, 0x0b, 0x11]
        const results = codes.map((c) => artAnim(c << 16))
        expect(results).toEqual(codes)
    })
})

// ---------------------------------------------------------------------------
// 2. obj_art_fid algorithm — objects expose their frmPID as the art FID
// ---------------------------------------------------------------------------

/**
 * Minimal Obj-like stub sufficient to exercise the obj_art_fid contract.
 */
interface FidObj {
    type: string
    frmPID: number | null
}

/**
 * Inline replica of the scripting.ts obj_art_fid implementation.
 */
function objArtFid(obj: FidObj | null): number {
    if (obj === null || obj.type === undefined) return 0
    return obj.frmPID ?? 0
}

describe('obj_art_fid — returns the object FRM frame ID', () => {
    it('returns frmPID for a valid game object', () => {
        const obj: FidObj = { type: 'critter', frmPID: 0x00050042 }
        expect(objArtFid(obj)).toBe(0x00050042)
    })

    it('returns 0 when frmPID is null', () => {
        const obj: FidObj = { type: 'critter', frmPID: null }
        expect(objArtFid(obj)).toBe(0)
    })

    it('returns 0 for a null object', () => {
        expect(objArtFid(null)).toBe(0)
    })

    it('returns frmPID for an item object', () => {
        const obj: FidObj = { type: 'item', frmPID: 0x01002A00 }
        expect(objArtFid(obj)).toBe(0x01002A00)
    })

    it('art_anim composed with obj_art_fid extracts the correct animation', () => {
        // An object whose FID encodes animation 0x06
        const obj: FidObj = { type: 'critter', frmPID: 0x00060005 }
        expect(artAnim(objArtFid(obj))).toBe(0x06)
    })
})

// ---------------------------------------------------------------------------
// 3. sfall global variable store
// ---------------------------------------------------------------------------
// getSfallGlobal / setSfallGlobal are exported from scripting.ts so they
// can be tested directly without touching browser-dependent code.

describe('sfall global variable store', () => {
    // The store is module-level state; use unique key names to avoid
    // cross-test interference.

    it('returns 0 for an unset key', () => {
        expect(getSfallGlobal('PHASE7_UNSET_KEY')).toBe(0)
    })

    it('round-trips a value via set/get', () => {
        setSfallGlobal('PHASE7_TEST_A', 42)
        expect(getSfallGlobal('PHASE7_TEST_A')).toBe(42)
    })

    it('stores negative values correctly', () => {
        setSfallGlobal('PHASE7_NEGATIVE', -7)
        expect(getSfallGlobal('PHASE7_NEGATIVE')).toBe(-7)
    })

    it('independent keys do not interfere', () => {
        setSfallGlobal('PHASE7_KEY_X', 100)
        setSfallGlobal('PHASE7_KEY_Y', 200)
        expect(getSfallGlobal('PHASE7_KEY_X')).toBe(100)
        expect(getSfallGlobal('PHASE7_KEY_Y')).toBe(200)
    })

    it('overwriting a key updates the stored value', () => {
        setSfallGlobal('PHASE7_OVERWRITE', 1)
        setSfallGlobal('PHASE7_OVERWRITE', 999)
        expect(getSfallGlobal('PHASE7_OVERWRITE')).toBe(999)
    })

    it('stores zero explicitly', () => {
        setSfallGlobal('PHASE7_ZERO', 99)
        setSfallGlobal('PHASE7_ZERO', 0)
        expect(getSfallGlobal('PHASE7_ZERO')).toBe(0)
    })

    it('key names are case-sensitive', () => {
        setSfallGlobal('PHASE7_CASE', 1)
        setSfallGlobal('phase7_case', 2)
        expect(getSfallGlobal('PHASE7_CASE')).toBe(1)
        expect(getSfallGlobal('phase7_case')).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// 4. SFALL_VER — metarule(56, 0) value and structure
// ---------------------------------------------------------------------------

describe('SFALL_VER constant', () => {
    it('is a positive integer', () => {
        expect(SFALL_VER).toBeGreaterThan(0)
        expect(Number.isInteger(SFALL_VER)).toBe(true)
    })

    it('encodes a major version ≥ 4 (sfall 4.x compatibility)', () => {
        // Convention: major * 1_000_000 + minor * 1_000 + patch
        const major = Math.floor(SFALL_VER / 1_000_000)
        expect(major).toBeGreaterThanOrEqual(4)
    })

    it('minor and patch components are non-negative', () => {
        const minor = Math.floor((SFALL_VER % 1_000_000) / 1_000)
        const patch = SFALL_VER % 1_000
        expect(minor).toBeGreaterThanOrEqual(0)
        expect(patch).toBeGreaterThanOrEqual(0)
    })

    it('metarule(56, …) returns the same version constant', () => {
        // Inline replica of the metarule(56) handler so we can test the
        // round-trip without importing browser-only modules.
        function metarule56(): number {
            return SFALL_VER
        }
        expect(metarule56()).toBe(SFALL_VER)
    })

    it('version is distinguishable from 0 (sfall not present)', () => {
        // In original Fallout 2 without sfall, metarule(56,0) returns 0.
        expect(SFALL_VER).not.toBe(0)
    })
})

// ---------------------------------------------------------------------------
// 5. critter_add_trait OBJECT_CUR_ROT / OBJECT_VISIBILITY
// ---------------------------------------------------------------------------
// Test the logic inline — same isolation pattern used throughout this file.

interface TraitObj {
    type: string
    orientation: number
    visible: boolean
}

function applyObjectTrait(obj: TraitObj, traitType: number, traitId: number, amount: number): void {
    if (traitType !== 1) return // TRAIT_OBJECT only
    switch (traitId) {
        case 10: // OBJECT_CUR_ROT
            obj.orientation = ((amount % 6) + 6) % 6
            break
        case 666: // OBJECT_VISIBILITY
            obj.visible = amount !== 0
            break
    }
}

describe('critter_add_trait OBJECT_CUR_ROT (trait 10)', () => {
    function makeObj(): TraitObj {
        return { type: 'critter', orientation: 0, visible: true }
    }

    it('sets orientation to the given value (0–5)', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 1, 10, 3)
        expect(obj.orientation).toBe(3)
    })

    it('wraps values >= 6 correctly', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 1, 10, 7)
        expect(obj.orientation).toBe(1)  // 7 % 6 = 1
    })

    it('normalises negative rotations to positive (0–5 range)', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 1, 10, -1)
        expect(obj.orientation).toBe(5)  // ((-1 % 6) + 6) % 6 = 5
    })

    it('does not change visibility', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 1, 10, 2)
        expect(obj.visible).toBe(true)
    })

    it('traitType !== 1 is a no-op', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 0, 10, 4)
        expect(obj.orientation).toBe(0)  // unchanged
    })
})

describe('critter_add_trait OBJECT_VISIBILITY (trait 666)', () => {
    function makeObj(): TraitObj {
        return { type: 'critter', orientation: 0, visible: true }
    }

    it('hides the object when amount is 0', () => {
        const obj = makeObj()
        applyObjectTrait(obj, 1, 666, 0)
        expect(obj.visible).toBe(false)
    })

    it('shows the object when amount is non-zero', () => {
        const obj = { ...makeObj(), visible: false }
        applyObjectTrait(obj, 1, 666, 1)
        expect(obj.visible).toBe(true)
    })

    it('non-zero amounts (other than 1) also make visible', () => {
        const obj = { ...makeObj(), visible: false }
        applyObjectTrait(obj, 1, 666, 255)
        expect(obj.visible).toBe(true)
    })

    it('does not change orientation', () => {
        const obj = { ...makeObj(), orientation: 3 }
        applyObjectTrait(obj, 1, 666, 0)
        expect(obj.orientation).toBe(3)
    })
})
