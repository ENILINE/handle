import { createRequire } from 'node:module'
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compareWords, projectRoot, readIdiomSource } from './lib/idiom-source.mjs'

const require = createRequire(import.meta.url)
const pinyin = require('pinyin/lib/web-pinyin.js')
const rows = readIdiomSource()

function getDefaultPinyin(word) {
  return pinyin(word, { style: pinyin.STYLE_TONE2 }).map(item => item[0]).join(' ')
}

const plainWords = []
const polyphones = []
for (const row of rows) {
  if (getDefaultPinyin(row.word) === row.pinyin)
    plainWords.push(row.word)
  else
    polyphones.push([row.word, row.pinyin])
}
plainWords.sort(compareWords)
polyphones.sort(([a], [b]) => compareWords(a, b))

writeFileSync(resolve(projectRoot, 'src/data/idioms.txt'), plainWords.join('\n'), 'utf8')
writeFileSync(
  resolve(projectRoot, 'src/data/polyphones.json'),
  JSON.stringify(Object.fromEntries(polyphones), null, 2),
  'utf8',
)

const byChar = new Map()
for (const row of rows) {
  const first = Array.from(row.word)[0]
  if (!byChar.has(first))
    byChar.set(first, [])
  byChar.get(first).push(row)
}

const targetBuckets = 50
const targetPerBucket = Math.ceil(rows.length / targetBuckets)
const charEntries = [...byChar.entries()]
  .map(([char, entries]) => ({ char, entries, count: entries.length }))
  .sort((a, b) => b.count - a.count)

const buckets = []
for (const { char, entries } of charEntries) {
  let best = null
  let bestCount = Infinity
  for (const bucket of buckets) {
    if (bucket.count < bestCount) {
      best = bucket
      bestCount = bucket.count
    }
  }
  if (!best || (bestCount > targetPerBucket && buckets.length < targetBuckets * 2)) {
    best = { chars: [], entries: [], count: 0 }
    buckets.push(best)
  }
  best.chars.push(char)
  best.entries.push(...entries)
  best.count += entries.length
}

const outputDir = resolve(projectRoot, 'public/idiom-data')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) {
  if (/^idiom_\d+\.json$/.test(file))
    unlinkSync(resolve(outputDir, file))
}

const index = {}
for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
  const bucketId = String(bucketIndex).padStart(2, '0')
  const data = {}
  for (const row of buckets[bucketIndex].entries) {
    data[row.word] = {
      e: row.explanation,
      d: row.derivation,
      x: row.example,
    }
  }
  writeFileSync(resolve(outputDir, `idiom_${bucketId}.json`), JSON.stringify(data), 'utf8')
  for (const char of buckets[bucketIndex].chars)
    index[char] = bucketId
}

writeFileSync(
  resolve(projectRoot, 'src/data/idiom_index.json'),
  `${JSON.stringify(index)}\n`,
  'utf8',
)

const explanationBytes = readdirSync(outputDir)
  .filter(file => /^idiom_\d+\.json$/.test(file))
  .reduce((total, file) => total + statSync(resolve(outputDir, file)).size, 0)

console.log(`Generated ${plainWords.length} default-pinyin idioms and ${polyphones.length} overrides`)
console.log(`Generated ${rows.length} explanations in ${buckets.length} files (${explanationBytes} bytes)`)
