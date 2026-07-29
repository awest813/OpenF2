/**
 * Parity Slice A + B regressions.
 *
 * A — honest measurement: asset suites skip without data/; checklist
 *     distinguishes safe_stub from implemented.
 * B — HUD reads live Critter HP via playerProjection (P0-2 adapter).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    SCRIPTING_STUB_CHECKLIST,
    stubChecklistSummary,
    isBehaviorallyComplete,
} from './scriptingChecklist.js'
import {
    hasScriptAssets,
    hasConvertedGameData,
    SCRIPTS_DIR,
} from './testScriptAssets.js'
import {
    readPlayerHudSnapshot,
    syncPlayerEntityFromCritter,
} from './playerProjection.js'
import globalState from './globalState.js'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { fromTileNum, hexToTile } from './tile.js'
import * as fs from 'fs'

describe('Parity Slice A — asset gate helpers', () => {
    it('reports no script assets on a clean checkout', () => {
        // This repo checkout does not ship data/scripts; helpers must say so.
        expect(hasScriptAssets()).toBe(fs.existsSync(SCRIPTS_DIR) && fs.readdirSync(SCRIPTS_DIR).some((f) => f.endsWith('.int')))
        expect(typeof hasConvertedGameData()).toBe('boolean')
    })

    it('SCRIPTS_DIR points at repo data/scripts', () => {
        expect(SCRIPTS_DIR.endsWith('data/scripts') || SCRIPTS_DIR.endsWith('data\\scripts')).toBe(true)
    })
})

describe('Parity Slice A — checklist safe_stub vocabulary', () => {
    it('summary includes safe_stub and sums to total entries', () => {
        const summary = stubChecklistSummary()
        expect(summary.safe_stub).toBeGreaterThanOrEqual(1)
        expect(
            summary.stub + summary.partial + summary.safe_stub + summary.implemented
        ).toBe(SCRIPTING_STUB_CHECKLIST.length)
    })

    it('known no-ops are safe_stub, not implemented', () => {
        const play = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'play_gmovie')
        const setTile = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_tile_fid')
        const repeat = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_global_script_repeat')
        expect(play?.status).toBe('safe_stub')
        expect(setTile?.status).toBe('safe_stub')
        expect(repeat?.status).toBe('safe_stub')
        expect(isBehaviorallyComplete('safe_stub')).toBe(false)
        expect(isBehaviorallyComplete('implemented')).toBe(true)
    })

    it('always-true metarule3 walk/visibility helpers are partial', () => {
        expect(SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_102')?.status).toBe('partial')
        expect(SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_107')?.status).toBe('partial')
    })
})

describe('Parity Slice A — get_tile_fid with lut fixture', () => {
    it('resolves brick01 from the lut/tiles.lst fixture without a full art export', () => {
        const script = new (Scripting as any).Script()
        const savedMap = globalState.gMap
        const hexPos = fromTileNum(20100)
        const tilePos = hexToTile(hexPos)
        const floorGrid = Array.from({ length: 100 }, () => Array(100).fill('grid000'))
        floorGrid[tilePos.y][tilePos.x] = 'brick01'
        ;(globalState as any).gMap = {
            numLevels: 1,
            mapObj: { levels: [{ tiles: { floor: floorGrid } }] },
        }
        try {
            expect(script.get_tile_fid(20100, 0)).toBe(0x04000000 | 2)
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })
})

describe('Parity Slice B — HUD follows live Critter HP', () => {
    let savedPlayer: any
    let savedEntityId: number
    let entityId: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
        entityId = createPlayerEntity({ name: 'Test Vault Dweller' })
        globalState.playerEntityId = entityId
        globalState.player = new Player() as any
        // Ensure Max HP / HP are defined on the live StatSet
        ;(globalState.player as any).stats.baseStats['Max HP'] = 100
        ;(globalState.player as any).stats.baseStats['HP'] = 100
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
    })

    it('readPlayerHudSnapshot reflects Critter HP', () => {
        ;(globalState.player as any).stats.baseStats['HP'] = 37
        const snap = readPlayerHudSnapshot()
        expect(snap).not.toBeNull()
        expect(snap!.currentHp).toBe(37)
        expect(snap!.maxHp).toBeGreaterThanOrEqual(37)
        expect(snap!.name).toBe('Player')
    })

    it('syncPlayerEntityFromCritter copies combat damage into ECS stats', () => {
        ;(globalState.player as any).stats.baseStats['HP'] = 22
        syncPlayerEntityFromCritter()
        const stats = EntityManager.get<'stats'>(entityId, 'stats')
        expect(stats).toBeDefined()
        expect(stats!.currentHp).toBe(22)
        expect(stats!.maxHp).toBeGreaterThanOrEqual(22)
    })

    it('ECS HUD path stays aligned after further HP changes', () => {
        ;(globalState.player as any).stats.baseStats['HP'] = 90
        syncPlayerEntityFromCritter()
        ;(globalState.player as any).stats.baseStats['HP'] = 11
        syncPlayerEntityFromCritter()
        const stats = EntityManager.get<'stats'>(entityId, 'stats')
        expect(stats!.currentHp).toBe(11)
        const snap = readPlayerHudSnapshot()
        expect(snap!.currentHp).toBe(stats!.currentHp)
    })
})
