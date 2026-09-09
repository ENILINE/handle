import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEvalCorpusVersion } from './lib/eval-corpus-version.mjs'
import { FINALS, INITIALS, compareWords, parseIdiomPinyin, projectRoot, readIdiomSource } from './lib/idiom-source.mjs'

const require = createRequire(import.meta.url)
const pinyin = require('pinyin/lib/web-pinyin.js')
const rows = readIdiomSource()
const sourceByWord = new Map(rows.map(row => [row.word, row]))

const plainWords = readFileSync(resolve(projectRoot, 'src/data/idioms.txt'), 'utf8')
  .split(/\r?\n/)
  .map(word => word.trim())
  .filter(Boolean)
const plainWordSet = new Set(plainWords)
const polyphones = JSON.parse(readFileSync(resolve(projectRoot, 'src/data/polyphones.json'), 'utf8'))
const polyphoneWords = Object.keys(polyphones)
const runtimeWords = new Set([...plainWords, ...Object.keys(polyphones)])

if (plainWords.length + Object.keys(polyphones).length !== runtimeWords.size)
  throw new Error('Runtime idiom files overlap or contain duplicates')
if (plainWords.some((word, index) => index > 0 && compareWords(plainWords[index - 1], word) >= 0))
  throw new Error('src/data/idioms.txt is not strictly sorted')
if (polyphoneWords.some((word, index) => index > 0 && compareWords(polyphoneWords[index - 1], word) >= 0))
  throw new Error('src/data/polyphones.json is not strictly sorted')
if (runtimeWords.size !== sourceByWord.size)
  throw new Error(`Runtime/source count mismatch: ${runtimeWords.size}/${sourceByWord.size}`)

for (const row of rows) {
  const actual = pinyin(row.word, { style: pinyin.STYLE_TONE2 }).map(item => item[0]).join(' ')
  if (actual === row.pinyin) {
    if (!plainWordSet.has(row.word) || row.word in polyphones)
      throw new Error(`Default-pinyin idiom is in the wrong runtime file: ${row.word}`)
  }
  else if (polyphones[row.word] !== row.pinyin) {
    throw new Error(`Missing or incorrect pinyin override for ${row.word}`)
  }
}

const index = JSON.parse(readFileSync(resolve(projectRoot, 'src/data/idiom_index.json'), 'utf8'))
const explanationWords = new Set()
const explanationDir = resolve(projectRoot, 'public/idiom-data')
for (const file of readdirSync(explanationDir).filter(file => /^idiom_\d+\.json$/.test(file))) {
  const bucketId = file.match(/idiom_(\d+)\.json/)[1]
  const data = JSON.parse(readFileSync(resolve(explanationDir, file), 'utf8'))
  for (const [word, info] of Object.entries(data)) {
    const source = sourceByWord.get(word)
    if (!source)
      throw new Error(`Unknown explanation entry ${word}`)
    if (explanationWords.has(word))
      throw new Error(`Duplicate explanation entry ${word}`)
    if (index[Array.from(word)[0]] !== bucketId)
      throw new Error(`Incorrect explanation index for ${word}`)
    if (info.e !== source.explanation || info.d !== source.derivation || info.x !== source.example)
      throw new Error(`Explanation mismatch for ${word}`)
    explanationWords.add(word)
  }
}
if (explanationWords.size !== sourceByWord.size)
  throw new Error(`Explanation/source count mismatch: ${explanationWords.size}/${sourceByWord.size}`)

const evalData = readFileSync(resolve(projectRoot, 'src/eval/data.ts'), 'utf8')
const evalRowCount = Number(evalData.match(/export const EVAL_ROW_COUNT = (\d+)/)?.[1])
if (evalRowCount !== rows.length)
  throw new Error(`Evaluation/source count mismatch: ${evalRowCount}/${rows.length}`)

