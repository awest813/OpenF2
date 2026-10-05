import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from '../globalState.js'
import { Config } from '../config.js'
import { resetAnimSequences, tickAnimSequences } from '../animSequence.js'
import { Dam } from './criticalTables.js'
import {
    ANIM_DODGE_ANIM, ANIM_FALL_BACK, ANIM_FALL_FRONT, ANIM_FIRE_DANCE, ANIM_HIT_FROM_BACK, ANIM_HIT_FROM_FRONT,
    beginReactionBatch, dodgeAnimation, endReactionBatch, pickFall, showDamageReaction, standUpAnimation,
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

describe('an attack as one sequence (_action_melee)', () => {
    it("the defender reacts at the swing's action frame, and the turn goes on once all is done", () => {
        globalState.imageInfo[BASE + 'aq'] = { numFrames: 6, fps: 10, actionFrame: 3 } as any // ANIM_THROW_PUNCH
        const attacker = critter([])
        const defender = critter([ANIM_HIT_FROM_FRONT], { x: 51, y: 50 })
        let done = false
        beginReactionBatch()
        showDamageReaction(defender, 0, true, 0)
        expect(defender.animCode).toBeUndefined()
        endReactionBatch(attacker, 16, () => { done = true }, () => { throw new Error('no fallback expected') })
        expect(attacker.animCode).toBe(16)
        tickAnimSequences()
        tickAnimSequences()
        expect(defender.animCode).toBeUndefined()
        tickAnimSequences()
        expect(defender.animCode).toBe(ANIM_HIT_FROM_FRONT)
        defender.animCallback()
        expect(done).toBe(false)
        attacker.animCallback()
        expect(done).toBe(true)
    })

    it('without the swing art the reactions play at once and the old animation runs', () => {
        const attacker = critter([])
        const defender = critter([ANIM_HIT_FROM_FRONT], { x: 51, y: 50 })
        let fellBack = false
        beginReactionBatch()
        showDamageReaction(defender, 0, true, 0)
        endReactionBatch(attacker, 16, () => {}, (finish) => { fellBack = true; finish() })
        expect(fellBack).toBe(true)
        expect(defender.animCode).toBe(ANIM_HIT_FROM_FRONT)
    })
})

describe('a ranged attack (_action_ranged)', () => {
    it('raises the gun, fires, the projectile flies and the hit lands on arrival, then lowers it', () => {
        const saved = Config.engine.doUseWeaponModel
        Config.engine.doUseWeaponModel = true
        try {
            for (const code of ['dh', 'di']) {globalState.imageInfo[BASE + code] = { numFrames: 2, fps: 10 } as any}
            globalState.imageInfo[BASE + 'dj'] = { numFrames: 4, fps: 10, actionFrame: 1 } as any
            const attacker = critter([])
            attacker.equippedWeapon = { pro: { extra: { animCode: 1 } } }
            const defender = critter([ANIM_HIT_FROM_FRONT], { x: 50, y: 59 })
            const path = Array.from({ length: 9 }, (_, i) => ({ x: 50, y: 51 + i }))
            const rocket: any = { type: 'misc' }
            const log: string[] = []
            let done = false
            beginReactionBatch()
            showDamageReaction(defender, 0, true, 0)
            endReactionBatch(attacker, 45, () => { done = true }, () => { throw new Error('no fallback expected') }, {
                point: true,
                projectile: { obj: rocket, path, show: () => log.push('show'), remove: () => log.push('remove') },
            })
            expect(attacker.animCode).toBe(43) // ANIM_POINT
            attacker.animCallback()
            expect(attacker.animCode).toBe(45) // ANIM_FIRE_SINGLE
            expect(log).toEqual([])
            tickAnimSequences()
            expect(log).toEqual(['show'])
            expect(rocket.position).toEqual(path[0])
            for (let i = 0; i < 4 && defender.animCode === undefined; i++) {tickAnimSequences()}
            expect(rocket.position).toEqual(path[8])
            expect(defender.animCode).toBe(ANIM_HIT_FROM_FRONT)
            attacker.animCallback()
            defender.animCallback()
            expect(log).toEqual(['show', 'remove'])
            expect(attacker.animCode).toBe(44) // ANIM_UNPOINT
            expect(done).toBe(false)
            attacker.animCallback()
            expect(done).toBe(true)
        } finally {
            Config.engine.doUseWeaponModel = saved
        }
    })
})
