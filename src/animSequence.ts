/**
 * Animation sequences (animation.cc reg_anim_*). A script, or the engine,
 * builds a sequence between reg_anim_begin and reg_anim_end; each step is
 * played in order:
 *
 *   - the first step starts at once;
 *   - a later step with delay -1 waits until the step before it is done;
 *   - delay 0 starts it alongside the step before;
 *   - delay N > 0 waits N animation ticks, then starts it alongside.
 *
 * The sequence ends once every step is done (or one fails, or it is
 * cleared); its critters then stand, unless they are lying down or the
 * sequence asked for no stand. Registering a step for an object that is in
 * another running sequence fails, cancelling the new one, unless that other
 * sequence was insignificant (then it ends instead).
 */

import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { Config } from './config.js'
import { fromTileNum } from './tile.js'
import type { Point } from './geometry.js'

export const ANIM_STAND = 0
export const ANIM_WALK = 1
export const ANIM_FALL_BACK = 20
export const ANIM_FALL_FRONT = 21
export const ANIM_FALL_FRONT_BLOOD = 35
export const ANIM_PRONE_TO_STANDING = 36
export const ANIM_BACK_TO_STANDING = 37
export const ANIM_TAKE_OUT = 38
export const ANIM_FIRE_CONTINUOUS = 47
export const ANIM_FALL_BACK_SF = 48
export const ANIM_FALL_FRONT_SF = 49
export const ANIM_FALL_FRONT_BLOOD_SF = 63
export const ANIM_CALLED_SHOT_PIC = 64
export const ANIM_COUNT = 65

const ANIM_DODGE_ANIM = 13
const ANIM_THROW_ANIM = 18
const WEAPON_ANIMATION_KNIFE = 1
const WEAPON_ANIMATION_SPEAR = 4

export const ANIMATION_REQUEST_UNRESERVED = 0x01
export const ANIMATION_REQUEST_RESERVED = 0x02
export const ANIMATION_REQUEST_NO_STAND = 0x04
export const ANIMATION_REQUEST_INSIGNIFICANT = 0x200

/** ANIMATION_DESCRIPTION_LIST_CAPACITY. */
const MAX_STEPS = 55

const ch = (code: number) => String.fromCharCode(code)

/**
 * _art_get_code: the two letters after a critter's base art name for an
 * animation with a weapon type (0 = none). Null when there is none.
 */
export function artCode(anim: number, weaponType: number): string | null {
    if (weaponType < 0 || weaponType > 10) {return null}
    const a = 'a'.charCodeAt(0)
    if (anim >= ANIM_TAKE_OUT && anim <= ANIM_FIRE_CONTINUOUS) {
        if (weaponType === 0) {return null}
        return ch('d'.charCodeAt(0) + weaponType - 1) + ch('c'.charCodeAt(0) + anim - ANIM_TAKE_OUT)
    }
    if (anim === ANIM_PRONE_TO_STANDING) {return 'ch'}
    if (anim === ANIM_BACK_TO_STANDING) {return 'cj'}
    if (anim === ANIM_CALLED_SHOT_PIC) {return 'na'}
    if (anim >= ANIM_FALL_BACK_SF) {return 'r' + ch(a + anim - ANIM_FALL_BACK_SF)}
    if (anim >= ANIM_FALL_BACK) {return 'b' + ch(a + anim - ANIM_FALL_BACK)}
    if (anim === ANIM_THROW_ANIM) {
        if (weaponType === WEAPON_ANIMATION_KNIFE) {return 'dm'}
        if (weaponType === WEAPON_ANIMATION_SPEAR) {return 'gm'}
        return 'as'
    }
    if (anim === ANIM_DODGE_ANIM) {
        return weaponType <= 0 ? 'an' : ch('d'.charCodeAt(0) + weaponType - 1) + 'e'
    }
    const second = ch(a + anim)
    if (anim <= ANIM_WALK && weaponType > 0) {return ch('d'.charCodeAt(0) + weaponType - 1) + second}
    return 'a' + second
}

/** The weapon type a critter's art uses: its wielded weapon's animation code. */
export function weaponAnimationCode(critter: any): number {
    if (Config.engine.doUseWeaponModel !== true) {return 0}
    const code = critter?.equippedWeapon?.pro?.extra?.animCode
    return typeof code === 'number' ? code : 0
}

