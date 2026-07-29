/**
 * Game movie playback registry (parity P1-9 stub).
 *
 * Maps FO2 `play_gmovie` / metarule(MOVIE) IDs to named entries, emits
 * EventBus notifications, and can drive a placeholder CinematicPlayer slide
 * when no browser video asset is available.
 */

import { EventBus } from './eventBus.js'
import type { CinematicPlayer, CinematicSequence } from './cinematic.js'

export interface MovieDef {
    id: string
    title: string
    /** Optional path to a browser-playable video (webm/mp4) once converted. */
    videoPath?: string
}

/** Common FO2 movie IDs (names from engine / sfall docs). */
export const FO2_MOVIE_CATALOG: Readonly<Record<number, MovieDef>> = {
    0: { id: 'iplogo', title: 'Interplay Logo' },
    1: { id: 'intro', title: 'Intro' },
    2: { id: 'elder', title: 'Elder' },
    3: { id: 'vexploded', title: 'Vault Exploded' },
    4: { id: 'cathexp', title: 'Cathedral Exploded' },
    5: { id: 'ovrrun', title: 'Overrun' },
    6: { id: 'diped', title: 'Diped' },
    7: { id: 'artimer', title: 'Arroyo Timer' },
    8: { id: 'tanker', title: 'Tanker' },
    9: { id: 'enclave', title: 'Enclave' },
    10: { id: 'derrick', title: 'Derrick' },
    11: { id: 'dummy', title: 'Dummy' },
    12: { id: 'rallybo', title: 'Rallybo' },
    13: { id: 'stolen', title: 'Stolen' },
}

let moviePlayer: CinematicPlayer | null = null
let lastMovieId: number | null = null

export function setMovieCinematicPlayer(player: CinematicPlayer | null): void {
    moviePlayer = player
}

export function resolveMovie(movieID: number): MovieDef {
    const known = FO2_MOVIE_CATALOG[movieID]
    if (known) return known
    return { id: `movie_${movieID}`, title: `Movie ${movieID}` }
}

export interface PlayMovieResult {
    movieID: number
    def: MovieDef
    played: boolean
    mode: 'video' | 'cinematic' | 'event_only'
}

/**
 * Play a game movie by FO2 ID.
 * Without converted video assets, emits events and optionally shows a caption slide.
 */
export function playMovie(movieID: number, opts: { playCinematic?: boolean } = {}): PlayMovieResult {
    const id = typeof movieID === 'number' && Number.isFinite(movieID) ? Math.floor(movieID) : -1
    const def = resolveMovie(id)
    lastMovieId = id
    EventBus.emit('movie:play', { movieID: id, movieId: def.id, title: def.title })

    if (def.videoPath) {
        // Future: attach <video> overlay. For now still notify listeners.
        return { movieID: id, def, played: true, mode: 'video' }
    }

    if (opts.playCinematic !== false && moviePlayer) {
        const sequence: CinematicSequence = {
            id: `movie:${def.id}`,
            slides: [
                {
                    imagePath: null,
                    backgroundColor: '#101008',
                    caption: def.title,
                    duration: 2500,
                },
            ],
            onComplete: () => {
                EventBus.emit('movie:end', { movieID: id, movieId: def.id })
            },
        }
        moviePlayer.play(sequence)
        return { movieID: id, def, played: true, mode: 'cinematic' }
    }

    // Event-only path (tests / headless) — still emit end so waiters unblock.
    EventBus.emit('movie:end', { movieID: id, movieId: def.id })
    return { movieID: id, def, played: false, mode: 'event_only' }
}

export function getLastMovieId(): number | null {
    return lastMovieId
}
