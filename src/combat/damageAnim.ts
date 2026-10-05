/**
 * How a critter reacts on screen to a blow it survives, and getting back up
 * (actions.cc _show_damage_to_object, _pick_fall; animation.cc _dude_standup;
 * the dodge in _action_melee).
 */

import globalState from '../globalState.js'
import { hexInDirectionDistance, type Point } from '../geometry.js'
import {
    ANIMATION_REQUEST_RESERVED, critterArt, regAnimAnimate, regAnimBegin, regAnimCallback, regAnimClear, regAnimEnd,
    PROJECTILE_HEXES_PER_TICK, regAnimFly, regAnimOnEnd, regAnimSetArt,
} from '../animSequence.js'
import { Dam } from './criticalTables.js'

export const ANIM_STAND = 0
export const ANIM_DODGE_ANIM = 13
export const ANIM_HIT_FROM_FRONT = 14
export const ANIM_HIT_FROM_BACK = 15
export const ANIM_FALL_BACK = 20
export const ANIM_FALL_FRONT = 21
export const ANIM_FIRE_DANCE = 33
export const ANIM_BURNED_TO_NOTHING = 29
export const ANIM_PRONE_TO_STANDING = 36
export const ANIM_BACK_TO_STANDING = 37
export const ANIM_POINT = 43
export const ANIM_UNPOINT = 44
/** A fall's single-frame lying-down version (ANIM_FALL_BACK_SF − ANIM_FALL_BACK). */
const SINGLE_FRAME_OFFSET = 28

const CRITTER_NO_KNOCKBACK = 0x4000

function blockingAt(self: any, hex: Point | null): boolean {
    if (!hex) {return true}
    const objects: any[] = (globalState.gMap as any)?.objectsAtPosition?.(hex) ?? []
    return objects.some((o) => o !== self && (o.type === 'critter' ? !o.dead : typeof o.blocks === 'function' && o.blocks() === true))
}

/**
 * _pick_fall: a critter falls the other way when something stands within two
 * hexes where it would land, and backwards when it has no forward fall.
 */
export function pickFall(critter: any, anim: number): number {
    const position: Point | null = critter?.position ?? null
    const rotation = critter?.orientation ?? 0
    if (position && anim === ANIM_FALL_FRONT) {
        for (let i = 1; i < 3; i++) {
            if (blockingAt(critter, hexInDirectionDistance(position, rotation, i))) {
                anim = ANIM_FALL_BACK
                break
            }
        }
    } else if (position && anim === ANIM_FALL_BACK) {
        for (let i = 1; i < 3; i++) {
            if (blockingAt(critter, hexInDirectionDistance(position, (rotation + 3) % 6, i))) {
                anim = ANIM_FALL_FRONT
                break
            }
        }
    }
    if (anim === ANIM_FALL_FRONT && !critterArt(critter, ANIM_FALL_FRONT)) {anim = ANIM_FALL_BACK}
    return anim
}

type Step = { anim: number } | { art: number } | { call: () => void }

function registerStep(owner: any, step: Step, delay: number): number {
    if ('anim' in step) {return regAnimAnimate(owner, step.anim, delay)}
    if ('art' in step) {return regAnimSetArt(owner, step.art, delay)}
    return regAnimCallback(owner, step.call, delay)
}

/** Play `steps` now as one sequence of their own. False when it could not be registered. */
function playNow(owner: any, steps: Step[]): boolean {
    regAnimClear(owner)
    if (regAnimBegin(ANIMATION_REQUEST_RESERVED) === -1) {return false}
    let delay = 0
    for (const step of steps) {
        if (registerStep(owner, step, delay) === -1) {return false}
        delay = -1
    }
    return regAnimEnd() !== -1
}

/**
 * While an attack is being worked out, reactions wait here so they can join
 * the attacker's swing in one sequence (_action_melee / _action_ranged).
 */
let batch: Array<{ owner: any; steps: Step[] }> | null = null

function play(owner: any, steps: Step[]): boolean {
    if (batch) {
        batch.push({ owner, steps })
        return true
    }
    return playNow(owner, steps)
}