/** The art for a critter animation, or null when the critter has none. */
export function critterArt(critter: any, anim: number): string | null {
    if (typeof critter?.art !== 'string' || critter.art.length < 2) {return null}
    const base = typeof critter.getBase === 'function' ? critter.getBase() : critter.art.slice(0, -2)
    const code = artCode(anim, weaponAnimationCode(critter))
    if (!code) {return null}
    const art = base + code
    return globalState.imageInfo?.[art] !== undefined ? art : null
}

/** _critter_is_prone: knocked down or out, or showing a fall or death. */
export function isProne(critter: any): boolean {
    if (critter?.type !== 'critter') {return false}
    if (critter.dead || critter.knockedDown || critter.knockedOut) {return true}
    const anim = critter.animCode ?? 0
    return (anim >= ANIM_FALL_BACK && anim <= ANIM_FALL_FRONT_BLOOD) || (anim >= ANIM_FALL_BACK_SF && anim <= ANIM_FALL_FRONT_BLOOD_SF)
}

type StepKind = 'animate' | 'reverse' | 'forever' | 'moveTile' | 'runTile' | 'moveObj' | 'runObj' | 'sfx' | 'callback' | 'setArt' | 'fly'

interface Step {
    kind: StepKind
    owner: any
    delay: number
    anim?: number
    tile?: number
    target?: any
    sound?: string
    fn?: () => void
    /** 'fly': the hexes a projectile crosses, in order. */
    path?: Point[]
}

interface Sequence {
    steps: Step[]
    flags: number
    /** Index of the next step to start (field_0). */
    started: number
    /** Steps done, less one (animationIndex). */
    done: number
    running: Set<Step>
    ended: boolean
}

let building: Sequence | null = null
let active: Sequence[] = []

let regAnimCombatCheck = true

/**
 * sfall reg_anim_combat_check: while on (the default, put back every frame),
 * scripts cannot register animations in combat.
 */
export function setRegAnimCombatCheck(on: boolean): void {
    regAnimCombatCheck = on
}

/** Whether a script's reg_anim_* call is ignored now (checkCombatMode). */
export function regAnimBlocked(): boolean {
    return regAnimCombatCheck && globalState.inCombat === true
}

export function resetAnimSequences(): void {
    flights.length = 0
    building = null
    active = []
}

/** reg_anim_begin. */
export function regAnimBegin(flags = ANIMATION_REQUEST_UNRESERVED): number {
    if (building) {return -1}
    building = { steps: [], flags, started: 0, done: -1, running: new Set(), ended: false }
    return 0
}

/** _check_registry. */
function checkRegistry(owner: any): boolean {
    if (!building || building.steps.length >= MAX_STEPS) {return false}
    if (!owner) {return true}
    for (const seq of [...active]) {
        if (seq.ended || !seq.steps.some((s) => s.owner === owner && s.kind !== 'callback')) {continue}
        if ((seq.flags & ANIMATION_REQUEST_INSIGNIFICANT) === 0) {return false}
        endSequence(seq)
    }
    return true
}

function register(step: Step): number {
    if (!checkRegistry(step.owner)) {
        building = null // _anim_cleanup
        return -1
    }
    building!.steps.push(step)
    return 0
}

function canAnimate(owner: any, anim: number): boolean {
    if (owner?.type === 'critter') {return critterArt(owner, anim) !== null}
    return true
}

function registerAnimate(kind: 'animate' | 'reverse' | 'forever', owner: any, anim: number, delay: number): number {
    if (!owner || !canAnimate(owner, anim)) {
        building = null
        return -1
    }
    return register({ kind, owner, anim, delay })
}

