import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { CAR_FUEL_MAX, getCarFuel, setHasCar } from './car.js'

/** opMetarule (interpreter_extra.cc): rules 13–53; anything else gives 0. */
describe('metarule ids follow the engine', () => {
    let script: any
    const saved: Record<string, unknown> = {}

    beforeEach(() => {
        script = new (Scripting as any).Script()
        for (const k of ['mapAreas', 'mapAreaStates', 'player', 'gMap', 'worldPosition', 'carFuel', 'hasCar', 'loadingGame']) {
            saved[k] = (globalState as any)[k]
        }
        globalState.mapAreaStates = {}
    })

    afterEach(() => {
        for (const k in saved) {(globalState as any)[k] = saved[k]}
        EventBus.offAll('ui:message')
        EventBus.offAll('ui:openPanel')
    })

    it('ids the engine does not define return 0', () => {
        for (const id of [0, 1, 5, 12, 20, 21, 23, 24, 35, 41, 54, 55, 56, 100]) {
            expect(script.metarule(id, 0)).toBe(0)
        }
    })

    it('AREA_KNOWN (17) reads the area state', () => {
        globalState.mapAreas = { 3: { state: true }, 4: { state: false } } as any
        expect(script.metarule(17, 3)).toBe(1)
        expect(script.metarule(17, 4)).toBe(0)
        expect(script.metarule(17, 99)).toBe(0)
    })

    it('WHO_ON_DRUGS (18) is true while a drug event is queued', () => {
        const critter: any = { _type: 'obj', type: 'critter' }
        expect(script.metarule(18, critter)).toBe(0)
        critter.drugState = { bonus: {}, drugEvents: [{ tick: 10, pid: 87, stats: [], mods: [] }], withdrawals: [] }
        expect(script.metarule(18, critter)).toBe(1)
    })

    it('IS_LOADGAME (22) is set while a save is restored', () => {
        expect(script.metarule(22, 0)).toBe(0)
        globalState.loadingGame = true
        expect(script.metarule(22, 0)).toBe(1)
    })

    it('GIVE_CAR_GAS (32) fills up to the tank size and returns what did not fit', () => {
        globalState.carFuel = CAR_FUEL_MAX - 100
        expect(script.metarule(32, 40)).toBe(0)
        expect(getCarFuel()).toBe(CAR_FUEL_MAX - 60)
        expect(script.metarule(32, 500)).toBe(60)
        expect(getCarFuel()).toBe(CAR_FUEL_MAX)
    })

    it('GIVE_CAR_TO_PARTY (31) refuses an empty tank, else leaves for the world map', () => {
        const messages: string[] = []
        const panels: string[] = []
        EventBus.on('ui:message', (m: any) => messages.push(m.text))
        EventBus.on('ui:openPanel', (p: any) => panels.push(p.panelName))
        setHasCar(false)
        expect(script.metarule(31, 0)).toBe(-1)
        expect(messages).toHaveLength(1)
        globalState.carFuel = 1000
        expect(script.metarule(31, 0)).toBe(0)
        expect(globalState.hasCar).toBe(true)
        expect(globalState.mapAreaStates[21]).toBe(false)
        expect(panels).toEqual(['worldMap'])
    })

    it('SKILL_CHECK_TAG (40) asks the player\'s tags', () => {
        globalState.player = { skills: { isTagged: (name: string) => name === 'Lockpick' } } as any
        expect(script.metarule(40, 9)).toBe(1)
        expect(script.metarule(40, 10)).toBe(0)
    })

    it('DROP_ALL_INVEN (42) puts everything on the critter\'s hex', () => {
        const added: any[] = []
        globalState.gMap = { addObject: (o: any) => added.push(o) } as any
        const gun: any = { _type: 'obj', type: 'item', subtype: 'weapon' }
        const armor: any = { _type: 'obj', type: 'item', subtype: 'armor' }
        const critter: any = { _type: 'obj', type: 'critter', position: { x: 3, y: 4 }, inventory: [gun, armor], rightHand: gun, equippedArmor: armor }
        expect(script.metarule(42, critter)).toBe(0)
        expect(added).toEqual([gun, armor])
        expect(gun.position).toEqual({ x: 3, y: 4 })
        expect(critter.inventory).toEqual([])
        expect(critter.rightHand).toBeUndefined()
        expect(critter.equippedArmor).toBeNull()
    })

    it('WORLDMAP X/Y (44/45) give the party\'s world position', () => {
        globalState.worldPosition = { x: 120, y: 340 }
        expect(script.metarule(44, 0)).toBe(120)
        expect(script.metarule(45, 0)).toBe(340)
    })

    it('WEAPON_DAMAGE_TYPE (49) answers for weapons and the explosion', () => {
        expect(script.metarule(49, { _type: 'obj', type: 'item', subtype: 'weapon', dmgType: 'Plasma' })).toBe(3)
        expect(script.metarule(49, { _type: 'obj', type: 'misc', fid: 0x0500000a })).toBe(6)
        expect(script.metarule(49, { _type: 'obj', type: 'item', subtype: 'drug' })).toBe(0)
    })

    it('CRITTER_BARTERS (50) reads the proto\'s barter flag', () => {
        expect(script.metarule(50, { _type: 'obj', type: 'critter', pro: { extra: { flags: 0x02 } } })).toBe(1)
        expect(script.metarule(50, { _type: 'obj', type: 'critter', pro: { extra: { flags: 0x20 } } })).toBe(0)
    })

    it('CRITTER_KILL_TYPE (51): the player is a man or a woman, others use the proto', () => {
        const player: any = { _type: 'obj', type: 'critter', getStat: (s: string) => (s === 'Gender' ? 1 : 0) }
        globalState.player = player
        expect(script.metarule(51, player)).toBe(1)
        expect(script.metarule(51, { _type: 'obj', type: 'critter', killType: 5 })).toBe(5)
        expect(script.metarule(51, { _type: 'obj', type: 'item' })).toBe(-1)
    })

    it('SET/GET_CAR_CARRY_AMOUNT (52/53) change the trunk size', () => {
        expect(script.metarule(52, 250)).toBe(1)
        expect(script.metarule(53, 0)).toBe(250)
    })

    it('ELEVATOR (15) asks for an elevator near the script\'s object with the given type', () => {
        const handler = vi.fn(() => 0)
        Scripting.setUseElevatorHandler(handler)
        script.self_obj = { _type: 'obj', type: 'scenery' }
        expect(script.metarule(15, 4)).toBe(0)
        expect(handler).toHaveBeenCalledWith(script.self_obj, 4)
        Scripting.setUseElevatorHandler(() => -1)
    })
})