const corpusVersionSource = readFileSync(resolve(projectRoot, 'src/eval/corpus-version.ts'), 'utf8')
const generatedCorpusVersion = corpusVersionSource.match(/export const EVAL_CORPUS_VERSION = '([0-9a-f]{16})'/)?.[1]
const expectedCorpusVersion = createEvalCorpusVersion(rows)
if (generatedCorpusVersion !== expectedCorpusVersion) {
  throw new Error(
    `Evaluation corpus version mismatch: ${generatedCorpusVersion || 'missing'}/${expectedCorpusVersion}; run pnpm data:build`,
  )
}

function readBase64Export(name) {
  const value = evalData.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]
  if (!value)
    throw new Error(`Missing evaluation export ${name}`)
  return Buffer.from(value, 'base64')
}

function packTuple(values, ids, bits, word) {
  let packed = 0
  for (let position = 0; position < 4; position++) {
    const id = ids.get(values[position])
    if (id == null)
      throw new Error(`Unknown evaluation value ${values[position]} in ${word}`)
    packed |= id << (position * bits)
  }
  return packed >>> 0
}

const initialIds = new Map(INITIALS.map((value, index) => [value, index]))
const finalIds = new Map(FINALS.map((value, index) => [value, index]))
const toneIds = new Map(Array.from({ length: 5 }, (_, value) => [value, value]))
const initialTuples = readBase64Export('INITIAL_TUPLES_BASE64')
const finalTuples = readBase64Export('FINAL_TUPLES_BASE64')
const toneTuples = readBase64Export('TONE_TUPLES_BASE64')
for (const [name, buffer] of [['initial', initialTuples], ['final', finalTuples], ['tone', toneTuples]]) {
  if (buffer.length !== rows.length * 4)
    throw new Error(`Invalid ${name} tuple byte length: ${buffer.length}`)
}

for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
  const parsed = parseIdiomPinyin(rows[rowIndex])
  const expectedInitial = packTuple(parsed.map(value => value.initial), initialIds, 5, rows[rowIndex].word)
  const expectedFinal = packTuple(parsed.map(value => value.final), finalIds, 6, rows[rowIndex].word)
  const expectedTone = packTuple(parsed.map(value => value.tone), toneIds, 3, rows[rowIndex].word)
  if (initialTuples.readUInt32LE(rowIndex * 4) !== expectedInitial
    || finalTuples.readUInt32LE(rowIndex * 4) !== expectedFinal
    || toneTuples.readUInt32LE(rowIndex * 4) !== expectedTone) {
    throw new Error(`Evaluation tuple mismatch for ${rows[rowIndex].word}`)
  }
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

const sampleSize = Number(evalData.match(/export const SAMPLE_SIZE = (\d+)/)?.[1])
const sampleSeed = Number(evalData.match(/export const SAMPLE_SEED = (\d+)/)?.[1])
const sampledWordsSource = evalData.match(/export const SAMPLED_WORDS = (\[[^\n]+\]) as const/)?.[1]
if (!sampledWordsSource)
  throw new Error('Missing evaluation export SAMPLED_WORDS')
const sampledWords = JSON.parse(sampledWordsSource)
const sampleRandom = mulberry32(sampleSeed)
const indices = Array.from({ length: rows.length }, (_, index) => index)
for (let index = 0; index < sampleSize; index++) {
  const swapIndex = index + Math.floor(sampleRandom() * (indices.length - index))
  ;[indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]]
}
const expectedSampledWords = indices.slice(0, sampleSize).map(index => rows[index].word)
if (JSON.stringify(sampledWords) !== JSON.stringify(expectedSampledWords))
  throw new Error('Evaluation benchmark words do not match the canonical source')

console.log(`Validated ${rows.length} canonical idioms`)
console.log(`Runtime split: ${plainWords.length} default pinyin, ${Object.keys(polyphones).length} overrides`)
console.log(`Explanation entries: ${explanationWords.size}; verified evaluation tuples: ${evalRowCount}`)
console.log(`Evaluation corpus version: ${generatedCorpusVersion}`)
