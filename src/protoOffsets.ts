/**
 * sfall get_proto_data / set_proto_data: proto fields by their byte offset in
 * the engine's in-memory Proto structs (proto_types.h; the PROTO_* constants
 * of sfall's define_extra.h). OpenF2 keeps protos as parsed objects, so each
 * offset maps to the field the converter (proto.py) stored it under.
 */

import globalState from './globalState.js'
import { loadPRO } from './pro.js'

type Field = { get(pro: any): number; set(pro: any, value: number): void }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** A field of pro.extra (or of an object below it). */
function extraField(...path: string[]): Field {
    const holder = (pro: any, create: boolean): any => {
        if (!pro.extra) {
            if (!create) {return undefined}
            pro.extra = {}
        }
        let o = pro.extra
        for (const p of path.slice(0, -1)) {
            if (!o[p]) {
                if (!create) {return undefined}
                o[p] = {}
            }
            o = o[p]
        }
        return o
    }
    const key = path[path.length - 1]
    return {
        get: (pro) => num(holder(pro, false)?.[key]),
        set: (pro, v) => { holder(pro, true)[key] = v },
    }
}

function proField(key: string): Field {
    return { get: (pro) => num(pro[key]), set: (pro, v) => { pro[key] = v } }
}

/** Stats 0–34 in the engine's order, under the names proto.py gives them. */
const PRO_STATS = [
    'STR', 'PER', 'END', 'CHR', 'INT', 'AGI', 'LUK', 'HP', 'AP', 'AC', 'Unarmed', 'Melee', 'Carry', 'Sequence',
    'Healing Rate', 'Critical Chance', 'Better Criticals',
    'DT Normal', 'DT Laser', 'DT Fire', 'DT Plasma', 'DT Electrical', 'DT EMP', 'DT Explosive',
    'DR Normal', 'DR Laser', 'DR Fire', 'DR Plasma', 'DR Electrical', 'DR EMP', 'DR Explosive', 'DR Radiation', 'DR Poison',
]
/** The same stats under the names a live critter's StatSet uses. */
const LIVE_STATS: Record<string, string> = { CHR: 'CHA', HP: 'Max HP' }

const SKILLS = [
    'Small Guns', 'Big Guns', 'Energy Weapons', 'Unarmed', 'Melee', 'Throwing', 'First Aid', 'Doctor', 'Sneak',
    'Lockpick', 'Steal', 'Traps', 'Science', 'Repair', 'Speech', 'Barter', 'Gambling', 'Outdoorsman',
]

const ARMOR_STATS = [
    'DR Normal', 'DR Laser', 'DR Fire', 'DR Plasma', 'DR Electrical', 'DR EMP', 'DR Explosive',
    'DT Normal', 'DT Laser', 'DT Fire', 'DT Plasma', 'DT Electrical', 'DT EMP', 'DT Explosive',
]

/** Offsets 0–20: pid, message, fid, light distance and intensity, flags. */
function header(pro: any, pid: number): Record<number, Field> {
    return {
        0: { get: () => pid, set: () => {} },
        4: proField('textID'),
        8: {
            get: (p) => ((num(p.frmType) << 24) | num(p.frmPID)) | 0,
            set: (p, v) => { p.frmType = (v >>> 24) & 0xff; p.frmPID = v & 0xffffff },
        },
        12: proField('lightRadius'),
        16: proField('lightIntensity'),
        20: proField('flags'),
    }
}

function itemFields(subType: number): Record<number, Field> {
    const fields: Record<number, Field> = {
        24: {
            get: (p) => ((num(p.extra?.itemFlags) << 24) | (num(p.extra?.actionFlags) << 16) |
                (num(p.extra?.weaponFlags) << 8) | num(p.extra?.attackMode)) | 0,
            set: (p, v) => {
                p.extra ??= {}
                p.extra.itemFlags = (v >>> 24) & 0xff
                p.extra.actionFlags = (v >>> 16) & 0xff
                p.extra.weaponFlags = (v >>> 8) & 0xff
                p.extra.attackMode = v & 0xff
            },
        },
        28: extraField('scriptID'),
        32: extraField('subType'),
        108: extraField('materialID'),
        112: extraField('size'),
        116: extraField('weight'),
        120: extraField('cost'),
        124: extraField('invFRM'),
        128: extraField('soundID'),
    }
    const at = (start: number, ...keys: (string | string[])[]) => {
        keys.forEach((k, i) => { fields[start + i * 4] = Array.isArray(k) ? extraField(...k) : extraField(k) })
    }
    switch (subType) {
        case 0: // armor
            at(36, 'AC', ...ARMOR_STATS.map((s) => ['stats', s]), 'perk', 'maleFID', 'femaleFID')
            break
        case 1: // container
            at(36, 'maxSize', 'containerFlags')
            break
        case 2: // drug
            at(36, 'stat0', 'stat1', 'stat2', 'amount0', 'amount1', 'amount2',
                ['firstDelayed', 'duration'], ['firstDelayed', 'amount0'], ['firstDelayed', 'amount1'], ['firstDelayed', 'amount2'],
                ['secondDelayed', 'duration'], ['secondDelayed', 'amount0'], ['secondDelayed', 'amount1'], ['secondDelayed', 'amount2'],
                'addictionRate', 'addictionEffect', 'addictionOnset')
            break
        case 3: // weapon
            at(36, 'animCode', 'minDmg', 'maxDmg', 'dmgType', 'maxRange1', 'maxRange2', 'projPID', 'minST',
                'APCost1', 'APCost2', 'critFail', 'perk', 'rounds', 'caliber', 'ammoPID', 'maxAmmo', 'soundID')
            break
        case 4: // ammo
            at(36, 'caliber', 'quantity', 'AC modifier', 'DR modifier', 'damMult', 'damDiv')
            break
        case 5: // misc
            at(36, 'powerPID', 'powerType', 'charges')
            break
        case 6: // key
            at(36, 'keyCode')
            break
    }
    return fields
}

