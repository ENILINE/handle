import type { MatchResult, ParsedChar } from './types'
import { getPinyin } from './idioms'
import { WORD_LENGTH } from './constants'
import { ELEMENTS, SAMPLED_DATA, SAMPLED_WORDS, SAMPLE_SIZE } from '../data/eval-data'

// ============ a.csv Z-count map ============
// Number of idioms (out of 44010) WITHOUT this element
const Z_MAP: Record<string, number> = {
  b: 35404, c: 41067, ch: 37956, d: 35901, f: 37777, g: 36929, h: 36611,
  j: 32772, k: 41101, l: 35008, m: 37371, n: 41385,
  null: 41235,
  p: 41623, q: 36627, r: 39208, s: 39990, sh: 33110, t: 38168,
  w: 37441, x: 34410, y: 29771, z: 40079, zh: 34391,
  a: 40172, ai: 39347, an: 34709, ang: 38458, ao: 38368,
  e: 38481, ei: 39970, en: 38151, eng: 38136, er: 42789,
  i: 21824, ia: 42448, ian: 37738, iang: 41717, iao: 41025,
  ie: 41611, in: 38852, ing: 37047, iong: 43416, iu: 41432,
  o: 42273, ong: 38119, ou: 38102,
  u: 24875, ua: 42824, uai: 43521, uan: 39624, uang: 42592,
  ue: 42242, ui: 40169, un: 40931, uo: 39799,
  v: 43456, ve: 43926,
}
const N = 44010

// ============ Pinyin parsing (jsonl-compatible) ============
// jsonl convention: y/w are treated as real initials, finals are unchanged
// from the pinyin syllable. e.g. "yan2" → initial=y, final=an
// Zero-initial syllables (a, an, e, etc.) → initial=null

/**
 * Split a pinyin syllable (tone2 format, e.g. "yi1") into [initial, final]
 * using the same convention as playground/idioms.jsonl.
 */
function splitPinyin(syllable: string): [string, string] {
  const base = syllable.replace(/[\d]$/, '')
  if (!base) return ['null', '']

  // Greedy match: longer initials first
  const initials = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'w', 'y']
  for (const ini of initials) {
    if (base.startsWith(ini)) {
      return [ini, base.slice(ini.length)]
    }
  }
  return ['null', base]
}

/**
 * Parse a word into {element → position bitmask} using jsonl naming.
 */
function parseWordElements(word: string): Map<string, number> {
  const pinyins = getPinyin(word)
  const result = new Map<string, number>()

  for (let i = 0; i < Math.min(pinyins.length, WORD_LENGTH); i++) {
    const [initial, final] = splitPinyin(pinyins[i])
    const mask = 1 << i

    const add = (elem: string) => {
      if (!elem) return
      result.set(elem, (result.get(elem) || 0) | mask)
    }
    add(initial)
    add(final)
  }
  return result
}

// ============ Element state machine ============

export interface ElementState {
  p_absent: number
  live_set: number[] // positions 1-4 where element could be
}

export type EvalState = Map<string, ElementState>

export function createEvalState(): EvalState {
  const s = new Map<string, ElementState>()
  for (const elem of ELEMENTS) {
    const z = Z_MAP[elem] ?? N
    s.set(elem, {
      p_absent: z / N,
      live_set: [1, 2, 3, 4],
    })
  }
  return s
}

// ============ E[I] computation ============

function entropy(p_absent: number, k: number): number {
  if (p_absent >= 1 || k === 0) return 0
  if (p_absent <= 0) return Math.log2(k)
  const p_present = 1 - p_absent
  return -p_absent * Math.log2(p_absent) - p_present * Math.log2(p_present / k)
}

/**
 * Expected information gain for element e in state st, guessed at positions in G.
 */
function elementEI(st: ElementState, G: number[]): number {
  const k = st.live_set.length
  if (k === 0 || st.p_absent >= 1) return 0

  // Positions in live_set NOT covered by G
  const remaining = st.live_set.filter(p => !G.includes(p))
  const m = remaining.length

  const H_current = entropy(st.p_absent, k)

  if (m === 0) return H_current // element state already resolved

  const p_remain = (1 - st.p_absent) * m / k
  const H_after = p_remain * Math.log2(m)

  return H_current - H_after
}

/**
 * Convert position bitmask to array of 1-indexed positions.
 */
function maskToPositions(mask: number): number[] {
  const pos: number[] = []
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (mask & (1 << i)) pos.push(i + 1)
  }
  return pos
}

/**
 * Compute E[I] for a word given the current element states.
 */
export function computeEI(state: EvalState, word: string): number {
  const elemMasks = parseWordElements(word)
  let total = 0
  for (const [elem, mask] of elemMasks) {
    const st = state.get(elem)
    if (!st) continue
    const G = maskToPositions(mask)
    total += elementEI(st, G)
  }
  return total
}

// ============ State update from feedback ============

/**
 * Update eval state based on the feedback received for a guess.
 */