export const regAnimAnimate = (owner: any, anim: number, delay: number) => registerAnimate('animate', owner, anim, delay)
export const regAnimAnimateReversed = (owner: any, anim: number, delay: number) => registerAnimate('reverse', owner, anim, delay)
export const regAnimAnimateForever = (owner: any, anim: number) => registerAnimate('forever', owner, anim, -1)
export const regAnimMoveToTile = (owner: any, tile: number, delay: number) => register({ kind: 'moveTile', owner, tile, delay })
export const regAnimRunToTile = (owner: any, tile: number, delay: number) => register({ kind: 'runTile', owner, tile, delay })
export const regAnimMoveToObject = (owner: any, target: any, delay: number) => register({ kind: 'moveObj', owner, target, delay })
export const regAnimRunToObject = (owner: any, target: any, delay: number) => register({ kind: 'runObj', owner, target, delay })
export const regAnimPlaySfx = (owner: any, sound: string, delay: number) => register({ kind: 'sfx', owner, sound, delay })
export const regAnimCallback = (owner: any, fn: () => void, delay: number) => register({ kind: 'callback', owner, fn, delay })
/** animationRegisterMoveToTileStraight for a projectile: along `path`, a few hexes a tick. */
export const regAnimFly = (owner: any, path: Point[], delay: number) => register({ kind: 'fly', owner, path, delay })
/** animationRegisterSetFid with a critter animation's art (the frame stays first). */
export const regAnimSetArt = (owner: any, anim: number, delay: number) => register({ kind: 'setArt', owner, anim, delay })

/** reg_anim_end: the sequence starts. */
export function regAnimEnd(): number {
    const seq = building
    if (!seq) {return -1}
    building = null
    if (seq.steps.length > 0) {seq.steps[0].delay = 0}
    active.push(seq)
    proceed(seq, true)
    return 0
}

/** reg_anim_clear: end the first running sequence the object is in. */
export function regAnimClear(owner: any): number {
    for (const seq of active) {
        if (!seq.ended && seq.steps.some((s) => s.owner === owner && s.kind !== 'callback')) {
            endSequence(seq)
            return 0
        }
    }
    return -1
}

/** animationIsBusy: -1 while the object is in a running sequence (a lone stand does not count). */
export function animationIsBusy(owner: any): number {
    if (!owner) {return 0}
    for (const seq of active) {
        if (seq.ended) {continue}
        for (const step of seq.steps) {
            if (step.owner !== owner || step.kind === 'callback') {continue}
            if (seq.steps.length === 1 && step.anim === ANIM_STAND) {continue}
            return -1
        }
    }
    return 0
}

/** _anim_set_continue. */
function proceed(seq: Sequence, run: boolean): void {
    if (seq.ended) {return}
    seq.done++
    if (seq.done >= seq.steps.length) {
        endSequence(seq)
    } else if (run) {
        runSequence(seq)
    }
}

/** animationRunSequence. */
function runSequence(seq: Sequence): void {
    while (!seq.ended && seq.started < seq.steps.length) {
        const step = seq.steps[seq.started]
        if (seq.started > seq.done && step.delay !== 0) {return}
        seq.started++
        if (!startStep(seq, step)) {
            endSequence(seq)
            return
        }
    }
}

/**
 * Projectiles in flight (animationRegisterMoveToTileStraight on a misc
 * object): hexes crossed per animation tick.
 */
export const PROJECTILE_HEXES_PER_TICK = 4
const flights: Array<{ step: Step; seq: Sequence; at: number; finish: () => void }> = []

function advanceFlights(): void {
    for (const flight of [...flights]) {
        const path = flight.step.path ?? []
        if (flight.seq.ended) {
            flights.splice(flights.indexOf(flight), 1)
            continue
        }
        flight.at = Math.min(path.length - 1, flight.at + PROJECTILE_HEXES_PER_TICK)
        if (path[flight.at]) {flight.step.owner.position = { ...path[flight.at] }}
        if (flight.at >= path.length - 1) {
            flights.splice(flights.indexOf(flight), 1)
            flight.finish()
        }
    }
}

/** One animation tick: count down the delays of waiting steps. */
export function tickAnimSequences(): void {
    advanceFlights()
    for (const seq of [...active]) {
        if (seq.ended || seq.started >= seq.steps.length || seq.started <= seq.done) {continue}
        const step = seq.steps[seq.started]
        if (step.delay > 0) {
            step.delay--
            if (step.delay === 0) {runSequence(seq)}
        }
    }
}

