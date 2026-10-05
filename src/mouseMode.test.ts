import { describe, it, expect } from 'vitest'
import { arrowPrimaryAction, cycleMouseMode, HoverLook } from './mouseMode.js'

describe('cursor modes (game_mouse.cc)', () => {
    it('right-click cycles move → arrow → move outside combat', () => {
        expect(cycleMouseMode('move', false, true)).toBe('arrow')
        expect(cycleMouseMode('arrow', false, true)).toBe('move')
    })

    it('in combat the crosshair joins the cycle when a weapon is ready', () => {
        expect(cycleMouseMode('arrow', true, true)).toBe('crosshair')
        expect(cycleMouseMode('crosshair', true, true)).toBe('move')
        expect(cycleMouseMode('arrow', true, false)).toBe('move')
    })

    it('arrow clicks: pick up items, turn yourself, talk (examine in combat), loot the dead, use or examine scenery', () => {
        const player = { type: 'critter' }
        expect(arrowPrimaryAction({ type: 'item' }, player, false)).toBe('pickup')
        expect(arrowPrimaryAction(player, player, false)).toBe('rotate')
        expect(arrowPrimaryAction({ type: 'critter' }, player, false)).toBe('talk')
        expect(arrowPrimaryAction({ type: 'critter' }, player, true)).toBe('examine')
        expect(arrowPrimaryAction({ type: 'critter', dead: true }, player, false)).toBe('loot')
        expect(arrowPrimaryAction({ type: 'scenery', canUse: true }, player, false)).toBe('use')
        expect(arrowPrimaryAction({ type: 'scenery', canUse: false }, player, false)).toBe('examine')
        expect(arrowPrimaryAction(null, player, false)).toBeNull()
    })

    it('hovering looks once, after the mouse rests 250 ms on a new object', () => {
        const h = new HoverLook()
        const rock = {}
        expect(h.update(0, 10, 10, () => rock)).toBeNull() // just moved
        expect(h.update(100, 10, 10, () => rock)).toBeNull() // too soon
        expect(h.update(300, 10, 10, () => rock)).toBe(rock)
        expect(h.update(400, 10, 10, () => rock)).toBeNull() // already tested
        h.update(500, 20, 20, () => rock)
        expect(h.update(800, 20, 20, () => rock)).toBeNull() // same object again
        const tree = {}
        h.update(900, 30, 30, () => tree)
        expect(h.update(1200, 30, 30, () => tree)).toBe(tree)
    })
})