export function updateState(
  state: EvalState,
  parsedGuess: ParsedChar[],
  feedback: MatchResult[],
): void {
  // Collect all unique elements in the guess with their positions and feedback
  const pinyins = parsedGuess.map(c => c.yin + (c.tone || ''))
  const elemInfo = new Map<string, {
    positions: number[]
    exactPositions: number[]
    allGray: boolean
  }>()

  for (let i = 0; i < parsedGuess.length; i++) {
    const [initial, final] = splitPinyin(pinyins[i])
    const fb = feedback[i]
    const pos = i + 1

    const record = (elem: string) => {
      if (!elem) return
      let info = elemInfo.get(elem)
      if (!info) {
        info = { positions: [], exactPositions: [], allGray: true }
        elemInfo.set(elem, info)
      }
      info.positions.push(pos)
      // Check if this element is exact (green) or misplaced (red)
      // For initial: fb._1, for final: fb._2
      const isExact = (elem === initial && fb._1 === 'exact') ||
        (elem === final && fb._2 === 'exact')
      const isMisplaced = (elem === initial && fb._1 === 'misplaced') ||
        (elem === final && fb._2 === 'misplaced')

      if (isExact) info.exactPositions.push(pos)
      if (isExact || isMisplaced) info.allGray = false
    }
    record(initial)
    record(final)
  }

  // Update each element's state
  for (const [elem, info] of elemInfo) {
    const st = state.get(elem)
    if (!st) continue

    if (info.allGray) {
      // Element is confirmed absent from answer
      st.p_absent = 1
      st.live_set = []
    }
    else if (info.exactPositions.length > 0) {
      // Element is present at exact position(s)
      // In MVP (no multi-element), there's at most 1 exact position
      st.p_absent = 0
      st.live_set = [info.exactPositions[0]]
    }
    else {
      // Element is present but misplaced — remove guessed positions
      st.p_absent = 0
      st.live_set = st.live_set.filter(p => !info.positions.includes(p))
    }
  }
}

// ============ Ranking against sampled idioms ============

// Pre-built: parse the sampled data into element arrays
interface SampledIdiom {
  elements: { idx: number; mask: number }[]
}

let _sampledCache: SampledIdiom[] | null = null

function getSampledIdioms(): SampledIdiom[] {
  if (_sampledCache) return _sampledCache

  _sampledCache = []
  let offset = 0
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const count = SAMPLED_DATA[offset++]
    const elements: { idx: number; mask: number }[] = []
    for (let j = 0; j < count; j++) {
      const idx = SAMPLED_DATA[offset++]
      const mask = SAMPLED_DATA[offset++]
      elements.push({ idx, mask })
    }
    _sampledCache.push({ elements })
  }
  return _sampledCache
}

/**
 * Compute E[I] for a sampled idiom given current state.
 */
function sampledEI(state: EvalState, idiom: SampledIdiom): number {
  let total = 0
  for (const { idx, mask } of idiom.elements) {
    const elem = ELEMENTS[idx]
    const st = state.get(elem)
    if (!st) continue
    const G = maskToPositions(mask)
    total += elementEI(st, G)
  }
  return total
}

export type Rating = 'brilliant' | 'excellent' | 'good' | 'mistake' | 'incorrect'

/**
 * Rate a guess given the current eval state.
 */
export function rate(state: EvalState, word: string): Rating {
  const playerEI = computeEI(state, word)
  const sampled = getSampledIdioms()

  // Count how many sampled idioms have lower EI
  let lowerCount = 0
  for (const idiom of sampled) {
    const ei = sampledEI(state, idiom)
    if (ei < playerEI) lowerCount++
  }

  const pct = lowerCount / sampled.length

  if (pct >= 0.99) return 'brilliant'
  if (pct >= 0.90) return 'excellent'
  if (pct >= 0.70) return 'good'
  if (pct >= 0.40) return 'mistake'
  return 'incorrect'
}

// ============ Debug info ============

export interface EvalDebugEntry {
  word: string
  ei: number
}

export interface EvalDebugInfo {
  playerEI: number
  rating: Rating
  rank: number
  total: number
  sampled: EvalDebugEntry[]
}

/**
 * Like rate(), but returns full debug info for the dev panel.
 */
export function debugRate(state: EvalState, word: string): EvalDebugInfo {
  const playerEI = computeEI(state, word)
  const sampled = getSampledIdioms()

  const entries: EvalDebugEntry[] = []
  let lowerCount = 0
  for (let i = 0; i < sampled.length; i++) {
    const ei = sampledEI(state, sampled[i])
    entries.push({ word: SAMPLED_WORDS[i], ei })
    if (ei < playerEI) lowerCount++
  }

  // Sort descending by EI
  entries.sort((a, b) => b.ei - a.ei)

  const pct = lowerCount / sampled.length
  let rating: Rating = 'incorrect'
  if (pct >= 0.99) rating = 'brilliant'
  else if (pct >= 0.90) rating = 'excellent'
  else if (pct >= 0.70) rating = 'good'
  else if (pct >= 0.40) rating = 'mistake'

  return {
    playerEI,
    rating,
    rank: lowerCount,
    total: sampled.length,
    sampled: entries,
  }
}