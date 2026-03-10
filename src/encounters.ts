/*
Copyright 2014 darkf

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

import { lookupMapNameFromLookup, MapInfo } from "./data.js";
import { hexInDirectionDistance, Point } from "./geometry.js";
import globalState from "./globalState.js";
import { Scripting } from "./scripting.js";
import { fromTileNum } from "./tile.js";
import { getRandomInt } from "./util.js";
import { Worldmap } from "./worldmap.js";

// Random Encounter system

/** Fallout 2 perk IDs used by the encounter system (from PERKS.MSG). */
const PERK_CAUTIOUS_NATURE = 16
const PERK_SCOUT           = 22
const PERK_RANGER          = 28
const PERK_EXPLORER        = 29

export namespace Encounters {
    enum Tok {
        IF = 0,
        LPAREN = 1,
        RPAREN = 2,
        IDENT = 3,
        OP = 4,
        INT = 5
    }
        
    type Token = [Tok, string /* Matched text */, number /* length (or number value for Tok.INT tokens) */];
    
    interface IfNode { type: "if", cond: Node }
    interface OpNode { type: "op", op: string, lhs: Node, rhs: Node }
    interface CallNode { type: "call", name: string, arg: Node }
    interface VarNode { type: "var", name: string }
    interface IntNode { type: "int", value: number }
    
    export type Node = IfNode | OpNode | CallNode | VarNode | IntNode;

    function tokenizeCond(data: string): Token[] {
        const tokensRe: { [re: string]: number } = {
            "if": Tok.IF,
            "and": Tok.OP,
            "[a-z_]+": Tok.IDENT,
            "-?[0-9]+": Tok.INT,
            "[><=&]+": Tok.OP,
            "\\(": Tok.LPAREN,
            "\\)": Tok.RPAREN,
        }

        function match(str: string): Token|null {
            for(const re in tokensRe) {
                const m = str.match(new RegExp("^\\s*(" + re + ")\\s*"))
                if(m !== null)
                    {return [tokensRe[re], m[1], m[0].length]}
            }
            return null
        }

        let acc = data
        const toks: Token[] = []
        while(acc.length > 0) {
            const m = match(acc)
            if(m === null) {
                console.warn("encounters: error parsing condition: '" + data + "': choked on '" + acc + "' — skipping token")
                break
            }
            toks.push(m[0] === Tok.INT ? [Tok.INT, m[1], parseInt(m[1])] : m)
            acc = acc.slice(m[2])
        }

        return toks
    }

    function parseCond(data: string) {
        data = data.replace("%", "") // percentages don't really matter
        const tokens = tokenizeCond(data)
        let curTok = 0

        function expect(t: Tok) {
            if(tokens[curTok] === undefined || tokens[curTok++][0] !== t)
                {console.warn("encounters: expected token " + t + " but got " + tokens[curTok-1] + " in: " + data)}
        }

        function next() {
            return tokens[curTok++]
        }

        function peek() {
            if(curTok >= tokens.length)
                {return null}
            return tokens[curTok]
        }

        function call(name: string): Node {
            expect(Tok.LPAREN)
            const arg = expr()
            expect(Tok.RPAREN)
            return {type: 'call', name, arg}
        }

        function checkOp(node: Node): Node {
            const t = peek()
            if(t === null || t[0] !== Tok.OP)
                {return node}

            curTok++
            const rhs = checkOp(expr())
            return {type: 'op', op: t[1], lhs: node, rhs: rhs}
        }

        function expr(): Node {
            const t = next()
            switch(t[0]) {
                case Tok.IF:
                    expect(Tok.LPAREN)
                    var cond = expr()
                    expect(Tok.RPAREN)
                    return checkOp({type: 'if', cond: cond})
                case Tok.IDENT:
                    if(peek()![0] === Tok.LPAREN)
                        {return checkOp(call(t[1]))}
                    return checkOp({type: 'var', name: t[1]})
                case Tok.INT:
                    return checkOp({type: 'int', value: t[2]})
                default:
                    console.warn("encounters: unhandled/unexpected token: " + t + " in: " + data)
                    return {type: 'int', value: 0} as Node
            }
        }

        return expr()
    }

