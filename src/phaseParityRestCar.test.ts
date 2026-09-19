/**
 * Parity Slice H (partial) — rest encounter interrupts + Highwayman car stub (P1-11 / P1-6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import {
    restForHours,
    rollRestInterrupt,
    setRestDangerOverride,
    getRestDanger,
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
    resetRadiationPoisonClocks,
    tickRadiationAndPoison,
    readPlayerPoisonLevel,
} from './character/radiationPoison.js'
import {
    resolveRestEncounterTable,
    triggerRestEncounter,
} from './restEncounter.js'
import { Worldmap } from './worldmap.js'

describe('Parity — rest encounter spawn', () => {
    it('resolveRestEncounterTable maps danger to outdoor tables', () => {
        expect(resolveRestEncounterTable('low', null)).toBe('wasteland')
        expect(resolveRestEncounterTable('high', null)).toBe('desert')
        expect(resolveRestEncounterTable('medium', { encounterType: 'forest' })).toBe('forest')
    })

    it('triggerRestEncounter calls forceEncounter on local maps', () => {
        const prevMap = globalState.gMap
        const prevPlayer = globalState.player
        const prevWorldPos = globalState.worldPosition
        globalState.player = new Player()
        globalState.gMap = { encounterType: 'wasteland' } as any
        globalState.worldPosition = null
        const spy = vi.spyOn(Worldmap, 'forceEncounter').mockReturnValue(true)
        expect(triggerRestEncounter('medium')).toBe(true)
        expect(spy).toHaveBeenCalledWith('wasteland')
        spy.mockRestore()
        globalState.gMap = prevMap
        globalState.player = prevPlayer
        globalState.worldPosition = prevWorldPos
    })
})

describe('Parity — rest encounter interrupts', () => {
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
        setRestDangerOverride(null)
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.gameTickTime = savedTick
        globalState.inCombat = savedCombat
        setRestDangerOverride(null)
        Scripting.timeEventList.length = 0
    })

    it('safe danger never interrupts', () => {
        expect(rollRestInterrupt('safe', () => 0)).toBe(false)
        expect(rollRestInterrupt('safe', () => 0.99)).toBe(false)
    })

    it('high danger interrupts when rng rolls under chance', () => {
        // chance 25% → floor(rng*100) < 25
        expect(rollRestInterrupt('high', () => 0.24)).toBe(true)
        expect(rollRestInterrupt('high', () => 0.25)).toBe(false)
    })

    it('restForHours stops early and emits rest:interrupted', () => {
        setRestDangerOverride('high')
        const handler = vi.fn()
        EventBus.on('rest:interrupted', handler)
        // Always interrupt on first hour check
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.0)
        const before = globalState.gameTickTime
        const result = restForHours(8)
        expect(result.interrupted).toBe(true)
        expect(result.hoursCompleted).toBe(0)
        expect(result.ticksAdvanced).toBe(0)
        expect(globalState.gameTickTime).toBe(before)
        expect(handler).toHaveBeenCalledOnce()
        spy.mockRestore()
        EventBus.off('rest:interrupted', handler)
    })

    it('restForHours completes all hours when never interrupted', () => {
        setRestDangerOverride('high')
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const before = globalState.gameTickTime
        const result = restForHours(4)
        expect(result.interrupted).toBe(false)
        expect(result.hoursCompleted).toBe(4)
        expect(result.ticksAdvanced).toBe(4 * TICKS_PER_HOUR)
        expect(globalState.gameTickTime).toBe(before + 4 * TICKS_PER_HOUR)
        spy.mockRestore()
    })

    it('setRestDangerOverride forces danger level', () => {
        setRestDangerOverride('medium')
        expect(getRestDanger()).toBe('medium')
        setRestDangerOverride('safe')
        expect(getRestDanger()).toBe('safe')
    })

    it('advanceGameTime does not double-apply poison DoT on the next live tick', () => {
        const player = globalState.player as Player
        player.stats.setBase('Poison Level', 200)
        player.stats.setBase('Max HP', 100)
        player.stats.setBase('HP', 100)
        resetRadiationPoisonClocks()
        globalState.gameTickTime = 0

        const beforeHp = player.stats.get('HP') ?? 100
        advanceGameTime(TICKS_PER_HOUR, { heal: false, tickEffects: true })
        const afterRestHp = player.stats.get('HP') ?? 100
        expect(afterRestHp).toBeLessThan(beforeHp)

        tickRadiationAndPoison(globalState.gameTickTime)
        expect(player.stats.get('HP')).toBe(afterRestHp)
        expect(readPlayerPoisonLevel()).toBeLessThan(200)
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
