/**
 * metarule(id, param) and metarule3(id, p1, p2, p3) parity with fallout2-ce
 * opMetarule / opMetarule3 (src/interpreter_extra.cc).
 *
 * The engine defines exactly these METARULE_* IDs:
 *   13 SIGNAL_END_GAME, 14 FIRST_RUN, 15 ELEVATOR, 16 PARTY_COUNT,
 *   17 AREA_KNOWN, 18 WHO_ON_DRUGS, 19 MAP_KNOWN, 22 IS_LOADGAME,
 *   30 CAR_CURRENT_TOWN, 31 GIVE_CAR_TO_PARTY, 32 GIVE_CAR_GAS,
 *   40 SKILL_CHECK_TAG, 42 DROP_ALL_INVEN, 43 INVEN_UNWIELD_WHO,
 *   44 GET_WORLDMAP_XPOS, 45 GET_WORLDMAP_YPOS, 46 CURRENT_TOWN,
 *   47 LANGUAGE_FILTER, 48 VIOLENCE_FILTER, 49 WEAPON_DAMAGE_TYPE,
 *   50 CRITTER_BARTERS, 51 CRITTER_KILL_TYPE, 52 SET_CAR_CARRY_AMOUNT,
 *   53 GET_CAR_CARRY_AMOUNT
 * and returns 0 for every other ID.
 *
 * METARULE3_* IDs: 100 CLR_FIXED_TIMED_EVENTS, 101 MARK_SUBTILE,
 * 102 SET_WM_MUSIC (unhandled → 0), 103 GET_KILL_COUNT, 104 MARK_MAP_ENTRANCE,
 * 105 WM_SUBTILE_STATE, 106 TILE_GET_NEXT_CRITTER, 107 ART_SET_BASE_FID_NUM,
 * 108 TILE_SET_CENTER, 109 chem use, 110 car out of gas, 111 current area.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { Party } from './party.js'
import { SkillSet } from './char.js'
import { EventBus } from './eventBus.js'
import { CAR_FUEL_MAX, getCarFuel, hasCar, parkCar, setCarFuel, setCarTrunkCapacity, setHasCar } from './car.js'
import { patchSettings, resetSettings } from './settings.js'
import { drainStubHits, stubHitCount } from './scriptingChecklist.js'
import { getSubtileState, hydrateWorldmapMarks, resetWorldmapMarks, serializeWorldmapMarks } from './worldmapMarks.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { toTileNum } from './tile.js'

const ENGINE_IDS = [13, 14, 15, 16, 17, 18, 19, 22, 30, 31, 32, 40, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]

// Minimal data/data/maps.txt served to data.ts's synchronous XHR loader.
const MAPS_TXT = [
    '[Map 000]',
    'lookup_name=Desert Encounter 1',
    'map_name=desert1',
    '[Map 001]',
    'lookup_name=Arroyo Temple',
    'map_name=ArTemple',
    '[Map 002]',
    'lookup_name=Arroyo Village',
    'map_name=ArVill',
].join('\n')

class FakeXHR {
    status = 0
    responseText = ''
    private path = ''
    open(_method: string, path: string) {
        this.path = path
    }
    send() {
        if (this.path === 'data/data/maps.txt') {
            this.status = 200
            this.responseText = MAPS_TXT
        } else if (this.path === 'data/art/critters/critters.lst') {
            this.status = 200
            this.responseText = 'HAPOWR,11,1\nHMJMPS,12,1\nMAMTNT,13,1'
        } else if (this.path === 'data/art/items/items.lst') {
            this.status = 200
            this.responseText = 'pistol.frm\nshotgun.frm\nrock.frm'
        } else {
            this.status = 404
        }
    }
}

function makeEntrance(mapName: string, startState: string) {
    return { startState, x: 0, y: 0, mapLookupName: mapName, mapName, elevation: 0, tileNum: 0, orientation: 0 }
}

function makeAreas(): any {
    return {
        '0': {
            name: 'Arroyo',
            id: 0,
            size: 'small',
            state: true,
            worldPosition: { x: 10, y: 10 },
            entrances: [makeEntrance('ArTemple', 'On'), makeEntrance('ArVill', 'Off')],
        },
        '7': {
            name: 'Klamath',
            id: 7,
            size: 'small',
            state: false,
            worldPosition: { x: 50, y: 50 },
            entrances: [makeEntrance('klaent', 'On')],
        },
    }
}

function makeItem(overrides: Record<string, any> = {}): any {
    return { type: 'item', subtype: 'misc', pid: 41, position: { x: 0, y: 0 }, ...overrides }
}

function makeCritter(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        isPlayer: false,
        pid: 0x01000010,
        position: { x: 5, y: 6 },
        inventory: [],
        visible: true,
        dead: false,
        equippedArmor: null,
        pro: { extra: { flags: 0, killType: 0 } },
        ...overrides,
    }
}

describe('metarule — engine parity (fallout2-ce opMetarule)', () => {
    let script: Scripting.Script
    const saved: Record<string, any> = {}

    beforeAll(() => {
        vi.stubGlobal('XMLHttpRequest', FakeXHR)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    beforeEach(() => {
        drainStubHits()
        for (const key of ['player', 'gParty', 'gMap', 'mapAreas', 'worldPosition', 'mapLoadedFromSave']) {
            saved[key] = (globalState as any)[key]
        }
        globalState.mapAreas = makeAreas()
        setHasCar(false)
        setCarTrunkCapacity(NaN)
        resetSettings(false)
        script = new (Scripting as any).Script()
    })

    afterEach(() => {
        for (const key in saved) {(globalState as any)[key] = saved[key]}
        setHasCar(false)
        setCarTrunkCapacity(NaN)
        resetSettings(false)
        Scripting.setUseElevatorHandler(vi.fn())
    })

    describe('IDs the engine does not define', () => {
        const nonEngine = Array.from({ length: 60 }, (_, i) => i).filter((id) => !ENGINE_IDS.includes(id))

        it('return 0 for every non-engine ID in 0–59, including the previously invented 26–29/31/32 meanings', () => {
            const critter = makeCritter({ hostile: true, isFleeing: true, level: 9, dead: true })
            for (const id of nonEngine) {
                expect(script.metarule(id, critter), `metarule(${id})`).toBe(0)
                expect(script.metarule(id, 0), `metarule(${id}, 0)`).toBe(0)
            }
            expect(script.metarule(1000, 0)).toBe(0)
            expect(script.metarule(-1, 0)).toBe(0)
            expect(stubHitCount()).toBe(0)
        })
    })

    it('13 SIGNAL_END_GAME starts the ending and returns 0', () => {
        const spy = vi.fn()
        EventBus.on('endgame:start', spy)
        try {
            expect(script.metarule(13, 0)).toBe(0)
            expect(spy).toHaveBeenCalledTimes(1)
        } finally {
            EventBus.offAll('endgame:start')
            EventBus.offAll('endgame:credits')
            EventBus.offAll('endgame:returnToMenu')
        }
    })

    it('14 FIRST_RUN returns the numeric first-run flag', () => {
        const result = script.metarule(14, 0)
        expect(typeof result).toBe('number')
        expect(result).toBe(Scripting.getMapFirstRun())
    })

    it('15 ELEVATOR invokes the elevator handler and returns 0', () => {
        const handler = vi.fn()
        Scripting.setUseElevatorHandler(handler)
        expect(script.metarule(15, -1)).toBe(0)
        expect(script.metarule(15, 3)).toBe(0)
        expect(handler).toHaveBeenCalledTimes(2)
    })

    it('16 PARTY_COUNT counts the player plus living, visible critter members', () => {
        globalState.gParty = new Party()
        expect(script.metarule(16, 0)).toBe(1)
        const a = makeCritter({ pid: 0x01000100 })
        const b = makeCritter({ pid: 0x01000101 })
        const c = makeCritter({ pid: 0x01000102 })
        globalState.gParty.addPartyMember(a)
        globalState.gParty.addPartyMember(b)
        globalState.gParty.addPartyMember(c)
        expect(script.metarule(16, 0)).toBe(4)
        b.dead = true
        c.visible = false
        expect(script.metarule(16, 0)).toBe(2)
    })

    it('17 AREA_KNOWN reports the area state', () => {
        expect(script.metarule(17, 0)).toBe(1)
        expect(script.metarule(17, 7)).toBe(0)
        expect(script.metarule(17, 99)).toBe(0)
    })

    it('18 WHO_ON_DRUGS checks the critter argument, not self_obj', () => {
        const user = makeCritter()
        const bystander = makeCritter()
        const drug = makeItem({ subtype: 'drug', pid: 40, _script: { use_p_proc: vi.fn() } })
        script.self_obj = user
        Scripting.use(drug, user)
        expect(script.metarule(18, user)).toBe(1)
        expect(script.metarule(18, bystander)).toBe(0)
        expect(script.metarule(18, 0)).toBe(0)
    })

    it('19 MAP_KNOWN checks the entrance state of map index `param`', () => {
        expect(script.metarule(19, 1)).toBe(1) // ArTemple: entrance On
        expect(script.metarule(19, 2)).toBe(0) // ArVill: entrance Off
        expect(script.metarule(19, 0)).toBe(0) // desert1: in no area
        expect(script.metarule(19, 999)).toBe(0) // unknown map index
    })

    it('22 IS_LOADGAME reflects a save being restored', () => {
        globalState.mapLoadedFromSave = false
        expect(script.metarule(22, 0)).toBe(0)
        globalState.mapLoadedFromSave = true
        expect(script.metarule(22, 0)).toBe(1)
    })

    it('30 CAR_CURRENT_TOWN returns the car\'s area, -1 without a car', () => {
        expect(script.metarule(30, 0)).toBe(-1)
        setHasCar(true)
        parkCar('artemple', 1, 2, 0)
        expect(script.metarule(30, 0)).toBe(0)
        parkCar('klaent', 1, 2, 0)
        expect(script.metarule(30, 0)).toBe(7)
    })

    it('31 GIVE_CAR_TO_PARTY fails with -1 when out of fuel, else gives the car', () => {
        expect(script.metarule(31, 0)).toBe(-1)
        expect(hasCar()).toBe(false)
        globalState.carFuel = 1000
        expect(script.metarule(31, 0)).toBe(0)
        expect(hasCar()).toBe(true)
    })

    it('32 GIVE_CAR_GAS adds fuel and returns the overflow', () => {
        setHasCar(true)
        setCarFuel(500)
        expect(script.metarule(32, 1000)).toBe(0)
        expect(getCarFuel()).toBe(1500)
        setCarFuel(CAR_FUEL_MAX - 10)
        expect(script.metarule(32, 100)).toBe(10)
        expect(getCarFuel()).toBe(CAR_FUEL_MAX)
    })

    it('40 SKILL_CHECK_TAG reports whether the player tagged the skill', () => {
        globalState.player = { isPlayer: true, skills: new SkillSet(undefined, ['Lockpick', 'Speech']) } as any
        expect(script.metarule(40, 9)).toBe(1) // Lockpick
        expect(script.metarule(40, 14)).toBe(1) // Speech
        expect(script.metarule(40, 0)).toBe(0) // Small Guns
        expect(script.metarule(40, 99)).toBe(0)
    })

    it('42 DROP_ALL_INVEN drops every item on the critter\'s tile and unequips them', () => {
        const armor = makeItem({ subtype: 'armor' })
        const weapon = makeItem({ subtype: 'weapon' })
        const caps = makeItem({ pid: 41 })
        const critter = makeCritter({ inventory: [armor, weapon, caps], equippedArmor: armor, rightHand: weapon })
        const added: any[] = []
        globalState.gMap = { addObject: (o: any) => added.push(o) } as any
        expect(script.metarule(42, critter)).toBe(0)
        expect(critter.inventory).toEqual([])
        expect(critter.equippedArmor).toBeNull()
        expect(critter.rightHand).toBeUndefined()
        expect(added).toEqual([armor, weapon, caps])
        for (const item of added) {expect(item.position).toEqual({ x: 5, y: 6 })}
        expect(script.metarule(42, 0)).toBe(0)
    })

    it('43 INVEN_UNWIELD_WHO puts away the critter\'s weapon', () => {
        const weapon = makeItem({ subtype: 'weapon' })
        const critter = makeCritter({ rightHand: weapon })
        expect(script.metarule(43, critter)).toBe(0)
        expect(critter.rightHand).toBeUndefined()
    })

    it('44/45 GET_WORLDMAP_XPOS/YPOS return the party world position', () => {
        globalState.worldPosition = { x: 123, y: 456 }
        expect(script.metarule(44, 0)).toBe(123)
        expect(script.metarule(45, 0)).toBe(456)
    })

    it('46 CURRENT_TOWN returns the area containing the current map', () => {
        globalState.gMap = { name: 'artemple' } as any
        expect(script.metarule(46, 0)).toBe(0)
        globalState.gMap = { name: 'KLAENT' } as any
        expect(script.metarule(46, 0)).toBe(7)
        globalState.gMap = { name: 'desert1' } as any
        expect(script.metarule(46, 0)).toBe(-1)
    })

    it('47 LANGUAGE_FILTER follows the Options setting', () => {
        expect(script.metarule(47, 0)).toBe(0)
        patchSettings({ languageFilter: true }, false)
        expect(script.metarule(47, 0)).toBe(1)
    })

    it('50 CRITTER_BARTERS reads the CRITTER_BARTER (0x02) proto flag', () => {
        expect(script.metarule(50, makeCritter({ pro: { extra: { flags: 0x02 } } }))).toBe(1)
        expect(script.metarule(50, makeCritter({ pro: { extra: { flags: 0x20 } } }))).toBe(0)
        expect(script.metarule(50, makeItem())).toBe(0)
        expect(script.metarule(50, 0)).toBe(0)
    })

    it('51 CRITTER_KILL_TYPE: player by gender, critters by proto, others -1', () => {
        const player = makeCritter({ isPlayer: true, gender: 'female' })
        globalState.player = player
        expect(script.metarule(51, player)).toBe(1)
        player.gender = 'male'
        expect(script.metarule(51, player)).toBe(0)
        expect(script.metarule(51, makeCritter({ pro: { extra: { killType: 6 } } }))).toBe(6)
        expect(script.metarule(51, makeItem())).toBe(-1)
        expect(script.metarule(51, 0)).toBe(-1)
    })

    it('52/53 SET/GET_CAR_CARRY_AMOUNT round-trip the trunk capacity', () => {
        expect(script.metarule(53, 0)).toBe(0)
        expect(script.metarule(52, 150)).toBe(1)
        expect(script.metarule(53, 0)).toBe(150)
    })

    it('engine IDs do not record stub hits', () => {
        globalState.gParty = new Party()
        globalState.gMap = { name: 'artemple', addObject: vi.fn() } as any
        Scripting.setUseElevatorHandler(vi.fn())
        for (const id of ENGINE_IDS) {
            if (id === 13 || id === 49) {continue} // endgame / weapon-only, covered elsewhere
            script.metarule(id, makeCritter())
        }
        expect(stubHitCount()).toBe(0)
    })
})

describe('metarule3 — engine parity (fallout2-ce opMetarule3)', () => {
    let script: Scripting.Script
    const saved: Record<string, any> = {}

    beforeAll(() => {
        vi.stubGlobal('XMLHttpRequest', FakeXHR)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    beforeEach(() => {
        drainStubHits()
        for (const key of ['player', 'gParty', 'gMap', 'mapAreas', 'critterKillCounts', 'carFuel', 'cameraPosition']) {
            saved[key] = (globalState as any)[key]
        }
        globalState.mapAreas = makeAreas()
        resetWorldmapMarks()
        script = new (Scripting as any).Script()
    })

    afterEach(() => {
        for (const key in saved) {(globalState as any)[key] = saved[key]}
        resetWorldmapMarks()
        Scripting.timeEventList.length = 0
    })

    it('IDs outside 100–111 (and unhandled 102) return 0 without stub hits', () => {
        for (const id of [0, 50, 99, 102, 112, 113, 120, 999]) {
            expect(script.metarule3(id, makeCritter(), makeCritter(), 0), `metarule3(${id})`).toBe(0)
        }
        expect(stubHitCount()).toBe(0)
    })

    it('100 CLR_FIXED_TIMED_EVENTS removes every matching event for the object', () => {
        const a = makeCritter()
        const b = makeCritter()
        const fn = vi.fn()
        Scripting.timeEventList.push(
            { obj: a, ticks: 10, userdata: 1, fn },
            { obj: a, ticks: 20, userdata: 1, fn },
            { obj: a, ticks: 30, userdata: 2, fn },
            { obj: b, ticks: 40, userdata: 1, fn },
        )
        expect(script.metarule3(100, a, 1, 0)).toBe(0)
        expect(Scripting.timeEventList.map((e) => [e.obj === a ? 'a' : 'b', e.userdata])).toEqual([['a', 2], ['b', 1]])
    })

    it('101 MARK_SUBTILE / 105 WM_SUBTILE_STATE track known and visited subtiles', () => {
        expect(script.metarule3(105, 275, 175, 0)).toBe(0)
        expect(script.metarule3(101, 275, 175, 1)).toBe(0)
        expect(script.metarule3(105, 275, 175, 0)).toBe(2) // centre visited
        expect(script.metarule3(105, 225, 125, 0)).toBe(1) // diagonal neighbour known
        expect(script.metarule3(105, 375, 175, 0)).toBe(0) // two subtiles away
        // marking a neighbour known never downgrades a visited subtile
        script.metarule3(101, 325, 175, 1)
        expect(getSubtileState(275, 175)).toBe(2)
    })

    it('101 ignores out-of-bounds positions', () => {
        expect(script.metarule3(101, -10, 50, 3)).toBe(0)
        expect(script.metarule3(105, -10, 50, 0)).toBe(0)
        expect(serializeWorldmapMarks().subtiles).toEqual({})
    })

    it('103 GET_KILL_COUNT reads the per-type kill counter', () => {
        globalState.critterKillCounts = { 0: 4, 18: 1 }
        expect(script.metarule3(103, 0, 0, 0)).toBe(4)
        expect(script.metarule3(103, 18, 0, 0)).toBe(1)
        expect(script.metarule3(103, 19, 0, 0)).toBe(0)
        expect(script.metarule3(103, -1, 0, 0)).toBe(0)
    })

    it('104 MARK_MAP_ENTRANCE drives metarule MAP_KNOWN', () => {
        expect(script.metarule(19, 2)).toBe(0) // ArVill starts Off
        expect(script.metarule3(104, 2, -1, 1)).toBe(0)
        expect(script.metarule(19, 2)).toBe(1)
        expect(script.metarule3(104, 1, 0, 0)).toBe(0) // ArTemple entrance has elevation 0
        expect(script.metarule(19, 1)).toBe(0)
        expect(script.metarule3(104, 1, 2, 1)).toBe(-1) // no entrance on elevation 2
        expect(script.metarule3(104, 0, -1, 1)).toBe(-1) // desert1 belongs to no area
    })

    it('106 TILE_GET_NEXT_CRITTER iterates critters on the tile, player included', () => {
        const pos = { x: 20, y: 30 }
        const player = makeCritter({ isPlayer: true, position: { ...pos } })
        const npc = makeCritter({ position: { ...pos } })
        const elsewhere = makeCritter({ position: { x: 1, y: 1 } })
        const item = makeItem({ position: { ...pos } })
        globalState.gMap = { getObjects: () => [item, player, elsewhere, npc] } as any
        const tile = toTileNum(pos)
        expect(script.metarule3(106, tile, 0, 0)).toBe(player)
        expect(script.metarule3(106, tile, 0, player)).toBe(npc)
        expect(script.metarule3(106, tile, 0, npc)).toBe(0)
        expect(script.metarule3(106, tile, 0, elsewhere)).toBe(0)
    })

    it('107 ART_SET_BASE_FID_NUM swaps base art, keeping a critter\'s animation suffix', () => {
        const critter = makeCritter({ frmPID: 0x0102000, art: 'art/critters/hapowrab' })
        expect(script.metarule3(107, critter, 2, 0)).toBe(0)
        expect(critter.frmPID).toBe(0x0102002)
        expect(critter.art).toBe('art/critters/mamtntab')

        const rock = makeItem({ frmPID: 0, art: 'art/items/pistol' })
        expect(script.metarule3(107, rock, 2, 0)).toBe(0)
        expect(rock.frmPID).toBe(2)
        expect(rock.art).toBe('art/items/rock')
    })

    it('108 TILE_SET_CENTER moves the camera; -1 for an invalid tile', () => {
        globalState.cameraPosition = { x: 0, y: 0 } as any
        expect(script.metarule3(108, 20100, 0, 0)).toBe(0)
        expect(globalState.cameraPosition).not.toEqual({ x: 0, y: 0 })
        expect(script.metarule3(108, -1, 0, 0)).toBe(-1)
    })

    it('109 returns the AI chem_use index, party control first', () => {
        globalState.gParty = new Party()
        const c = makeCritter({ ai: { info: { chem_use: 'Sometimes' } } })
        expect(script.metarule3(109, c, 0, 0)).toBe(3)
        c.ai.info.chem_use = 'always'
        expect(script.metarule3(109, c, 0, 0)).toBe(5)
        c.ai.info.chem_use = 'bogus'
        expect(script.metarule3(109, c, 0, 0)).toBe(0)
        expect(script.metarule3(109, makeItem(), 0, 0)).toBe(0)
    })

    it('110 reports whether the car is out of gas', () => {
        globalState.carFuel = 0
        expect(script.metarule3(110, 0, 0, 0)).toBe(1)
        globalState.carFuel = 1
        expect(script.metarule3(110, 0, 0, 0)).toBe(0)
    })

    it('111 returns the area containing the current map', () => {
        globalState.gMap = { name: 'ArVill' } as any
        expect(script.metarule3(111, 0, 0, 0)).toBe(0)
        globalState.gMap = { name: 'klaent' } as any
        expect(script.metarule3(111, 0, 0, 0)).toBe(7)
    })
})

describe('world-map marks persistence (save v27)', () => {
    afterEach(() => {
        resetWorldmapMarks()
    })

    it('serialize/hydrate round-trips subtile and entrance states', () => {
        hydrateWorldmapMarks({ subtiles: { '3,4': 2, 'bad': 1 }, entrances: { '0:1': 1, 'x:y': 0 } })
        expect(serializeWorldmapMarks()).toEqual({ subtiles: { '3,4': 2 }, entrances: { '0:1': 1 } })
        expect(getSubtileState(175, 225)).toBe(2)
    })

    it('migrateSave adds empty worldmapMarks to v26 saves', () => {
        expect(SAVE_VERSION).toBe(27)
        const migrated = migrateSave({ version: 26, name: 't', party: [] } as any)
        expect(migrated.version).toBe(27)
        expect(migrated.worldmapMarks).toEqual({ subtiles: {}, entrances: {} })
    })
})
