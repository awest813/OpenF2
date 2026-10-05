import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { explode, explosionDamage, explosionVictims, type ExplosionMap } from './explosion.js'

function critter(name: string, x: number, y: number, opts: { dt?: number; dr?: number; hp?: number } = {}) {
    const stats: Record<string, number> = { 'DT Explosive': opts.dt ?? 0, 'DR Explosive': opts.dr ?? 0, HP: opts.hp ?? 100 }
    const c: any = {
        type: 'critter',
        name,
        dead: false,
        flags: 0,
        position: { x, y },
        pro: { extra: { flags: 0 } },
        getStat: (s: string) => stats[s] ?? 0,
        move: (p: any) => (c.position = p),
    }
    return c
}

function mapOf(objects: any[]): ExplosionMap {
    return {
        objectsAt: (p) => objects.filter((o) => o.position && o.position.x === p.x && o.position.y === p.y),
        critters: () => objects.filter((o) => o.type === 'critter'),
    }
}

const fixed = (v: number) => () => v

describe('explosion damage (_compute_explosion_damage)', () => {
    it('subtracts Explosion DT, then DR%, and knocks back a hex per 10', () => {
        const c = critter('A', 0, 0, { dt: 5, dr: 20 })
        expect(explosionDamage(30, 50, c, fixed(45))).toEqual({ damage: 32, knockback: 3 })
    })

    it('never goes below zero', () => {
        expect(explosionDamage(1, 10, critter('A', 0, 0, { dt: 20 }), fixed(10)).damage).toBe(0)
    })

    it('multi-hex critters are not knocked back', () => {
        const c = critter('A', 0, 0)
        c.flags = 0x800
        expect(explosionDamage(40, 40, c, fixed(40)).knockback).toBe(0)
    })
})

describe('who an explosion catches', () => {
    it('the critter on the hex plus up to six others within three hexes', () => {
        const center = critter('C', 50, 50)
        const near = Array.from({ length: 8 }, (_, i) => critter('N' + i, 50, 51 + (i % 3)))
        const far = critter('F', 50, 60)
        const dead = critter('D', 51, 50)
        dead.dead = true
        const { main, extras } = explosionVictims({ x: 50, y: 50 }, mapOf([center, ...near, far, dead]))
        expect(main).toBe(center)
        expect(extras).toHaveLength(6)
        expect(extras).not.toContain(far)
        expect(extras).not.toContain(dead)
    })

    it('a wall between the blast and a critter shields it', () => {
        const behind = critter('B', 50, 52)
        const wall = { type: 'wall', position: { x: 50, y: 51 }, flags: 0, blocks: () => true }
        const { extras } = explosionVictims({ x: 50, y: 50 }, mapOf([behind, wall]))
        expect(extras).toEqual([])
    })
})

describe('explode (actionExplode / _report_explosion)', () => {
    let messages: string[]
    let off: () => void
    let saved: any
    beforeEach(() => {
        saved = { inCombat: globalState.inCombat }
        globalState.inCombat = false
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })
    afterEach(() => {
        off()
        globalState.inCombat = saved.inCombat
    })

    it('damages, reports, blames the source and starts a fight', () => {
        const victim = critter('Guard', 50, 51)
        const player: any = { type: 'critter', isPlayer: true, name: 'You' }
        const damage = vi.fn((c: any, n: number) => { c.hp = n })
        const startCombat = vi.fn()
        const hit = explode({ x: 50, y: 50 }, 20, 20, player, { damage, startCombat }, mapOf([victim]), fixed(20))
        expect(hit).toEqual([victim])
        expect(damage).toHaveBeenCalledWith(victim, 20, player)
        expect(messages).toEqual(['Guard was hit for 20 hit points.'])
        expect(victim.whoHitMe).toBe(player)
        expect(startCombat).toHaveBeenCalledWith(victim, player)
        // knocked back two hexes, away from the blast
        expect(victim.position).not.toEqual({ x: 50, y: 51 })
    })

    it('a scripted blast blames no one', () => {
        const victim = critter('Guard', 50, 50)
        const startCombat = vi.fn()
        explode({ x: 50, y: 50 }, 1, 10, null, { damage: () => {}, startCombat }, mapOf([victim]), fixed(5))
        expect(startCombat).not.toHaveBeenCalled()
        expect(messages).toEqual(['Guard was hit for 5 hit points.'])
    })
})
