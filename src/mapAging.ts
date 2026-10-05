/**
 * What changes on a map while the player is away (map.cc mapLoadSaved /
 * _map_age_dead_critters) and at midnight (scripts.cc
 * gameTimeEventProcess): living critters heal and stop fleeing, jammed
 * locks come free, and after six days the dead are cleared away, leaving
 * blood on the floor and their belongings where they lay.
 */

import { isPartyMember } from './combat/aiPacket.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './gameTime.js'

const CRITTER_NO_DROP = 0x40
const CRITTER_NO_HEAL = 0x200
const CRITTER_FLAT = 0x800

const KILL_TYPE_RAT = 7
const KILL_TYPE_ROBOT = 10
const KILL_TYPE_MANTIS = 12

const MANEUVER_FLEEING = 0x04

/** The blood pool left in place of an aged corpse (misc proto 4). */
export const BLOOD_PID = 0x5000004

function critterFlags(critter: any): number {
    return critter?.pro?.extra?.flags ?? 0
}

function killType(critter: any): number {
    const kt = critter?.killType ?? critter?.pro?.extra?.killType
    return typeof kt === 'number' ? kt : -1
}

function isLockable(obj: any): boolean {
    return obj?.type === 'item' ? obj.subtype === 'container' : obj?.type === 'scenery' && obj.subtype === 'door'
}

/** objectIsJammed. */
export function isJammed(obj: any): boolean {
    return isLockable(obj) && obj.lockJammed === true
}

/** objectUnjamLock. */
export function unjamLock(obj: any): void {
    if (isLockable(obj)) {obj.lockJammed = false}
}

/** objectUnjamAll: every top-level object on every elevation. */
export function unjamAll(levels: any[][] | null | undefined): void {
    for (const level of levels ?? []) {
        for (const obj of level ?? []) {unjamLock(obj)}
    }
}

/** Whether a game clock moving from `before` to `after` passed midnight. */
export function crossedMidnight(before: number, after: number): boolean {
    return Math.floor(after / TICKS_PER_DAY) > Math.floor(before / TICKS_PER_DAY)
}

/** gameTimeEventProcess: when the clock passes midnight, every lock on the map comes free. */
export function midnightCheck(before: number, after: number, levels: any[][] | null | undefined): void {
    if (crossedMidnight(before, after)) {unjamAll(levels)}
}

/** _critter_heal_hours: 14 HP for every three hours away, and no more fleeing. */
export function critterHealHours(critter: any, hours: number): void {
    if (critter?.type !== 'critter') {return}
    const hp = critter.getStat?.('HP') ?? 0
    const maxHp = critter.getStat?.('Max HP') ?? 0
    if (hp < maxHp) {
        const heal = Math.min(14 * Math.trunc(hours / 3), maxHp - hp)
        if (heal > 0) {critter.stats?.modifyBase?.('HP', heal)}
    }
    critter.combatManeuver = (critter.combatManeuver ?? 0) & ~MANEUVER_FLEEING
}

export interface AgingDeps {
    /** objectCreateWithPid for the blood pool; null when it cannot be made. */
    createObject(pid: number): any
    addObject(obj: any, level: number): void
    removeObject(obj: any): void
    random(min: number, max: number): number
}

/** itemDropAll: everything the critter carries lands on its hex. */
function dropAll(critter: any, level: number, deps: AgingDeps): void {
    const items: any[] = critter.inventory ?? []
    if (!critter.position || items.length === 0) {return}
    for (const item of items) {
        item.position = { x: critter.position.x, y: critter.position.y }
        deps.addObject(item, level)
    }
    critter.inventory = []
    if (items.includes(critter.leftHand)) {critter.leftHand = undefined}
    if (items.includes(critter.rightHand)) {critter.rightHand = undefined}
    if (items.includes(critter.equippedArmor)) {critter.equippedArmor = null}
}

/**
 * mapLoadSaved's aging step, for a map the player returns to. `levels` are
 * the map's objects per elevation; `deadBodiesAge` is the MAPS.TXT
 * dead_bodies_age flag.
 */
export function ageMapOnReentry(
    levels: any[][],
    lastVisitTime: number,
    now: number,
    deadBodiesAge: boolean,
    deps: AgingDeps
): void {
    if (now < lastVisitTime) {return}
    if ((now - lastVisitTime) / TICKS_PER_HOUR >= 24) {unjamAll(levels)}
    if (!deadBodiesAge) {return}

    const hours = Math.trunc((now - lastVisitTime) / TICKS_PER_HOUR)
    if (hours === 0) {return}

    for (const level of levels) {
        for (const obj of level ?? []) {
            if (obj?.type !== 'critter' || obj.isPlayer || isPartyMember(obj) || obj.dead) {continue}
            obj.combatManeuver = (obj.combatManeuver ?? 0) & ~MANEUVER_FLEEING
            if (killType(obj) !== KILL_TYPE_ROBOT && (critterFlags(obj) & CRITTER_NO_HEAL) === 0) {
                critterHealHours(obj, hours)
            }
        }
    }

    // The engine tests "more than six days" before "more than fourteen", so
    // only corpses are ever cleared; old blood stays.
    if (hours <= 6 * 24) {return}

    levels.forEach((level, elevation) => {
        const corpses = (level ?? []).filter(
            (obj: any) =>
                obj?.type === 'critter' &&
                !obj.isPlayer &&
                obj.dead &&
                killType(obj) !== KILL_TYPE_ROBOT &&
                (critterFlags(obj) & CRITTER_NO_HEAL) === 0
        )
        for (const corpse of corpses) {
            if ((critterFlags(corpse) & CRITTER_NO_DROP) === 0) {dropAll(corpse, elevation, deps)}

            const blood = deps.createObject(BLOOD_PID)
            if (blood && corpse.position) {
                let frame = deps.random(0, 3)
                if (critterFlags(corpse) & CRITTER_FLAT) {frame += 6}
                else if (killType(corpse) !== KILL_TYPE_RAT && killType(corpse) !== KILL_TYPE_MANTIS) {frame += 3}
                blood.position = { x: corpse.position.x, y: corpse.position.y }
                blood.frame = frame
                deps.addObject(blood, elevation)
            }
            deps.removeObject(corpse)
        }
    })
}
