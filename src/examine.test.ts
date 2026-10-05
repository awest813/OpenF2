import { describe, it, expect } from 'vitest'
import { examineLines, format, lookAtText } from './examine.js'
import { PerkId } from './character/perkIds.js'

function critter(over: Record<string, any> = {}): any {
    const stats: Record<string, number> = { HP: 20, 'Max HP': 40, Gender: 0, ...(over.stats ?? {}) }
    return { type: 'critter', name: 'Raider', getStat: (s: string) => stats[s] ?? 0, getDescription: () => 'A raider.', perkRanks: {}, ...over }
}

describe('look at / examine (proto_instance.cc)', () => {
    it('look-at names the object, a corpse gets a corpse line', () => {
        expect(lookAtText({ type: 'item', name: 'Stimpak' }, () => 0)).toBe('You see: Stimpak.')
        expect(lookAtText(critter({ dead: true }), () => 0)).toBe('You see a dead Raider.')
    })

    it('examining a critter adds how hurt it looks by HP thirds', () => {
        const player = { isPlayer: true, perkRanks: {} }
        expect(examineLines(player, critter())).toEqual(['A raider.', 'He looks severely wounded.'])
        expect(examineLines(player, critter({ stats: { HP: 30 } }))[1]).toBe('He looks wounded.')
        expect(examineLines(player, critter({ stats: { HP: 40 } }))[1]).toBe('He looks unhurt.')
        expect(examineLines(player, critter({ stats: { HP: 5, Gender: 1 } }))[1]).toBe('She looks almost dead.')
    })

    it('Awareness reads out exact hit points instead', () => {
        const player = { isPlayer: true, perkRanks: { [PerkId.AWARENESS]: 1 } }
        expect(examineLines(player, critter())[1]).toBe('He has 20/40 hps.')
    })

    it('without a description it says nothing out of the ordinary; scripts can replace the description', () => {
        const player = { isPlayer: true, perkRanks: {} }
        expect(examineLines(player, { type: 'scenery', getDescription: () => null })).toEqual(['You see nothing out of the ordinary.'])
        expect(examineLines(player, { type: 'scenery', getDescription: () => 'A rock.' }, true)).toEqual([])
    })

    it('format handles %d, %s and %%', () => {
        expect(format('%d%% of %s', 50, 'it')).toBe('50% of it')
    })
})
