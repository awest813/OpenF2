/**
 * What the display monitor says when the player looks at or examines
 * something (proto_instance.cc _obj_look_at / _obj_examine_func), built
 * from proto.msg. English fallbacks cover a missing message file.
 */

import { HOOK, runHook } from './hookScripts.js'
import globalState from './globalState.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { getLoadedAmmo, isRangedWeapon, weaponAmmoPid } from './combat/ammo.js'
import { getMessage } from './util.js'

const FALLBACK: Record<number, string> = {
    490: 'You see: %s.',
    491: 'You see a dead %s.',
    492: 'You see the remains of %s.',
    493: 'You see nothing out of the ordinary.',
    500: 'dead',
    501: 'almost dead',
    502: 'severely wounded',
    503: 'wounded',
    504: 'unhurt',
    510: 'Armor Class modifier: %d.',
    511: 'Damage Resistance modifier: %d%%.',
    512: 'Damage modifier: %d/%d.',
    518: 'You look %s',
    520: 'You look %s.',
    522: 'He looks %s.',
    523: 'She looks %s.',
    526: 'It has %d/%d shots of %s.',
    530: ' and has a crippled limb.',
    531: ' and has a crippled limb.',
    532: ' and you have a crippled limb.',
    533: ' and you have a crippled limb.',
    535: 'He has %d/%d hps',
    536: 'She has %d/%d hps',
    537: 'It has %d/%d hps',
    544: ',',
    545: '.',
    546: ' and is wielding a %s.',
    547: ' and is wielding a %s with %d/%d shots of %s.',
    548: "The car doesn't look like it's working right now.",
    549: 'The car is running at %d%% power.',
}

function proto(id: number): string {
    let text: string | null = null
    try {
        text = getMessage('proto', id)
    } catch {
        text = null
    }
    return text ?? FALLBACK[id] ?? ''
}

/** printf-style %s / %d (and %% for a literal percent sign). */
export function format(template: string, ...args: Array<string | number>): string {
    let i = 0
    return template.replace(/%(%|s|d)/g, (_, kind) => (kind === '%' ? '%' : String(args[i++] ?? '')))
}

function nameOf(obj: any): string {
    return obj?.name || ''
}

function statOf(obj: any, stat: string): number {
    try {
        const v = obj?.getStat?.(stat)
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

function isCrippled(c: any): boolean {
    return !!(c?.crippledLeftLeg || c?.crippledRightLeg || c?.crippledLeftArm || c?.crippledRightArm || c?.blinded)
}

function ammoName(weapon: any): string {
    const pid = weaponAmmoPid(weapon)
    try {
        const names = globalState.proMap?.items
        const pro = names?.[pid & 0xffffff]
        if (pro) {return getMessage('pro_item', pro.textID) || ''}
    } catch {
        // unnamed ammo
    }
    return ''
}

/** _obj_look_at: "You see: <name>." (a dead critter gets one of two corpse lines). */
export function lookAtText(target: any, rng: (min: number, max: number) => number): string {
    const deadCritter = target?.type === 'critter' && target.dead
    const id = deadCritter ? 491 + rng(0, 1) : 490
    return format(proto(id), nameOf(target))
}

/**
 * _obj_examine_func: the description (or proto.msg 493), then for a critter
 * how hurt it looks (or, with Awareness, its exact HP and weapon), for a
 * gun its load, and for ammo its modifiers.
 */
export function examineLines(viewer: any, target: any, scriptOverrides = false): string[] {
    const lines: string[] = []
    let description: string | null = null
    try {
        description = target?.getDescription?.() ?? null
    } catch {
        description = null
    }
    // sfall HOOK_DESCRIPTIONOBJ: a script may give the text instead.
    const hook = runHook(HOOK.DESCRIPTIONOBJ, [target], { allowNonIntReturn: true })
    const hookText = hook?.rets[0]
    if (typeof hookText === 'string' && hookText !== '') {
        lines.push(hookText)
    } else if (scriptOverrides) {
        // description_p_proc printed its own text.
    } else if (!description) {
        lines.push(proto(493))
    } else if (target?.type !== 'critter' || !target.dead) {
        lines.push(description)
    }

    if (!viewer || !viewer.isPlayer) {return lines}

    if (target?.type === 'critter') {
        lines.push(critterCondition(viewer, target))
    } else if (target?.type === 'item' && target.subtype === 'weapon' && isRangedWeapon(target)) {
        const capacity = target.pro?.extra?.maxAmmo ?? 0
        lines.push(format(proto(526), getLoadedAmmo(target), capacity, ammoName(target)))
    } else if (target?.type === 'item' && target.subtype === 'ammo') {
        const extra = target.pro?.extra ?? {}
        lines.push(format(proto(510), extra['AC modifier'] ?? extra.acModifier ?? 0))
        lines.push(format(proto(511), extra['DR modifier'] ?? extra.drModifier ?? 0))
        lines.push(format(proto(512), extra.damMult ?? 1, extra.damDiv ?? 1))
    }
    return lines
}

function critterCondition(viewer: any, target: any): string {
    const hp = statOf(target, 'HP')
    const maxHp = statOf(target, 'Max HP')
    const female = statOf(target, 'Gender') === 1

    if (target !== viewer && perkRank(viewer, PerkId.AWARENESS) > 0 && !target.dead) {
        const bodyType = target.pro?.extra?.bodyType ?? 0
        const hpText = proto(bodyType !== 0 ? 537 : female ? 536 : 535)
        const weapon = target.equippedWeapon
        const armed = weapon && weapon.pro && weapon.weapon
        if (armed) {
            if (isRangedWeapon(weapon)) {
                return format(hpText + proto(547), hp, maxHp, nameOf(weapon), getLoadedAmmo(weapon), weapon.pro?.extra?.maxAmmo ?? 0, ammoName(weapon))
            }
            return format(hpText + proto(546), hp, maxHp, nameOf(weapon))
        }
        return format(hpText, hp, maxHp) + proto(isCrippled(target) ? 544 : 545)
    }

    const crippled = isCrippled(target)
    let level: number
    if (hp <= 0 || target.dead) {level = 0}
    else if (hp === maxHp) {level = 4}
    else {level = Math.trunc((hp * 3) / Math.max(1, maxHp)) + 1}
    const word = proto(500 + level)

    let text: string
    if (target === viewer) {
        text = format(proto(520 + (crippled ? -2 : 0)), word)
    } else {
        text = format(proto(522 + (female ? 1 : 0)), word)
    }
    if (crippled) {
        text = text.replace(/\.$/, '')
        let id = maxHp >= hp ? 531 : 530
        if (target === viewer) {id += 2}
        text += proto(id)
    }
    return text
}
