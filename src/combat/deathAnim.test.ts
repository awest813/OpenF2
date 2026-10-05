import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import globalState from '../globalState.js'
import { clearHookScripts, getHookArgAt, HOOK, registerHook, setHookReturn } from '../hookScripts.js'
import { computeDamage } from './fo2Formulas.js'
import {
    ANIM_BIG_HOLE, ANIM_CHUNKS_OF_FLESH, ANIM_DANCING_AUTOFIRE, ANIM_FALL_BACK, ANIM_FALL_FRONT, ANIM_FIRE_BURST,
    ANIM_FIRE_SINGLE, ANIM_THROW_PUNCH, deathAnimationFor, isHitFromFront, pickDeath,
} from './deathAnim.js'

/** A critter whose art set holds the given animation codes. */
function critter(codes: number[]): any {
    const letter = (n: number) => String.fromCharCode('a'.charCodeAt(0) + n)
    for (const code of codes) {
        const art = 'art/critters/hmjmps' + (code >= 48 ? 'r' + letter(code - 48) : 'b' + letter(code - 20))
        globalState.imageInfo[art] = { numFrames: 1, fps: 10 } as any
    }
    return { type: 'critter', art: 'art/critters/hmjmpsaa', getBase: () => 'art/critters/hmjmps', orientation: 0, pro: { extra: {} } }
}

let savedImages: any
let savedViolence: number
beforeEach(() => {
    savedImages = globalState.imageInfo
    savedViolence = globalState.violenceLevel
    globalState.imageInfo = {} as any
})
afterEach(() => {
    globalState.imageInfo = savedImages
    globalState.violenceLevel = savedViolence
    clearHookScripts()
})

describe('_pick_death', () => {
    it('a heavy burst at maximum blood rips the critter apart; a weaker one riddles it', () => {
        globalState.violenceLevel = 2
        const target = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT, ANIM_CHUNKS_OF_FLESH, ANIM_DANCING_AUTOFIRE])
        expect(pickDeath({}, target, null, 50, 'Normal', ANIM_FIRE_BURST, true)).toBe(ANIM_CHUNKS_OF_FLESH)
        expect(pickDeath({}, target, null, 20, 'Normal', ANIM_FIRE_BURST, true)).toBe(ANIM_DANCING_AUTOFIRE)
        expect(pickDeath({}, target, null, 5, 'Normal', ANIM_FIRE_BURST, true)).toBe(ANIM_FALL_BACK)
    })

    it('single shots blow a big hole only at maximum blood with 45+ damage', () => {
        globalState.violenceLevel = 2
        const target = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT, ANIM_BIG_HOLE])
        expect(pickDeath({}, target, null, 45, 'Normal', ANIM_FIRE_SINGLE, true)).toBe(ANIM_BIG_HOLE)
        globalState.violenceLevel = 1
        expect(pickDeath({}, target, null, 45, 'Normal', ANIM_FIRE_SINGLE, true)).toBe(ANIM_FALL_BACK)
    })

    it('a punch from behind drops the critter on its face', () => {
        const target = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT])
        expect(pickDeath({}, target, null, 10, 'Normal', ANIM_THROW_PUNCH, false)).toBe(ANIM_FALL_FRONT)
        expect(pickDeath({}, target, null, 10, 'Normal', ANIM_THROW_PUNCH, true)).toBe(ANIM_FALL_BACK)
    })

    it('_is_hit_from_front: facing the same way (or one off) is from behind', () => {
        expect(isHitFromFront({ orientation: 0 }, { orientation: 3 })).toBe(true)
        expect(isHitFromFront({ orientation: 0 }, { orientation: 0 })).toBe(false)
        expect(isHitFromFront({ orientation: 0 }, { orientation: 5 })).toBe(false)
    })

    it('DeathAnim2 replaces the pick and sees it as arg4', () => {
        const target = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT])
        let seen = -1
        registerHook({ start() { seen = Number(getHookArgAt(4)); setHookReturn(ANIM_BIG_HOLE) } }, HOOK.DEATHANIM2, null, false)
        expect(deathAnimationFor({}, target, null, 10, 'Normal', ANIM_THROW_PUNCH, true)).toBe(ANIM_BIG_HOLE)
        expect(seen).toBe(ANIM_FALL_BACK)
    })
})

describe('HOOK_SUBCOMBATDAMAGE', () => {
    it('replaces the per-round total; Living Anatomy-style flat damage still adds', () => {
        const input = {
            minDamage: 10, maxDamage: 10, rounds: 1, damageBonus: 0, damageMultiplier: 2,
            ammoDamageMultiplier: 1, ammoDamageDivisor: 1, ammoDRModifier: 0,
            damageThreshold: 2, damageResistance: 20, bypassArmor: false, isEmp: false,
            penetrate: false, finesse: false, difficultyPercent: 100, flatAfter: 5,
        }
        expect(computeDamage(input, () => 10)).toBe(8 - Math.trunc(8 * 20 / 100) + 5)
        expect(computeDamage({ ...input, replaceRounds: (dr, dt) => dr + dt }, () => 10)).toBe(22 + 5)
    })
})
