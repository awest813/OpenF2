/**
 * Automap fog + party disposition combat AI (Slice G / P1-11 + P1-1).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { Party } from './party.js'
import { Combat } from './combat.js'
import {
    markExploredAround,
    markTileVisited,
    getVisitedTiles,
    isTileVisited,
    buildPipBoyMapData,
    serializeAutomap,
    hydrateAutomap,
    resetAutomap,
    automapKey,
} from './character/automap.js'
import { toTileNum } from './tile.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { Critter } from './object.js'

describe('Automap fog-of-war', () => {
    let savedMap: typeof globalState.gMap
    let savedPlayer: typeof globalState.player
    let savedElev: number

    beforeEach(() => {
        savedMap = globalState.gMap
        savedPlayer = globalState.player
        savedElev = globalState.currentElevation
        resetAutomap()
        globalState.player = new Player()
        ;(globalState.player as Player).position = { x: 50, y: 50 }
        globalState.currentElevation = 0
        globalState.gMap = {
            name: 'testmap',
            currentElevation: 0,
        } as any
    })

    afterEach(() => {
        globalState.gMap = savedMap
        globalState.player = savedPlayer
        globalState.currentElevation = savedElev
        resetAutomap()
    })

    it('markExploredAround records tiles around the player', () => {
        markExploredAround('testmap', 0, 50, 50, 1)
        const visited = getVisitedTiles('testmap', 0)
        expect(visited.size).toBeGreaterThan(0)
        expect(isTileVisited('testmap', 0, toTileNum({ x: 50, y: 50 }))).toBe(true)
    })

    it('keys maps by name and elevation', () => {
        markTileVisited('arroyo', 0, 100)
        markTileVisited('arroyo', 1, 200)
        expect(automapKey('Arroyo', 0)).toBe('arroyo|0')
        expect(getVisitedTiles('arroyo', 0).has(100)).toBe(true)
        expect(getVisitedTiles('arroyo', 1).has(200)).toBe(true)
        expect(getVisitedTiles('arroyo', 0).has(200)).toBe(false)
    })

    it('buildPipBoyMapData downsamples visited tiles', () => {
        markExploredAround('testmap', 0, 50, 50, 2)
        const grid = buildPipBoyMapData(20)
        expect(grid).not.toBeNull()
        expect(grid!.width).toBe(20)
        expect(grid!.cells.some((row) => row.some((c) => c.visited))).toBe(true)
        expect(grid!.cells[grid!.playerY][grid!.playerX].visited).toBe(true)
    })

    it('serialize/hydrate round-trips visited tiles', () => {
        markTileVisited('den', 0, 42)
        markTileVisited('den', 0, 99)
        const snap = serializeAutomap()
        resetAutomap()
        expect(getVisitedTiles('den', 0).size).toBe(0)
        hydrateAutomap(snap)
        expect(isTileVisited('den', 0, 42)).toBe(true)
        expect(isTileVisited('den', 0, 99)).toBe(true)
    })

    it('migrateSave v22 adds empty automap at v23', () => {
        const migrated = migrateSave({
            version: 22,
            name: 't',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: {
                position: { x: 1, y: 1 },
                orientation: 0,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            party: [],
            savedMaps: {},
            timedEffects: {},
        })
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(SAVE_VERSION).toBe(24)
        expect(migrated.automap).toEqual({})
    })
})

describe('Party disposition combat AI', () => {
    let savedParty: typeof globalState.gParty
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedParty = globalState.gParty
        savedPlayer = globalState.player
        globalState.gParty = new Party()
        globalState.player = new Player()
        ;(globalState.player as Player).position = { x: 10, y: 10 }
        ;(globalState.player as any).teamNum = 0
    })

    afterEach(() => {
        globalState.gParty = savedParty
        globalState.player = savedPlayer
    })

    function makeCritter(opts: {
        name: string
        team: number
        x: number
        y: number
        hp: number
        maxHp: number
        pid?: number
    }): Critter {
        return {
            name: opts.name,
            type: 'critter',
            teamNum: opts.team,
            pid: opts.pid ?? 1,
            dead: false,
            position: { x: opts.x, y: opts.y },
            getStat: (stat: string) => {
                if (stat === 'HP') return opts.hp
                if (stat === 'Max HP') return opts.maxHp
                return 0
            },
        } as any
    }

    it('defensive disposition prefers threats near the player', () => {
        const ally = makeCritter({ name: 'Sulik', team: 0, x: 12, y: 10, hp: 50, maxHp: 50, pid: 16777313 })
        globalState.gParty.addPartyMember(ally)
        globalState.gParty.setDisposition(ally, 'defensive')

        const nearPlayer = makeCritter({ name: 'RaiderNear', team: 1, x: 11, y: 10, hp: 40, maxHp: 40 })
        const farEnemy = makeCritter({ name: 'RaiderFar', team: 1, x: 40, y: 40, hp: 10, maxHp: 40 })

        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = [ally, nearPlayer, farEnemy]
        const target = combat.findTarget(ally)
        expect(target?.name).toBe('RaiderNear')
    })

    it('aggressive disposition prefers weak targets', () => {
        const ally = makeCritter({ name: 'Marcus', team: 0, x: 20, y: 20, hp: 80, maxHp: 80, pid: 16777377 })
        globalState.gParty.addPartyMember(ally)
        globalState.gParty.setDisposition(ally, 'aggressive')

        const weak = makeCritter({ name: 'Weak', team: 1, x: 24, y: 20, hp: 5, maxHp: 40 })
        const strong = makeCritter({ name: 'Strong', team: 1, x: 22, y: 20, hp: 40, maxHp: 40 })

        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = [ally, weak, strong]
        const target = combat.findTarget(ally)
        expect(target?.name).toBe('Weak')
    })
})
