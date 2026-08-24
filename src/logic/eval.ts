import type { MatchResult, ParsedChar, Rating } from './types'
import { getPinyin } from './idioms'
import { WORD_LENGTH } from './constants'
import {
  EVAL_ROW_COUNT,
  FINAL_BITS,
  FINALS,
  FINAL_TUPLES_BASE64,
  INITIAL_BITS,
  INITIALS,
  INITIAL_TUPLES_BASE64,
  NULL_INITIAL_ID,
  SAMPLED_FINALS_BASE64,
  SAMPLED_INITIALS_BASE64,
  SAMPLED_WORDS,
  SAMPLE_SEED,
  SAMPLE_SIZE,
} from '../data/eval-data'

export const EVAL_VERSION = 2
export const MAX_POSTERIOR_SAMPLES = 4096

export function canReuseRatings(
  ratingsVersion: number | undefined,
  ratingsLength: number | undefined,
  triesLength: number,
): boolean {
  return ratingsVersion === EVAL_VERSION && ratingsLength === triesLength
}

export function canAppendEvaluation(
  previousGameKey: string,
  previousWords: readonly string[],
  gameKey: string,
  words: readonly string[],
): boolean {
  return gameKey === previousGameKey
    && previousWords.length < words.length
    && previousWords.every((word, index) => word === words[index])
}

const NONE = 0
const MISPLACED = 1
const EXACT = 2
const FEEDBACK_BUCKETS = 3 ** WORD_LENGTH

const initialIndex = new Map<string, number>(INITIALS.map((value, index) => [value, index]))
const finalIndex = new Map<string, number>(FINALS.map((value, index) => [value, index]))

let initialTuplesCache: Uint32Array | undefined
let finalTuplesCache: Uint32Array | undefined
let sampledInitialsCache: Uint32Array | undefined
let sampledFinalsCache: Uint32Array | undefined

function decodeUint32(base64: string): Uint32Array {
  const binary = atob(base64)
  const values = new Uint32Array(binary.length / 4)
  for (let index = 0; index < values.length; index++) {
    const offset = index * 4
    values[index] = (
      binary.charCodeAt(offset)
      | binary.charCodeAt(offset + 1) << 8
      | binary.charCodeAt(offset + 2) << 16
      | binary.charCodeAt(offset + 3) << 24
    ) >>> 0
  }
  return values
}

function getInitialTuples(): Uint32Array {
  return initialTuplesCache ||= decodeUint32(INITIAL_TUPLES_BASE64)
}

function getFinalTuples(): Uint32Array {
  return finalTuplesCache ||= decodeUint32(FINAL_TUPLES_BASE64)
}

function getSampledInitials(): Uint32Array {
  return sampledInitialsCache ||= decodeUint32(SAMPLED_INITIALS_BASE64)
}

function getSampledFinals(): Uint32Array {
  return sampledFinalsCache ||= decodeUint32(SAMPLED_FINALS_BASE64)
}

function splitPinyin(syllable: string): [string, string] {
  const base = syllable.replace(/[\d]$/, '')
  if (!base)
    return ['null', '']

  const initials = [
    'zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'w', 'y',
  ]
  for (const initial of initials) {
    if (base.startsWith(initial))
      return [initial, base.slice(initial.length)]
  }
  return ['null', base]
}

function packTuple(values: readonly number[], bits: number): number {
  let packed = 0
  for (let position = 0; position < WORD_LENGTH; position++)
    packed |= values[position] << (position * bits)
  return packed >>> 0
}

function parsePinyins(pinyins: readonly string[]): { initial: number; final: number } {
  const initials: number[] = []
  const finals: number[] = []
  for (let position = 0; position < WORD_LENGTH; position++) {
    const [initial, final] = splitPinyin(pinyins[position] || '')
    const initialId = initialIndex.get(initial)
    const finalId = finalIndex.get(final)
    if (initialId == null || finalId == null)
      throw new Error(`Unsupported pinyin element: ${initial || 'null'} + ${final}`)
    initials.push(initialId)
    finals.push(finalId)
  }
  return {
    initial: packTuple(initials, INITIAL_BITS),
    final: packTuple(finals, FINAL_BITS),
  }
}

function parseWordTuples(word: string): { initial: number; final: number } {
  return parsePinyins(getPinyin(word))
}

function parseParsedTuples(parsed: readonly ParsedChar[]): { initial: number; final: number } {
  return parsePinyins(parsed.map(char => `${char.yin}${char.tone || ''}`))
}

function tupleValue(tuple: number, bits: number, position: number): number {
  return tuple >>> (position * bits) & ((1 << bits) - 1)
}

/**
 * Encode the four-position Wordle feedback for one pinyin dimension.
 * Base-3 digits are none=0, misplaced=1, exact=2.
 * A skipped value (the null initial) is not a query and always contributes 0.
 */
