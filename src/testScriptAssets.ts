/**
 * Shared helpers for suites that require a converted Fallout 2 install
 * (real `.int` scripts under `data/scripts/`).
 *
 * Clean checkouts without assets must stay green: call
 * `describeIfScriptAssets(...)` so the suite is skipped with a clear reason
 * instead of hard-failing on missing files.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { describe, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to `data/scripts` relative to the repo root. */
export const SCRIPTS_DIR = path.resolve(__dirname, '..', 'data', 'scripts')

/**
 * True when `data/scripts` exists and contains at least one `.int` file.
 * Used to gate real-asset integration suites (phase100/107/109, etc.).
 */
export function hasScriptAssets(): boolean {
    try {
        if (!fs.existsSync(SCRIPTS_DIR) || !fs.statSync(SCRIPTS_DIR).isDirectory()) {
            return false
        }
        return fs.readdirSync(SCRIPTS_DIR).some((f) => f.toLowerCase().endsWith('.int'))
    } catch {
        return false
    }
}

const SKIP_REASON =
    'Requires converted Fallout 2 scripts in data/scripts/ (run setup.py against a legal install)'

/**
 * Like `describe`, but skips the whole suite when script assets are absent.
 *
 * Important: when skipping, the suite body is not executed. Suites that call
 * `fs.readdirSync` at describe-time would otherwise throw during collection.
 */
export function describeIfScriptAssets(name: string, fn: () => void): void {
    if (hasScriptAssets()) {
        describe(name, fn)
    } else {
        describe.skip(`${name} [${SKIP_REASON}]`, () => {
            it('requires data/scripts/*.int from a converted Fallout 2 install', () => {
                // Unreachable when skipped; documents the skip reason in reporters.
            })
        })
    }
}

/**
 * True when a converted `proto/pro.json` (or data/scripts) is present.
 * Used by broader real-asset suites (phase109).
 */
export function hasConvertedGameData(): boolean {
    try {
        const protoJson = path.resolve(__dirname, '..', 'proto', 'pro.json')
        if (fs.existsSync(protoJson)) {
            return true
        }
        return hasScriptAssets()
    } catch {
        return false
    }
}

/**
 * Like `describeIfScriptAssets`, but for any converted game data (proto/scripts/art).
 */
export function describeIfConvertedAssets(name: string, fn: () => void): void {
    if (hasConvertedGameData()) {
        describe(name, fn)
    } else {
        describe.skip(
            `${name} [Requires converted Fallout 2 data (proto/pro.json or data/scripts)]`,
            () => {
                it('requires converted Fallout 2 data', () => {})
            }
        )
    }
}