/** opMetarule3 (interpreter_extra.cc): rules 100–111; anything else gives 0. */
describe('metarule3 ids follow the engine', () => {
    let script: any
    let savedMap: unknown
    let savedFuel: unknown

    beforeEach(() => {
        script = new (Scripting as any).Script()
        savedMap = globalState.gMap
        savedFuel = globalState.carFuel
        Scripting.timeEventList.length = 0
    })

    afterEach(() => {
        globalState.gMap = savedMap as any
        globalState.carFuel = savedFuel as any
        Scripting.timeEventList.length = 0
    })

    it('ids the engine does not define return 0', () => {
        for (const id of [0, 99, 102, 112, 115, 200]) {expect(script.metarule3(id, 5, 10, 0)).toBe(0)}
    })

    it('CLR_FIXED_TIMED_EVENTS (100) removes every event of that object with that fixed param', () => {
        const a: any = { _type: 'obj', type: 'critter' }
        const b: any = { _type: 'obj', type: 'critter' }
        Scripting.timeEventList.push(
            { obj: a, ticks: 1, userdata: 7 } as any,
            { obj: a, ticks: 2, userdata: 7 } as any,
            { obj: a, ticks: 3, userdata: 8 } as any,
            { obj: b, ticks: 4, userdata: 7 } as any
        )
        script.metarule3(100, a, 7, 0)
        expect(Scripting.timeEventList.map((e: any) => e.ticks)).toEqual([3, 4])
    })

    it('TILE_GET_NEXT_CRITTER (106) walks every critter on the tile, the player included', () => {
        const player: any = { _type: 'obj', type: 'critter', isPlayer: true, position: { x: 10, y: 10 } }
        const rat: any = { _type: 'obj', type: 'critter', position: { x: 10, y: 10 } }
        const rock: any = { _type: 'obj', type: 'item', position: { x: 10, y: 10 } }
        globalState.gMap = { getObjects: () => [player, rock, rat] } as any
        const tile = 10 * 200 + 10
        expect(script.metarule3(106, tile, 0, 0)).toBe(player)
        expect(script.metarule3(106, tile, 0, player)).toBe(rat)
        expect(script.metarule3(106, tile, 0, rat)).toBe(0)
    })

    it('110 tells whether the car is out of gas', () => {
        globalState.carFuel = 0
        expect(script.metarule3(110, 0, 0, 0)).toBe(1)
        globalState.carFuel = 500
        expect(script.metarule3(110, 0, 0, 0)).toBe(0)
    })
})