/** Start collecting reactions for an attack (anything left over plays at once). */
export function beginReactionBatch(): void {
    const stale = batch
    batch = null
    for (const p of stale ?? []) {playNow(p.owner, p.steps)}
    batch = []
}

export interface AttackSequenceOptions {
    /** _action_ranged: raise the weapon first (ANIM_POINT) and lower it after (ANIM_UNPOINT). */
    point?: boolean
    /**
     * A projectile with art of its own: shown at the swing's action frame on
     * `path[0]`, it flies along `path`; the hits land when it arrives, then
     * `remove` takes it off the map.
     */
    projectile?: {
        obj: any
        path: Array<{ x: number; y: number }>
        show: () => void
        remove: () => void
        /**
         * Explosives: on arrival the projectile becomes the explosion `art`,
         * the `ring` around it bursts too, and the hits land with the blast.
         */
        explode?: { art: string; ring: Array<{ obj: any; show: () => void }> }
    }
}

/**
 * The attack's sequence (_action_melee / _action_ranged): the attacker's
 * swing, each reaction starting at the swing's action frame (or when the
 * projectile arrives; the attacker's own after the swing), then `onDone`.
 * Without the swing's art, or when the sequence cannot be registered, the
 * reactions play at once and `fallback(onDone)` animates the attacker.
 */
export function endReactionBatch(
    attacker: any, attackAnim: number, onDone: () => void, fallback: (done: () => void) => void,
    opts: AttackSequenceOptions = {}
): void {
    // A critter hit twice shows only its last reaction (one animation at a time).
    const latest = new Map<any, Step[]>()
    for (const p of batch ?? []) {
        latest.delete(p.owner)
        latest.set(p.owner, p.steps)
    }
    const pending = [...latest].map(([owner, steps]) => ({ owner, steps }))
    batch = null
    const art = critterArt(attacker, attackAnim)
    const immediate = () => {
        for (const p of pending) {playNow(p.owner, p.steps)}
        fallback(onDone)
    }
    if (!art) {
        immediate()
        return
    }
    regAnimClear(attacker)
    for (const p of pending) {regAnimClear(p.owner)}
    const actionFrame = Math.max(0, globalState.imageInfo?.[art]?.actionFrame ?? 0)
    const point = opts.point === true && critterArt(attacker, ANIM_POINT) !== null
    const projectile = opts.projectile && opts.projectile.path.length > 0 ? opts.projectile : null

    // The turn must go on even if a step fails or the sequence is cleared.
    let called = false
    const finished = () => {
        if (called) {return}
        called = true
        onDone()
    }
    let ok = regAnimBegin(ANIMATION_REQUEST_RESERVED) !== -1
    if (ok) {regAnimOnEnd(() => {
        projectile?.remove()
        finished()
    })}
    if (ok && point) {ok = regAnimAnimate(attacker, ANIM_POINT, 0) !== -1}
    ok = ok && regAnimAnimate(attacker, attackAnim, point ? -1 : 0) !== -1

    // When the first hit lands, counted from the swing (or the flight).
    let hitDelay = actionFrame > 0 ? actionFrame : 0
    if (ok && projectile) {
        ok = regAnimCallback(projectile.obj, projectile.show, actionFrame > 0 ? actionFrame : 0) !== -1
            && regAnimFly(projectile.obj, projectile.path, 0) !== -1
        hitDelay = Math.ceil((projectile.path.length - 1) / PROJECTILE_HEXES_PER_TICK)
        const blast = projectile.explode
        if (ok && blast) {
            const obj = projectile.obj
            ok = regAnimCallback(obj, () => {
                obj.art = blast.art
                obj.frame = 0
            }, -1) !== -1 && regAnimAnimate(obj, 0, 0) !== -1
            for (const piece of blast.ring) {
                if (!ok) {break}
                ok = regAnimCallback(piece.obj, piece.show, 0) !== -1 && regAnimAnimate(piece.obj, 0, 0) !== -1
            }
            hitDelay = 0
        }
    }

    let first = true
    for (const p of pending) {
        if (!ok) {break}
        let delay = p.owner === attacker ? -1 : first && hitDelay > 0 ? hitDelay : 0
        if (p.owner !== attacker) {first = false}
        for (const step of p.steps) {
            if (registerStep(p.owner, step, delay) === -1) {
                ok = false
                break
            }
            delay = -1
        }
    }
    if (ok && projectile) {ok = regAnimCallback(projectile.obj, projectile.remove, -1) !== -1}
    const attackerStanding = !attacker.dead && !attacker.knockedDown && !attacker.knockedOut
    if (ok && point && attackerStanding && critterArt(attacker, ANIM_UNPOINT)) {
        ok = regAnimAnimate(attacker, ANIM_UNPOINT, -1) !== -1
    }
    ok = ok && regAnimCallback(attacker, finished, -1) !== -1 && regAnimEnd() !== -1
    if (!ok) {
        projectile?.remove()
        immediate()
    }
}

