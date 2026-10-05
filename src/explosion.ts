/**
 * A free-standing explosion (actions.cc actionExplode / _report_explosion /
 * _compute_explosion_damage): the timed explosives and the script
 * explosion() call. The critter on the blast hex and up to six more within
 * three hexes, each with a clear line to it, take a roll between the
 * minimum and maximum, less Explosion DT and then DR, and are knocked back
 * a hex per 10 points. Survivors blame the source, and if no fight is on
 * one of them starts one against it.
 */

import { hexDirectionTo, hexDistance, hexInDirectionDistance, hexLine, type Point } from './geometry.js'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getRandomInt } from './util.js'
import type { Rng } from './combat/fo2Formulas.js'
import { describeAttack } from './combat/combatMessages.js'
import { setWhoHitMe } from './combat/aiPacket.js'
import { sfallSettings } from './sfallSettings.js'
import { HOOK, runHook } from './hookScripts.js'
import { toTileNum } from './tile.js'

/** item.cc gRocketExplosionRadius: the reach of a free-standing blast. */
export const EXPLOSION_RADIUS = 3
/** item.cc gExplosionMaxTargets: critters caught besides the one on the blast hex. */
export const EXPLOSION_MAX_TARGETS = 6

const OBJECT_MULTIHEX = 0x800
const OBJECT_SHOOT_THRU = 0x80000000
const CRITTER_NO_KNOCKBACK = 0x4000

const defaultRng: Rng = (min, max) => getRandomInt(min, max)