    export function parseConds(data: string) {
        // conditions are formed by conjunctions, so
        // x AND y AND z can just be collapsed to [x, y, z] here

        let cond: Node
        try {
            cond = parseCond(data)
        } catch(e) {
            console.warn('encounters: parseConds failed for "' + data + '": ' + e + ' — treating as always-true')
            return [{type: 'int', value: 1} as Node]
        }
        const out: Node[] = []

        function visit(node: Node) {
            if(node.type === "op" && node.op === "and") {
                visit(node.lhs)
                visit(node.rhs)
            }
            else
                {out.push(node)}
        }

        visit(cond)
        return out
    }

    function printTree(node: Node, s: string) {
        switch(node.type) {
            case "if":
                console.log(s + "if")
                printTree(node.cond, s + "  ")
                break
            case "op":
                console.log(s + "op " + node.op + "")
                printTree(node.lhs, s + "  ")
                printTree(node.rhs, s + "  ")
                break
            case "call":
                console.log(s + "call " + node.name + "")
                printTree(node.arg, s + "  ")
                break
            case "var":
                console.log(s + "var " + node.name)
                break
            case "int":
                console.log(s + "int " + node.value)
                break
        }
    }

    // evaluates conditions against game state
    function evalCond(node: Node): number|boolean {
        switch(node.type) {
            case "if": // condition
                return evalCond(node.cond)
            case "call": // call (more like a property access)
                switch(node.name) {
                    case "global": // GVAR
                        if(node.arg.type !== "int") { console.warn("evalCond: GVAR not a number"); return 0 }
                        return Scripting.getGlobalVar(node.arg.value)
                    case "player":
                        if(node.arg.type !== "var") { console.warn("evalCond: player arg not a var"); return 0 }
                        if(node.arg.name === "level")
                            {return globalState.player ? globalState.player.level : 1}
                        console.warn("evalCond: unhandled player property: " + node.arg.name)
                        return 0
                    case "rand": // random percentage
                        if(node.arg.type !== "int") { console.warn("evalCond: rand arg not a number"); return 0 }
                        return getRandomInt(0, 100) <= node.arg.value
                    default:
                        console.warn("evalCond: unhandled call: " + node.name + " — returning 0")
                        return 0
                }
            case "var":
                switch(node.name) {
                    case "time_of_day":
                        return 12 // hour of the day
                    default:
                        console.warn("evalCond: unhandled var: " + node.name + " — returning 0")
                        return 0
                }
            case "int": return node.value
            case "op":
                var lhs = evalCond(node.lhs)
                var rhs = evalCond(node.rhs)
                var op: { [op: string]: (l: boolean|number, r: boolean|number) => boolean|number } =  {
                    "<": (l, r) => l < r,
                    ">": (l, r) => l > r,
                    "and": (l, r) => l && r,
                    "or": (l, r) => l || r,
                    ">=": (l, r) => l >= r,
                    "<=": (l, r) => l <= r,
                    "==": (l, r) => l === r,
                    "!=": (l, r) => l !== r,
                }

                if(op[node.op] === undefined) {
                    console.warn("evalCond: unhandled op: " + node.op + " — returning true (include encounter)")
                    return 1
                }
                return op[node.op](lhs, rhs)
            default:
                console.warn("evalCond: unhandled node type: " + (node as any).type + " — returning 0")
                return 0
        }
    }

    function evalConds(conds: Node[]): boolean {
        // TODO: Array.every
        for(let i = 0; i < conds.length; i++) {
            if(evalCond(conds[i]) === false)
                {return false}
        }
        return true
    }

    function evalEncounterCritter(critter: Worldmap.EncounterCritter): Worldmap.EncounterCritter {
        const items = []
        for(let i = 0; i < critter.items.length; i++) {
            const item = critter.items[i]
            let amount = 1

            if(item.range) {
                amount = getRandomInt(item.range.start, item.range.end)
            }

            if(amount > 0)
                {items.push({pid: item.pid, wielded: item.wielded, amount: amount})}
        }

        return {items: items, pid: critter.pid, script: critter.script, dead: critter.dead}
    }

