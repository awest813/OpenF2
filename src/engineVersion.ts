/**
 * Which Fallout game the engine is currently operating as.
 *
 * All game-version-specific branching must be gated on this value —
 * never on hard-coded strings or filename heuristics scattered through the code.
 */
export const enum EngineVersion {
    FALLOUT1 = 1,
    FALLOUT2 = 2,
}

/** String labels, useful for logging and UI. */
export const ENGINE_VERSION_LABELS: Record<EngineVersion, string> = {
    [EngineVersion.FALLOUT1]: 'Fallout 1',
    [EngineVersion.FALLOUT2]: 'Fallout 2',
}

/**
 * Returns the expected base data path segment for each version.
 * F1 uses a single-level DAT1 layout; F2 uses the 4-directory DAT2 layout.
 */
export function dataPathPrefix(version: EngineVersion): string {
    switch (version) {
        case EngineVersion.FALLOUT1:
            return 'f1data'
        case EngineVersion.FALLOUT2:
            return 'data'
    }
}

/**
 * Returns which map format version to expect when loading .MAP files.
 * Fallout 1 uses map version 19; Fallout 2 uses version 20.
 */
export function expectedMapVersion(version: EngineVersion): number {
    switch (version) {
        case EngineVersion.FALLOUT1:
            return 19
        case EngineVersion.FALLOUT2:
            return 20
    }
}
