/**
 * Party member definitions (parity Slice G / P1-3).
 *
 * Embedded FO2-aligned rows from party.txt so companion combat-control options
 * and level-up tiers work without shipping copyrighted data files. Optional
 * `parsePartyTxt()` can load a real party.txt when present.
 */

export type PartyDistance = 'stay_close' | 'charge' | 'snipe' | 'on_your_own' | 'stay'
export type PartyDisposition = 'none' | 'custom' | 'coward' | 'defensive' | 'aggressive' | 'berserk'
export type PartyAttackWho =
    | 'whomever_attacking_me'
    | 'strongest'
    | 'weakest'
    | 'whomever'
    | 'closest'
export type PartyBestWeapon =
    | 'no_pref'
    | 'melee'
    | 'melee_over_ranged'
    | 'ranged_over_melee'
    | 'ranged'
    | 'unarmed'
export type PartyChemUse =
    | 'clean'
    | 'stims_when_hurt_little'
    | 'stims_when_hurt_lots'
    | 'sometimes'
    | 'anytime'
    | 'always'
export type PartyAreaAttack = 'always' | 'sometimes' | 'be_sure' | 'be_careful' | 'be_absolutely_sure'
export type PartyRunAway =
    | 'none'
    | 'coward'
    | 'finger_hurts'
    | 'bleeding'
    | 'not_feeling_good'
    | 'tourniquet'
    | 'never'

export interface PartyMemberDef {
    pid: number
    name: string
    areaAttackModes: PartyAreaAttack[]
    attackWho: PartyAttackWho[]
    bestWeapon: PartyBestWeapon[]
    chemUse: PartyChemUse[]
    distance: PartyDistance[]
    runAwayMode: PartyRunAway[]
    disposition: PartyDisposition[]
    levelMinimum: number
    levelUpEvery: number
    /** Successive proto PIDs applied as the companion tiers up with the player. */
    levelPids: number[]
}

/** Runtime combat-control / follow state for one party member. */
export interface PartyMemberControl {
    waiting: boolean
    distance: PartyDistance
    disposition: PartyDisposition
    attackWho: PartyAttackWho
    bestWeapon: PartyBestWeapon
    areaAttackMode: PartyAreaAttack
    chemUse: PartyChemUse
    runAwayMode: PartyRunAway
    /**
     * How many level_pids have been applied (0 = still on recruit proto).
     */
    levelIndex: number
    /** Last applied tier PID (0 if still on base recruit pid). */
    appliedLevelPid: number
}

/** Bit 0 = waiting (used by metarule PARTY_MEMBER_STATE). */
export const PARTY_STATE_WAITING = 0x01

function first<T>(opts: T[], fallback: T): T {
    return opts.length > 0 ? opts[0] : fallback
}

export function defaultControlFromDef(def: PartyMemberDef | null | undefined): PartyMemberControl {
    if (!def) {
        return {
            waiting: false,
            distance: 'stay_close',
            disposition: 'defensive',
            attackWho: 'whomever_attacking_me',
            bestWeapon: 'no_pref',
            areaAttackMode: 'sometimes',
            chemUse: 'stims_when_hurt_lots',
            runAwayMode: 'none',
            levelIndex: 0,
            appliedLevelPid: 0,
        }
    }
    return {
        waiting: false,
        distance: first(def.distance, 'stay_close'),
        disposition: first(def.disposition.filter((d) => d !== 'none' && d !== 'custom'), 'defensive'),
        attackWho: first(def.attackWho, 'whomever_attacking_me'),
        bestWeapon: first(def.bestWeapon, 'no_pref'),
        areaAttackMode: first(def.areaAttackModes, 'sometimes'),
        chemUse: first(def.chemUse, 'stims_when_hurt_lots'),
        runAwayMode: first(def.runAwayMode, 'none'),
        levelIndex: 0,
        appliedLevelPid: 0,
    }
}

