import { FINALS, FINAL_BITS, INITIAL_BITS, NULL_INITIAL_ID, SIGNATURE_WEIGHT_MIN } from './data'
import { endgameStructureSignature, feedbackCode, packTuple, pinyinFeedbackCode, tupleValue } from './feedback'

export const ENDGAME_PRODUCT_LIMIT = 32
export const ENDGAME_NODE_LIMIT = 262144
export const ENDGAME_CANDIDATE_LIMIT = 4096

export interface PinyinHistoryEntry {
  guessInitial: number
  guessFinal: number
  initialCode: number
  finalCode: number
  code: number // full pinyin
}

export interface EndgameSyllable {
  // Full-pinyin id has the same 6-bit final layout as the feedback encoder.
  values: readonly [number, number, number]
  probability: number
}

export interface EndgamePrior {
  syllables: readonly EndgameSyllable[]
  signatureWeights: ReadonlyMap<number, number>
}

export function createEndgamePrior(counts: Uint32Array, signatureWeights: ReadonlyMap<number, number>): EndgamePrior {
  const total = counts.reduce((sum, count) => sum + count, 0)
  const syllables: EndgameSyllable[] = []
  counts.forEach((count, pair) => {
    if (!count)
      return
    const initial = Math.floor(pair / FINALS.length)
    const final = pair % FINALS.length
    syllables.push({ values: [initial, final, initial * (1 << FINAL_BITS) + final], probability: count / total })
  })
  return { syllables, signatureWeights }
}

export interface EndgameBudget {
  maxNodes?: number
  maxCandidates?: number
}

export type EndgameStatus = 'complete' | 'node-limit' | 'candidate-limit' | 'contradiction'

export interface EndgameSearch {
  status: EndgameStatus
  complete: boolean
  nodes: number
  candidatesFound: number
  reason?: string
  initials: Uint32Array
  finals: Uint32Array
  weights: Float64Array
}

interface Constraint {
  fixed: (number | undefined)[]
  banned: Set<number>[]
  min: Map<number, number>
  max: Map<number, number>
}

function buildConstraints(history: readonly PinyinHistoryEntry[]): Constraint[] | null {
  const constraints: Constraint[] = Array.from({ length: 3 }, () => ({
    fixed: Array(4).fill(undefined),
    banned: Array.from({ length: 4 }, () => new Set<number>()),
    min: new Map(),
    max: new Map(),
  }))
  for (const entry of history) {
    const codes = [entry.initialCode, entry.finalCode, entry.code]
    const initial = Array.from({ length: 4 }, (_, p) => tupleValue(entry.guessInitial, INITIAL_BITS, p))
    const final = Array.from({ length: 4 }, (_, p) => tupleValue(entry.guessFinal, FINAL_BITS, p))
    const values = [initial, final, initial.map((i, p) => i * (1 << FINAL_BITS) + final[p])]
    for (let dim = 0; dim < 3; dim++) {
      const constraint = constraints[dim]
      const counts = new Map<number, { positive: number; gray: boolean }>()
      for (let position = 0; position < 4; position++) {
        const value = values[dim][position]
        if (dim === 0 && value === NULL_INITIAL_ID)
          continue
        const feedback = Math.floor(codes[dim] / 3 ** position) % 3
        if (feedback === 2) {
          if (constraint.fixed[position] != null && constraint.fixed[position] !== value)
            return null
          constraint.fixed[position] = value
        }
        else {
          constraint.banned[position].add(value)
        }
        const count = counts.get(value) || { positive: 0, gray: false }
        if (feedback)
          count.positive++
        else count.gray = true
        counts.set(value, count)
      }
      for (const [value, count] of counts) {
        constraint.min.set(value, Math.max(constraint.min.get(value) || 0, count.positive))
        if (count.gray)
          constraint.max.set(value, Math.min(constraint.max.get(value) ?? 4, count.positive))
        if ((constraint.min.get(value) || 0) > (constraint.max.get(value) ?? 4))
          return null
      }
    }
  }
  return constraints
}

export function satisfiesHistory(initial: number, final: number, history: readonly PinyinHistoryEntry[]): boolean {
  return history.every(entry =>
    feedbackCode(entry.guessInitial, initial, INITIAL_BITS, NULL_INITIAL_ID) === entry.initialCode
    && feedbackCode(entry.guessFinal, final, FINAL_BITS) === entry.finalCode
    && pinyinFeedbackCode(entry.guessInitial, entry.guessFinal, initial, final) === entry.code)
}

