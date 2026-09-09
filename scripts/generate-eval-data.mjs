import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEvalCorpusVersion } from './lib/eval-corpus-version.mjs'
import { FINALS, INITIALS, parseIdiomPinyin, readIdiomSource } from './lib/idiom-source.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(scriptDir, '../src/eval/data.ts')
const versionOutputPath = resolve(scriptDir, '../src/eval/corpus-version.ts')

const INITIAL_BITS = 5
const FINAL_BITS = 6
const TONE_BITS = 3
const SAMPLE_SIZE = 1000
const SAMPLE_SEED = 42
const CALIBRATION_PAIRINGS = 1_000_000
const CALIBRATION_SEED = 0x56330001
const ENDGAME_CALIBRATION_SEED = 0x56340001
const SIGNATURE_WEIGHT_MIN = 1 / 16
const SIGNATURE_WEIGHT_MAX = 16

const initialIndex = new Map(INITIALS.map((value, index) => [value, index]))
const finalIndex = new Map(FINALS.map((value, index) => [value, index]))

function packTuple(values, bits) {
  let packed = 0
  for (let position = 0; position < 4; position++)
    packed |= values[position] << (position * bits)
  return packed >>> 0
}

function encodeUint32(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4)
  for (let index = 0; index < values.length; index++)
    buffer.writeUInt32LE(values[index], index * 4)
  return buffer.toString('base64')
}

function equalityPattern(values) {
  const ids = new Map()
  let next = 0
  let code = 0
  for (let position = 0; position < 4; position++) {
    const value = values[position]
    if (!ids.has(value))
      ids.set(value, next++)
    code |= ids.get(value) << (position * 2)
  }
  return code
}

function structureSignature(initials, finals) {
  const pinyins = initials.map((initial, position) =>
    initial * FINALS.length + finals[position])
  return equalityPattern(initials)
    | equalityPattern(finals) << 8
    | equalityPattern(pinyins) << 16
}

function unpackTuple(tuple, bits) {
  const mask = (1 << bits) - 1
  return Array.from({ length: 4 }, (_, position) =>
    tuple >>> (position * bits) & mask)
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

const sourceRows = readIdiomSource()
const corpusVersion = createEvalCorpusVersion(sourceRows)
const rows = sourceRows.map((source) => {
  const parsed = parseIdiomPinyin(source)
  return {
    word: Array.from(source.word),
    initial: parsed.map(value => value.initial),
    final: parsed.map(value => value.final),
    tone: parsed.map(value => value.tone),
  }
})

const initialTuples = new Uint32Array(rows.length)
const finalTuples = new Uint32Array(rows.length)
const toneTuples = new Uint32Array(rows.length)
const syllableCounts = new Uint32Array(INITIALS.length * FINALS.length)
const initialCounts = new Uint32Array(INITIALS.length)
const finalCounts = new Uint32Array(FINALS.length)
const realSignatureCounts = new Map()

for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
  const row = rows[rowIndex]
  if (row.initial.length !== 4 || row.final.length !== 4 || row.tone.length !== 4 || row.word.length !== 4)
    throw new Error(`Invalid idiom row ${rowIndex}`)

  const initials = row.initial.map((value) => {
    const index = initialIndex.get(value)
    if (index == null)
      throw new Error(`Unknown initial ${value} in ${row.word.join('')}`)
    return index
  })
  const finals = row.final.map((value) => {
    const index = finalIndex.get(value)
    if (index == null)
      throw new Error(`Unknown final ${value} in ${row.word.join('')}`)
    return index
  })
  const tones = row.tone.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 4)
      throw new Error(`Unknown tone ${value} in ${row.word.join('')}`)
    return value
  })

  initialTuples[rowIndex] = packTuple(initials, INITIAL_BITS)
  finalTuples[rowIndex] = packTuple(finals, FINAL_BITS)
  toneTuples[rowIndex] = packTuple(tones, TONE_BITS)
  for (let position = 0; position < 4; position++) {
    syllableCounts[initials[position] * FINALS.length + finals[position]]++
    initialCounts[initials[position]]++
    finalCounts[finals[position]]++
  }
  const signature = structureSignature(initials, finals)
  realSignatureCounts.set(signature, (realSignatureCounts.get(signature) || 0) + 1)
}

