import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { getProtoData, setProtoData } from './protoOffsets.js'
import { getSfallGlobalAny, rawToFloat, rawValue, resetSfallGlobals, setSfallGlobal, setSfallGlobalInt } from './sfallGlobals.js'

describe('get_proto_data / set_proto_data (sfall PROTO_* offsets)', () => {
    let saved: any
    let critter: any
    const weapon = {
        pid: 9, textID: 900, type: 0, flags: 0x10, lightRadius: 0, lightIntensity: 0, frmType: 0, frmPID: 33,
        extra: { itemFlags: 1, actionFlags: 2, weaponFlags: 3, attackMode: 4, subType: 3, weight: 7, cost: 250, minDmg: 5, maxDmg: 12, maxAmmo: 6 },
    }
    const critterPro = {
        pid: 5, textID: 500, type: 1, flags: 0, frmType: 1, frmPID: 0x2a,
        extra: { actionFlags: 0, scriptID: -1, team: 3, AI: 12, age: 30, baseStats: { STR: 6, HP: 20 }, bonusStats: { STR: 1 }, skills: { 'Small Guns': 40 } },
    }

    beforeEach(() => {
        saved = { proMap: globalState.proMap, lst: (globalState as any).lstFiles, gMap: globalState.gMap }
        globalState.proMap = { items: { 9: weapon }, critters: { 5: critterPro } } as any
        critter = { type: 'critter', pid: 0x01000005, stats: { baseStats: { STR: 7, 'Max HP': 20 } } }
        globalState.gMap = { getObjects: () => [critter] } as any
    })
    afterEach(() => {
        globalState.proMap = saved.proMap
        globalState.gMap = saved.gMap
    })


    it('maps weapon, critter and skill offsets', async () => {
        const proMod = await import('./pro.js')
        const spy = (await import('vitest')).vi.spyOn(proMod, 'loadPRO').mockImplementation((pid: number) =>
            ((pid >>> 24) === 0 ? weapon : critterPro) as any)
        expect(getProtoData(9, 0)).toBe(9)
        expect(getProtoData(9, 8)).toBe(33)
        expect(getProtoData(9, 24)).toBe(0x01020304)
        expect(getProtoData(9, 116)).toBe(7) // PROTO_IT_WEIGHT
        expect(getProtoData(9, 40)).toBe(5) // PROTO_WP_DMG_MIN
        expect(getProtoData(9, 96)).toBe(6) // PROTO_WP_MAG_SIZE
        setProtoData(9, 44, 20)
        expect(weapon.extra.maxDmg).toBe(20)

        expect(getProtoData(0x01000005, 36)).toBe(6) // base STR
        expect(getProtoData(0x01000005, 176)).toBe(1) // bonus STR
        expect(getProtoData(0x01000005, 316)).toBe(40) // Small Guns
        expect(getProtoData(0x01000005, 412)).toBe(3) // team
        expect(getProtoData(0x01000005, 36 + 33 * 4)).toBe(30) // age
        setProtoData(0x01000005, 36, 8)
        expect(critterPro.extra.baseStats.STR).toBe(8)
        expect(critter.stats.baseStats.STR).toBe(9) // the live critter follows
        setProtoData(0x01000005, 36 + 7 * 4, 25)
        expect(critter.stats.baseStats['Max HP']).toBe(25)
        spy.mockRestore()
    })
})

describe('sfall globals (ScriptExtender.cpp)', () => {
    beforeEach(() => resetSfallGlobals())

    it('names must be 8 characters; numbers and names share one table', () => {
        expect(setSfallGlobal('short', 5)).toBe(-1)
        expect(getSfallGlobalAny('short')).toBe(0)
        expect(setSfallGlobal('EIGHTCHR', 5)).toBe(0)
        expect(getSfallGlobalAny('EIGHTCHR')).toBe(5)
        setSfallGlobalInt(70000, 3)
        expect(getSfallGlobalAny(70000)).toBe(3)
    })

    it('floats keep their bits: _int gives the raw value, _float the number', () => {
        setSfallGlobal('FLOATVAR', 1.5)
        expect(getSfallGlobalAny('FLOATVAR')).toBe(rawValue(1.5))
        expect(getSfallGlobalAny('FLOATVAR')).toBe(0x3fc00000)
        expect(rawToFloat(getSfallGlobalAny('FLOATVAR'))).toBe(1.5)
    })
})
