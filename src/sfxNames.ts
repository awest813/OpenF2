/**
 * Sound effect file names (game_sound.cc sfxBuild*Name), as scripts build
 * them with sfx_build_*_name. The engine formats with C printf, so "%6s"
 * pads short names on the left with spaces, and the result is upper case.
 */

import { HOOK, runHook } from './hookScripts.js'
import { artCode, weaponAnimationCode } from './animSequence.js'

/** _snd_lookup_scenery_action: open, close, lock, unlock, use. */
const SCENERY_ACTION = ['O', 'C', 'L', 'N', 'U']
/** _snd_lookup_weapon_type: ready, attack, out of ammo, firing, hit. */
const WEAPON_EFFECT = ['R', 'A', 'O', 'F', 'H']

const WEAPON_SOUND_EFFECT_READY = 0
const WEAPON_SOUND_EFFECT_OUT_OF_AMMO = 2
const HIT_MODE_LEFT_WEAPON_PRIMARY = 0
const HIT_MODE_RIGHT_WEAPON_PRIMARY = 2
const HIT_MODE_PUNCH = 4

const ANIM_THROW_PUNCH = 16
const ANIM_KICK_LEG = 17
const ANIM_FALL_BACK = 20
const ANIM_FALL_FRONT = 21
const ANIM_TAKE_OUT = 38

const CHARACTER_SOUND_EFFECT_PASS_OUT = 2
const CHARACTER_SOUND_EFFECT_DIE = 3
const CHARACTER_SOUND_EFFECT_CONTACT = 4

const DAMAGE_TYPE_PLASMA = 3
const DAMAGE_TYPE_EMP = 5
const DAMAGE_TYPE_EXPLOSION = 6

/** printf("%Ns", s): right-aligned in N characters (never cut). */
function pad(s: string, width: number): string {
    return s.length >= width ? s : ' '.repeat(width - s.length) + s
}

function charOf(code: unknown, fallback: string): string {
    if (typeof code === 'number' && code > 0) {return String.fromCharCode(code & 0xff)}
    if (typeof code === 'string' && code.length > 0) {return code[0]}
    return fallback
}

/** gameSoundBuildAmbientSoundEffectName. */
export function sfxAmbientName(name: string): string {
    return ('A' + pad(String(name ?? ''), 6) + '1').toUpperCase()
}

/** gameSoundBuildInterfaceName (also used for item sounds). */
export function sfxInterfaceName(name: string): string {
    return ('N' + pad(String(name ?? ''), 6) + '1').toUpperCase()
}

/** sfxBuildSceneryName: actionType 0 is passive ('P'), anything else active ('A'). */
export function sfxSceneryName(actionType: number, action: number, name: string): string {
    const type = actionType === 0 ? 'P' : 'A'
    return ('S' + type + (SCENERY_ACTION[action] ?? '') + pad(String(name ?? ''), 4) + '1').toUpperCase()
}

/** sfxBuildOpenName: a door's (scenery) or a container's open/close/lock sound. */
export function sfxOpenName(obj: any, action: number): string {
    const act = SCENERY_ACTION[action] ?? ''
    if (obj?.type === 'scenery') {
        return ('S' + act + 'DOORS' + charOf(obj.pro?.extra?.soundID, 'A')).toUpperCase()
    }
    return ('I' + act + 'CNTNR' + charOf(obj?.pro?.extra?.soundID, '')).toUpperCase()
}

/** sfxBuildCharName: the critter's art name plus the animation's two letters. */
export function sfxCharName(critter: any, anim: number, extra: number): string | null {
    const art: string | undefined = typeof critter?.getBase === 'function' ? critter.getBase() : critter?.art?.slice(0, -2)
    if (!art) {return null}
    const base = art.split('/').pop() ?? ''
    const code = artCode(anim, anim === ANIM_TAKE_OUT ? extra : weaponAnimationCode(critter))
    if (!code) {return null}
    let first = code[0]
    if (anim === ANIM_FALL_FRONT || anim === ANIM_FALL_BACK) {
        if (extra === CHARACTER_SOUND_EFFECT_PASS_OUT) {first = 'Y'}
        else if (extra === CHARACTER_SOUND_EFFECT_DIE) {first = 'Z'}
    } else if ((anim === ANIM_THROW_PUNCH || anim === ANIM_KICK_LEG) && extra === CHARACTER_SOUND_EFFECT_CONTACT) {
        first = 'Z'
    }
    return (base + first + code[1]).toUpperCase()
}

/** The material a hit lands on: M(etal/glass/plastic), W(ood), S(tone/dirt/cement), F(lesh/other). */
function materialCode(target: any): string {
    const material = target?.type === 'item' || target?.type === 'scenery' || target?.type === 'wall'
        ? target?.pro?.extra?.materialID
        : -1
    switch (material) {
        case 0: case 1: case 2: return 'M' // glass, metal, plastic
        case 3: return 'W' // wood
        case 4: case 5: case 6: return 'S' // dirt, stone, cement
        default: return 'F'
    }
}

/** sfxBuildWeaponName. */
export function sfxWeaponName(effectType: number, weapon: any, hitMode: number, target: any): string {
    // sfall HOOK_BUILDSFXWEAPON: a script may name the sound itself.
    const hook = runHook(HOOK.BUILDSFXWEAPON, [effectType, weapon ?? 0, hitMode, target ?? 0], { allowNonIntReturn: true })
    const named = hook?.rets[0]
    if (typeof named === 'string' && named !== '') {return named.toUpperCase()}
    return engineWeaponSfx(effectType, weapon, hitMode, target)
}

function engineWeaponSfx(effectType: number, weapon: any, hitMode: number, target: any): string {
    const weaponCode = charOf(weapon?.pro?.extra?.soundID, '')
    const effect = WEAPON_EFFECT[effectType] ?? ''
    let variant = 1
    if (effectType !== WEAPON_SOUND_EFFECT_READY && effectType !== WEAPON_SOUND_EFFECT_OUT_OF_AMMO &&
        hitMode !== HIT_MODE_LEFT_WEAPON_PRIMARY && hitMode !== HIT_MODE_RIGHT_WEAPON_PRIMARY && hitMode !== HIT_MODE_PUNCH) {
        variant = 2
    }
    const damageType = weapon?.pro?.extra?.dmgType
    const material = effect !== 'H' || !target || damageType === DAMAGE_TYPE_EXPLOSION || damageType === DAMAGE_TYPE_PLASMA || damageType === DAMAGE_TYPE_EMP
        ? 'X'
        : materialCode(target)
    return ('W' + effect + weaponCode + variant + material + 'XX1').toUpperCase()
}
