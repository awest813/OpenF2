/**
 * Phase 108 — per-object lighting readback (lightmap integration)
 *
 *   A. get_object_lighting samples Lightmap at object tile
 *   B. get/set_tile_light_level_sfall tile array wrappers
 *   C. get/set_obj_light_level_sfall synced with lightIntensity
 *   D. obj_set_light_level syncs emission fields
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import { Lightmap } from './lightmap.js'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiLog: vi.fn() }
})

let script: InstanceType<typeof Scripting.Script>

beforeEach(() => {
    Scripting.init('test_phase108')
    script = new Scripting.Script()
    Lightmap.resetLight()
    globalState.ambientLightLevel = 65536
})

describe('Phase 108-A — get_object_lighting reads lightmap', () => {
    it('returns ambient when object has no position', () => {
        expect(script.get_object_lighting({} as any)).toBe(65536)
        expect(script.get_object_lighting(null as any)).toBe(65536)
    })

    it('returns tile intensity at object position', () => {
        const tile = 200
        Lightmap.setTileLightLevel(tile, 12000)
        const obj = { position: { x: 0, y: 1 } }
        expect(script.get_object_lighting(obj as any)).toBeCloseTo(12000, -2)
    })

    it('obj_set_light_level syncs lightIntensity and lightLevel', () => {
        const obj: any = {
            type: 'scenery',
            position: { x: 10, y: 10 },
            lightIntensity: 655,
            lightRadius: 0,
        }
        script.obj_set_light_level(obj, 40000, 4)
        expect(obj.lightIntensity).toBe(40000)
        expect(obj.lightLevel).toBe(40000)
        expect(obj.lightRadius).toBe(4)
    })
})

describe('Phase 108-B — tile light level sfall opcodes', () => {
    it('set/get round-trip on a tile', () => {
        script.set_tile_light_level_sfall(500, 22000)
        expect(script.get_tile_light_level_sfall(500)).toBeCloseTo(22000, -2)
    })

    it('returns 0 for invalid tile numbers', () => {
        expect(script.get_tile_light_level_sfall(-1)).toBe(0)
        expect(script.get_tile_light_level_sfall(NaN)).toBe(0)
    })

    it('clamps overflow on set', () => {
        script.set_tile_light_level_sfall(501, 99999)
        expect(script.get_tile_light_level_sfall(501)).toBe(65536)
    })
})

describe('Phase 108-C — obj emission light level bridge', () => {
    it('set_obj_light_level_sfall syncs lightIntensity and lightLevel', () => {
        const obj: any = { type: 'scenery', position: { x: 1, y: 1 } }
        script.set_obj_light_level_sfall(obj, 18000)
        expect(script.get_obj_light_level_sfall(obj)).toBe(18000)
        expect(obj.lightIntensity).toBe(18000)
        expect(obj.lightLevel).toBe(18000)
    })
})

describe('Phase 108-D — checklist status', () => {
    it('sfall_get_object_lighting is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_object_lighting')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 108-E — ambient and emitter rebuild', () => {
    it('set_light_level darkens tile readback after applyAmbientLight', () => {
        script.set_light_level(8192)
        Lightmap.applyAmbientLight()
        expect(script.get_tile_light_level_sfall(10)).toBeLessThan(65536)
    })

    it('obj_set_light_level updates get_object_lighting when gMap is present', () => {
        const obj: any = { type: 'scenery', position: { x: 5, y: 5 }, lightIntensity: 655, lightRadius: 3 }
        const origMap = globalState.gMap
        globalState.gMap = {
            getObjects: () => [obj],
            objectsAtPosition: () => [],
        } as any
        script.set_light_level(8192)
        script.obj_set_light_level(obj, 50000, 4)
        const received = script.get_object_lighting(obj)
        globalState.gMap = origMap
        expect(received).toBeGreaterThan(16384)
    })
})
