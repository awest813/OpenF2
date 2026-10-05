/**
 * Parity Slice H (partial) — rest encounter interrupts + Highwayman car stub (P1-11 / P1-6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import {
    restForHours,
    bindTimedEventList,
    advanceGameTime,
    TICKS_PER_HOUR,
} from './character/rest.js'
import { Scripting } from './scripting.js'
import { EventBus } from './eventBus.js'
import {
    hasCar,
    setHasCar,
    getCarFuel,
    setCarFuel,
    worldmapTravelSpeed,
    burnCarFuelOnTravel,
    CAR_FUEL_BURN_PER_TICK,
    CAR_SPEED_MULT,
} from './car.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import {
    processRadPoisonUpTo,
    readPlayerPoisonLevel,
} from './character/radiationPoison.js'
import { Worldmap } from './worldmap.js'

describe('Pip-Boy rest (pipboy.cc pipboyRest)', () => {
    let savedPlayer: typeof globalState.player
    let savedTick: number
    let savedCombat: boolean

    beforeEach(() => {
        savedPlayer = globalState.player
        savedTick = globalState.gameTickTime
        savedCombat = globalState.inCombat
        Scripting.timeEventList.length = 0
        bindTimedEventList(Scripting.timeEventList)
        globalState.player = new Player()
        globalState.gameTickTime = 50_000
        globalState.inCombat = false
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.gameTickTime = savedTick
        globalState.inCombat = savedCombat
        Scripting.timeEventList.length = 0
    })

    it('restForHours rests every hour asked (no random ambushes in pipboyRest)', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.0)
        const before = globalState.gameTickTime
        const result = restForHours(4)
        expect(result.hoursCompleted).toBe(4)
        expect(result.ticksAdvanced).toBe(4 * TICKS_PER_HOUR)
        expect(globalState.gameTickTime).toBe(before + 4 * TICKS_PER_HOUR)
        spy.mockRestore()
    })

    it('advanceGameTime runs poison ticks once, in time order', () => {
        const player = globalState.player as Player
        player.stats.setBase('Max HP', 100)
        player.stats.setBase('HP', 100)
        globalState.gameTickTime = 0
        processRadPoisonUpTo(0)
        player.stats.setBase('Poison Level', 50)
        ;(player as any).radPoison.poisonTick = 100

        advanceGameTime(TICKS_PER_HOUR, { heal: false, tickEffects: true })
        const afterRestHp = player.stats.get('HP') ?? 100
        expect(afterRestHp).toBeLessThan(100)

        processRadPoisonUpTo(globalState.gameTickTime)
        expect(player.stats.get('HP')).toBe(afterRestHp)
        expect(readPlayerPoisonLevel()).toBeLessThan(50)
    })
})

describe('Parity — Highwayman car stub (P1-6)', () => {
    let savedFuel: number
    let savedHasCar: boolean

    beforeEach(() => {
        savedFuel = globalState.carFuel
        savedHasCar = globalState.hasCar
        setHasCar(false)
        globalState.carFuel = 0
    })

    afterEach(() => {
        globalState.carFuel = savedFuel
        setHasCar(savedHasCar)
    })

    it('setCarFuel implies ownership', () => {
        expect(hasCar()).toBe(false)
        setCarFuel(500)
        expect(hasCar()).toBe(true)
        expect(getCarFuel()).toBe(500)
    })

    it('worldmapTravelSpeed doubles when car is fueled', () => {
        setHasCar(true)
        setCarFuel(1000)
        expect(worldmapTravelSpeed(10)).toBe(10 * CAR_SPEED_MULT)
        setCarFuel(0)
        expect(worldmapTravelSpeed(10)).toBe(10)
    })

    it('burnCarFuelOnTravel depletes fuel per tick', () => {
        setHasCar(true)
        setCarFuel(CAR_FUEL_BURN_PER_TICK * 2 + 3)
        expect(burnCarFuelOnTravel()).toBe(CAR_FUEL_BURN_PER_TICK)
        expect(getCarFuel()).toBe(CAR_FUEL_BURN_PER_TICK + 3)
        expect(burnCarFuelOnTravel()).toBe(CAR_FUEL_BURN_PER_TICK)
        expect(burnCarFuelOnTravel()).toBe(3)
        expect(getCarFuel()).toBe(0)
        expect(burnCarFuelOnTravel()).toBe(0)
    })

    it('empty ownership still allows hasCar without speed bonus', () => {
        setHasCar(true)
        setCarFuel(0)
        expect(hasCar()).toBe(true)
        expect(worldmapTravelSpeed(8)).toBe(8)
        expect(burnCarFuelOnTravel()).toBe(0)
    })

    it('SAVE_VERSION is 26 and v23 migrates hasCar from fuel', () => {
        expect(SAVE_VERSION).toBe(26)
        const migrated = migrateSave({
            version: 23,
            name: 'car-mig',
            timestamp: 1,
            currentMap: 'arroyo',
            currentElevation: 0,
            carFuel: 1200,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        } as any)
        expect(migrated.version).toBe(26)
        expect(migrated.hasCar).toBe(true)

        const empty = migrateSave({
            version: 23,
            name: 'no-car',
            timestamp: 1,
            currentMap: 'arroyo',
            currentElevation: 0,
            carFuel: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        } as any)
        expect(empty.hasCar).toBe(false)
    })
})

describe('rest safety (critter.cc _critter_can_obj_dude_rest)', () => {
    it('refuses while a living critter is after the player, or strangers are about where resting is not allowed', async () => {
        const { canRest, restForHours } = await import('./character/rest.js')
        const savedPlayer = globalState.player
        const savedMap = globalState.gMap
        const savedCombat = globalState.inCombat
        try {
            const player: any = { teamNum: 0, type: 'critter' }
            const raider: any = { type: 'critter', teamNum: 1, dead: false, whoHitMe: null }
            globalState.player = player
            globalState.inCombat = false
            ;(globalState as any).gMap = { getObjects: () => [player, raider] }
            expect(canRest()).toBe(true)
            raider.whoHitMe = player
            expect(canRest()).toBe(false)
            expect(restForHours(2).refusedReason).toBe('unsafe')
            raider.whoHitMe = null
            ;(globalState as any).gMap = { getObjects: () => [player, raider], canRestHere: false }
            expect(canRest()).toBe(false)
            raider.dead = true
            expect(canRest()).toBe(true)
        } finally {
            globalState.player = savedPlayer
            ;(globalState as any).gMap = savedMap
            globalState.inCombat = savedCombat
        }
    })
})