function startStep(seq: Sequence, step: Step): boolean {
    const finish = () => {
        seq.running.delete(step)
        proceed(seq, true)
    }
    switch (step.kind) {
        case 'animate':
        case 'reverse':
        case 'forever':
            seq.running.add(step)
            return playAnimation(step.owner, step.anim!, step.kind, finish)
        case 'moveTile':
        case 'runTile': {
            const owner = step.owner
            if (typeof owner?.walkTo !== 'function' || !owner.position || typeof step.tile !== 'number' || step.tile < 0) {return false}
            const target = fromTileNum(step.tile)
            if (owner.position.x === target.x && owner.position.y === target.y) {
                proceed(seq, false)
                return true
            }
            seq.running.add(step)
            return owner.walkTo(target, step.kind === 'runTile', finish) !== false
        }
        case 'moveObj':
        case 'runObj': {
            const owner = step.owner
            const target = step.target
            if (typeof owner?.walkInFrontOf !== 'function' || !owner.position || !target?.position) {return false}
            seq.running.add(step)
            return owner.walkInFrontOf(target.position, finish) !== false
        }
        case 'sfx':
            if (step.sound) {EventBus.emit('audio:playSound', { soundId: step.sound })}
            proceed(seq, false)
            return true
        case 'callback':
            step.fn?.()
            proceed(seq, false)
            return true
        case 'fly': {
            const path = step.path ?? []
            if (path.length === 0 || !step.owner) {return false}
            step.owner.position = { ...path[0] }
            if (path.length === 1) {
                proceed(seq, false)
                return true
            }
            seq.running.add(step)
            flights.push({ step, seq, at: 0, finish })
            return true
        }
        case 'setArt': {
            const art = step.owner?.type === 'critter' ? critterArt(step.owner, step.anim!) : null
            if (art) {
                step.owner.art = art
                step.owner.animCode = step.anim
                step.owner.frame = 0
            }
            proceed(seq, false)
            return true
        }
    }
}

/** _anim_animate: play an animation once, reversed, or forever. False when there is no such art. */
function playAnimation(owner: any, anim: number, mode: 'animate' | 'reverse' | 'forever', done: () => void): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    if (owner?.type === 'critter') {
        const art = critterArt(owner, anim)
        if (!art) {return false}
        const frames = globalState.imageInfo[art].numFrames ?? 1
        owner.path = null
        owner.art = art
        owner.animCode = anim
        owner.frame = mode === 'reverse' ? frames - 1 : 0
        owner.lastFrameTime = now
        owner.animReverse = mode === 'reverse'
        owner.anim = 'static'
        owner.animCallback = () => {
            if (mode === 'forever') {
                owner.frame = 0
                return
            }
            owner.frame = mode === 'reverse' ? 0 : frames - 1
            owner.anim = null
            owner.animCallback = null
            owner.animReverse = false
            done()
        }
        return true
    }
    if (typeof owner?.singleAnimation !== 'function' || globalState.imageInfo?.[owner.art] === undefined) {return false}
    const onEnd = () => {
        if (mode === 'forever') {
            owner.singleAnimation(false, onEnd)
            return
        }
        owner.anim = null
        owner.animCallback = null
        done()
    }
    owner.singleAnimation(mode === 'reverse', onEnd)
    return true
}

/** _dude_stand: back to the standing frame of the critter's current weapon. */
export function standCritter(critter: any): void {
    if (critter?.type !== 'critter') {return}
    const art = critterArt(critter, ANIM_STAND) ?? (typeof critter.getAnimation === 'function' ? critter.getAnimation('idle') : null)
    if (art) {critter.art = art}
    critter.animCode = ANIM_STAND
    critter.frame = 0
    critter.anim = 'idle'
    critter.animCallback = null
    critter.animReverse = false
}

/** _anim_set_end. */
function endSequence(seq: Sequence): void {
    if (seq.ended) {return}
    seq.ended = true
    active = active.filter((s) => s !== seq)
    const owners: any[] = []
    for (const step of seq.steps) {
        if (step.kind === 'callback' || owners.includes(step.owner)) {continue}
        owners.push(step.owner)
    }
    for (const owner of owners) {
        // Stop whatever this sequence still has the owner doing.
        if ([...seq.running].some((s) => s.owner === owner)) {
            owner.animCallback = null
            owner.anim = null
            owner.path = null
            owner.shift = null
            owner.animReverse = false
        }
        if (owner?.type === 'critter' && (seq.flags & ANIMATION_REQUEST_NO_STAND) === 0 && !isProne(owner)) {
            standCritter(owner)
        }
    }
    seq.running.clear()
}
