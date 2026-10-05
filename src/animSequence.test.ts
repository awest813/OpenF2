import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import {
    ANIM_FALL_BACK, ANIM_STAND, ANIMATION_REQUEST_INSIGNIFICANT, animationIsBusy, artCode, isProne,
    regAnimAnimate, regAnimAnimateForever, regAnimAnimateReversed, regAnimBegin, regAnimCallback, regAnimClear,
    regAnimEnd, regAnimPlaySfx, resetAnimSequences, tickAnimSequences,
} from './animSequence.js'

/** A critter whose animations finish when the test says so. */
function critter(): any {
    return {
        type: 'critter',
        art: 'art/critters/hmjmpsaa',
        getBase() { return this.art.slice(0, -2) },
        frame: 0,
        finish() {
            const cb = this.animCallback
            if (cb) {cb()}
        },
    }
}

describe('artCode (art.cc _art_get_code)', () => {
    it('maps animations and weapon types to FRM suffixes', () => {
        expect(artCode(0, 0)).toBe('aa') // stand
        expect(artCode(1, 0)).toBe('ab') // walk
        expect(artCode(0, 3)).toBe('fa') // stand with a weapon
        expect(artCode(19, 3)).toBe('at') // running ignores the weapon
        expect(artCode(16, 0)).toBe('aq') // punch
        expect(artCode(20, 0)).toBe('ba') // fall back
        expect(artCode(48, 0)).toBe('ra') // fall back, last frame
        expect(artCode(36, 0)).toBe('ch') // prone to standing
        expect(artCode(45, 3)).toBe('fj') // fire single with weapon type 3
        expect(artCode(45, 0)).toBeNull() // no weapon, no firing
        expect(artCode(18, 1)).toBe('dm') // throwing a knife
        expect(artCode(64, 0)).toBe('na') // called-shot picture
    })
})

describe('reg_anim sequences (animation.cc)', () => {
    let savedImageInfo: any
    let sounds: string[]

    beforeEach(async () => {
        resetAnimSequences()
        savedImageInfo = globalState.imageInfo
        const info = { numFrames: 4, fps: 10 }
        globalState.imageInfo = new Proxy({}, { get: () => info }) as any
        sounds = []
        const { EventBus } = await import('./eventBus.js')
        EventBus.on('audio:playSound', (e: any) => sounds.push(e.soundId))
    })

    afterEach(async () => {
        globalState.imageInfo = savedImageInfo
        const { EventBus } = await import('./eventBus.js')
        EventBus.offAll('audio:playSound')
        resetAnimSequences()
    })

    it('steps with delay -1 wait for the step before; the critter stands at the end', () => {
        const c = critter()
        regAnimBegin()
        regAnimAnimate(c, 16, -1)
        regAnimPlaySfx(c, 'whoosh', -1)
        regAnimAnimate(c, 17, -1)
        regAnimEnd()
        expect(c.art).toBe('art/critters/hmjmpsaq')
        expect(animationIsBusy(c)).toBe(-1)
        c.finish()
        expect(sounds).toEqual(['whoosh'])
        expect(c.art).toBe('art/critters/hmjmpsar')
        c.finish()
        expect(animationIsBusy(c)).toBe(0)
        expect(c.art).toBe('art/critters/hmjmpsaa')
        expect(c.animCode).toBe(ANIM_STAND)
    })

    it('delay 0 starts alongside the step before; a positive delay counts ticks', () => {
        const a = critter()
        const b = critter()
        regAnimBegin()
        regAnimAnimate(a, 16, -1)
        regAnimAnimate(b, 17, 0)
        regAnimPlaySfx(a, 'later', 2)
        regAnimEnd()
        expect(b.art).toBe('art/critters/hmjmpsar')
        expect(sounds).toEqual([])
        tickAnimSequences()
        expect(sounds).toEqual([])
        tickAnimSequences()
        expect(sounds).toEqual(['later'])
    })

    it('a reversed animation runs from the last frame', () => {
        const c = critter()
        regAnimBegin()
        regAnimAnimateReversed(c, 16, -1)
        regAnimEnd()
        expect(c.frame).toBe(3)
        expect(c.animReverse).toBe(true)
    })

    it('a forever animation keeps the sequence going until cleared', () => {
        const c = critter()
        regAnimBegin()
        regAnimAnimateForever(c, 16)
        regAnimEnd()
        c.finish()
        expect(animationIsBusy(c)).toBe(-1)
        expect(regAnimClear(c)).toBe(0)
        expect(animationIsBusy(c)).toBe(0)
        expect(c.animCallback).toBeNull()
        expect(regAnimClear(c)).toBe(-1)
    })

    it('an object busy in another sequence cannot join a new one, unless that one is insignificant', () => {
        const c = critter()
        let ran = false
        regAnimBegin()
        regAnimAnimate(c, 16, -1)
        regAnimEnd()
        regAnimBegin()
        expect(regAnimAnimate(c, 17, -1)).toBe(-1)
        expect(regAnimEnd()).toBe(-1) // the new sequence was cancelled
        regAnimClear(c)

        regAnimBegin(ANIMATION_REQUEST_INSIGNIFICANT)
        regAnimAnimate(c, 16, -1)
        regAnimEnd()
        regAnimBegin()
        expect(regAnimAnimate(c, 17, -1)).toBe(0)
        regAnimCallback(null, () => { ran = true }, -1)
        regAnimEnd()
        c.finish()
        expect(ran).toBe(true)
    })

    it('a critter left lying after a fall does not stand up', () => {
        const c = critter()
        regAnimBegin()
        regAnimAnimate(c, ANIM_FALL_BACK, -1)
        regAnimEnd()
        c.finish()
        expect(isProne(c)).toBe(true)
        expect(c.art).toBe('art/critters/hmjmpsba')
    })

    it('a lone stand does not count as busy', () => {
        const c = critter()
        regAnimBegin()
        regAnimAnimate(c, ANIM_STAND, -1)
        regAnimEnd()
        expect(animationIsBusy(c)).toBe(0)
    })
})