/** A critter stat: changing the proto also changes the critters made from it. */
function critterStat(group: 'baseStats' | 'bonusStats', index: number, pid: number): Field {
    if (index === 33 || index === 34) {
        const key = (group === 'bonusStats' ? 'bonus' : '') + (index === 33 ? 'Age' : 'Gender')
        const field = extraField(group === 'bonusStats' ? key : key.toLowerCase())
        return field
    }
    const name = PRO_STATS[index]
    const field = extraField(group, name)
    return {
        get: field.get,
        set: (pro, v) => {
            const delta = v - field.get(pro)
            field.set(pro, v)
            const live = LIVE_STATS[name] ?? name
            for (const obj of mapObjects()) {
                if (obj?.type === 'critter' && obj.pid === pid && obj !== globalState.player && obj.stats?.baseStats) {
                    obj.stats.baseStats[live] = num(obj.stats.baseStats[live]) + delta
                }
            }
        },
    }
}

function critterFields(pid: number): Record<number, Field> {
    const fields: Record<number, Field> = {
        24: extraField('actionFlags'),
        28: extraField('scriptID'),
        32: extraField('flags'),
        388: extraField('bodyType'),
        392: extraField('XPValue'),
        396: extraField('killType'),
        400: extraField('damageType'),
        404: extraField('headFID'),
        408: extraField('AI'),
        412: extraField('team'),
    }
    for (let i = 0; i < 35; i++) {
        fields[36 + i * 4] = critterStat('baseStats', i, pid)
        fields[176 + i * 4] = critterStat('bonusStats', i, pid)
    }
    SKILLS.forEach((s, i) => { fields[316 + i * 4] = extraField('skills', s) })
    return fields
}

function sceneryFields(subType: number): Record<number, Field> {
    const fields: Record<number, Field> = {
        24: {
            get: (p) => ((num(p.extra?.wallLightTypeFlags) << 16) | (num(p.extra?.actionFlags) & 0xffff)) | 0,
            set: (p, v) => {
                p.extra ??= {}
                p.extra.wallLightTypeFlags = (v >>> 16) & 0xffff
                p.extra.actionFlags = v & 0xffff
            },
        },
        28: extraField('scriptPID'),
        32: extraField('subType'),
        44: extraField('materialID'),
        52: extraField('soundID'),
    }
    switch (subType) {
        case 0: fields[36] = extraField('walkthroughFlag'); break
        case 1: fields[36] = extraField('destination'); fields[40] = extraField('destinationMap'); break
        case 2: fields[36] = extraField('elevatorType'); fields[40] = extraField('elevatorLevel'); break
        case 3: case 4: fields[36] = extraField('destination'); break
    }
    return fields
}

function mapObjects(): any[] {
    try {
        return (globalState.gMap?.getObjects?.() ?? []) as any[]
    } catch {
        return []
    }
}

function fieldsOf(pid: number, pro: any): Record<number, Field> {
    const type = (pid >>> 24) & 0xff
    const fields = header(pro, pid)
    switch (type) {
        case 0: return { ...fields, ...itemFields(num(pro.extra?.subType)) }
        case 1: return { ...fields, ...critterFields(pid) }
        case 2: return { ...fields, ...sceneryFields(num(pro.extra?.subType)) }
        case 3: return { ...fields, 24: extraField('actionFlags'), 28: extraField('scriptPID'), 32: extraField('materialID') }
        case 5: return { ...fields, 24: extraField('actionFlags') }
        default: return fields
    }
}

function protoOf(pid: number): any | null {
    const type = (pid >>> 24) & 0xff
    if (pid === -1 || type > 5 || type === 4) {return null}
    try {
        return loadPRO(pid, pid & 0xffff) ?? null
    } catch {
        return null
    }
}

/** get_proto_data(pid, offset): -1 when the proto does not load; 0 for offsets past the struct. */
export function getProtoData(pid: number, offset: number): number {
    const pro = protoOf(pid)
    if (!pro) {return -1}
    return fieldsOf(pid, pro)[offset]?.get(pro) ?? 0
}

/** set_proto_data(pid, offset, value): -1 when the proto does not load. */
export function setProtoData(pid: number, offset: number, value: number): number {
    const pro = protoOf(pid)
    if (!pro) {return -1}
    fieldsOf(pid, pro)[offset]?.set(pro, value | 0)
    return 0
}