/** Complete bounded CSP search. Failed searches deliberately expose no partial posterior. */
export function enumerateEndgame(
  history: readonly PinyinHistoryEntry[],
  prior: EndgamePrior,
  budget: EndgameBudget = {},
): EndgameSearch {
  const maxNodes = Math.max(0, Math.min(budget.maxNodes ?? ENDGAME_NODE_LIMIT, ENDGAME_NODE_LIMIT))
  const maxCandidates = Math.max(0, Math.min(budget.maxCandidates ?? ENDGAME_CANDIDATE_LIMIT, ENDGAME_CANDIDATE_LIMIT))
  const constraints = buildConstraints(history)
  const initials: number[] = []
  const finals: number[] = []
  const weights: number[] = []
  let nodes = 0
  let candidatesFound = 0
  let stopped: 'node-limit' | 'candidate-limit' | undefined

  if (constraints) {
    const active = constraints.map(constraint =>
      [...new Set([...constraint.min.keys(), ...constraint.max.keys()])].filter(value =>
        (constraint.max.get(value) ?? 4) > 0 && ((constraint.min.get(value) || 0) > 0 || constraint.max.has(value))))
    const domains = Array.from({ length: 4 }, (_, position) => prior.syllables.filter(syllable =>
      constraints.every((c, dim) =>
        (c.fixed[position] == null || c.fixed[position] === syllable.values[dim])
        && !c.banned[position].has(syllable.values[dim])
        && c.max.get(syllable.values[dim]) !== 0)))

    function propagate(slots: EndgameSyllable[][]): boolean {
      let changed = true
      while (changed) {
        changed = false
        if (slots.some(slot => !slot.length))
          return false
        for (let dim = 0; dim < 3; dim++) {
          for (const value of active[dim]) {
            const possible: number[] = []
            const forced: number[] = []
            for (let p = 0; p < 4; p++) {
              if (slots[p].some(s => s.values[dim] === value))
                possible.push(p)
              if (slots[p].every(s => s.values[dim] === value))
                forced.push(p)
            }
            const min = constraints![dim].min.get(value) || 0
            const max = constraints![dim].max.get(value) ?? 4
            if (possible.length < min || forced.length > max)
              return false
            for (const p of possible) {
              if (forced.includes(p))
                continue
              const filtered = possible.length === min
                ? slots[p].filter(s => s.values[dim] === value)
                : forced.length === max ? slots[p].filter(s => s.values[dim] !== value) : slots[p]
              if (!filtered.length)
                return false
              if (filtered.length !== slots[p].length) {
                slots[p] = filtered
                changed = true
              }
            }
          }
        }
      }
      return true
    }

    function visit(slots: EndgameSyllable[][]): void {
      if (stopped)
        return
      if (nodes >= maxNodes) {
        stopped = 'node-limit'
        return
      }
      nodes++
      if (!propagate(slots))
        return
      let position = -1
      for (let p = 0; p < 4; p++) {
        if (slots[p].length > 1 && (position < 0 || slots[p].length < slots[position].length))
          position = p
      }

      if (position >= 0) {
        for (const syllable of slots[position]) {
          const branch = slots.slice()
          branch[position] = [syllable]
          visit(branch)
          if (stopped)
            break
        }
        return
      }
      const initial = packTuple(slots.map(slot => slot[0].values[0]), INITIAL_BITS)
      const final = packTuple(slots.map(slot => slot[0].values[1]), FINAL_BITS)
      // Counts/positions are only pruning: replay the exact duplicate matching too.
      if (!satisfiesHistory(initial, final, history))
        return
      candidatesFound++
      if (candidatesFound > maxCandidates) {
        stopped = 'candidate-limit'
        return
      }
      const correction = prior.signatureWeights.get(endgameStructureSignature(initial, final)) ?? SIGNATURE_WEIGHT_MIN
      weights.push(slots.reduce((weight, slot) => weight * slot[0].probability, correction))
      initials.push(initial)
      finals.push(final)
    }
    visit(domains)
  }

  const status = stopped || (initials.length ? 'complete' : 'contradiction')
  const reasons = {
    'node-limit': `搜索节点超过预算 ${maxNodes}，常规评分暂停`,
    'candidate-limit': `合法候选超过预算 ${maxCandidates}，常规评分暂停`,
    'contradiction': '公开反馈与合法音节约束矛盾，没有完整候选',
  }
  if (status !== 'complete') {
    return {
      status,
      complete: !stopped,
      nodes,
      candidatesFound,
      reason: reasons[status],
      initials: new Uint32Array(),
      finals: new Uint32Array(),
      weights: new Float64Array(),
    }
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  return {
    status,
    complete: true,
    nodes,
    candidatesFound,
    initials: Uint32Array.from(initials),
    finals: Uint32Array.from(finals),
    weights: Float64Array.from(weights, weight => weight / totalWeight),
  }
}