function statOf(critter: any, stat: string): number {
    try {
        const v = critter?.getStat?.(stat)
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

/** _compute_explosion_damage: roll − DT, then − DR%, never below 0; knockback damage/10. */
export function explosionDamage(min: number, max: number, defender: any, rng: Rng = defaultRng): { damage: number; knockback: number } {
    let damage = rng(min, max) - statOf(defender, 'DT Explosive')
    if (damage > 0) {damage -= Math.trunc((statOf(defender, 'DR Explosive') * damage) / 100)}
    if (damage < 0) {damage = 0}
    const knockback = (defender?.flags ?? 0) & OBJECT_MULTIHEX ? 0 : Math.trunc(damage / 10)
    return { damage, knockback }
}

export interface ExplosionMap {
    objectsAt(pos: Point): any[]
    critters(): any[]
}

export function liveMap(): ExplosionMap | null {
    const map: any = globalState.gMap
    if (!map) {return null}
    return {
        objectsAt: (pos) => map.objectsAtPosition?.(pos) ?? [],
        critters: () => (map.getObjects?.() ?? []).filter((o: any) => o?.type === 'critter'),
    }
}

function blocks(obj: any): boolean {
    if (!obj || obj.type === 'critter') {return false}
    if (((obj.flags ?? 0) & OBJECT_SHOOT_THRU) !== 0) {return false}
    try {
        return typeof obj.blocks === 'function' ? obj.blocks() === true : false
    } catch {
        return false
    }
}

/** _combat_is_shot_blocked between a critter and the blast hex (critters do not block). */
function lineBlocked(map: ExplosionMap, from: Point, to: Point): boolean {
    for (const hex of hexLine(from, to).slice(1, -1)) {
        if (map.objectsAt(hex).some(blocks)) {return true}
    }
    return false
}

/**
 * The critters an explosion at `center` catches: the living critter on the
 * hex, then up to six others ring by ring out to three hexes.
 */
export function explosionVictims(
    center: Point, map: ExplosionMap,
    opts: { attacker?: any; throwing?: boolean; noDamage?: boolean } = {}
): { main: any; extras: any[] } {
    const living = map.critters().filter((c) => !c.dead && c.position)
    const main = living.find((c) => c.position.x === center.x && c.position.y === center.y) ?? null
    const candidates = living
        .filter((c) => c !== main && hexDistance(center, c.position) <= sfallSettings.explosionRadiusRocket)
        .sort((a, b) => hexDistance(center, a.position) - hexDistance(center, b.position))
    const extras: any[] = []
    for (const found of candidates) {
        if (extras.length >= sfallSettings.explosionMaxTargets) {break}
        // sfall HOOK_ONEXPLOSION: per checked tile, the found object may be
        // replaced, or skipped with 0.
        let c: any = found
        const hook = runHook(HOOK.ONEXPLOSION, [
            opts.noDamage ? 1 : 0, opts.attacker ?? 0, toTileNum(center), toTileNum(found.position),
            found, main ?? 0, opts.throwing ? 1 : 0,
        ], { allowNonIntReturn: true })
        if (hook && hook.rets.length > 0) {
            const r = hook.rets[0]
            if (!r || typeof r !== 'object') {continue}
            c = r
        }
        if (c === main || extras.includes(c) || !c.position || c.dead) {continue}
        if (((c.flags ?? 0) & OBJECT_SHOOT_THRU) !== 0 || lineBlocked(map, c.position, center)) {continue}
        extras.push(c)
    }
    return { main, extras }
}

/**
 * actionKnockdown: slide up to `distance` hexes (at most 20) away from
 * `from`, stopping before anything solid.
 */
export function knockBack(map: ExplosionMap | null, critter: any, from: Point, distance: number): void {
    if (!map || distance <= 0 || !critter?.position) {return}
    if (((critter.pro?.extra?.flags ?? 0) & CRITTER_NO_KNOCKBACK) !== 0) {return}
    if (critter.position.x === from.x && critter.position.y === from.y) {return}
    const dir = hexDirectionTo(from, critter.position)
    if (dir === null || dir === undefined) {return}
    let dest: Point | null = null
    for (let step = 1; step <= Math.min(distance, 20); step++) {
        const hex = hexInDirectionDistance(critter.position, dir, step)
        if (!hex || map.objectsAt(hex).some((o) => o !== critter && (o.type === 'critter' ? !o.dead : blocks(o)))) {break}
        dest = hex
    }
    if (dest && typeof critter.move === 'function') {critter.move(dest)}
}

export interface ExplosionHooks {
    /** critterDamage: take HP (and die at 0). */
    damage(critter: any, amount: number, source: any): void
    /** damage_p_proc on a scripted non-critter object near the blast. */
    damageScenery?(obj: any): void
    /** Start a fight: `attacker` turns on `defender`. */
    startCombat?(attacker: any, defender: any): void
}

/**
 * actionExplode (without the animation): damage, messages, knockback,
 * blame. Returns the critters hit.
 */
export function explode(
    center: Point,
    minDamage: number,
    maxDamage: number,
    source: any,
    hooks: ExplosionHooks,
    map: ExplosionMap | null = liveMap(),
    rng: Rng = defaultRng
): any[] {
    if (!map) {return []}
    const { main, extras } = explosionVictims(center, map, { attacker: source })
    const hits = [main, ...extras].filter(Boolean).map((critter) => ({ critter, ...explosionDamage(minDamage, maxDamage, critter, rng) }))

    for (const hit of hits) {
        if (hit.damage > 0) {hooks.damage(hit.critter, hit.damage, source)}
    }

    const report = (hit: { critter: any; damage: number }) => ({ critter: hit.critter, damage: hit.damage, flags: 0, died: hit.critter.dead === true })
    const mainHit = main ? hits[0] : null
    for (const line of describeAttack({
        attacker: { name: '', isPlayer: false },
        defender: mainHit ? mainHit.critter : null,
        hit: true, // attackerFlags = DAM_HIT
        critical: false,
        region: 'torso',
        defenderDamage: mainHit?.damage ?? 0,
        defenderFlags: 0,
        defenderDied: mainHit?.critter.dead === true,
        attackerDamage: 0,
        attackerFlags: 0,
        extras: hits.slice(mainHit ? 1 : 0).map(report),
    })) {
        EventBus.emit('ui:message', { text: line })
    }

    for (const hit of hits) {
        if (!hit.critter.dead) {knockBack(map, hit.critter, center, hit.knockback)}
    }

    // _combat_explode_scenery: scripted things in reach hear about it.
    if (hooks.damageScenery) {
        for (const obj of allObjectsNear(center)) {
            if (obj.type !== 'critter' && obj._script) {hooks.damageScenery(obj)}
        }
    }

    // _report_explosion: survivors blame the source; one of them may start a fight.
    if (source) {
        let anyDefender: any = null
        for (const hit of hits) {
            if (hit.critter === source || hit.critter.dead) {continue}
            setWhoHitMe(hit.critter, source, rng)
            anyDefender ??= hit.critter
        }
        if (anyDefender && !globalState.inCombat) {hooks.startCombat?.(anyDefender, source)}
    }

    return hits.map((h) => h.critter)
}

function allObjectsNear(center: Point): any[] {
    const objects: any[] = (globalState.gMap as any)?.getObjects?.() ?? []
    return objects.filter((o) => o?.position && hexDistance(center, o.position) <= sfallSettings.explosionRadiusRocket)
}
