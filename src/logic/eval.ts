import type { MatchResult, ParsedChar, Rating } from './types'
import { getPinyin } from './idioms'
import { WORD_LENGTH } from './constants'
import {
  CALIBRATION_SEED,
  EVAL_ROW_COUNT,
  FINAL_BITS,
  FINAL_SLOT_COUNTS_BASE64,
  FINALS,
  FINAL_TUPLES_BASE64,
  INITIAL_BITS,
  INITIAL_SLOT_COUNTS_BASE64,
  INITIALS,
  INITIAL_TUPLES_BASE64,
  LEGAL_PINYIN_COUNT,
  NULL_INITIAL_ID,
  PINYIN_ID_COUNT,
  SAMPLED_FINALS_BASE64,
  SAMPLED_INITIALS_BASE64,
  SAMPLED_WORDS,
  SAMPLE_SEED,
  SAMPLE_SIZE,
  SAMPLED_TONES_BASE64,
  SIGNATURE_WEIGHT_MAX,
  SIGNATURE_WEIGHT_MIN,
  SLOT_COUNT,
  STRUCTURE_SIGNATURE_KEYS,
  STRUCTURE_SIGNATURE_WEIGHTS,
  SYLLABLE_COUNTS_BASE64,
  TONE_BITS,
  TONE_TUPLES_BASE64,
} from '../data/eval-data'

export const EVAL_VERSION = 3
export const TONE_WEIGHT = 1
export const MAX_POSTERIOR_SAMPLES = 4096
export const DIAGNOSTIC_SATURATION_EFFECTIVE_LIMIT = 8
export const V3_PARTICLE_COUNT = 4096
export const V3_VIRTUAL_POOL_LIMIT = 16384
export const V3_ATTEMPT_LIMIT = 262144

export function combineExpectedInformation(e1: number, e2: number, toneWeight = TONE_WEIGHT): number {
  return e1 + toneWeight * e2
}

export function combineActualInformation(i1: number, i2: number): number {
  return i1 + i2
}

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
let toneTuplesCache: Uint32Array | undefined
let sampledTonesCache: Uint32Array | undefined
let syllableCountsCache: Uint32Array | undefined
let initialSlotCountsCache: Uint32Array | undefined
let finalSlotCountsCache: Uint32Array | undefined

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

function getToneTuples(): Uint32Array {
  return toneTuplesCache ||= decodeUint32(TONE_TUPLES_BASE64)
}

function getSampledTones(): Uint32Array {
  return sampledTonesCache ||= decodeUint32(SAMPLED_TONES_BASE64)
}

function getSyllableCounts(): Uint32Array {
  return syllableCountsCache ||= decodeUint32(SYLLABLE_COUNTS_BASE64)
}

function getInitialSlotCounts(): Uint32Array {
  return initialSlotCountsCache ||= decodeUint32(INITIAL_SLOT_COUNTS_BASE64)
}