    function evalEncounterCritters(count: number, group: Worldmap.EncounterGroup): Worldmap.EncounterCritter[] {
        const critters: Worldmap.EncounterCritter[] = []

        for(let i = 0; i < group.critters.length; i++) {
            const critter = group.critters[i]

            if(critter.cond) {
                if(!evalConds(critter.cond)) {
                    console.log("critter cond false: %o", critter.cond)
                    continue
                }
                else
                    {console.log("critter cond true: %o", critter.cond)}
            }

            if(critter.ratio === undefined)
                {critters.push(evalEncounterCritter(critter))}
            else {
                const num = Math.ceil(critter.ratio/100 * count)
                // TODO: better distribution (might be +1 now)
                console.log("critter nums: %d (%d% of %d)", num, critter.ratio, count)
                for(let j = 0; j < num; j++)
                    {critters.push(evalEncounterCritter(critter))}
            }
        }

        return critters
    }

    function pickEncounter(encounters: Worldmap.Encounter[]) {
        // Pick an encounter from an encounter list based on a roll

        let succEncounters = encounters.filter(function(enc) {
            if(enc.enc === null) {return false} // skip encounters with invalid enc ref
            return (enc.cond !== null) ? evalConds(enc.cond) : true
        })
        let numEncounters = succEncounters.length
        let totalChance = succEncounters.reduce(function(sum, x) { return x.chance + sum }, 0)

        if(numEncounters === 0) {
            console.warn("pickEncounter: no conditioned encounters passed — using all encounters unconditionally")
            succEncounters = encounters.slice()
            numEncounters = succEncounters.length
            totalChance = succEncounters.reduce(function(sum, x) { return x.chance + sum }, 0)
            if(numEncounters === 0) {return null}
        }

        console.log("pickEncounter: num: %d, chance: %d, encounters: %o", numEncounters, totalChance, succEncounters)

        const luck = globalState.player.getStat("LUK")
        let roll = getRandomInt(0, totalChance) + (luck - 5)

        // Apply perk-based encounter roll modifiers (Fallout 2 perk IDs per PERKS.MSG):
        //   Scout (ID 22): +1 roll, Ranger (ID 28): +1 roll, Explorer (ID 29): +2 roll.
        // These perks are not yet in perks.ts but can be granted by scripts; check
        // perkRanks directly so the bonuses activate as soon as a script awards them.
        const perkRanks = globalState.player.perkRanks ?? {}
        if ((perkRanks[PERK_SCOUT] ?? 0) > 0) {roll += 1}
        if ((perkRanks[PERK_RANGER] ?? 0) > 0) {roll += 1}
        if ((perkRanks[PERK_EXPLORER] ?? 0) > 0) {roll += 2}

        // Remove chances from roll until either we reach the end of the list or the roll runs out.
        // If our roll does *not* run out (i.e., its value exceeds totalChance), then
        // we will choose the last encounter in the list.

        let acc = roll
        let idx = 0
        for(; idx < succEncounters.length; idx++) {
            const chance = succEncounters[idx].chance
            if(acc < chance)
                {break}

            acc -= chance
        }

        console.log("idx: %d", idx)
        return succEncounters[idx]
    }