export function feedbackCode(
  guess: number,
  target: number,
  bits: number,
  skippedValue = -1,
): number {
  const g0 = tupleValue(guess, bits, 0)
  const g1 = tupleValue(guess, bits, 1)
  const g2 = tupleValue(guess, bits, 2)
  const g3 = tupleValue(guess, bits, 3)
  const a0 = tupleValue(target, bits, 0)
  const a1 = tupleValue(target, bits, 1)
  const a2 = tupleValue(target, bits, 2)
  const a3 = tupleValue(target, bits, 3)

  let s0 = NONE
  let s1 = NONE
  let s2 = NONE
  let s3 = NONE
  let used = 0

  if (g0 !== skippedValue && g0 === a0) { s0 = EXACT; used |= 1 }
  if (g1 !== skippedValue && g1 === a1) { s1 = EXACT; used |= 2 }
  if (g2 !== skippedValue && g2 === a2) { s2 = EXACT; used |= 4 }
  if (g3 !== skippedValue && g3 === a3) { s3 = EXACT; used |= 8 }

  const usedBefore0 = used
  if (g0 !== skippedValue && s0 !== EXACT) {
    if (!(used & 1) && g0 === a0) used |= 1
    else if (!(used & 2) && g0 === a1) used |= 2
    else if (!(used & 4) && g0 === a2) used |= 4
    else if (!(used & 8) && g0 === a3) used |= 8
    if (used !== usedBefore0) s0 = MISPLACED
  }
  const usedAfter0 = used
  if (g1 !== skippedValue && s1 !== EXACT) {
    if (!(used & 1) && g1 === a0) used |= 1
    else if (!(used & 2) && g1 === a1) used |= 2
    else if (!(used & 4) && g1 === a2) used |= 4
    else if (!(used & 8) && g1 === a3) used |= 8
    if (used !== usedAfter0) s1 = MISPLACED
  }
  const usedAfter1 = used
  if (g2 !== skippedValue && s2 !== EXACT) {
    if (!(used & 1) && g2 === a0) used |= 1
    else if (!(used & 2) && g2 === a1) used |= 2
    else if (!(used & 4) && g2 === a2) used |= 4
    else if (!(used & 8) && g2 === a3) used |= 8
    if (used !== usedAfter1) s2 = MISPLACED
  }
  const usedAfter2 = used
  if (g3 !== skippedValue && s3 !== EXACT) {
    if (!(used & 1) && g3 === a0) used |= 1
    else if (!(used & 2) && g3 === a1) used |= 2
    else if (!(used & 4) && g3 === a2) used |= 4
    else if (!(used & 8) && g3 === a3) used |= 8
    if (used !== usedAfter2) s3 = MISPLACED
  }

  return s0 + s1 * 3 + s2 * 9 + s3 * 27
}

function matchValue(value: string): number {
  if (value === 'exact') return EXACT
  if (value === 'misplaced') return MISPLACED
  return NONE
}

function observedCode(
  parsed: readonly ParsedChar[],
  results: readonly MatchResult[],
  dimension: 'initial' | 'final',
): number {
  let code = 0
  let factor = 1
  for (let position = 0; position < WORD_LENGTH; position++) {
    const skipped = dimension === 'initial' && !parsed[position]._1
    const result = dimension === 'initial' ? results[position]._1 : results[position]._2
    code += (skipped ? NONE : matchValue(result)) * factor
    factor *= 3
  }
  return code
}

function allRows(): Uint32Array {
  return Uint32Array.from({ length: EVAL_ROW_COUNT }, (_, index) => index)
}

export interface EvalState {
  initialRows: Uint32Array
  finalRows: Uint32Array
  initialHistoryHash: number
  finalHistoryHash: number
  valid: boolean
}

export function createEvalState(): EvalState {
  return {
    initialRows: allRows(),
    finalRows: allRows(),
    initialHistoryHash: SAMPLE_SEED,
    finalHistoryHash: SAMPLE_SEED,
    valid: true,
  }
}