describe('script animation opcodes', () => {
    let savedImageInfo: any
    beforeEach(() => {
        resetAnimSequences()
        savedImageInfo = globalState.imageInfo
        const info = { numFrames: 4, fps: 10, actionFrame: 2 }
        globalState.imageInfo = new Proxy({}, { get: () => info }) as any
    })
    afterEach(() => {
        globalState.imageInfo = savedImageInfo
        resetAnimSequences()
    })

    it('anim() plays a fall, then leaves the lying frame; critter_state says prone; anim_busy is -1 meanwhile', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = new (Scripting as any).Script()
        const c = { ...critter(), _type: 'obj' }
        script.anim(c, ANIM_FALL_BACK, 0)
        expect(c.art).toBe('art/critters/hmjmpsba')
        expect(script.anim_busy(c)).toBe(-1)
        c.finish()
        expect(c.art).toBe('art/critters/hmjmpsra')
        expect(script.anim_busy(c)).toBe(0)
        expect(script.critter_state(c) & 2).toBe(2)
        expect(script.anim_action_frame(c, 16)).toBe(2)
    })

    it('reg_anim_func builds a sequence from script calls, and is ignored in combat', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = new (Scripting as any).Script()
        const c = { ...critter(), _type: 'obj' }
        script.reg_anim_func(1, 1)
        script.reg_anim_animate(c, 16, -1)
        script.reg_anim_func(3, 0)
        expect(c.art).toBe('art/critters/hmjmpsaq')
        script.reg_anim_func(2, c)
        expect(script.anim_busy(c)).toBe(0)

        globalState.inCombat = true
        script.reg_anim_func(1, 1)
        script.reg_anim_animate(c, 17, -1)
        script.reg_anim_func(3, 0)
        globalState.inCombat = false
        expect(c.art).toBe('art/critters/hmjmpsaa')
    })
})
