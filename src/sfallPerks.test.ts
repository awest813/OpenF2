import { describe, it, expect, afterEach } from 'vitest'
import './scripting.js'
import { sfallMethods, resetSfallState, serializeFakePerks, deserializeFakePerks } from './sfallFunctions.js'
import { sfallSettings } from './sfallSettings.js'
import { FAKE_PERK_START, getAvailablePerks, grantPerk, isPerkAvailable, PERK_MAP } from './character/perks.js'
import { PERK_DESCRIPTIONS, perkCanAdd } from './character/perkTable.js'
import { PerkId } from './character/perkIds.js'

function stats(level: number, special = 5): any {
    return {
        level, strength: special, perception: special, endurance: special, charisma: special, intelligence: special,
        agility: special, luck: special, strengthMod: 0, perceptionMod: 0, enduranceMod: 0, charismaMod: 0,
        intelligenceMod: 0, agilityMod: 0, luckMod: 0,
    }
}
const skills: any = {
    smallGuns: 0, bigGuns: 0, energyWeapons: 0, unarmed: 0, meleeWeapons: 0, throwing: 0, firstAid: 0, doctor: 0,
    sneak: 0, lockpick: 0, steal: 0, traps: 0, science: 0, repair: 0, speech: 0, barter: 0, gambling: 0, outdoorsman: 0,
}

afterEach(() => resetSfallState())

describe('perk.cc perkCanAdd and the perk table', () => {
    it('reads level, ranks, SPECIAL minimums and maximums', () => {
        const d = PERK_DESCRIPTIONS[PerkId.TOUGHNESS]
        expect(d.maxRank).toBe(3)
        const s = { isPlayer: true, level: 3, rank: 0, stat: () => 6, skill: () => 0, gvar: () => 0 }
        expect(perkCanAdd(s, PerkId.TOUGHNESS)).toBe(true)
        expect(perkCanAdd({ ...s, level: 2 }, PerkId.TOUGHNESS)).toBe(false)
        expect(perkCanAdd({ ...s, rank: 3 }, PerkId.TOUGHNESS)).toBe(false)
        expect(perkCanAdd({ ...s, level: 2 }, PerkId.TOUGHNESS, 1)).toBe(true) // set_perk_level_mod
    })

    it('set_perk_* edits the table the perk box uses', () => {
        const toughness = PERK_MAP.get(PerkId.TOUGHNESS)!
        expect(isPerkAvailable(toughness, stats(3, 6), skills, 0)).toBe(true)
        sfallMethods.set_perk_level(PerkId.TOUGHNESS, 10)
        expect(isPerkAvailable(toughness, stats(3, 6), skills, 0)).toBe(false)
        sfallMethods.set_perk_end(PerkId.TOUGHNESS, 0)
        sfallMethods.set_perk_lck(PerkId.TOUGHNESS, 0)
        sfallMethods.set_perk_level(PerkId.TOUGHNESS, 1)
        expect(isPerkAvailable(toughness, stats(1, 1), skills, 0)).toBe(true)
        sfallMethods.set_perk_name(PerkId.TOUGHNESS, 'Tough Guy')
        expect(toughness.name).toBe('Tough Guy')
        resetSfallState()
        expect(toughness.name).not.toBe('Tough Guy')
        expect(PERK_DESCRIPTIONS[PerkId.TOUGHNESS].minLevel).toBe(3)
    })
})

describe('sfall selectable perks', () => {
    it('hide_real_perks and set_selectable_perk fill the perk box; choosing one follows perk_add_mode', () => {
        sfallMethods.hide_real_perks()
        sfallMethods.set_selectable_perk('Lucky Hat', 1, 5, 'A lucky hat.')
        const box = getAvailablePerks(stats(30, 10), skills, new Map())
        expect(box.map((p) => p.name)).toEqual(['Lucky Hat'])
        expect(box[0].id).toBe(FAKE_PERK_START)
        expect(grantPerk(box[0].id, stats(30), skills, new Map())).toBe(true)
        expect(sfallMethods.has_fake_perk('Lucky Hat')).toBe(1)
        sfallMethods.perk_add_mode(1 | 4)
        expect(grantPerk(FAKE_PERK_START, stats(30), skills, new Map())).toBe(true)
        expect(sfallMethods.has_fake_trait('Lucky Hat')).toBe(1)
        expect(sfallSettings.selectablePerks.size).toBe(0)
    })

    it('fake perks survive a save', () => {
        sfallMethods.set_fake_perk('Iron Will', 2, 1, 'desc')
        const saved = serializeFakePerks()
        resetSfallState()
        expect(sfallMethods.has_fake_perk('Iron Will')).toBe(0)
        deserializeFakePerks(saved)
        expect(sfallMethods.has_fake_perk('Iron Will')).toBe(2)
    })
})