    export function positionCritters(groups: Worldmap.EncounterGroup[], playerPos: Point, map: MapInfo) {
        // set up critters' positions in their formations

        groups.forEach(function(group) {
            let dir = getRandomInt(0, 5)
            const formation = group.position.type
            let pos: Point

            if(formation === "surrounding")
                {pos = {x: playerPos.x, y: playerPos.y}}
            else {
                // choose a random starting point from the map
                const randomPoint = map.randomStartPoints[getRandomInt(0, map.randomStartPoints.length - 1)]
                pos = fromTileNum(randomPoint.tileNum)
            }

            console.log("positionCritters: map %o, dir %d, formation %s, pos %o", map, dir, formation, pos)

            group.critters.forEach(function(critter) {
                switch(formation) {
                    case "huddle":
                        critter.position = {x: pos.x, y: pos.y}

                        dir = (dir + 1) % 6
                        pos = hexInDirectionDistance(pos, dir, group.position.spacing)
                        break
                    case "surrounding":
                        var roll = globalState.player.getStat("PER") + getRandomInt(-2, 2)
                        // Cautious Nature perk (Fallout 2 perk ID 16): +3 to formation spacing.
                        if (((globalState.player.perkRanks ?? {})[PERK_CAUTIOUS_NATURE] ?? 0) > 0) {roll += 3}

                        if(roll < 0)
                            {roll = 0}

                        pos = hexInDirectionDistance(pos, dir, roll)

                        dir++
                        if(dir >= 6)
                            {dir = 0}

                        var rndSpacing = getRandomInt(0, Math.floor(roll / 2))
                        var rndDir = getRandomInt(0, 5)
                        pos = hexInDirectionDistance(pos, (rndDir + dir) % 6, rndSpacing)

                        critter.position = {x: pos.x, y: pos.y}
                        break

                    case "straight_line":
                    case "double_line":
                    case "wedge":
                    case "cone":
                    default:
                        console.log("UNHANDLED FORMATION %s", formation)

                        // use some arbitrary formation
                        critter.position = {x: pos.x, y: pos.y}
                        pos.x--
                        
                        break
                }
            })
        })
    }

    export function evalEncounter(encTable: Worldmap.EncounterTable) {
        const mapIndex = getRandomInt(0, encTable.maps.length - 1)
        let mapLookupName = encTable.maps[mapIndex]
        let mapName = lookupMapNameFromLookup(mapLookupName)
        const groups: Worldmap.EncounterGroup[] = []
        const encounter = pickEncounter(encTable.encounters)

        if(encounter === null) {
            console.warn("evalEncounter: pickEncounter returned null — skipping encounter")
            return null
        }

        if(encounter.special !== null) {
            // special encounter: use specific map
            mapLookupName = encounter.special
            mapName = lookupMapNameFromLookup(mapLookupName)
            console.log("special encounter: %s", mapName)
        }

        console.log("map: %s (from %s)", mapName, mapLookupName)
        console.log("encounter: %o", encounter)

        // TODO: maybe unify these and just have a `.groups` in the encounter, along with a target.
        if(encounter.enc.type === "ambush") {
            // player ambush
            console.log("(player ambush)")

            const party = encounter.enc.party
            const group = Worldmap.getEncounterGroup(party.name)
            const position = group.position

            console.log("party: %d-%d of %s", party.start, party.end, party.name)
            console.log("encounter group: %o", group)
            console.log("position:", position)

            const critterCount = getRandomInt(party.start, party.end)
            const critters = evalEncounterCritters(critterCount, group)
            groups.push({critters: critters, position: position, target: "player"})
        }
        else if(encounter.enc.type === "fighting") {
            // two factions fighting
            const firstParty = encounter.enc.firstParty
            const secondParty = encounter.enc.secondParty
            console.log("two factions: %o vs %o", firstParty, secondParty)

            if(!firstParty) {
                console.warn("encounter fighting: firstParty is null — skipping encounter")
                return null
            }

            const firstGroup = Worldmap.getEncounterGroup(firstParty.name)
            const firstCritterCount = getRandomInt(firstParty.start, firstParty.end)
            groups.push({critters: evalEncounterCritters(firstCritterCount, firstGroup), target: 1, position: firstGroup.position})

            // one-party fighting? TODO: check what all is allowed with `fighting`
            if(secondParty && secondParty.name !== undefined) {
                const secondGroup = Worldmap.getEncounterGroup(secondParty.name)
                const secondCritterCount = getRandomInt(secondParty.start, secondParty.end)
                groups.push({critters: evalEncounterCritters(secondCritterCount, secondGroup), target: 0, position: secondGroup.position})
            }
        }
        else if(encounter.enc.type === "special") {
            //console.log("TODO: special encounter type")
        }
        else {
            console.warn("encounter: unknown encounter type: " + encounter.enc.type + " — treating as empty encounter")
        }

        console.log("groups: %o", groups)

        return {mapName: mapName,
                mapLookupName: mapLookupName,
                encounter: encounter,
                encounterType: encounter.enc.type,
                groups: groups}
    }
}