function hashStep(hash: number, value: number): number {
  hash ^= value
  return Math.imul(hash, 16777619) >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function sampleTuples(
  rows: Uint32Array,
  corpus: Uint32Array,
  seed: number,
): Uint32Array {
  if (rows.length <= MAX_POSTERIOR_SAMPLES)
    return Uint32Array.from(rows, row => corpus[row])

  const random = mulberry32(seed)
  const reservoir = new Uint32Array(MAX_POSTERIOR_SAMPLES)
  for (let index = 0; index < MAX_POSTERIOR_SAMPLES; index++)
    reservoir[index] = corpus[rows[index]]

  for (let index = MAX_POSTERIOR_SAMPLES; index < rows.length; index++) {
    const selected = Math.floor(random() * (index + 1))
    if (selected < MAX_POSTERIOR_SAMPLES)
      reservoir[selected] = corpus[rows[index]]
  }
  return reservoir
}

export function feedbackEntropy(
  guess: number,
  targets: Uint32Array,
  bits: number,
  skippedValue = -1,
): number {
  if (!targets.length)
    return Number.NaN

  const counts = new Uint32Array(FEEDBACK_BUCKETS)
  for (const target of targets)
    counts[feedbackCode(guess, target, bits, skippedValue)]++

  let entropy = 0
  for (const count of counts) {
    if (!count) continue
    const probability = count / targets.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

interface EvalParticles {
  initials: Uint32Array
  finals: Uint32Array
}

function createParticles(state: EvalState): EvalParticles | null {
  if (!state.valid || !state.initialRows.length || !state.finalRows.length)
    return null
  return {
    initials: sampleTuples(state.initialRows, getInitialTuples(), state.initialHistoryHash ^ 0x49A7E1),
    finals: sampleTuples(state.finalRows, getFinalTuples(), state.finalHistoryHash ^ 0xF17A1),
  }
}

function tupleScore(initial: number, final: number, particles: EvalParticles): number {
  return feedbackEntropy(initial, particles.initials, INITIAL_BITS, NULL_INITIAL_ID)
    + feedbackEntropy(final, particles.finals, FINAL_BITS)
}

function ratingFromPercentile(percentile: number): Rating {
  if (percentile >= 0.99) return 'brilliant'
  if (percentile >= 0.90) return 'excellent'
  if (percentile >= 0.70) return 'good'
  if (percentile >= 0.40) return 'mistake'
  return 'incorrect'
}

export interface EvalDebugEntry {
  word: string
  ei: number
}

export interface EvalResult {
  playerEI: number
  rating: Rating
  rank: number
  total: number
  initialPosterior: number
  finalPosterior: number
  initialParticles: number
  finalParticles: number
  elapsedMs: number
  sampled?: EvalDebugEntry[]
}

export function evaluate(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  includeDebug = false,
): EvalResult | null {
  const startedAt = performance.now()
  const particles = createParticles(state)
  if (!particles)
    return null

  const guess = parseParsedTuples(parsedGuess)
  const playerEI = tupleScore(guess.initial, guess.final, particles)
  const sampledInitials = getSampledInitials()
  const sampledFinals = getSampledFinals()
  const entries: EvalDebugEntry[] | undefined = includeDebug ? [] : undefined
  let lowerCount = 0

  for (let index = 0; index < SAMPLE_SIZE; index++) {
    const ei = tupleScore(sampledInitials[index], sampledFinals[index], particles)
    if (ei < playerEI)
      lowerCount++
    entries?.push({ word: SAMPLED_WORDS[index], ei })
  }
  entries?.sort((left, right) => right.ei - left.ei)

  return {
    playerEI,
    rating: ratingFromPercentile(lowerCount / SAMPLE_SIZE),
    rank: lowerCount,
    total: SAMPLE_SIZE,
    initialPosterior: state.initialRows.length,
    finalPosterior: state.finalRows.length,
    initialParticles: particles.initials.length,
    finalParticles: particles.finals.length,
    elapsedMs: performance.now() - startedAt,
    sampled: entries,
  }
}

function filterRows(
  rows: Uint32Array,
  corpus: Uint32Array,
  guess: number,
  expectedCode: number,
  bits: number,
  skippedValue = -1,
): Uint32Array {
  const result = new Uint32Array(rows.length)
  let count = 0
  for (const row of rows) {
    if (feedbackCode(guess, corpus[row], bits, skippedValue) === expectedCode)
      result[count++] = row
  }
  return result.slice(0, count)
}

/** Apply the observed feedback after the guess has been scored. */
export function updateState(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results: readonly MatchResult[],
): boolean {
  const guess = parseParsedTuples(parsedGuess)
  const initialCode = observedCode(parsedGuess, results, 'initial')
  const finalCode = observedCode(parsedGuess, results, 'final')

  state.initialRows = filterRows(
    state.initialRows,
    getInitialTuples(),
    guess.initial,
    initialCode,
    INITIAL_BITS,
    NULL_INITIAL_ID,
  )
  state.finalRows = filterRows(
    state.finalRows,
    getFinalTuples(),
    guess.final,
    finalCode,
    FINAL_BITS,
  )
  state.initialHistoryHash = hashStep(state.initialHistoryHash, initialCode)
  state.finalHistoryHash = hashStep(state.finalHistoryHash, finalCode)
  state.valid = state.initialRows.length > 0 && state.finalRows.length > 0
  return state.valid
}

// Test helpers also ensure generator/runtime parsing stays aligned.
export const evalTesting = {
  parseWordTuples,
  parseParsedTuples,
  packTuple,
  splitPinyin,
  stateContains(state: EvalState, parsed: readonly ParsedChar[]) {
    const tuple = parseParsedTuples(parsed)
    return {
      initial: Array.from(state.initialRows).some(row => getInitialTuples()[row] === tuple.initial),
      final: Array.from(state.finalRows).some(row => getFinalTuples()[row] === tuple.final),
    }
  },
}
