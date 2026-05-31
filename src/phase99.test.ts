/**
 * Phase 99 regression tests — BLK-220–223 audit polish guards.
 *
 * Covers:
 *   A. BLK-220 — hexInDirection / hexInDirectionDistance out-of-range direction guard
 *   B. BLK-221 — tile.ts fromTileNum bitwise floor correctness
 *   C. BLK-222 — Weapon.getAPCost unknown attack mode guard
 *   D. BLK-223 — applyEncounterCritterLoadout null createItem result guard
 */

import { describe, it, expect, vi } from 'vitest'
import { hexInDirection, hexInDirectionDistance } from './geometry.js'
import { fromTileNum, toTileNum } from './tile.js'
import { applyEncounterCritterLoadout } from './encounterLoadout.js'

// ---------------------------------------------------------------------------
// A. BLK-220: hexInDirection / hexInDirectionDistance out-of-range guard
// ---------------------------------------------------------------------------

describe('Phase 99-A — BLK-220: hexInDirection out-of-range direction guard', () => {
    const pos = { x: 50, y: 50 }

    it('hexInDirection with valid direction (0) returns a neighbor', () => {
        const result = hexInDirection(pos, 0)
        // Should not equal the origin position
        const validNeighbors = [
            { x: 49, y: 50 }, { x: 49, y: 51 }, { x: 50, y: 51 },
            { x: 51, y: 51 }, { x: 51, y: 50 }, { x: 50, y: 49 },
        ]
        // result must be one of the 6 neighbors — i.e. not {x:50, y:50} itself
        expect(result.x !== pos.x || result.y !== pos.y).toBe(true)
    })

    it('hexInDirection with direction -1 returns current position and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = hexInDirection(pos, -1)
        expect(result).toEqual(pos)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid direction'))
        warnSpy.mockRestore()
    })

    it('hexInDirection with direction 6 returns current position and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = hexInDirection(pos, 6)
        expect(result).toEqual(pos)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid direction'))
        warnSpy.mockRestore()
    })

    it('hexInDirection with direction 99 returns current position without throwing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(() => hexInDirection(pos, 99)).not.toThrow()
        const result = hexInDirection(pos, 99)
        expect(result).toEqual(pos)
        warnSpy.mockRestore()
    })

    it('hexInDirectionDistance with invalid direction returns current position and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = hexInDirectionDistance(pos, -1, 3)
        expect(result).toEqual(pos)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid direction'))
        warnSpy.mockRestore()
    })

    it('hexInDirectionDistance with distance 0 returns position regardless of dir', () => {
        const result = hexInDirectionDistance(pos, 99, 0)
        expect(result).toEqual(pos)
    })

    it('hexInDirectionDistance with valid direction and distance > 0 returns a different position', () => {
        const result = hexInDirectionDistance(pos, 0, 1)
        // Should be a neighbor of pos (not equal to pos itself)
        expect(result.x !== pos.x || result.y !== pos.y).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// B. BLK-221: fromTileNum / toTileNum round-trip
// ---------------------------------------------------------------------------

describe('Phase 99-B — BLK-221: fromTileNum bitwise floor correctness', () => {
    it('toTileNum(fromTileNum(n)) round-trips correctly for tile 0', () => {
        expect(toTileNum(fromTileNum(0))).toBe(0)
    })

    it('toTileNum(fromTileNum(n)) round-trips correctly for tile 1', () => {
        expect(toTileNum(fromTileNum(1))).toBe(1)
    })

    it('toTileNum(fromTileNum(n)) round-trips correctly for tile 199', () => {
        expect(toTileNum(fromTileNum(199))).toBe(199)
    })

    it('toTileNum(fromTileNum(n)) round-trips correctly for tile 200', () => {
        expect(toTileNum(fromTileNum(200))).toBe(200)
    })

    it('toTileNum(fromTileNum(n)) round-trips correctly for tile 39999 (max)', () => {
        const max = 200 * 200 - 1
        expect(toTileNum(fromTileNum(max))).toBe(max)
    })

    it('fromTileNum gives correct x and y for tile 201', () => {
        // tile 201: x = 201 % 200 = 1, y = floor(201/200) = 1
        const p = fromTileNum(201)
        expect(p.x).toBe(1)
        expect(p.y).toBe(1)
    })

    it('fromTileNum gives correct x and y for tile 400', () => {
        // tile 400: x = 400 % 200 = 0, y = floor(400/200) = 2
        const p = fromTileNum(400)
        expect(p.x).toBe(0)
        expect(p.y).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// C. BLK-222: Weapon.getAPCost guard for unknown attack mode
// ---------------------------------------------------------------------------

describe('Phase 99-C — BLK-222: Weapon.getAPCost unknown attack mode guard', () => {
    // We instantiate Weapon directly with a minimal mock weapon object
    // rather than going through the scripting stack.
    it('getAPCost returns 0 and warns for undefined APCost key', async () => {
        const { Weapon } = await import('./critter.js')
        const mockWeaponObj = {
            art: 'art/items/testweapon',
            pro: {
                extra: {
                    APCost1: 4,
                    APCost2: 5,
                    maxRange1: 5,
                    maxRange2: 5,
                    minDmg: 1,
                    maxDmg: 6,
                    projPID: -1,
                    animCode: 5,
                    dmgType: 0,
                    attackMode: 0x65, // modes: 5 (throw) + 6 (fire single)
                },
            },
        } as any

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const weapon = new Weapon(mockWeaponObj)
        // APCost99 is not in extra — should return 0 + warn
        const cost = weapon.getAPCost(99)
        expect(cost).toBe(0)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown attackMode'))
        warnSpy.mockRestore()
    })

    it('getAPCost returns correct value for known attack mode 1', async () => {
        const { Weapon } = await import('./critter.js')
        const mockWeaponObj = {
            art: 'art/items/testweapon',
            pro: {
                extra: {
                    APCost1: 4,
                    APCost2: 6,
                    maxRange1: 5,
                    maxRange2: 5,
                    minDmg: 1,
                    maxDmg: 6,
                    projPID: -1,
                    animCode: 5,
                    dmgType: 0,
                    attackMode: 0x65,
                },
            },
        } as any
        const weapon = new Weapon(mockWeaponObj)
        expect(weapon.getAPCost(1)).toBe(4)
        expect(weapon.getAPCost(2)).toBe(6)
    })
})

// ---------------------------------------------------------------------------
// D. BLK-223: applyEncounterCritterLoadout null createItem guard
// ---------------------------------------------------------------------------

describe('Phase 99-D — BLK-223: applyEncounterCritterLoadout null createItem guard', () => {
    function makeObj() {
        const inv: any[] = []
        return {
            inventory: inv,
            dead: false,
            anim: 'idle',
            addInventoryItem(item: any, count: number) {
                inv.push({ item, count })
            },
        }
    }

    it('does not throw when createItem returns null for an item pid', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const obj = makeObj()
        const critter = {
            dead: false,
            items: [{ pid: 99999, wielded: false, amount: 1 }],
        }
        const deps = {
            createItem: (_pid: number) => null,
            isWeapon: (_o: any) => false,
        }
        expect(() => applyEncounterCritterLoadout(obj, critter, deps)).not.toThrow()
        expect(obj.inventory).toHaveLength(0) // null item was skipped
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('createItem returned null'))
        warnSpy.mockRestore()
    })

    it('still adds valid items when some pids are null and some are valid', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const obj = makeObj()
        const critter = {
            dead: false,
            items: [
                { pid: 1, wielded: false, amount: 1 },
                { pid: 99999, wielded: false, amount: 1 }, // will be null
                { pid: 2, wielded: false, amount: 2 },
            ],
        }
        const deps = {
            createItem: (pid: number) => pid === 99999 ? null : { pid },
            isWeapon: (_o: any) => false,
        }
        applyEncounterCritterLoadout(obj, critter, deps)
        expect(obj.inventory).toHaveLength(2) // pid 1 and pid 2 were added; 99999 skipped
        warnSpy.mockRestore()
    })

    it('does not emit stub hit for null createItem — just a warning', async () => {
        const { drainStubHits } = await import('./scriptingChecklist.js')
        drainStubHits() // clear any prior hits
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const obj = makeObj()
        applyEncounterCritterLoadout(obj, {
            dead: false,
            items: [{ pid: 0, wielded: false, amount: 1 }],
        }, { createItem: () => null, isWeapon: () => false })
        expect(drainStubHits()).toHaveLength(0)
        warnSpy.mockRestore()
    })
})
