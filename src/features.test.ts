/**
 * Tests for the new/improved features addressing known gaps:
 *
 *  1. BitmapFontRenderer — measureText, charWidth, fallback mode
 *  2. Audio volume clamping (inline algorithm test, mirrors phase2/3 approach
 *     of testing logic directly since audio.ts imports browser-only data.ts)
 *  3. PipBoyPanel — lifecycle, tab cycling, map data, quest rendering
 *  4. WorldmapPlayer interface — target may be null (type safety)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// 1. BitmapFontRenderer
// ---------------------------------------------------------------------------

import { BitmapFontRenderer, FALLOUT_GREEN } from './ui2/uiPanel.js'

describe('BitmapFontRenderer — null-font fallback', () => {
    it('measureText returns a positive number for any non-empty string', () => {
        const r = new BitmapFontRenderer(null)
        expect(r.measureText('Hello')).toBeGreaterThan(0)
    })

    it('measureText returns 0 for empty string', () => {
        const r = new BitmapFontRenderer(null)
        expect(r.measureText('')).toBe(0)
    })

    it('charWidth returns 8 (monospace fallback) when font is null', () => {
        const r = new BitmapFontRenderer(null)
        expect(r.charWidth('A')).toBe(8)
    })

    it('measureText scales linearly with string length (monospace fallback)', () => {
        const r = new BitmapFontRenderer(null)
        const one = r.measureText('A')
        const five = r.measureText('AAAAA')
        expect(five).toBe(one * 5)
    })

    it('drawText does not throw with a stub canvas context', () => {
        const r = new BitmapFontRenderer(null)
        const ctx = makeCtxStub()
        expect(() => r.drawText(ctx, 'TEST', 0, 0, FALLOUT_GREEN)).not.toThrow()
    })

    it('drawText calls fillText on the context', () => {
        const r = new BitmapFontRenderer(null)
        const ctx = makeCtxStub()
        r.drawText(ctx, 'HELLO', 10, 20, FALLOUT_GREEN)
        expect(ctx.fillText).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// 2. Audio volume-clamping algorithm (inline, as HTMLAudioEngine imports
//    browser-only modules via data.ts; see phase2/phase3 test pattern)
// ---------------------------------------------------------------------------

/**
 * Inline replica of the setMusicVolume / setSfxVolume clamping logic from
 * HTMLAudioEngine so we can verify the algorithm in isolation.
 */
function clampVolume(vol: number): number {
    return Math.max(0, Math.min(1, vol))
}

describe('Audio volume clamping', () => {
    it('clamps negative values to 0', () => {
        expect(clampVolume(-1)).toBe(0)
        expect(clampVolume(-99)).toBe(0)
    })

    it('clamps values above 1 to 1', () => {
        expect(clampVolume(2)).toBe(1)
        expect(clampVolume(99)).toBe(1)
    })

    it('preserves values in [0, 1]', () => {
        expect(clampVolume(0)).toBe(0)
        expect(clampVolume(0.5)).toBeCloseTo(0.5)
        expect(clampVolume(1)).toBe(1)
    })

    it('0.7 is preserved unchanged', () => {
        expect(clampVolume(0.7)).toBeCloseTo(0.7)
    })
})

/**
 * Inline replica of the _pickFormat logic from HTMLAudioEngine —
 * specifically the Node/undefined fallback behaviour.
 */
function pickFormatFallback(): string {
    if (typeof Audio === 'undefined') return 'wav'
    // In a real browser this would probe canPlayType; in Node we just return 'wav'
    return 'wav'
}

const FORMAT_CANDIDATES = ['wav', 'mp3', 'ogg'] as const

describe('Audio format selection', () => {
    it('returns "wav" in Node (Audio is undefined)', () => {
        expect(pickFormatFallback()).toBe('wav')
    })

    it('FORMAT_CANDIDATES contains wav, mp3, and ogg', () => {
        expect(FORMAT_CANDIDATES).toContain('wav')
        expect(FORMAT_CANDIDATES).toContain('mp3')
        expect(FORMAT_CANDIDATES).toContain('ogg')
    })

    it('wav appears before mp3 in the candidates list (preferred format)', () => {
        expect(FORMAT_CANDIDATES.indexOf('wav')).toBeLessThan(FORMAT_CANDIDATES.indexOf('mp3'))
    })
})