const slotCount = rows.length * 4
const calibrationRandom = mulberry32(CALIBRATION_SEED)
const baseSignatureMass = new Map()
let totalBaseMass = 0
let validCalibrationPairings = 0

for (let iteration = 0; iteration < CALIBRATION_PAIRINGS; iteration++) {
  const initialTuple = initialTuples[Math.floor(calibrationRandom() * rows.length)]
  const finalTuple = finalTuples[Math.floor(calibrationRandom() * rows.length)]
  const initials = unpackTuple(initialTuple, INITIAL_BITS)
  const finals = unpackTuple(finalTuple, FINAL_BITS)
  let weight = 1
  let valid = true

  for (let position = 0; position < 4; position++) {
    const joint = syllableCounts[initials[position] * FINALS.length + finals[position]]
    if (!joint) {
      valid = false
      break
    }
    weight *= joint * slotCount / (initialCounts[initials[position]] * finalCounts[finals[position]])
  }
  if (!valid || !Number.isFinite(weight) || weight <= 0)
    continue

  const signature = structureSignature(initials, finals)
  baseSignatureMass.set(signature, (baseSignatureMass.get(signature) || 0) + weight)
  totalBaseMass += weight
  validCalibrationPairings++
}

if (!validCalibrationPairings || !totalBaseMass)
  throw new Error('Calibration pairing produced no valid candidates')

const signatureKeys = [...new Set([
  ...realSignatureCounts.keys(),
  ...baseSignatureMass.keys(),
])].sort((left, right) => left - right)
const signatureWeights = signatureKeys.map((signature) => {
  const realProbability = (realSignatureCounts.get(signature) || 0) / rows.length
  const baseProbability = (baseSignatureMass.get(signature) || 0) / totalBaseMass
  const raw = (realProbability + 1 / rows.length)
    / (baseProbability + 1 / validCalibrationPairings)
  return Math.max(SIGNATURE_WEIGHT_MIN, Math.min(SIGNATURE_WEIGHT_MAX, raw))
})

// Endgame starts from iid syllables, NOT re-paired corpus tuples. Pool position
// permutations of each signature so the correction cannot add position priors.
const orbitCache = new Map()
function signatureOrbit(signature) {
  if (orbitCache.has(signature)) return orbitCache.get(signature)
  const patterns = [0, 8, 16].map(shift =>
    Array.from({ length: 4 }, (_, p) => signature >>> (shift + p * 2) & 3))
  let key = Infinity
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (b === a) continue
      for (let c = 0; c < 4; c++) {
        if (c === a || c === b) continue
        const order = [a, b, c, 6 - a - b - c]
        const code = patterns.reduce((value, pattern, dim) =>
          value | equalityPattern(order.map(p => pattern[p])) << (dim * 8), 0)
        key = Math.min(key, code)
      }
    }
  }
  orbitCache.set(signature, key)
  return key
}

const endgameReal = new Map()
for (const [signature, count] of realSignatureCounts) {
  const key = signatureOrbit(signature)
  endgameReal.set(key, (endgameReal.get(key) || 0) + count)
}
// Sampling uniformly from the slot list is exactly sampling from q(s).
const slots = []
for (let pair = 0; pair < syllableCounts.length; pair++) {
  for (let n = 0; n < syllableCounts[pair]; n++) slots.push(pair)
}
const endgameRandom = mulberry32(ENDGAME_CALIBRATION_SEED)
const endgameBase = new Map()
for (let iteration = 0; iteration < CALIBRATION_PAIRINGS; iteration++) {
  const pairs = Array.from({ length: 4 }, () => slots[Math.floor(endgameRandom() * slotCount)])
  const key = signatureOrbit(structureSignature(
    pairs.map(pair => Math.floor(pair / FINALS.length)),
    pairs.map(pair => pair % FINALS.length),
  ))
  endgameBase.set(key, (endgameBase.get(key) || 0) + 1)
}
const endgameKeys = [...new Set([...endgameReal.keys(), ...endgameBase.keys()])].sort((a, b) => a - b)
const endgameWeights = endgameKeys.map((key) => {
  const real = ((endgameReal.get(key) || 0) + 1) / rows.length
  const base = ((endgameBase.get(key) || 0) + 1) / CALIBRATION_PAIRINGS
  return Math.max(SIGNATURE_WEIGHT_MIN, Math.min(SIGNATURE_WEIGHT_MAX, real / base))
})

