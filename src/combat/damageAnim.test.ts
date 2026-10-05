import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from '../globalState.js'
import { resetAnimSequences } from '../animSequence.js'
import { Dam } from './criticalTables.js'
import {
    ANIM_DODGE_ANIM, ANIM_FALL_BACK, ANIM_FALL_FRONT, ANIM_FIRE_DANCE, ANIM_HIT_FROM_BACK, ANIM_HIT_FROM_FRONT,
    dodgeAnimation, pickFall, showDamageReaction, standUpAnimation,
} from './damageAnim.js'

const BASE = 'art/critters/hmjmps'
const CODES: Record<number, string> = {
    [ANIM_DODGE_ANIM]: 'an', [ANIM_HIT_FROM_FRONT]: 'ao', [ANIM_HIT_FROM_BACK]: 'ap',
    [ANIM_FALL_BACK]: 'ba', [ANIM_FALL_FRONT]: 'bb', [ANIM_FIRE_DANCE]: 'bn',
    36: 'ch', 37: 'cj', 48: 'ra', 49: 'rb',
}

function critter(codes: number[], at = { x: 50, y: 50 }): any {
    for (const code of codes) {globalState.imageInfo[BASE + CODES[code]] = { numFrames: 4, fps: 10 } as any}
    return {
        type: 'critter', art: BASE + 'aa', getBase: () => BASE, orientation: 0, position: at,
        pro: { extra: { flags: 0 } }, dead: false,
    }
}

let savedImages: any
let savedMap: any
beforeEach(() => {
    savedImages = globalState.imageInfo
    savedMap = globalState.gMap
    globalState.imageInfo = {} as any
    globalState.gMap = { objectsAtPosition: () => [] } as any
    resetAnimSequences()
})
afterEach(() => {
    globalState.imageInfo = savedImages
    globalState.gMap = savedMap
    resetAnimSequences()
})

describe('_show_damage_to_object for a survivor', () => {
    it('flinches from the front, or from the back when hit from behind', () => {
        const c = critter([ANIM_HIT_FROM_FRONT, ANIM_HIT_FROM_BACK])
        showDamageReaction(c, 0, true, 0)
        expect(c.animCode).toBe(ANIM_HIT_FROM_FRONT)
        resetAnimSequences()
        showDamageReaction(c, 0, false, 0)
        expect(c.animCode).toBe(ANIM_HIT_FROM_BACK)
    })

    it('without hit-from-back art it flinches from the front', () => {
        const c = critter([ANIM_HIT_FROM_FRONT])
        showDamageReaction(c, 0, false, 0)
        expect(c.animCode).toBe(ANIM_HIT_FROM_FRONT)
    })

    it('a knockdown falls away from the blow', () => {
        const c = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT, 48, 49])
        showDamageReaction(c, Dam.KNOCKED_DOWN, true, 0)
        expect(c.animCode).toBe(ANIM_FALL_BACK)
        resetAnimSequences()
        showDamageReaction(c, Dam.KNOCKED_OUT, false, 0)
        expect(c.animCode).toBe(ANIM_FALL_FRONT)
    })

    it('on fire with the art, it dances', () => {
        const c = critter([ANIM_HIT_FROM_FRONT, ANIM_FIRE_DANCE])
        showDamageReaction(c, Dam.ON_FIRE, true, 0)
        expect(c.animCode).toBe(ANIM_FIRE_DANCE)
    })

    it('_pick_fall: something in the way turns the fall around', () => {
        const c = critter([ANIM_FALL_BACK, ANIM_FALL_FRONT])
        const wall = { blocks: () => true }
        globalState.gMap = { objectsAtPosition: (p: any) => (p.x === c.position.x && p.y === c.position.y ? [] : [wall]) } as any
        expect(pickFall(c, ANIM_FALL_FRONT)).toBe(ANIM_FALL_BACK)
        expect(pickFall(c, ANIM_FALL_BACK)).toBe(ANIM_FALL_FRONT)
    })

    it('getting up matches the way it fell; a standing defender dodges a miss', () => {
        const c = critter([36, 37, ANIM_DODGE_ANIM])
        c.animCode = 48
        standUpAnimation(c)
        expect(c.animCode).toBe(37)
        resetAnimSequences()
        c.animCode = 0
        dodgeAnimation(c)
        expect(c.animCode).toBe(ANIM_DODGE_ANIM)
        resetAnimSequences()
        c.animCode = 0
        c.knockedDown = true
        dodgeAnimation(c)
        expect(c.animCode).toBe(0)
    })
})