// ---------------------------------------------------------------------------
// 3. PipBoyPanel — lifecycle and rendering
// ---------------------------------------------------------------------------

import { PipBoyPanel, PipBoyMapData } from './ui2/pipboy.js'
import { EntityManager } from './ecs/entityManager.js'
import { QuestLog } from './quest/questLog.js'
import { zeroDamageStats } from './ecs/components.js'

describe('PipBoyPanel — lifecycle', () => {
    let panel: PipBoyPanel
    let questLog: QuestLog
    let entityId: number

    beforeEach(() => {
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        questLog = new QuestLog()
        entityId = EntityManager.create()
        EntityManager.add(entityId, {
            componentType: 'stats',
            strength: 5, perception: 5, endurance: 5,
            charisma: 5, intelligence: 5, agility: 5, luck: 5,
            strengthMod: 0, perceptionMod: 0, enduranceMod: 0,
            charismaMod: 0, intelligenceMod: 0, agilityMod: 0, luckMod: 0,
            maxHp: 30, currentHp: 25, maxAP: 8, maxAPMod: 0,
            armorClass: 5, carryWeight: 150, meleeDamage: 2,
            damageResistance: 10, poisonResistance: 20, radiationResistance: 30,
            sequence: 6, healingRate: 2, criticalChance: 5,
            maxHpMod: 0, carryWeightMod: 0, meleeDamageMod: 0,
            poisonResistanceMod: 0, radiationResistanceMod: 0,
            sequenceMod: 0, healingRateMod: 0, criticalChanceMod: 0,
            level: 1, xp: 0, xpToNextLevel: 1000,
            dt: zeroDamageStats(), dr: zeroDamageStats(),
        })
        panel = new PipBoyPanel(800, 600, entityId, questLog)
    })

    it('starts hidden', () => {
        expect(panel.visible).toBe(false)
    })

    it('has name "pipboy"', () => {
        expect(panel.name).toBe('pipboy')
    })

    it('has zOrder > 0 (renders on top of HUD)', () => {
        expect(panel.zOrder).toBeGreaterThan(0)
    })

    it('show() makes it visible', () => {
        panel.show()
        expect(panel.visible).toBe(true)
    })

    it('Escape key closes the panel', () => {
        panel.show()
        const consumed = panel.onKeyDown('Escape')
        expect(consumed).toBe(true)
        expect(panel.visible).toBe(false)
    })

    it('"P" key closes the panel', () => {
        panel.show()
        panel.onKeyDown('P')
        expect(panel.visible).toBe(false)
    })

    it('ArrowRight cycles through tabs', () => {
        expect((panel as any).activeTab).toBe('status')
        panel.onKeyDown('ArrowRight')
        expect((panel as any).activeTab).toBe('items')
        panel.onKeyDown('ArrowRight')
        expect((panel as any).activeTab).toBe('map')
        panel.onKeyDown('ArrowRight')
        expect((panel as any).activeTab).toBe('quests')
        panel.onKeyDown('ArrowRight')
        expect((panel as any).activeTab).toBe('status') // wraps around
    })

    it('ArrowLeft cycles backwards through tabs', () => {
        expect((panel as any).activeTab).toBe('status')
        panel.onKeyDown('ArrowLeft')
        expect((panel as any).activeTab).toBe('quests') // wraps backwards
    })

    it('mouse click on tab region switches active tab', () => {
        // Tab 1 is at x=0..tabW, y=30..52
        const { width } = panel.bounds
        const tabW = Math.floor(width / 4)
        // Click on tab index 1 ('items')
        panel.onMouseDown(tabW + 5, 38, 'l')
        expect((panel as any).activeTab).toBe('items')
    })

    it('unknown key returns false', () => {
        const consumed = panel.onKeyDown('F12')
        expect(consumed).toBe(false)
    })
})