const random = mulberry32(SAMPLE_SEED)
const indices = Array.from({ length: rows.length }, (_, index) => index)
for (let index = 0; index < SAMPLE_SIZE; index++) {
  const swapIndex = index + Math.floor(random() * (indices.length - index))
  ;[indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]]
}

const sampledIndices = indices.slice(0, SAMPLE_SIZE)
const sampledInitials = sampledIndices.map(index => initialTuples[index])
const sampledFinals = sampledIndices.map(index => finalTuples[index])
const sampledTones = sampledIndices.map(index => toneTuples[index])
const sampledWords = sampledIndices.map(index => rows[index].word.join(''))

const output = `// Auto-generated by scripts/generate-eval-data.mjs
// Do not edit manually.

export const EVAL_ROW_COUNT = ${rows.length}
export const SAMPLE_SIZE = ${SAMPLE_SIZE}
export const SAMPLE_SEED = ${SAMPLE_SEED}
export const CALIBRATION_SEED = ${CALIBRATION_SEED}
export const INITIAL_BITS = ${INITIAL_BITS}
export const FINAL_BITS = ${FINAL_BITS}
export const TONE_BITS = ${TONE_BITS}
export const NULL_INITIAL_ID = ${initialIndex.get('null')}
export const PINYIN_ID_COUNT = ${INITIALS.length * FINALS.length}
export const SLOT_COUNT = ${slotCount}
export const LEGAL_PINYIN_COUNT = ${Array.from(syllableCounts).filter(Boolean).length}
export const SIGNATURE_WEIGHT_MIN = ${SIGNATURE_WEIGHT_MIN}
export const SIGNATURE_WEIGHT_MAX = ${SIGNATURE_WEIGHT_MAX}

export const INITIALS = ${JSON.stringify(INITIALS)} as const
export const FINALS = ${JSON.stringify(FINALS)} as const

// Little-endian packed uint32 tuples, four element ids per tuple.
export const INITIAL_TUPLES_BASE64 = '${encodeUint32(initialTuples)}'
export const FINAL_TUPLES_BASE64 = '${encodeUint32(finalTuples)}'
export const TONE_TUPLES_BASE64 = '${encodeUint32(toneTuples)}'
export const SYLLABLE_COUNTS_BASE64 = '${encodeUint32(syllableCounts)}'
export const INITIAL_SLOT_COUNTS_BASE64 = '${encodeUint32(initialCounts)}'
export const FINAL_SLOT_COUNTS_BASE64 = '${encodeUint32(finalCounts)}'
export const STRUCTURE_SIGNATURE_KEYS = ${JSON.stringify(signatureKeys)} as const
export const STRUCTURE_SIGNATURE_WEIGHTS = ${JSON.stringify(signatureWeights.map(value => Number(value.toFixed(8))))} as const
export const ENDGAME_CALIBRATION_SEED = ${ENDGAME_CALIBRATION_SEED}
export const ENDGAME_SIGNATURE_KEYS = ${JSON.stringify(endgameKeys)} as const
export const ENDGAME_SIGNATURE_WEIGHTS = ${JSON.stringify(endgameWeights)} as const
export const SAMPLED_INITIALS_BASE64 = '${encodeUint32(sampledInitials)}'
export const SAMPLED_FINALS_BASE64 = '${encodeUint32(sampledFinals)}'
export const SAMPLED_TONES_BASE64 = '${encodeUint32(sampledTones)}'
export const SAMPLED_WORDS = ${JSON.stringify(sampledWords)} as const
`

writeFileSync(outputPath, output, 'utf8')
writeFileSync(versionOutputPath, `// Auto-generated by scripts/generate-eval-data.mjs
// Do not edit manually.

export const EVAL_CORPUS_VERSION = '${corpusVersion}'
`, 'utf8')
console.log(`Generated ${rows.length} tuple rows and ${SAMPLE_SIZE} samples`)
console.log(`Calibrated ${signatureKeys.length} signatures from ${validCalibrationPairings} valid pairings`)
console.log(`Evaluation corpus version: ${corpusVersion}`)
console.log(`Output: ${outputPath} (${(Buffer.byteLength(output) / 1024).toFixed(1)} KiB)`)
console.log(`Version output: ${versionOutputPath}`)
