/**
 * sfall get_object_data / set_object_data: object fields by their byte
 * offset in the engine's Object struct (OBJ_DATA_* in sfall's
 * define_extra.h). Offsets OpenF2 has no field for read 0 and ignore writes.
 */

import globalState from './globalState.js'
import { fromTileNum, toTileNum } from './tile.js'

type Field = { get(o: any): number; set(o: any, v: number): void }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const prop = (key: string): Field => ({ get: (o) => num(o[key]), set: (o, v) => { o[key] = v } })

/** Damage flag bits (DAM_*) and the critter fields that hold them. */
const DAMAGE_FLAGS: [number, string][] = [
    [0x01, 'knockedOut'], [0x02, 'knockedDown'], [0x04, 'crippledLeftLeg'], [0x08, 'crippledRightLeg'],
    [0x10, 'crippledLeftArm'], [0x20, 'crippledRightArm'], [0x40, 'blinded'], [0x80, 'dead'],
]

export function damageFlagsOf(c: any): number {
    let flags = 0
    for (const [bit, key] of DAMAGE_FLAGS) {if (c?.[key] === true) {flags |= bit}}
    return flags
}

const COMMON: Record<number, Field> = {
    0x00: { get: (o) => num(o.id), set: (o, v) => { o.id = v } },
    0x04: {
        get: (o) => (o.position ? toTileNum(o.position) : -1),
        set: (o, v) => { if (v >= 0 && v < 40000) {o.position = fromTileNum(v)} },
    },
    0x18: prop('frame'),
    0x1c: prop('orientation'),
    0x24: prop('flags'),
    0x28: {
        get: (o) => num(o.elevation ?? (o.position ? globalState.currentElevation : 0)),
        set: (o, v) => { o.elevation = v },
    },
    0x64: { get: (o) => num(o.pid), set: () => {} },
    0x6c: prop('lightRadius'),
    0x70: prop('lightIntensity'),
}

const CRITTER: Record<number, Field> = {
    0x3c: prop('combatManeuver'),
    0x40: { get: (o) => num(o.AP?.combat), set: (o, v) => { if (o.AP) {o.AP.combat = v} } },
    0x44: {
        get: (o) => damageFlagsOf(o),
        set: (o, v) => { for (const [bit, key] of DAMAGE_FLAGS) {o[key] = (v & bit) !== 0} },
    },
    0x48: prop('damageLastTurn'),
    0x54: { get: (o) => (o.whoHitMe ?? 0), set: (o, v) => { o.whoHitMe = v || null } },
    0x58: {
        get: (o) => num(o.stats?.getBase?.('HP') ?? o.stats?.baseStats?.HP),
        set: (o, v) => { if (o.stats?.baseStats) {o.stats.baseStats.HP = v} },
    },
}

const ITEM: Record<number, Field> = {
    0x3c: {
        get: (o) => num(o.extra?.charges ?? o.extra?.keyCode ?? o.extra?.ammoLoaded),
        set: (o, v) => {
            o.extra ??= {}
            if (o.pro?.extra?.subType === 6) {o.extra.keyCode = v}
            else if (o.pro?.extra?.subType === 3) {o.extra.ammoLoaded = v}
            else {o.extra.charges = v}
        },
    },
}

function fieldOf(obj: any, offset: number): Field | undefined {
    if (obj?.type === 'critter' && CRITTER[offset]) {return CRITTER[offset]}
    if (obj?.type === 'item' && ITEM[offset]) {return ITEM[offset]}
    return COMMON[offset]
}

export function getObjectData(obj: any, offset: number): any {
    if (!obj || typeof obj !== 'object') {return 0}
    return fieldOf(obj, offset)?.get(obj) ?? 0
}

export function setObjectData(obj: any, offset: number, value: number): number {
    if (!obj || typeof obj !== 'object') {return -1}
    fieldOf(obj, offset)?.set(obj, value)
    return 0
}