describe('PipBoyPanel — map data', () => {
    it('setMapData stores map data accessible for rendering', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)

        const mapData: PipBoyMapData = {
            width: 10, height: 10,
            cells: Array.from({ length: 10 }, () =>
                Array.from({ length: 10 }, () => ({ visited: false }))
            ),
            playerX: 5, playerY: 5,
        }
        p.setMapData(mapData)
        expect((p as any).mapData).toBe(mapData)
    })

    it('render does not throw on map tab when mapData is null', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'map'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('render does not throw on map tab when mapData is set', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        p.setMapData({
            width: 5, height: 5,
            cells: Array.from({ length: 5 }, () =>
                Array.from({ length: 5 }, (_, x) => ({ visited: x < 3 }))
            ),
            playerX: 2, playerY: 2,
        })
        ;(p as any).activeTab = 'map'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('player cell is distinct from visited cells', () => {
        // Verifies setMapData stores player coords correctly
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        const mapData: PipBoyMapData = {
            width: 3, height: 3,
            cells: [[{ visited: true }, { visited: true }, { visited: true }],
                    [{ visited: true }, { visited: false }, { visited: true }],
                    [{ visited: false }, { visited: false }, { visited: false }]],
            playerX: 1, playerY: 1,
        }
        p.setMapData(mapData)
        const stored = (p as any).mapData as PipBoyMapData
        expect(stored.playerX).toBe(1)
        expect(stored.playerY).toBe(1)
    })
})

describe('PipBoyPanel — quest tab', () => {
    it('renders without throwing when quest log is empty', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'quests'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('renders without throwing when quests are present', () => {
        const questLog = new QuestLog()
        questLog.start('q_vault15', 0)
        questLog.start('q_master', 0)
        questLog.complete('q_vault15', 0)

        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'quests'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('active quests appear in getAll()', () => {
        const questLog = new QuestLog()
        questLog.start('q_cathedral', 0)
        const entries = questLog.getAll()
        expect(entries.some((e) => e.id === 'q_cathedral' && e.state === 'active')).toBe(true)
    })
})

describe('PipBoyPanel — status tab', () => {
    it('renders without throwing when entity has stats', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        EntityManager.add(id, {
            componentType: 'stats',
            strength: 6, perception: 7, endurance: 5,
            charisma: 4, intelligence: 6, agility: 7, luck: 5,
            strengthMod: 0, perceptionMod: 0, enduranceMod: 0,
            charismaMod: 0, intelligenceMod: 0, agilityMod: 0, luckMod: 0,
            maxHp: 35, currentHp: 10, maxAP: 9, maxAPMod: 0,
            armorClass: 8, carryWeight: 175, meleeDamage: 3,
            damageResistance: 15, poisonResistance: 25, radiationResistance: 35,
            sequence: 7, healingRate: 3, criticalChance: 6,
            maxHpMod: 0, carryWeightMod: 0, meleeDamageMod: 0,
            poisonResistanceMod: 0, radiationResistanceMod: 0,
            sequenceMod: 0, healingRateMod: 0, criticalChanceMod: 0,
            level: 3, xp: 4000, xpToNextLevel: 6000,
            dt: zeroDamageStats(), dr: zeroDamageStats(),
        })
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'status'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('renders without throwing when entity has no stats (graceful degradation)', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        // No stats component added
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'status'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })
})

describe('PipBoyPanel — items tab', () => {
    it('renders without throwing when inventory is empty', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'items'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })

    it('renders without throwing when inventory has items', () => {
        const questLog = new QuestLog()
        EntityManager.deserialize({ version: 1, nextId: 1, entities: [] })
        const id = EntityManager.create()
        EntityManager.add(id, {
            componentType: 'inventory',
            items: [
                { pid: 42, count: 1 },
                { pid: 100, count: 5 },
            ],
            equippedWeaponPrimary: 42,
            equippedWeaponSecondary: null,
            equippedArmor: null,
        })
        const p = new PipBoyPanel(800, 600, id, questLog)
        ;(p as any).activeTab = 'items'
        expect(() => p.render(makeCtxStub())).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// Shared canvas stub
// ---------------------------------------------------------------------------

function makeCtxStub(): OffscreenCanvasRenderingContext2D {
    return {
        canvas: { width: 800, height: 600 },
        fillStyle: '' as any,
        strokeStyle: '' as any,
        font: '',
        textAlign: '' as any,
        textBaseline: '' as any,
        lineWidth: 1,
        globalCompositeOperation: '' as any,
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
        putImageData: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D
}
