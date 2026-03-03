/**
 * Phase 4: Mod manifest system — DAT override stacking.
 *
 * Mods are registered as an ordered stack; later-registered mods have higher
 * priority.  When resolving an asset path, each mod's overrides table is
 * checked in reverse-priority order until a match is found.  If no mod
 * overrides a path the canonical path is returned unchanged.
 *
 * Usage:
 *   modRegistry.register({ id: 'hi_res_pack', name: 'Hi-Res Pack', version: '1.0.0',
 *       overrides: { 'data/art/critters/hmjmpswk.frm': 'mods/hi_res/hmjmpswk.frm' } })
 *
 *   const path = modRegistry.resolveAsset('data/art/critters/hmjmpswk.frm')
 *   // → 'mods/hi_res/hmjmpswk.frm'
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModManifest {
    /** Unique identifier, e.g. "hi_res_pack". Must be stable across versions. */
    id: string
    /** Human-readable display name shown in the mod manager UI. */
    name: string
    /** Semver-style version string, e.g. "1.0.0". */
    version: string
    /**
     * Asset overrides: keys are canonical relative paths (as returned by
     * resolveDataPath), values are replacement relative paths served from
     * the mod's own directory.
     *
     * Example:
     *   { "data/art/critters/hmjmpswk.frm": "mods/my_mod/art/critters/hmjmpswk.frm" }
     */
    overrides?: Record<string, string>
}

// ---------------------------------------------------------------------------
// ModRegistry
// ---------------------------------------------------------------------------

export class ModRegistry {
    /** Active mods in load order (index 0 = lowest priority). */
    private mods: ModManifest[] = []

    /**
     * Register a mod.  If a mod with the same `id` is already registered it
     * is replaced in-place so load order is preserved.
     */
    register(mod: ModManifest): void {
        const existing = this.mods.findIndex((m) => m.id === mod.id)
        if (existing !== -1) {
            this.mods[existing] = mod
        } else {
            this.mods.push(mod)
        }
    }

    /** Remove a mod by ID.  No-op if the mod is not registered. */
    unregister(id: string): void {
        this.mods = this.mods.filter((m) => m.id !== id)
    }

    /** Returns all registered mods in load order (lowest priority first). */
    getAll(): readonly ModManifest[] {
        return this.mods
    }

    /**
     * Resolve an asset path against the mod stack.
     *
     * Mods are checked in reverse-priority order (highest priority first).
     * Returns the first override found, or `canonicalPath` if no mod covers it.
     */
    resolveAsset(canonicalPath: string): string {
        for (let i = this.mods.length - 1; i >= 0; i--) {
            const overrides = this.mods[i].overrides
            if (overrides && canonicalPath in overrides) {
                return overrides[canonicalPath]
            }
        }
        return canonicalPath
    }

    /** Remove all registered mods. */
    clear(): void {
        this.mods = []
    }
}

/** Shared registry instance used by the engine. */
export const modRegistry = new ModRegistry()
