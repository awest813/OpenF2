/**
 * Parity Slice E — get/set_tile_fid + Arroyo real-script smoke (P2-1 / P0-4).
 */

import { describe, it, expect } from 'vitest'
import { describeIfScriptAssets, hasScriptAssets, SCRIPTS_DIR } from './testScriptAssets.js'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { fromTileNum, hexToTile } from './tile.js'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'
import * as fs from 'fs'
import * as path from 'path'
import { BinaryReader } from './util.js'
import { parseIntFile, IntFile } from './intfile.js'
import { ScriptVM } from './vm.js'
import './vm_bridge.js'
import { Config } from './config.js'

/** Core Arroyo map scripts used for the opt-in smoke. */
export const ARROYO_SMOKE_SCRIPTS = [
    'artemple',
    'arvillag',
    'argarden',
    'arbridge',
    'artifact',
] as const

describe('Parity Slice E — tile FID checklist', () => {
    it('get_tile_fid is implemented; set_tile_fid is partial', () => {
        expect(SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_tile_fid')?.status).toBe('implemented')
        expect(SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_tile_fid')?.status).toBe('partial')
    })
})

describe('Parity Slice E — get/set_tile_fid round-trip (lut fixture)', () => {
    it('set_tile_fid then get_tile_fid returns the same FID', () => {
        const script = new (Scripting as any).Script()
        const savedMap = globalState.gMap
        const hexPos = fromTileNum(20100)
        const tilePos = hexToTile(hexPos)
        const floorGrid = Array.from({ length: 100 }, () => Array(100).fill('grid000'))
        ;(globalState as any).gMap = {
            numLevels: 1,
            mapObj: { levels: [{ tiles: { floor: floorGrid } }] },
        }
        try {
            const fid = 0x04000000 | 3 // brick02 in lut/tiles.lst
            script.set_tile_fid(20100, 0, fid)
            expect(floorGrid[tilePos.y][tilePos.x]).toBe('brick02')
            expect(script.get_tile_fid(20100, 0)).toBe(fid)
            script.set_tile_fid_sfall(20100, 0, 0x04000000 | 2)
            expect(script.get_tile_fid_sfall(20100, 0)).toBe(0x04000000 | 2)
        } finally {
            ;(globalState as any).gMap = savedMap
        }
    })
})

describe('Parity Slice E — real-asset lane helpers', () => {
    it('documents SCRIPTS_DIR and skip behavior on clean checkout', () => {
        expect(SCRIPTS_DIR).toMatch(/data[/\\]scripts$/)
        expect(typeof hasScriptAssets()).toBe('boolean')
    })
})

function loadInt(name: string): { intfile: IntFile; reader: BinaryReader } {
    const filePath = path.join(SCRIPTS_DIR, name + '.int')
    const buf = fs.readFileSync(filePath)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const reader = new BinaryReader(new DataView(ab))
    const intfile = parseIntFile(reader, name)
    reader.seek(intfile.codeOffset)
    return { intfile, reader }
}

function runMapEnter(intfile: IntFile, reader: BinaryReader): void {
    if (!intfile.procedures['map_enter_p_proc']) {
        return
    }
    const dv = new DataView(reader.data.buffer.slice(0))
    const freshReader = new BinaryReader(dv)
    freshReader.seek(intfile.codeOffset)
    const vm = new ScriptVM(freshReader, intfile) as any
    vm.scriptObj = new Proxy(
        {},
        {
            get: (_t, prop) => {
                if (prop === 'scriptName') return intfile.name
                if (prop === '_mapScript') return undefined
                const scalarProps = [
                    'action_being_used',
                    'game_time',
                    'cur_map_index',
                    'combat_is_initialized',
                    'fixed_param',
                    'self_obj',
                    'source_obj',
                    'target_obj',
                ]
                if (typeof prop === 'string' && scalarProps.includes(prop)) {
                    return 0
                }
                return () => 0
            },
        },
    )
    const prevStrict = Config.engine.failOnUnknownVmOpcode
    Config.engine.failOnUnknownVmOpcode = false
    try {
        vm.call('map_enter_p_proc')
    } finally {
        Config.engine.failOnUnknownVmOpcode = prevStrict
    }
}

describeIfScriptAssets('Parity Slice E — Arroyo ScriptVM smoke (requires data/scripts)', () => {
    for (const name of ARROYO_SMOKE_SCRIPTS) {
        it(`${name}.int exists, parses, and map_enter_p_proc does not hard-crash`, () => {
            const filePath = path.join(SCRIPTS_DIR, name + '.int')
            expect(fs.existsSync(filePath)).toBe(true)
            expect(() => {
                const loaded = loadInt(name)
                expect(loaded.intfile).toBeDefined()
                runMapEnter(loaded.intfile, loaded.reader)
            }).not.toThrow()
        })
    }
})
