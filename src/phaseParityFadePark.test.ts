/**
 * Parity — screen fades (P2-2), AI distance/area_attack, car parking (v26).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fadeOut, fadeIn, getFadeLevel, fadeTicksToMs, setFadeLevelImmediate } from './fade.js'
import { EventBus } from './eventBus.js'
import {
    shouldAdvanceOnTarget,
    allowAreaAttack,
    normalizeDistance,
    normalizeAreaAttack,
} from './combatAi.js'
import {
    setHasCar,
    parkCar,
    getCarPark,
    clearCarPark,
    isCarParkedOnMap,
    serializeCarPark,
    hydrateCarPark,
    clearCarTrunk,
} from './car.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { Scripting } from './scripting.js'

describe('Parity P2-2 — screen fades', () => {
    beforeEach(() => {
        setFadeLevelImmediate(0)
    })

    it('fadeTicksToMs clamps FO2 tick values', () => {
        expect(fadeTicksToMs(5)).toBe(500)
        expect(fadeTicksToMs(0)).toBe(200)
        expect(fadeTicksToMs(9999)).toBe(5000)
    })

    it('fadeOut/fadeIn update level and emit events', () => {
        const outs: any[] = []
        const ins: any[] = []
        EventBus.on('screen:fadeOut', (p) => outs.push(p))
        EventBus.on('screen:fadeIn', (p) => ins.push(p))
        fadeOut(5)
        expect(getFadeLevel()).toBe(1)
        expect(outs).toHaveLength(1)
        fadeIn(5)
        expect(getFadeLevel()).toBe(0)
        expect(ins).toHaveLength(1)
        EventBus.offAll('screen:fadeOut')
        EventBus.offAll('screen:fadeIn')
    })

    it('gfade_out/in drive fade module', () => {
        const script = new (Scripting as any).Script()
        script.gfade_out(3)
        expect(getFadeLevel()).toBe(1)
        script.gfade_in(3)
        expect(getFadeLevel()).toBe(0)
    })
})

describe('Parity P1-1 — distance / area_attack helpers', () => {
    it('normalizeDistance and shouldAdvanceOnTarget', () => {
        expect(normalizeDistance('snipe')).toBe('snipe')
        expect(shouldAdvanceOnTarget('stay', 20, 5)).toBe(false)
        expect(shouldAdvanceOnTarget('charge', 20, 5)).toBe(true)
        expect(shouldAdvanceOnTarget('snipe', 6, 5)).toBe(false) // barely out of range
        expect(shouldAdvanceOnTarget('snipe', 20, 5)).toBe(true) // far out
        expect(shouldAdvanceOnTarget('stay_close', 20, 5)).toBe(false) // beyond +8
        expect(shouldAdvanceOnTarget('stay_close', 10, 5)).toBe(true)
    })

    it('allowAreaAttack gates burst by mode and hit%', () => {
        expect(normalizeAreaAttack('be_sure')).toBe('be_sure')
        expect(allowAreaAttack('always', 10)).toBe(true)
        expect(allowAreaAttack('be_sure', 80)).toBe(true)
        expect(allowAreaAttack('be_sure', 60)).toBe(false)
        expect(allowAreaAttack('be_absolutely_sure', 90)).toBe(true)
        expect(allowAreaAttack('sometimes', 50, () => 0.4)).toBe(true)
        expect(allowAreaAttack('sometimes', 50, () => 0.6)).toBe(false)
    })
})

describe('Parity P1-6 — car parking (save v26)', () => {
    beforeEach(() => {
        clearCarTrunk()
        clearCarPark()
        setHasCar(false)
    })

    afterEach(() => {
        clearCarPark()
        setHasCar(false)
    })

    it('parkCar stores map spot and serialize/hydrate round-trips', () => {
        setHasCar(true)
        expect(parkCar('DenWest', 40, 55, 1)).toBe(true)
        expect(getCarPark()).toEqual({ mapName: 'denwest', x: 40, y: 55, elevation: 1 })
        expect(isCarParkedOnMap('DENWEST')).toBe(true)
        const snap = serializeCarPark()
        clearCarPark()
        hydrateCarPark(snap)
        expect(getCarPark()?.x).toBe(40)
    })

    it('SAVE_VERSION is 26 and v25 migrates null carPark', () => {
        expect(SAVE_VERSION).toBe(26)
        const migrated = migrateSave({
            version: 25,
            name: 'park-mig',
            timestamp: 1,
            currentMap: 'arroyo',
            currentElevation: 0,
            hasCar: true,
            carTrunk: [],
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        } as any)
        expect(migrated.version).toBe(26)
        expect(migrated.carPark).toBeNull()
    })
})