function def(
    pid: number,
    name: string,
    partial: Partial<Omit<PartyMemberDef, 'pid' | 'name'>> & {
        levelMinimum?: number
        levelUpEvery?: number
        levelPids?: number[]
    },
): PartyMemberDef {
    return {
        pid,
        name,
        areaAttackModes: partial.areaAttackModes ?? ['always', 'sometimes', 'be_careful'],
        attackWho: partial.attackWho ?? ['whomever_attacking_me', 'closest'],
        bestWeapon: partial.bestWeapon ?? ['no_pref'],
        chemUse: partial.chemUse ?? ['clean', 'stims_when_hurt_lots'],
        distance: partial.distance ?? ['stay_close', 'charge', 'snipe', 'on_your_own', 'stay'],
        runAwayMode: partial.runAwayMode ?? ['none', 'never'],
        disposition: partial.disposition ?? ['none', 'custom', 'defensive', 'aggressive'],
        levelMinimum: partial.levelMinimum ?? 0,
        levelUpEvery: partial.levelUpEvery ?? 0,
        levelPids: partial.levelPids ?? [],
    }
}

/**
 * Campaign-critical companions (FO2 party.txt PIDs / tiers).
 * Names are for logs/tests; art/proto swap is recorded via appliedLevelPid.
 */
export const BUILTIN_PARTY_DEFS: PartyMemberDef[] = [
    def(16777313, 'Sulik', {
        bestWeapon: ['melee', 'melee_over_ranged', 'ranged_over_melee', 'unarmed'],
        disposition: ['none', 'custom', 'defensive', 'aggressive', 'berserk'],
        levelMinimum: 6,
        levelUpEvery: 3,
        levelPids: [16777526, 16777527, 16777528, 16777529, 16777530, 16777531],
    }),
    def(16777278, 'Vic', {
        bestWeapon: ['no_pref', 'ranged_over_melee', 'ranged', 'unarmed'],
        attackWho: ['whomever_attacking_me', 'weakest', 'whomever', 'closest'],
        levelMinimum: 5,
        levelUpEvery: 4,
        levelPids: [16777589, 16777590, 16777591, 16777592, 16777593, 16777594],
    }),
    def(16777376, 'Myron', {
        bestWeapon: ['no_pref', 'ranged_over_melee', 'ranged', 'unarmed'],
        disposition: ['none', 'custom', 'coward', 'defensive', 'aggressive'],
        levelMinimum: 6,
        levelUpEvery: 4,
        levelPids: [16777541, 16777542, 16777543, 16777544],
    }),
    def(16777377, 'Marcus', {
        bestWeapon: ['no_pref', 'melee', 'melee_over_ranged', 'ranged_over_melee', 'ranged', 'unarmed'],
        disposition: ['none', 'custom', 'aggressive', 'berserk'],
        distance: ['charge', 'on_your_own'],
        levelMinimum: 12,
        levelUpEvery: 3,
        levelPids: [16777545, 16777546, 16777547, 16777548, 16777549],
    }),
    def(16777323, 'Lenny', {
        bestWeapon: ['ranged_over_melee'],
        attackWho: ['whomever_attacking_me', 'weakest'],
        distance: ['stay_close', 'stay'],
        levelMinimum: 10,
        levelUpEvery: 5,
        levelPids: [16777532, 16777533, 16777534],
    }),
    def(16777368, 'Goris', {
        bestWeapon: ['unarmed'],
        distance: ['charge'],
        disposition: ['none', 'custom', 'aggressive', 'berserk'],
        levelMinimum: 10,
        levelUpEvery: 4,
        levelPids: [16777535, 16777536, 16777537, 16777538, 16777539, 16777540],
    }),
    def(16777558, 'Dogmeat', {
        bestWeapon: ['unarmed'],
        chemUse: ['clean'],
        levelMinimum: 6,
        levelUpEvery: 3,
        levelPids: [16777559, 16777560, 16777561, 16777562, 16777563, 16777564],
    }),
    def(16777687, 'K9', {
        bestWeapon: ['unarmed'],
        chemUse: ['clean'],
        levelMinimum: 12,
        levelUpEvery: 4,
        levelPids: [16777688, 16777689, 16777690, 16777691],
    }),
    // Pariah Dog (combat miss bonus already special-cased in combat.ts)
    def(16777600, 'Pariah Dog', {
        bestWeapon: ['unarmed'],
        chemUse: ['clean'],
        levelMinimum: 0,
        levelUpEvery: 0,
        levelPids: [],
    }),
]

const defByPid = new Map<number, PartyMemberDef>(BUILTIN_PARTY_DEFS.map((d) => [d.pid, d]))

