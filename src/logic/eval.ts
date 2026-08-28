import type { MatchResult, ParsedChar, Rating } from './types'
import { getPinyin } from './idioms'
import { WORD_LENGTH } from './constants'
import { FEEDBACK_BUCKETS, feedbackCode, jointFeedbackCode, observedCode, packTuple, pinyinFeedbackCode, structureSignature, tupleValue } from './eval-feedback'
import { ENDGAME_PRODUCT_LIMIT, createEndgamePrior, enumerateEndgame } from './eval-endgame'
import type { EndgameBudget, EndgamePrior, EndgameSearch, PinyinHistoryEntry } from './eval-endgame'
export { feedbackCode, pinyinFeedbackCode } from './eval-feedback'
import {
  CALIBRATION_SEED,
  ENDGAME_SIGNATURE_KEYS,
  ENDGAME_SIGNATURE_WEIGHTS,
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

export const EVAL_VERSION = 4
export const MAX_POSTERIOR_SAMPLES = 4096
export const V3_PARTICLE_COUNT = 4096
export const V3_VIRTUAL_POOL_LIMIT = 16384
export const V3_ATTEMPT_LIMIT = 262144
export const I1_PARTICLE_FULL_WEIGHT_HITS = 8

export function combineExpectedInformation(e1: number, e2: number, toneWeight: number): number {
  return e1 + toneWeight * e2
}

export function combineActualInformation(i1: number, i2: number): number {
  return i1 + i2
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function toneWeightForInformation(information: number): number {
  return 0.5 + 0.5 * clamp01((information - 10) / 10)
}

export function compressionForInformation(information: number, posteriorProduct: number): number {
  return posteriorProduct <= ENDGAME_PRODUCT_LIMIT ? 1 : clamp01((information - 23) / 7)
}

export function compressPercentile(percentile: number, compression: number): number {
  return percentile <= 0.70 ? percentile : (1 - compression) * percentile + compression * 0.701
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

function parseWordTuples(word: string): { initial: number; final: number; tone: number } {
  return parsePinyins(getPinyin(word))
}

function parseParsedTuples(parsed: readonly ParsedChar[]): { initial: number; final: number; tone: number } {
  return parsePinyins(parsed.map(char => `${char.yin}${char.tone || ''}`))
}


function allRows(): Uint32Array {
  return Uint32Array.from({ length: EVAL_ROW_COUNT }, (_, index) => index)
}

export interface EvalState {
  history: PinyinHistoryEntry[]
  information: { i1: number; i2: number; missingI1: number; missingI2: number }
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
    history: [],
    information: { i1: 0, i2: 0, missingI1: 0, missingI2: 0 },
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

export type EvalDegradation = 'none' | 'corpus-saturated' | 'corpus-sparse' | 'invalid'

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
  else if (initial.unique * final.unique <= ENDGAME_PRODUCT_LIMIT)
    degradation = 'corpus-saturated'
  else if (jointPy.unique <= 1)
    degradation = 'corpus-sparse'

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
  observedCount?: number
  sampleSize: number
}

function feedbackStatistics(
  guess: number,
  targets: Uint32Array,
  bits: number,
  skippedValue = -1,
  observed?: number,
): FeedbackStatistics {
  if (!targets.length)
    return { entropy: Number.NaN, sampleSize: 0 }

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
    observedCount,
    sampleSize: targets.length,
    information: observedCount == null || !observedCount
      ? undefined
      : -Math.log2(observedCount / targets.length),
  }
}

interface EvalParticles {
  initials: Uint32Array
  finals: Uint32Array
  weights?: Float64Array
}


export function ratingFromPercentile(percentile: number): Rating {
  if (percentile > 0.99) return 'brilliant'
  if (percentile > 0.90) return 'excellent'
  if (percentile > 0.70) return 'good'
  if (percentile > 0.40) return 'mistake'
  return 'incorrect'
}

export interface EvalDebugEntry {
  word: string
  ei: number
  e1: number
  e2: number
}

export interface EvalBreakdown {
  e1?: number
  e2: number
  i1?: number
  i2?: number
  i1Details?: EvalI1Details
}

export interface EvalI1Details {
  particleHits: number
  particleTotal: number
  particleProbability: number
  realHits: number
  realTotal: number
  realProbability: number
  particleWeight: number
  blendedProbability: number
}


const JOINT_FEEDBACK_BUCKETS = FEEDBACK_BUCKETS ** 3
const jointFeedbackCounts = new Float64Array(JOINT_FEEDBACK_BUCKETS)
const touchedJointFeedback = new Uint32Array(JOINT_FEEDBACK_BUCKETS)

const signatureWeights = new Map<number, number>(
  STRUCTURE_SIGNATURE_KEYS.map((key, index) => [key, STRUCTURE_SIGNATURE_WEIGHTS[index]]),
)


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

export interface EvalResult extends EvalAnalysis {
  e1: number
  playerEI: number
  rating: Rating
  rawPercentile: number
  percentile: number
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
    return { entropy: Number.NaN, sampleSize: 0 }

  let touchedCount = 0
  let totalMass = 0
  for (let index = 0; index < particles.initials.length; index++) {
    const code = jointFeedbackCode(
      guessInitial,
      guessFinal,
      particles.initials[index],
      particles.finals[index],
    )
    if (!jointFeedbackCounts[code])
      touchedJointFeedback[touchedCount++] = code
    const mass = particles.weights ? particles.weights[index] : 1
    jointFeedbackCounts[code] += mass
    totalMass += mass
  }

  let entropy = 0
  let observedCount: number | undefined
  for (let index = 0; index < touchedCount; index++) {
    const code = touchedJointFeedback[index]
    const count = jointFeedbackCounts[code]
    const probability = Math.min(1, count / totalMass)
    entropy -= probability * Math.log2(probability)
    if (code === observed)
      observedCount = count
    jointFeedbackCounts[code] = 0
  }
  if (observed != null && observedCount == null)
    observedCount = 0
  return {
    entropy,
    observedCount,
    sampleSize: particles.initials.length,
    information: observed == null || !observedCount
      ? undefined
      : -Math.log2(Math.min(1, observedCount / totalMass)),
  }
}

function realJointFeedbackCount(
  state: EvalState,
  guessInitial: number,
  guessFinal: number,
  observed: number,
): { hits: number; total: number } | null {
  const rows = state.diagnostics?.ifPyRows
  if (!rows?.length)
    return null

  const initialTuples = getInitialTuples()
  const finalTuples = getFinalTuples()
  let hits = 0
  for (const row of rows) {
    if (jointFeedbackCode(
      guessInitial,
      guessFinal,
      initialTuples[row],
      finalTuples[row],
    ) === observed)
      hits++
  }
  return { hits, total: rows.length }
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}

export function blendI1Probability(
  particleHits: number,
  particleTotal: number,
  realHits: number,
  realTotal: number,
  fullWeightHits = I1_PARTICLE_FULL_WEIGHT_HITS,
): EvalI1Details | null {
  if (particleTotal <= 0 || realTotal <= 0 || realHits <= 0 || fullWeightHits <= 0)
    return null

  const particleProbability = particleHits / particleTotal
  const realProbability = realHits / realTotal
  const particleWeight = smoothstep(particleHits / fullWeightHits)
  const blendedProbability = (1 - particleWeight) * realProbability
    + particleWeight * particleProbability
  if (!(blendedProbability > 0))
    return null

  return {
    particleHits,
    particleTotal,
    particleProbability,
    realHits,
    realTotal,
    realProbability,
    particleWeight,
    blendedProbability,
  }
}

export interface EvalAnalysis extends EvalBreakdown {
  playerEI?: number
  model: 'v3' | 'endgame'
  initialUnique: number
  finalUnique: number
  posteriorProduct: number
  informationBefore: number
  informationIsLowerBound: boolean
  toneWeight: number
  compression: number
  candidateCount: number
  search?: Pick<EndgameSearch, 'status' | 'complete' | 'nodes' | 'candidatesFound' | 'reason'>
  reason?: string
  generationMs: number
  elapsedMs: number
}

interface PlayerAnalysis {
  analysis: EvalAnalysis
  particles?: EvalParticles
  tones: Uint32Array
  v3?: V3Particles
}

let endgamePriorCache: EndgamePrior | undefined
function getEndgamePrior(): EndgamePrior {
  return endgamePriorCache ||= createEndgamePrior(getSyllableCounts(), new Map<number, number>(
    ENDGAME_SIGNATURE_KEYS.map((key, index) => [key, ENDGAME_SIGNATURE_WEIGHTS[index]]),
  ))
}

export function getPosteriorSizes(state: EvalState): { initialUnique: number; finalUnique: number; posteriorProduct: number } {
  const initialUnique = new Set(Array.from(state.initialRows, row => getInitialTuples()[row])).size
  const finalUnique = new Set(Array.from(state.finalRows, row => getFinalTuples()[row])).size
  return { initialUnique, finalUnique, posteriorProduct: initialUnique * finalUnique }
}

function analyzeInternal(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results?: readonly MatchResult[],
  budget?: EndgameBudget,
): PlayerAnalysis {
  const startedAt = performance.now()
  const sizes = getPosteriorSizes(state)
  const informationBefore = combineActualInformation(state.information.i1, state.information.i2)
  const guess = parseParsedTuples(parsedGuess)
  const historySeed = (state.diagnostics?.pinyinHistoryHash ?? SAMPLE_SEED)
    ^ state.initialHistoryHash ^ state.finalHistoryHash ^ CALIBRATION_SEED
  const tones = sampleTuples(state.toneRows, getToneTuples(), state.toneHistoryHash ^ historySeed ^ 0x70AE3)
  const e2 = feedbackEntropy(guess.tone, tones, TONE_BITS)
  // Actual tone information is exact over the entire posterior, not its sample.
  let i2: number | undefined
  if (results && state.toneRows.length) {
    const code = observedCode(parsedGuess, results, 'tone')
    let hits = 0
    for (const row of state.toneRows) {
      if (feedbackCode(guess.tone, getToneTuples()[row], TONE_BITS) === code) hits++
    }
    if (hits) i2 = -Math.log2(hits / state.toneRows.length)
  }

  const analysis: EvalAnalysis = {
    ...sizes,
    model: sizes.posteriorProduct <= ENDGAME_PRODUCT_LIMIT ? 'endgame' : 'v3',
    informationBefore,
    informationIsLowerBound: !!(state.information.missingI1 || state.information.missingI2),
    toneWeight: toneWeightForInformation(informationBefore),
    compression: compressionForInformation(informationBefore, sizes.posteriorProduct),
    candidateCount: 0, e2, i2, generationMs: 0, elapsedMs: 0,
  }
  let particles: EvalParticles | undefined
  let v3: V3Particles | undefined
  if (analysis.model === 'endgame') {
    const search = enumerateEndgame(state.history, getEndgamePrior(), budget)
    analysis.search = { status: search.status, complete: search.complete, nodes: search.nodes,
      candidatesFound: search.candidatesFound, reason: search.reason }
    if (search.status === 'complete') particles = search
    else analysis.reason = search.reason
  }
  else {
    v3 = createV3Particles(state) || undefined
    particles = v3
    if (!particles) analysis.reason = '声韵联合后验不可用，本猜不评价'
  }
  analysis.generationMs = performance.now() - startedAt
  if (particles && particles.initials.length && Number.isFinite(e2)) {
    analysis.candidateCount = particles.initials.length
    const observed = results
      ? observedCode(parsedGuess, results, 'initial')
        + observedCode(parsedGuess, results, 'final') * FEEDBACK_BUCKETS
        + observedCode(parsedGuess, results, 'pinyin') * FEEDBACK_BUCKETS ** 2
      : undefined
    const base = jointFeedbackStatistics(guess.initial, guess.final, particles, observed)
    analysis.e1 = base.entropy
    analysis.playerEI = combineExpectedInformation(base.entropy, e2, analysis.toneWeight)
    if (analysis.model === 'endgame') {
      analysis.i1 = base.information
    }
    else if (observed != null) {
      const real = realJointFeedbackCount(state, guess.initial, guess.final, observed)
      const details = real && base.observedCount != null
        ? blendI1Probability(base.observedCount, base.sampleSize, real.hits, real.total)
        : null
      analysis.i1Details = details || undefined
      analysis.i1 = details ? -Math.log2(details.blendedProbability) : undefined
    }
  }
  else if (!analysis.reason) {
    analysis.reason = '声调后验为空，本猜不评价'
  }
  analysis.elapsedMs = performance.now() - startedAt
  return { analysis, particles, tones, v3 }
}

/** Reconstruct actual information without redoing the 1000-word ranking. */
export function analyzeGuess(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results: readonly MatchResult[],
  budget?: EndgameBudget,
): EvalAnalysis {
  return analyzeInternal(state, parsedGuess, results, budget).analysis
}

function rankAnalysis(
  state: EvalState,
  context: PlayerAnalysis,
  includeDebug: boolean,
): EvalResult | null {
  const { analysis, particles, tones, v3 } = context
  const { e1, playerEI } = analysis
  if (!particles || e1 == null || playerEI == null || !Number.isFinite(playerEI))
    return null

  const rankingStartedAt = performance.now()
  const sampledInitials = getSampledInitials()
  const sampledFinals = getSampledFinals()
  const sampledTones = getSampledTones()
  const entries: EvalDebugEntry[] | undefined = includeDebug ? [] : undefined
  let lowerCount = 0
  for (let index = 0; index < SAMPLE_SIZE; index++) {
    const benchmarkE1 = jointFeedbackEntropy(sampledInitials[index], sampledFinals[index], particles)
    const benchmarkE2 = feedbackEntropy(sampledTones[index], tones, TONE_BITS)
    const entropy = combineExpectedInformation(benchmarkE1, benchmarkE2, analysis.toneWeight)
    if (entropy < playerEI) lowerCount++
    entries?.push({ word: SAMPLED_WORDS[index], ei: entropy, e1: benchmarkE1, e2: benchmarkE2 })
  }
  entries?.sort((left, right) => right.ei - left.ei)
  const rankingMs = performance.now() - rankingStartedAt
  const rawPercentile = lowerCount / SAMPLE_SIZE
  const percentile = compressPercentile(rawPercentile, analysis.compression)
  return {
    ...analysis, e1, playerEI, rawPercentile, percentile,
    rating: ratingFromPercentile(percentile), rank: lowerCount, total: SAMPLE_SIZE,
    initialPosterior: state.initialRows.length,
    finalPosterior: state.finalRows.length,
    tonePosterior: state.toneRows.length,
    initialParticles: particles.initials.length,
    finalParticles: particles.finals.length,
    toneParticles: tones.length,
    effectiveHypotheses: v3?.effectiveHypotheses ?? 0,
    lambda: v3?.lambda ?? 0,
    realParticles: v3?.realCount ?? 0,
    virtualParticles: v3?.virtualCount ?? 0,
    attempts: v3?.attempts ?? 0,
    accepted: v3?.accepted ?? 0,
    acceptanceRate: v3?.attempts ? v3.accepted / v3.attempts : 0,
    invalidSyllableRejected: v3?.invalidSyllableRejected ?? 0,
    pinyinHistoryRejected: v3?.pinyinHistoryRejected ?? 0,
    clippedSignatureCount: v3?.clippedSignatureCount ?? 0,
    candidateEffective: v3?.candidateEffective ?? 0,
    resampledEffective: v3?.resampledEffective ?? 0,
    fallback: v3?.fallback ?? false,
    rankingMs, elapsedMs: analysis.elapsedMs + rankingMs, sampled: entries,
  }
}

/** Pure pre-guess score: actual feedback affects I only, never this guess's E/rank. */
export function evaluate(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  includeDebug = false,
  results?: readonly MatchResult[],
  budget?: EndgameBudget,
): EvalResult | null {
  return rankAnalysis(state, analyzeInternal(state, parsedGuess, results, budget), includeDebug)
}

/** Single session step shared by live play and replay, including paused searches. */
export function advanceEvaluation(
  state: EvalState,
  parsedGuess: readonly ParsedChar[],
  results: readonly MatchResult[],
  options: { rank?: boolean; includeDebug?: boolean; budget?: EndgameBudget } = {},
): { analysis: EvalAnalysis; result: EvalResult | null; valid: boolean } {
  const context = analyzeInternal(state, parsedGuess, results, options.budget)
  const result = options.rank === false ? null : rankAnalysis(state, context, !!options.includeDebug)
  const valid = updateState(state, parsedGuess, results, context.analysis)
  return { analysis: context.analysis, result, valid }
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
  analysis = analyzeGuess(state, parsedGuess, results),
): boolean {
  const guess = parseParsedTuples(parsedGuess)
  const initialCode = observedCode(parsedGuess, results, 'initial')
  const finalCode = observedCode(parsedGuess, results, 'final')
  const toneCode = observedCode(parsedGuess, results, 'tone')
  const pinyinCode = observedCode(parsedGuess, results, 'pinyin')
  state.history.push({ guessInitial: guess.initial, guessFinal: guess.final, initialCode, finalCode, code: pinyinCode })
  if (analysis.i1 != null && Number.isFinite(analysis.i1)) state.information.i1 += analysis.i1
  else state.information.missingI1++
  if (analysis.i2 != null && Number.isFinite(analysis.i2)) state.information.i2 += analysis.i2
  else state.information.missingI2++

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
  getEndgamePrior,
  jointFeedbackStatistics,
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
