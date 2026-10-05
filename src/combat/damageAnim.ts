/**
 * How a critter reacts on screen to a blow it survives, and getting back up
 * (actions.cc _show_damage_to_object, _pick_fall; animation.cc _dude_standup;
 * the dodge in _action_melee).
 */

import globalState from '../globalState.js'
import { hexInDirectionDistance, type Point } from '../geometry.js'
import {
    ANIMATION_REQUEST_RESERVED, critterArt, regAnimAnimate, regAnimBegin, regAnimClear, regAnimEnd, regAnimSetArt,
} from '../animSequence.js'
import { Dam } from './criticalTables.js'

export const ANIM_STAND = 0
export const ANIM_DODGE_ANIM = 13
export const ANIM_HIT_FROM_FRONT = 14
export const ANIM_HIT_FROM_BACK = 15
export const ANIM_FALL_BACK = 20
export const ANIM_FALL_FRONT = 21
export const ANIM_FIRE_DANCE = 33
export const ANIM_PRONE_TO_STANDING = 36
export const ANIM_BACK_TO_STANDING = 37
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

/** Play `steps` (an animation, or a lying-down frame to switch to) as one sequence. */
function play(critter: any, steps: Array<{ anim: number } | { art: number }>): boolean {
    regAnimClear(critter)
    if (regAnimBegin(ANIMATION_REQUEST_RESERVED) === -1) {return false}
    let delay = 0
    for (const step of steps) {
        const ok = 'anim' in step ? regAnimAnimate(critter, step.anim, delay) : regAnimSetArt(critter, step.art, -1)
        if (ok === -1) {return false}
        delay = -1
    }
    return regAnimEnd() !== -1
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
