/**
 * Engine preferences store — persist, apply, INI overlay.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Config } from './config.js'
import globalState from './globalState.js'
import {
    VOLUME_INI_DEFAULT,
    encounterDifficultyFromGame,
    getSettings,
    iniOverride,
    iniToVolume,
    loadAndApplySettings,
    patchSettings,
    resetSettings,
    violenceToIni,
    volumeToIni,
} from './settings.js'
import { Scripting } from './scripting.js'

describe('settings store', () => {
    beforeEach(() => {
        resetSettings()
    })

    afterEach(() => {
        resetSettings()
    })

    it('starts at FO2-aligned defaults', () => {
        const s = getSettings()
        expect(s.gameDifficulty).toBe(1)
        expect(s.combatDifficulty).toBe(1)
        expect(s.violenceLevel).toBe(2)
        expect(s.alwaysRun).toBe(true)
        expect(s.audioEnabled).toBe(false)
        expect(volumeToIni(s.musicVolume)).toBe(VOLUME_INI_DEFAULT)
    })

    it('patchSettings writes Config, globalState, and encounter difficulty', () => {
        patchSettings({ gameDifficulty: 2, combatDifficulty: 0, alwaysRun: false, showHexOverlay: true })
        expect(globalState.gameDifficulty).toBe(2)
        expect(globalState.combatDifficulty).toBe(0)
        expect(Config.engine.doAlwaysRun).toBe(false)
        expect(Config.engine.encounterDifficulty).toBe('hard')
        expect(Config.ui.showHexOverlay).toBe(true)
    })

    it('persists and reloads from storage', () => {
        patchSettings({ gameDifficulty: 0, audioEnabled: true, musicVolume: 1 })
        resetSettings(false)
        expect(getSettings().gameDifficulty).toBe(1)

        loadAndApplySettings()
        const s = getSettings()
        expect(s.gameDifficulty).toBe(0)
        expect(s.audioEnabled).toBe(true)
        expect(s.musicVolume).toBe(1)
        expect(Config.engine.encounterDifficulty).toBe('easy')
    })

    it('clamps out-of-range patches', () => {
        patchSettings({
            gameDifficulty: 9 as any,
            musicVolume: 4,
            sfxVolume: -2,
        })
        const s = getSettings()
        expect(s.gameDifficulty).toBe(2)
        expect(s.musicVolume).toBe(1)
        expect(s.sfxVolume).toBe(0)
    })

    it('maps volume and violence onto FO2 INI scales', () => {
        expect(volumeToIni(iniToVolume(VOLUME_INI_DEFAULT))).toBe(VOLUME_INI_DEFAULT)
        expect(violenceToIni(0)).toBe(0)
        expect(violenceToIni(1)).toBe(2)
        expect(violenceToIni(2)).toBe(3)
        expect(encounterDifficultyFromGame(0)).toBe('easy')
        expect(encounterDifficultyFromGame(1)).toBe('normal')
        expect(encounterDifficultyFromGame(2)).toBe('hard')
    })

    it('iniOverride reports live preference keys and leaves sound.sound to FO2 defaults', () => {
        patchSettings({
            gameDifficulty: 2,
            combatTaunts: false,
            alwaysRun: false,
            sfxVolume: 1,
        })
        expect(iniOverride('preferences.game_difficulty')).toBe(2)
        expect(iniOverride('preferences.combat_taunts')).toBe(0)
        expect(iniOverride('main.running')).toBe(0)
        expect(iniOverride('sound.sfxvolume')).toBe(222)
        expect(iniOverride('sound.sound')).toBeUndefined()
        expect(iniOverride('main.fps')).toBeUndefined()
    })
})

describe('settings overlay get_ini_setting / metarules', () => {
    let script: Scripting.Script

    beforeEach(() => {
        resetSettings()
        script = new (Scripting as any).Script()
    })

    afterEach(() => {
        resetSettings()
    })

    it('get_ini_setting still returns FO2 defaults at rest', () => {
        expect(script.get_ini_setting('sound.sound')).toBe(1)
        expect(script.get_ini_setting('preferences.combat_taunts')).toBe(1)
        expect(script.get_ini_setting('preferences.violence_level')).toBe(3)
        expect(script.get_ini_setting('sound.sfxvolume')).toBe(VOLUME_INI_DEFAULT)
        expect(script.get_ini_setting('main.FPS')).toBe(60)
    })

    it('get_ini_setting follows live difficulty after a patch', () => {
        patchSettings({ gameDifficulty: 0, combatDifficulty: 2 })
        expect(script.get_ini_setting('preferences.game_difficulty')).toBe(0)
        expect(script.get_ini_setting('preferences.combat_difficulty')).toBe(2)
        expect(script.metarule(35, 0)).toBe(2)
        expect(script.metarule(55, 0)).toBe(0)
    })

    it('get_violence_level_sfall follows the Options setting', () => {
        expect(script.get_violence_level_sfall()).toBe(2)
        patchSettings({ violenceLevel: 0 })
        expect(script.get_violence_level_sfall()).toBe(0)
        expect(script.metarule(48, 0)).toBe(0)
    })
})
