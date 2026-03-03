/*
Copyright 2015 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { getCurrentMapInfo } from './data.js'
import { getRandomInt } from './util.js'

// Audio engine for handling music and sound effects

export interface AudioEngine {
    playSfx(sfx: string): void
    playMusic(music: string): void
    playSound(soundName: string): HTMLAudioElement | null
    stopMusic(): void
    stopAll(): void
    tick(): void
    /** Set master music volume (0.0–1.0). */
    setMusicVolume(vol: number): void
    /** Set master SFX volume (0.0–1.0). */
    setSfxVolume(vol: number): void
}

export class NullAudioEngine implements AudioEngine {
    playSfx(sfx: string): void {}
    playMusic(music: string): void {}
    playSound(soundName: string): HTMLAudioElement | null {
        return null
    }
    stopMusic(): void {}
    stopAll(): void {}
    tick(): void {}
    setMusicVolume(_vol: number): void {}
    setSfxVolume(_vol: number): void {}
}

export class HTMLAudioEngine implements AudioEngine {
    //lastSfxTime: number = 0
    nextSfxTime: number = 0
    nextSfx: string | null = null
    musicAudio: HTMLAudioElement | null = null

    /** Current music volume (0.0–1.0). */
    private musicVolume: number = 1.0
    /** Current SFX volume (0.0–1.0). */
    private sfxVolume: number = 1.0

    /**
     * Ordered list of audio format extensions to probe when loading a sound.
     * The engine tries each extension in order and uses the first one the
     * browser reports as probably/maybe supported.  WAV is tried first because
     * it is the original Fallout format; MP3 and OGG are conversion targets
     * used by convertAudio.py in this repo.
     */
    private static readonly FORMAT_CANDIDATES: ReadonlyArray<string> = ['wav', 'mp3', 'ogg']

    setMusicVolume(vol: number): void {
        this.musicVolume = Math.max(0, Math.min(1, vol))
        if (this.musicAudio) this.musicAudio.volume = this.musicVolume
    }

    setSfxVolume(vol: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, vol))
    }

    playSfx(sfx: string): void {
        const sound = this.playSound('sfx/' + sfx)
        if (sound) sound.volume = this.sfxVolume
    }

    playMusic(music: string): void {
        this.stopMusic()
        this.musicAudio = this.playSound('music/' + music)
        if (this.musicAudio) {
            this.musicAudio.loop = true
            this.musicAudio.volume = this.musicVolume
        }
    }

    /**
     * Attempt to load and play `soundName`, probing supported audio formats.
     *
     * The browser's `canPlayType()` API is used to pick the best available
     * format before committing to a network fetch, avoiding 404 round-trips
     * when a format is completely unsupported.
     */
    playSound(soundName: string): HTMLAudioElement | null {
        const ext = this._pickFormat()
        const sound = new Audio()
        sound.addEventListener('loadeddata', () => sound.play(), false)
        sound.src = 'audio/' + soundName + '.' + ext
        return sound
    }

    stopMusic(): void {
        if (this.musicAudio) this.musicAudio.pause()
    }

    stopAll(): void {
        this.nextSfxTime = 0
        this.nextSfx = null
        this.stopMusic()
    }

    /**
     * Pick the most-preferred audio format the current browser supports.
     * Returns 'wav' as the default if nothing can be determined (e.g. in
     * a Node test environment where `Audio` is unavailable).
     */
    private _pickFormat(): string {
        if (typeof Audio === 'undefined') return 'wav'
        const probe = new Audio()
        const mimeMap: Record<string, string> = {
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg; codecs="vorbis"',
        }
        for (const ext of HTMLAudioEngine.FORMAT_CANDIDATES) {
            const support = probe.canPlayType(mimeMap[ext] ?? '')
            if (support === 'probably' || support === 'maybe') return ext
        }
        return 'wav'
    }

    rollNextSfx(): string {
        // Randomly obtain the next map sfx
        const curMapInfo = getCurrentMapInfo()
        if (!curMapInfo) return ''

        const sfx = curMapInfo.ambientSfx
        if (!sfx || sfx.length === 0) return ''

        const sumFreqs = sfx.reduce((sum: number, x: [string, number]) => sum + x[1], 0)
        if (sumFreqs <= 0) return ''

        let roll = getRandomInt(0, sumFreqs)

        for (var i = 0; i < sfx.length; i++) {
            var freq = sfx[i][1]

            if (roll < freq) return sfx[i][0]

            roll -= freq
        }

        // Fallback: return the last entry (handles floating-point edge cases)
        return sfx[sfx.length - 1][0]
    }

    tick(): void {
        var time = window.performance.now()

        if (!this.nextSfx) {
            this.nextSfx = this.rollNextSfx()
            if (!this.nextSfx) return
        }

        if (time >= this.nextSfxTime) {
            // play next sfx in queue
            this.playSfx(this.nextSfx)

            // queue up next sfx
            this.nextSfx = this.rollNextSfx()
            this.nextSfxTime = time + getRandomInt(15, 20) * 1000
        }
    }
}