/**
 * _show_death: a death animation (a fire dance burns on down to nothing),
 * then `done`. False when it could not be played as a sequence.
 */
export function playDeath(critter: any, anim: number, burnedAfter: boolean, done: () => void): boolean {
    const steps: Step[] = [{ anim }]
    if (burnedAfter) {steps.push({ anim: ANIM_BURNED_TO_NOTHING })}
    steps.push({ call: done })
    return play(critter, steps)
}

/**
 * _show_damage_to_object for a critter that lives through the hit (and was
 * standing): knocked down or out it falls and stays down; set on fire it
 * dances; knocked back it falls and gets up; otherwise it flinches from the
 * front or the back.
 */
export function showDamageReaction(defender: any, flags: number, hitFromFront: boolean, knockbackDistance: number): void {
    if (defender?.type !== 'critter' || defender.dead) {return}
    if (((defender.pro?.extra?.flags ?? 0) & CRITTER_NO_KNOCKBACK) !== 0) {knockbackDistance = 0}

    if ((flags & (Dam.KNOCKED_OUT | Dam.KNOCKED_DOWN)) !== 0) {
        const anim = pickFall(defender, hitFromFront ? ANIM_FALL_BACK : ANIM_FALL_FRONT)
        play(defender, [{ anim }, { art: anim + SINGLE_FRAME_OFFSET }])
        return
    }
    if ((flags & Dam.ON_FIRE) !== 0 && critterArt(defender, ANIM_FIRE_DANCE)) {
        play(defender, [{ anim: ANIM_FIRE_DANCE }, { art: ANIM_STAND }])
        return
    }
    if (knockbackDistance !== 0) {
        // actionKnockdown: no forward fall drawn means a backward one.
        let anim = hitFromFront ? ANIM_FALL_BACK : ANIM_FALL_FRONT
        if (anim === ANIM_FALL_FRONT && !critterArt(defender, ANIM_FALL_FRONT)) {anim = ANIM_FALL_BACK}
        play(defender, [{ anim }, { anim: anim === ANIM_FALL_BACK ? ANIM_BACK_TO_STANDING : ANIM_PRONE_TO_STANDING }])
        return
    }
    const anim = hitFromFront || !critterArt(defender, ANIM_HIT_FROM_BACK) ? ANIM_HIT_FROM_FRONT : ANIM_HIT_FROM_BACK
    play(defender, [{ anim }])
}

/** _dude_standup: up from whichever way the critter fell. */
export function standUpAnimation(critter: any): void {
    const lyingBack = critter?.animCode === ANIM_FALL_BACK || critter?.animCode === ANIM_FALL_BACK + SINGLE_FRAME_OFFSET
    play(critter, [{ anim: lyingBack ? ANIM_BACK_TO_STANDING : ANIM_PRONE_TO_STANDING }])
}

/** _action_melee: a defender that is not knocked down or out sidesteps a missed blow. */
export function dodgeAnimation(defender: any): void {
    if (defender?.type !== 'critter' || defender.dead || defender.knockedDown || defender.knockedOut) {return}
    if (!critterArt(defender, ANIM_DODGE_ANIM)) {return}
    play(defender, [{ anim: ANIM_DODGE_ANIM }])
}