/** Extra defs loaded from parsePartyTxt (override builtins on same pid). */
export function registerPartyMemberDef(def: PartyMemberDef): void {
    defByPid.set(def.pid, def)
}

export function getPartyMemberDef(pid: number | null | undefined): PartyMemberDef | null {
    if (typeof pid !== 'number' || !Number.isFinite(pid)) return null
    return defByPid.get(pid) ?? null
}

export function listPartyMemberDefs(): PartyMemberDef[] {
    return [...defByPid.values()]
}

/**
 * Parse a FO2-style party.txt body into definitions.
 * Tolerant of missing keys; skips the player slot (pid 16777216) and car trunk.
 */
export function parsePartyTxt(text: string): PartyMemberDef[] {
    const blocks = text.split(/\[\s*Party Member\s+\d+\s*\]/i).slice(1)
    const out: PartyMemberDef[] = []
    for (const block of blocks) {
        const pidMatch = block.match(/party_member_pid\s*=\s*(\d+)/i)
        if (!pidMatch) continue
        const pid = Number(pidMatch[1])
        if (pid === 16777216 || pid === 455) continue // player / car trunk
        const nameMatch = block.match(/;\s*(?:pM\s*)?([A-Za-z0-9_]+)/)
        const csv = (key: string): string[] => {
            const m = block.match(new RegExp(key + '\\s*=\\s*([^\\n\\r]+)', 'i'))
            if (!m) return []
            return m[1]
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
                .filter((s) => s !== '-1')
        }
        const levelMin = Number(block.match(/level_minimum\s*=\s*(-?\d+)/i)?.[1] ?? 0)
        const levelEvery = Number(block.match(/level_up_every\s*=\s*(-?\d+)/i)?.[1] ?? 0)
        const levelPids = csv('level_pids')
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n) && n > 0)
        const d = def(pid, nameMatch?.[1]?.replace(/_PID$/i, '') ?? `pid_${pid}`, {
            areaAttackModes: csv('area_attack_mode') as PartyAreaAttack[],
            attackWho: csv('attack_who') as PartyAttackWho[],
            bestWeapon: csv('best_weapon') as PartyBestWeapon[],
            chemUse: csv('chem_use') as PartyChemUse[],
            distance: csv('distance') as PartyDistance[],
            runAwayMode: csv('run_away_mode') as PartyRunAway[],
            disposition: csv('disposition') as PartyDisposition[],
            levelMinimum: levelMin,
            levelUpEvery: levelEvery,
            levelPids,
        })
        out.push(d)
        registerPartyMemberDef(d)
    }
    return out
}

/**
 * Expected companion tier count for a given player level (how many level_pids applied).
 */
export function expectedLevelIndex(def: PartyMemberDef, playerLevel: number): number {
    if (def.levelUpEvery <= 0 || def.levelPids.length === 0) return 0
    if (playerLevel < def.levelMinimum) return 0
    const tiers = Math.floor((playerLevel - def.levelMinimum) / def.levelUpEvery) + 1
    return Math.max(0, Math.min(def.levelPids.length, tiers))
}

export function sanitizePartyMemberControl(raw: any): PartyMemberControl {
    const base = defaultControlFromDef(null)
    if (!raw || typeof raw !== 'object') return base
    return {
        waiting: !!raw.waiting,
        distance: (raw.distance as PartyDistance) || base.distance,
        disposition: (raw.disposition as PartyDisposition) || base.disposition,
        attackWho: (raw.attackWho as PartyAttackWho) || base.attackWho,
        bestWeapon: (raw.bestWeapon as PartyBestWeapon) || base.bestWeapon,
        areaAttackMode: (raw.areaAttackMode as PartyAreaAttack) || base.areaAttackMode,
        chemUse: (raw.chemUse as PartyChemUse) || base.chemUse,
        runAwayMode: (raw.runAwayMode as PartyRunAway) || base.runAwayMode,
        levelIndex: typeof raw.levelIndex === 'number' && raw.levelIndex >= 0 ? Math.floor(raw.levelIndex) : 0,
        appliedLevelPid:
            typeof raw.appliedLevelPid === 'number' && Number.isFinite(raw.appliedLevelPid)
                ? raw.appliedLevelPid
                : 0,
    }
}