function getFinalSlotCounts(): Uint32Array {
  return finalSlotCountsCache ||= decodeUint32(FINAL_SLOT_COUNTS_BASE64)
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

function parsePinyins(pinyins: readonly string[]): { initial: number; final: number; tone: number } {
  const initials: number[] = []
  const finals: number[] = []
  const tones: number[] = []
  for (let position = 0; position < WORD_LENGTH; position++) {
    const [initial, final] = splitPinyin(pinyins[position] || '')
    const initialId = initialIndex.get(initial)
    const finalId = finalIndex.get(final)
    if (initialId == null || finalId == null)
      throw new Error(`Unsupported pinyin element: ${initial || 'null'} + ${final}`)
    initials.push(initialId)
    finals.push(finalId)
    tones.push(+(pinyins[position]?.match(/[\d]$/)?.[0] || 0))
  }
  return {
    initial: packTuple(initials, INITIAL_BITS),
    final: packTuple(finals, FINAL_BITS),
    tone: packTuple(tones, TONE_BITS),
  }
}

function parseWordTuples(word: string): { initial: number; final: number } {
  return parsePinyins(getPinyin(word))
}

function parseParsedTuples(parsed: readonly ParsedChar[]): { initial: number; final: number; tone: number } {
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

  return feedbackCodeValues(g0, g1, g2, g3, a0, a1, a2, a3, skippedValue)
}

function feedbackCodeValues(
  g0: number,
  g1: number,
  g2: number,
  g3: number,
  a0: number,
  a1: number,
  a2: number,
  a3: number,
  skippedValue = -1,
): number {

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

function pinyinValue(initial: number, final: number, position: number): number {
  return tupleValue(initial, INITIAL_BITS, position) * (1 << FINAL_BITS)
    + tupleValue(final, FINAL_BITS, position)
}

/** Encode full-pinyin feedback while preserving the initial/final pairing. */
export function pinyinFeedbackCode(
  guessInitial: number,
  guessFinal: number,
  targetInitial: number,
  targetFinal: number,
): number {
  return feedbackCodeValues(
    pinyinValue(guessInitial, guessFinal, 0),
    pinyinValue(guessInitial, guessFinal, 1),
    pinyinValue(guessInitial, guessFinal, 2),
    pinyinValue(guessInitial, guessFinal, 3),
    pinyinValue(targetInitial, targetFinal, 0),
    pinyinValue(targetInitial, targetFinal, 1),
    pinyinValue(targetInitial, targetFinal, 2),
    pinyinValue(targetInitial, targetFinal, 3),
  )
}

function matchValue(value: string): number {
  if (value === 'exact') return EXACT
  if (value === 'misplaced') return MISPLACED
  return NONE
}

function observedCode(
  parsed: readonly ParsedChar[],
  results: readonly MatchResult[],
  dimension: 'initial' | 'final' | 'pinyin' | 'tone',
): number {
  let code = 0
  let factor = 1
  for (let position = 0; position < WORD_LENGTH; position++) {
    const skipped = dimension === 'initial' && !parsed[position]._1
    const result = dimension === 'initial'
      ? results[position]._1
      : dimension === 'final'
        ? results[position]._2
        : dimension === 'pinyin'
          ? results[position].py
          : results[position].tone
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
  toneRows: Uint32Array
  initialHistoryHash: number
  finalHistoryHash: number
  toneHistoryHash: number
  valid: boolean
  diagnostics?: EvalDiagnosticsState
}

export interface EvalDiagnosticsState {
  ifRows: Uint32Array
  ifPyRows: Uint32Array
  pinyinHistory: EvalPinyinHistoryEntry[]
  pinyinHistoryHash: number
}

export interface EvalPinyinHistoryEntry {
  guessInitial: number
  guessFinal: number
  code: number
}

export interface EvalStateOptions {
  diagnostics?: boolean
}

export function createEvalState(options: EvalStateOptions = {}): EvalState {
  return {
    initialRows: allRows(),
    finalRows: allRows(),
    toneRows: allRows(),
    initialHistoryHash: SAMPLE_SEED,
    finalHistoryHash: SAMPLE_SEED,
    toneHistoryHash: SAMPLE_SEED,
    valid: true,
    diagnostics: options.diagnostics !== false
      ? {
          ifRows: allRows(),
          ifPyRows: allRows(),
          pinyinHistory: [],
          pinyinHistoryHash: SAMPLE_SEED,
        }
      : undefined,
  }
}

export type EvalDegradation = 'none' | 'true-saturation' | 'corpus-sparse' | 'invalid'

export interface EvalDiagnosticSnapshot {
  initialRows: number
  finalRows: number
  toneRows: number
  ifRows: number
  ifPyRows: number
  initialUnique: number
  finalUnique: number
  toneUnique: number
  ifUnique: number
  ifPyUnique: number
  initialEffective: number
  finalEffective: number
  toneEffective: number
  ifEffective: number
  ifPyEffective: number
  degradation: EvalDegradation
}

interface HypothesisStats {
  unique: number
  effective: number
}

function hypothesisStats(
  rows: Uint32Array,
  keyOf: (row: number) => string | number,
): HypothesisStats {
  if (!rows.length)
    return { unique: 0, effective: 0 }

  const counts = new Map<string | number, number>()
  for (const row of rows) {
    const key = keyOf(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / rows.length
    entropy -= probability * Math.log2(probability)
  }
  return {
    unique: counts.size,
    effective: 2 ** entropy,
  }
}

function pinyinTupleKey(initial: number, final: number): string {
  return `${initial}:${final}`
}

export function getEvalDiagnosticSnapshot(state: EvalState): EvalDiagnosticSnapshot | null {
  const diagnostics = state.diagnostics
  if (!diagnostics)
    return null

  const initialTuples = getInitialTuples()
  const finalTuples = getFinalTuples()
  const initial = hypothesisStats(state.initialRows, row => initialTuples[row])
  const final = hypothesisStats(state.finalRows, row => finalTuples[row])
  const toneTuples = getToneTuples()
  const tone = hypothesisStats(state.toneRows, row => toneTuples[row])
  const combinedKey = (row: number) => pinyinTupleKey(initialTuples[row], finalTuples[row])
  const joint = hypothesisStats(diagnostics.ifRows, combinedKey)
  const jointPy = hypothesisStats(diagnostics.ifPyRows, combinedKey)

  let degradation: EvalDegradation = 'none'
  if (!diagnostics.ifPyRows.length)
    degradation = 'invalid'
  else if (jointPy.unique <= 1)
    degradation = initial.effective <= DIAGNOSTIC_SATURATION_EFFECTIVE_LIMIT
      && final.effective <= DIAGNOSTIC_SATURATION_EFFECTIVE_LIMIT
      ? 'true-saturation'
      : 'corpus-sparse'

  return {
    initialRows: state.initialRows.length,
    finalRows: state.finalRows.length,
    toneRows: state.toneRows.length,
    ifRows: diagnostics.ifRows.length,
    ifPyRows: diagnostics.ifPyRows.length,
    initialUnique: initial.unique,
    finalUnique: final.unique,
    toneUnique: tone.unique,
    ifUnique: joint.unique,
    ifPyUnique: jointPy.unique,
    initialEffective: initial.effective,
    finalEffective: final.effective,
    toneEffective: tone.effective,
    ifEffective: joint.effective,
    ifPyEffective: jointPy.effective,
    degradation,
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
  return feedbackStatistics(guess, targets, bits, skippedValue).entropy
}

interface FeedbackStatistics {
  entropy: number
  information?: number
}

function feedbackStatistics(
  guess: number,
  targets: Uint32Array,
  bits: number,
  skippedValue = -1,
  observed?: number,
): FeedbackStatistics {
  if (!targets.length)
    return { entropy: Number.NaN }

  const counts = new Uint32Array(FEEDBACK_BUCKETS)
  for (const target of targets)
    counts[feedbackCode(guess, target, bits, skippedValue)]++

  let entropy = 0
  for (const count of counts) {
    if (!count) continue
    const probability = count / targets.length
    entropy -= probability * Math.log2(probability)
  }
  const observedCount = observed == null ? undefined : counts[observed]
  return {
    entropy,
    information: observedCount == null || !observedCount
      ? undefined
      : -Math.log2(observedCount / targets.length),
  }
}

interface EvalParticles {
  initials: Uint32Array
  finals: Uint32Array
}

interface V2Particles extends EvalParticles {
  tones: Uint32Array
}

function createParticles(state: EvalState): V2Particles | null {
  if (!state.valid || !state.initialRows.length || !state.finalRows.length || !state.toneRows.length)
    return null
  return {
    initials: sampleTuples(state.initialRows, getInitialTuples(), state.initialHistoryHash ^ 0x49A7E1),
    finals: sampleTuples(state.finalRows, getFinalTuples(), state.finalHistoryHash ^ 0xF17A1),
    tones: sampleTuples(state.toneRows, getToneTuples(), state.toneHistoryHash ^ 0x70AE1),
  }
}

function v2BaseScore(initial: number, final: number, particles: EvalParticles): number {
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
  e1: number
  e2: number
}

export interface EvalBreakdown {
  e1: number
  e2: number
  i1?: number
  i2?: number
}

export interface V2EvalResult extends EvalBreakdown {
  playerEI: number
  rating: Rating
  rank: number
  total: number
  initialPosterior: number
  finalPosterior: number
  tonePosterior: number
  initialParticles: number
  finalParticles: number
  toneParticles: number
  elapsedMs: number
  sampled?: EvalDebugEntry[]
}

export function evaluateV2(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  includeDebug = false,
  results?: readonly MatchResult[],
): V2EvalResult | null {
  const startedAt = performance.now()
  const particles = createParticles(state)
  if (!particles)
    return null

  const guess = parseParsedTuples(parsedGuess)
  const initial = feedbackStatistics(
    guess.initial,
    particles.initials,
    INITIAL_BITS,
    NULL_INITIAL_ID,
    results ? observedCode(parsedGuess, results, 'initial') : undefined,
  )
  const final = feedbackStatistics(
    guess.final,
    particles.finals,
    FINAL_BITS,
    -1,
    results ? observedCode(parsedGuess, results, 'final') : undefined,
  )
  const tone = feedbackStatistics(
    guess.tone,
    particles.tones,
    TONE_BITS,
    -1,
    results ? observedCode(parsedGuess, results, 'tone') : undefined,
  )
  const e1 = initial.entropy + final.entropy
  const e2 = tone.entropy
  const playerEI = combineExpectedInformation(e1, e2)
  const i1 = initial.information == null || final.information == null
    ? undefined
    : initial.information + final.information
  const i2 = tone.information
  const sampledInitials = getSampledInitials()
  const sampledFinals = getSampledFinals()
  const sampledTones = getSampledTones()
  const entries: EvalDebugEntry[] | undefined = includeDebug ? [] : undefined
  let lowerCount = 0

  for (let index = 0; index < SAMPLE_SIZE; index++) {
    const benchmarkE1 = v2BaseScore(sampledInitials[index], sampledFinals[index], particles)
    const benchmarkE2 = feedbackEntropy(sampledTones[index], particles.tones, TONE_BITS)
    const ei = combineExpectedInformation(benchmarkE1, benchmarkE2)
    if (ei < playerEI)
      lowerCount++
    entries?.push({ word: SAMPLED_WORDS[index], ei, e1: benchmarkE1, e2: benchmarkE2 })
  }
  entries?.sort((left, right) => right.ei - left.ei)

  return {
    playerEI,
    e1,
    e2,
    i1,
    i2,
    rating: ratingFromPercentile(lowerCount / SAMPLE_SIZE),
    rank: lowerCount,
    total: SAMPLE_SIZE,
    initialPosterior: state.initialRows.length,
    finalPosterior: state.finalRows.length,
    tonePosterior: state.toneRows.length,
    initialParticles: particles.initials.length,
    finalParticles: particles.finals.length,
    toneParticles: particles.tones.length,
    elapsedMs: performance.now() - startedAt,
    sampled: entries,
  }
}

const JOINT_FEEDBACK_BUCKETS = FEEDBACK_BUCKETS ** 3
const jointFeedbackCounts = new Uint16Array(JOINT_FEEDBACK_BUCKETS)
const touchedJointFeedback = new Uint32Array(V3_PARTICLE_COUNT)

const signatureWeights = new Map<number, number>(
  STRUCTURE_SIGNATURE_KEYS.map((key, index) => [key, STRUCTURE_SIGNATURE_WEIGHTS[index]]),
)

function equalityPattern4(v0: number, v1: number, v2: number, v3: number): number {
  let next = 1
  const l1 = v1 === v0 ? 0 : next++
  const l2 = v2 === v0 ? 0 : v2 === v1 ? l1 : next++
  const l3 = v3 === v0 ? 0 : v3 === v1 ? l1 : v3 === v2 ? l2 : next
  return l1 << 2 | l2 << 4 | l3 << 6
}

function structureSignature(initial: number, final: number): number {
  const i0 = tupleValue(initial, INITIAL_BITS, 0)
  const i1 = tupleValue(initial, INITIAL_BITS, 1)
  const i2 = tupleValue(initial, INITIAL_BITS, 2)
  const i3 = tupleValue(initial, INITIAL_BITS, 3)
  const f0 = tupleValue(final, FINAL_BITS, 0)
  const f1 = tupleValue(final, FINAL_BITS, 1)
  const f2 = tupleValue(final, FINAL_BITS, 2)
  const f3 = tupleValue(final, FINAL_BITS, 3)
  return equalityPattern4(i0, i1, i2, i3)
    | equalityPattern4(f0, f1, f2, f3) << 8
    | equalityPattern4(
      i0 * FINALS.length + f0,
      i1 * FINALS.length + f1,
      i2 * FINALS.length + f2,
      i3 * FINALS.length + f3,
    ) << 16
}

function candidateLogWeight(initial: number, final: number): {
  valid: boolean
  logWeight: number
  signatureClipped: boolean
} {
  const syllableCounts = getSyllableCounts()
  const initialCounts = getInitialSlotCounts()
  const finalCounts = getFinalSlotCounts()
  let logWeight = 0

  for (let position = 0; position < WORD_LENGTH; position++) {
    const initialId = tupleValue(initial, INITIAL_BITS, position)
    const finalId = tupleValue(final, FINAL_BITS, position)
    const jointCount = syllableCounts[initialId * FINALS.length + finalId]
    if (!jointCount)
      return { valid: false, logWeight: Number.NEGATIVE_INFINITY, signatureClipped: false }
    logWeight += Math.log(
      jointCount * SLOT_COUNT / (initialCounts[initialId] * finalCounts[finalId]),
    )
  }

  const signatureWeight = signatureWeights.get(structureSignature(initial, final))
    ?? SIGNATURE_WEIGHT_MIN
  logWeight += Math.log(signatureWeight)
  return {
    valid: true,
    logWeight,
    signatureClipped: signatureWeight === SIGNATURE_WEIGHT_MIN
      || signatureWeight === SIGNATURE_WEIGHT_MAX,
  }
}

function satisfiesPinyinHistory(
  initial: number,
  final: number,
  history: readonly EvalPinyinHistoryEntry[],
): boolean {
  for (const entry of history) {
    if (pinyinFeedbackCode(
      entry.guessInitial,
      entry.guessFinal,
      initial,
      final,
    ) !== entry.code)
      return false
  }
  return true
}

export function v3RealMixRatio(effectiveHypotheses: number): number {
  if (!Number.isFinite(effectiveHypotheses) || effectiveHypotheses <= 0)
    return 0
  return effectiveHypotheses / (effectiveHypotheses + 32)
}

function sampleRealParticles(
  rows: Uint32Array,
  count: number,
  seed: number,
): EvalParticles {
  const initials = new Uint32Array(count)
  const finals = new Uint32Array(count)
  if (!count || !rows.length)
    return { initials, finals }

  const corpusInitials = getInitialTuples()
  const corpusFinals = getFinalTuples()
  const random = mulberry32(seed)
  if (rows.length >= count) {
    const selected = Uint32Array.from(rows.slice(0, count))
    for (let index = count; index < rows.length; index++) {
      const replacement = Math.floor(random() * (index + 1))
      if (replacement < count)
        selected[replacement] = rows[index]
    }
    for (let index = 0; index < count; index++) {
      initials[index] = corpusInitials[selected[index]]
      finals[index] = corpusFinals[selected[index]]
    }
  }
  else {
    for (let index = 0; index < count; index++) {
      const row = rows[Math.floor(random() * rows.length)]
      initials[index] = corpusInitials[row]
      finals[index] = corpusFinals[row]
    }
  }
  return { initials, finals }
}

function resampledEffectiveSize(initials: Uint32Array, finals: Uint32Array): number {
  if (!initials.length)
    return 0
  const counts = new Map<number, number>()
  const finalFactor = 2 ** (FINAL_BITS * WORD_LENGTH)
  for (let index = 0; index < initials.length; index++) {
    const key = initials[index] * finalFactor + finals[index]
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let squared = 0
  for (const count of counts.values())
    squared += count * count
  return initials.length ** 2 / squared
}

interface V3Particles extends EvalParticles {
  tones: Uint32Array
  effectiveHypotheses: number
  lambda: number
  realCount: number
  virtualCount: number
  attempts: number
  accepted: number
  invalidSyllableRejected: number
  pinyinHistoryRejected: number
  clippedSignatureCount: number
  candidateEffective: number
  resampledEffective: number
  fallback: boolean
  generationMs: number
}

export interface EvalResult extends EvalBreakdown {
  playerEI: number
  rating: Rating
  rank: number
  total: number
  initialPosterior: number
  finalPosterior: number
  tonePosterior: number
  initialParticles: number
  finalParticles: number
  toneParticles: number
  effectiveHypotheses: number
  lambda: number
  realParticles: number
  virtualParticles: number
  attempts: number
  accepted: number
  acceptanceRate: number
  invalidSyllableRejected: number
  pinyinHistoryRejected: number
  clippedSignatureCount: number
  candidateEffective: number
  resampledEffective: number
  fallback: boolean
  generationMs: number
  rankingMs: number
  elapsedMs: number
  sampled?: EvalDebugEntry[]
}

function createV3Particles(state: EvalState): V3Particles | null {
  const startedAt = performance.now()
  const diagnostics = state.diagnostics
  if (!diagnostics || !state.valid || !state.initialRows.length || !state.finalRows.length || !state.toneRows.length)
    return null

  const combinedKey = (row: number) =>
    pinyinTupleKey(getInitialTuples()[row], getFinalTuples()[row])
  const effectiveHypotheses = hypothesisStats(diagnostics.ifPyRows, combinedKey).effective
  const lambda = v3RealMixRatio(effectiveHypotheses)
  let realCount = diagnostics.ifPyRows.length
    ? Math.round(V3_PARTICLE_COUNT * lambda)
    : 0
  let virtualCount = V3_PARTICLE_COUNT - realCount
  const historySeed = diagnostics.pinyinHistoryHash ^ state.initialHistoryHash
    ^ state.finalHistoryHash ^ CALIBRATION_SEED
  const sourceInitials = sampleTuples(
    state.initialRows,
    getInitialTuples(),
    historySeed ^ 0x1A17A1,
  )
  const sourceFinals = sampleTuples(
    state.finalRows,
    getFinalTuples(),
    historySeed ^ 0xF1A17A,
  )
  const random = mulberry32(historySeed ^ 0x5633CA1B)
  const poolTarget = virtualCount
    ? Math.min(V3_VIRTUAL_POOL_LIMIT, Math.max(V3_PARTICLE_COUNT, virtualCount * 4))
    : 0
  const candidateInitials: number[] = []
  const candidateFinals: number[] = []
  const candidateLogWeights: number[] = []
  let attempts = 0
  let invalidSyllableRejected = 0
  let pinyinHistoryRejected = 0
  let clippedSignatureCount = 0

  while (
    candidateInitials.length < poolTarget
    && attempts < V3_ATTEMPT_LIMIT
    && sourceInitials.length
    && sourceFinals.length
  ) {
    attempts++
    const initial = sourceInitials[Math.floor(random() * sourceInitials.length)]
    const final = sourceFinals[Math.floor(random() * sourceFinals.length)]
    const weighted = candidateLogWeight(initial, final)
    if (!weighted.valid) {
      invalidSyllableRejected++
      continue
    }
    if (!satisfiesPinyinHistory(initial, final, diagnostics.pinyinHistory)) {
      pinyinHistoryRejected++
      continue
    }
    if (weighted.signatureClipped)
      clippedSignatureCount++
    candidateInitials.push(initial)
    candidateFinals.push(final)
    candidateLogWeights.push(weighted.logWeight)
  }

  const virtualInitials = new Uint32Array(virtualCount)
  const virtualFinals = new Uint32Array(virtualCount)
  let candidateEffective = 0
  let fallback = false

  if (virtualCount && candidateInitials.length) {
    let maximumLogWeight = Number.NEGATIVE_INFINITY
    for (const value of candidateLogWeights)
      maximumLogWeight = Math.max(maximumLogWeight, value)
    const weights = new Float64Array(candidateLogWeights.length)
    let totalWeight = 0
    let squaredWeight = 0
    for (let index = 0; index < weights.length; index++) {
      const weight = Math.exp(candidateLogWeights[index] - maximumLogWeight)
      weights[index] = weight
      totalWeight += weight
      squaredWeight += weight * weight
    }
    candidateEffective = totalWeight * totalWeight / squaredWeight

    const step = totalWeight / virtualCount
    let point = random() * step
    let candidateIndex = 0
    let cumulative = weights[0]
    for (let index = 0; index < virtualCount; index++, point += step) {
      while (candidateIndex < weights.length - 1 && point > cumulative) {
        candidateIndex++
        cumulative += weights[candidateIndex]
      }
      virtualInitials[index] = candidateInitials[candidateIndex]
      virtualFinals[index] = candidateFinals[candidateIndex]
    }
  }
  else if (virtualCount) {
    fallback = true
    realCount = diagnostics.ifPyRows.length ? V3_PARTICLE_COUNT : 0
    virtualCount = 0
  }

  if (!realCount && !virtualCount)
    return null

  const real = sampleRealParticles(
    diagnostics.ifPyRows,
    realCount,
    historySeed ^ 0x3EA1,
  )
  const initials = new Uint32Array(V3_PARTICLE_COUNT)
  const finals = new Uint32Array(V3_PARTICLE_COUNT)
  initials.set(real.initials)
  finals.set(real.finals)
  if (virtualCount) {
    initials.set(virtualInitials, realCount)
    finals.set(virtualFinals, realCount)
  }

  for (let index = initials.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[initials[index], initials[swap]] = [initials[swap], initials[index]]
    ;[finals[index], finals[swap]] = [finals[swap], finals[index]]
  }

  return {
    initials,
    finals,
    tones: sampleTuples(
      state.toneRows,
      getToneTuples(),
      state.toneHistoryHash ^ historySeed ^ 0x70AE3,
    ),
    effectiveHypotheses,
    lambda,
    realCount,
    virtualCount,
    attempts,
    accepted: candidateInitials.length,
    invalidSyllableRejected,
    pinyinHistoryRejected,
    clippedSignatureCount,
    candidateEffective,
    resampledEffective: resampledEffectiveSize(
      virtualInitials.slice(0, virtualCount),
      virtualFinals.slice(0, virtualCount),
    ),
    fallback,
    generationMs: performance.now() - startedAt,
  }
}

function jointFeedbackEntropy(
  guessInitial: number,
  guessFinal: number,
  particles: EvalParticles,
): number {
  return jointFeedbackStatistics(guessInitial, guessFinal, particles).entropy
}

function jointFeedbackStatistics(
  guessInitial: number,
  guessFinal: number,
  particles: EvalParticles,
  observed?: number,
): FeedbackStatistics {
  if (!particles.initials.length)
    return { entropy: Number.NaN }

  let touchedCount = 0
  for (let index = 0; index < particles.initials.length; index++) {
    const initialCode = feedbackCode(
      guessInitial,
      particles.initials[index],
      INITIAL_BITS,
      NULL_INITIAL_ID,
    )
    const finalCode = feedbackCode(
      guessFinal,
      particles.finals[index],
      FINAL_BITS,
    )
    const pinyinCode = pinyinFeedbackCode(
      guessInitial,
      guessFinal,
      particles.initials[index],
      particles.finals[index],
    )
    const code = initialCode + finalCode * FEEDBACK_BUCKETS
      + pinyinCode * FEEDBACK_BUCKETS * FEEDBACK_BUCKETS
    if (!jointFeedbackCounts[code])
      touchedJointFeedback[touchedCount++] = code
    jointFeedbackCounts[code]++
  }

  let entropy = 0
  let observedCount: number | undefined
  for (let index = 0; index < touchedCount; index++) {
    const code = touchedJointFeedback[index]
    const count = jointFeedbackCounts[code]
    const probability = count / particles.initials.length
    entropy -= probability * Math.log2(probability)
    if (code === observed)
      observedCount = count
    jointFeedbackCounts[code] = 0
  }
  return {
    entropy,
    information: observed == null || !observedCount
      ? undefined
      : -Math.log2(observedCount / particles.initials.length),
  }
}

export interface EvalAnalysis extends EvalBreakdown {
  playerEI: number
}

interface V3PlayerAnalysis extends EvalAnalysis {
  particles: V3Particles
}

function analyzeV3Internal(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results?: readonly MatchResult[],
): V3PlayerAnalysis | null {
  const particles = createV3Particles(state)
  if (!particles)
    return null
  const guess = parseParsedTuples(parsedGuess)
  const observedJointCode = results
    ? observedCode(parsedGuess, results, 'initial')
      + observedCode(parsedGuess, results, 'final') * FEEDBACK_BUCKETS
      + observedCode(parsedGuess, results, 'pinyin') * FEEDBACK_BUCKETS * FEEDBACK_BUCKETS
    : undefined
  const base = jointFeedbackStatistics(
    guess.initial,
    guess.final,
    particles,
    observedJointCode,
  )
  const tone = feedbackStatistics(
    guess.tone,
    particles.tones,
    TONE_BITS,
    -1,
    results ? observedCode(parsedGuess, results, 'tone') : undefined,
  )
  return {
    particles,
    e1: base.entropy,
    e2: tone.entropy,
    i1: base.information,
    i2: tone.information,
    playerEI: combineExpectedInformation(base.entropy, tone.entropy),
  }
}

/** Score one observed guess without ranking it against the 1000 benchmark words. */
export function analyzeV3(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results: readonly MatchResult[],
): EvalAnalysis | null {
  const analysis = analyzeV3Internal(state, parsedGuess, results)
  if (!analysis)
    return null
  return {
    playerEI: analysis.playerEI,
    e1: analysis.e1,
    e2: analysis.e2,
    i1: analysis.i1,
    i2: analysis.i2,
  }
}

/** Official V3 score: calibrated initial/final/pinyin particles plus independent tone entropy. */
export function evaluate(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  includeDebug = false,
  results?: readonly MatchResult[],
): EvalResult | null {
  const startedAt = performance.now()
  const analysis = analyzeV3Internal(state, parsedGuess, results)
  if (!analysis)
    return null
  const { particles, e1, e2, i1, i2, playerEI } = analysis

  const rankingStartedAt = performance.now()
  const sampledInitials = getSampledInitials()
  const sampledFinals = getSampledFinals()
  const sampledTones = getSampledTones()
  const entries: EvalDebugEntry[] | undefined = includeDebug ? [] : undefined
  let lowerCount = 0
  for (let index = 0; index < SAMPLE_SIZE; index++) {
    const benchmarkE1 = jointFeedbackEntropy(
      sampledInitials[index],
      sampledFinals[index],
      particles,
    )
    const benchmarkE2 = feedbackEntropy(sampledTones[index], particles.tones, TONE_BITS)
    const entropy = combineExpectedInformation(benchmarkE1, benchmarkE2)
    if (entropy < playerEI)
      lowerCount++
    entries?.push({
      word: SAMPLED_WORDS[index],
      ei: entropy,
      e1: benchmarkE1,
      e2: benchmarkE2,
    })
  }
  entries?.sort((left, right) => right.ei - left.ei)
  const rankingMs = performance.now() - rankingStartedAt

  return {
    playerEI,
    e1,
    e2,
    i1,
    i2,
    rating: ratingFromPercentile(lowerCount / SAMPLE_SIZE),
    rank: lowerCount,
    total: SAMPLE_SIZE,
    initialPosterior: state.initialRows.length,
    finalPosterior: state.finalRows.length,
    tonePosterior: state.toneRows.length,
    initialParticles: particles.initials.length,
    finalParticles: particles.finals.length,
    toneParticles: particles.tones.length,
    effectiveHypotheses: particles.effectiveHypotheses,
    lambda: particles.lambda,
    realParticles: particles.realCount,
    virtualParticles: particles.virtualCount,
    attempts: particles.attempts,
    accepted: particles.accepted,
    acceptanceRate: particles.attempts ? particles.accepted / particles.attempts : 0,
    invalidSyllableRejected: particles.invalidSyllableRejected,
    pinyinHistoryRejected: particles.pinyinHistoryRejected,
    clippedSignatureCount: particles.clippedSignatureCount,
    candidateEffective: particles.candidateEffective,
    resampledEffective: particles.resampledEffective,
    fallback: particles.fallback,
    generationMs: particles.generationMs,
    rankingMs,
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

function filterJointRows(
  rows: Uint32Array,
  guess: { initial: number; final: number },
  expectedInitialCode: number,
  expectedFinalCode: number,
  expectedPinyinCode?: number,
): Uint32Array {
  const initialTuples = getInitialTuples()
  const finalTuples = getFinalTuples()
  const result = new Uint32Array(rows.length)
  let count = 0

  for (const row of rows) {
    const targetInitial = initialTuples[row]
    const targetFinal = finalTuples[row]
    if (feedbackCode(
      guess.initial,
      targetInitial,
      INITIAL_BITS,
      NULL_INITIAL_ID,
    ) !== expectedInitialCode)
      continue
    if (feedbackCode(guess.final, targetFinal, FINAL_BITS) !== expectedFinalCode)
      continue
    if (expectedPinyinCode != null && pinyinFeedbackCode(
      guess.initial,
      guess.final,
      targetInitial,
      targetFinal,
    ) !== expectedPinyinCode)
      continue
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
  const toneCode = observedCode(parsedGuess, results, 'tone')
  const pinyinCode = state.diagnostics
    ? observedCode(parsedGuess, results, 'pinyin')
    : undefined

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
  state.toneRows = filterRows(
    state.toneRows,
    getToneTuples(),
    guess.tone,
    toneCode,
    TONE_BITS,
  )
  if (state.diagnostics) {
    state.diagnostics.ifRows = filterJointRows(
      state.diagnostics.ifRows,
      guess,
      initialCode,
      finalCode,
    )
    state.diagnostics.ifPyRows = filterJointRows(
      state.diagnostics.ifPyRows,
      guess,
      initialCode,
      finalCode,
      pinyinCode!,
    )
    state.diagnostics.pinyinHistory.push({
      guessInitial: guess.initial,
      guessFinal: guess.final,
      code: pinyinCode!,
    })
    state.diagnostics.pinyinHistoryHash = hashStep(
      state.diagnostics.pinyinHistoryHash,
      guess.initial,
    )
    state.diagnostics.pinyinHistoryHash = hashStep(
      state.diagnostics.pinyinHistoryHash,
      guess.final,
    )
    state.diagnostics.pinyinHistoryHash = hashStep(
      state.diagnostics.pinyinHistoryHash,
      pinyinCode!,
    )
  }
  state.initialHistoryHash = hashStep(state.initialHistoryHash, initialCode)
  state.finalHistoryHash = hashStep(state.finalHistoryHash, finalCode)
  state.toneHistoryHash = hashStep(state.toneHistoryHash, toneCode)
  state.valid = state.initialRows.length > 0
    && state.finalRows.length > 0
    && state.toneRows.length > 0
  return state.valid
}

// Test helpers also ensure generator/runtime parsing stays aligned.
export const evalTesting = {
  parseWordTuples,
  parseParsedTuples,
  packTuple,
  splitPinyin,
  pinyinTupleKey(parsed: readonly ParsedChar[]) {
    const tuple = parseParsedTuples(parsed)
    return pinyinTupleKey(tuple.initial, tuple.final)
  },
  hypothesisStats(keys: readonly (string | number)[]) {
    const rows = Uint32Array.from({ length: keys.length }, (_, index) => index)
    return hypothesisStats(rows, row => keys[row])
  },
  legalPinyinCount: LEGAL_PINYIN_COUNT,
  pinyinIdCount: PINYIN_ID_COUNT,
  isLegalPinyin(initialId: number, finalId: number) {
    return getSyllableCounts()[initialId * FINALS.length + finalId] > 0
  },
  structureSignature,
  createV3Particles,
  jointFeedbackEntropy,
  corpusParticles(): EvalParticles {
    return {
      initials: getInitialTuples(),
      finals: getFinalTuples(),
    }
  },
  particlesAreValid(state: EvalState, particles: EvalParticles) {
    const history = state.diagnostics?.pinyinHistory || []
    for (let index = 0; index < particles.initials.length; index++) {
      const initial = particles.initials[index]
      const final = particles.finals[index]
      for (let position = 0; position < WORD_LENGTH; position++) {
        if (!getSyllableCounts()[
          tupleValue(initial, INITIAL_BITS, position) * FINALS.length
          + tupleValue(final, FINAL_BITS, position)
        ])
          return false
      }
      if (!satisfiesPinyinHistory(initial, final, history))
        return false
    }
    return true
  },
  stateContains(state: EvalState, parsed: readonly ParsedChar[]) {
    const tuple = parseParsedTuples(parsed)
    const result: {
      initial: boolean
      final: boolean
      tone: boolean
      if?: boolean
      ifPy?: boolean
    } = {
      initial: Array.from(state.initialRows).some(row => getInitialTuples()[row] === tuple.initial),
      final: Array.from(state.finalRows).some(row => getFinalTuples()[row] === tuple.final),
      tone: Array.from(state.toneRows).some(row => getToneTuples()[row] === tuple.tone),
    }
    if (state.diagnostics) {
      result.if = Array.from(state.diagnostics.ifRows).some(row =>
        getInitialTuples()[row] === tuple.initial && getFinalTuples()[row] === tuple.final)
      result.ifPy = Array.from(state.diagnostics.ifPyRows).some(row =>
        getInitialTuples()[row] === tuple.initial && getFinalTuples()[row] === tuple.final)
    }
    return result
  },
}
