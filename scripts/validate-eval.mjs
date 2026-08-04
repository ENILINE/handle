/**
 * Validate the pinyin-based element conversion against jsonl ground truth.
 * Run: node scripts/validate-eval.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const jsonlPath = resolve(__dirname, '../playground/idioms.jsonl')
const lines = readFileSync(jsonlPath, 'utf-8').trim().split('\n')

// Same ELEMENTS order as eval-data.ts
const ELEMENTS = [
  'b', 'c', 'ch', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n',
  'null', 'p', 'q', 'r', 's', 'sh', 't', 'w', 'x', 'y', 'z', 'zh',
  'a', 'ai', 'an', 'ang', 'ao',
  'e', 'ei', 'en', 'eng', 'er',
  'i', 'ia', 'ian', 'iang', 'iao', 'ie', 'in', 'ing', 'iong', 'iu',
  'o', 'ong', 'ou',
  'u', 'ua', 'uai', 'uan', 'uang', 'ue', 'ui', 'un', 'uo',
  'v', 've',
]

const elementIndex = new Map(ELEMENTS.map((e, i) => [e, i]))

// Parse from jsonl (ground truth)
function parseJsonl(line) {
  const obj = JSON.parse(line)
  const elemMasks = new Map()
  for (let i = 0; i < 4; i++) {
    const init = obj.initial[i]
    const fin = obj.final[i]
    const mask = 1 << i
    if (elemMasks.has(init)) elemMasks.set(init, elemMasks.get(init) | mask)
    else elemMasks.set(init, mask)
    if (elemMasks.has(fin)) elemMasks.set(fin, elemMasks.get(fin) | mask)
    else elemMasks.set(fin, mask)
  }
  // Convert to sorted [idx, mask] pairs
  const pairs = []
  for (const [name, mask] of elemMasks) {
    const idx = elementIndex.get(name)
    if (idx !== undefined) pairs.push([idx, mask])
  }
  pairs.sort((a, b) => a[0] - b[0])
  return new Map(pairs.map(([i, m]) => [ELEMENTS[i], m]))
}

// Parse from pinyin (our runtime conversion)
function splitPinyin(base) {
  const initials = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'w', 'y']
  for (const ini of initials) {
    if (base.startsWith(ini)) {
      return [ini, base.slice(ini.length)]
    }
  }
  return ['null', base]
}

// parse each word string using splitPinyin (no pinyin library needed —
// the jsonl already has the word array, we can just check our conversion)
// Actually, we need pinyin data to test the conversion. Let's use the jsonl
// data directly: each entry has the word characters.

// For each sampled idiom, build element data from jsonl's initial/final fields
// Then compare with what our splitPinyin would produce for each character's pinyin

// To test splitPinyin, we need the actual pinyin of each character.
// The jsonl doesn't store pinyin strings, only separated initial/final/tone.
// We can RECONSTRUCT the pinyin string from initial + final + tone:
// - If initial is "null": pinyin = final
// - Otherwise: pinyin = initial + final
// Then append tone number

function reconstructPinyin(initial, final, tone) {
  // jsonl: null initial = zero-initial syllable, final is the base pinyin
  const base = initial === 'null' ? final : initial + final
  return base + tone
}

// Validate: for each idiom, reconstruct pinyin, then splitPinyin, compare with jsonl
const SAMPLE_COUNT = 500
let mismatches = 0
let total = 0
const mismatchExamples = []

for (let s = 0; s < SAMPLE_COUNT; s++) {
  // Pick random lines
  const idx = Math.floor(Math.random() * lines.length)
  const obj = JSON.parse(lines[idx])
  const jsonlElements = parseJsonl(lines[idx])

  // Reconstruct pinyin for each position and run splitPinyin
  const pinyinElements = new Map()
  for (let i = 0; i < 4; i++) {
    const py = reconstructPinyin(obj.initial[i], obj.final[i], obj.tone[i])
    const base = py.replace(/[\d]$/, '')
    const [initial, final] = splitPinyin(base)
    const mask = 1 << i
    if (initial) pinyinElements.set(initial, (pinyinElements.get(initial) || 0) | mask)
    if (final) pinyinElements.set(final, (pinyinElements.get(final) || 0) | mask)
  }

  // Compare
  const allKeys = new Set([...jsonlElements.keys(), ...pinyinElements.keys()])
  for (const key of allKeys) {
    total++
    const jm = jsonlElements.get(key)
    const pm = pinyinElements.get(key)
    if (jm !== pm) {
      mismatches++
      if (mismatchExamples.length < 10) {
        mismatchExamples.push({
          word: obj.word.join(''),
          element: key,
          jsonl: jm,
          pinyin: pm,
          initials: obj.initial,
          finals: obj.final,
          tones: obj.tone,
        })
      }
    }
  }

  if (mismatches > 0 && mismatchExamples.length === 10) {
    // Already have enough examples
  }
}

console.log(`Checked ${total} element-position pairs across ${SAMPLE_COUNT} idioms`)
console.log(`Mismatches: ${mismatches} (${(mismatches / total * 100).toFixed(2)}%)`)

if (mismatchExamples.length > 0) {
  console.log('\nExample mismatches:')
  for (const ex of mismatchExamples) {
    console.log(`  Word: ${ex.word}`)
    console.log(`  Element: ${ex.element}, jsonl mask: ${ex.jsonl}, pinyin mask: ${ex.pinyin}`)
    console.log(`  Initials: ${ex.initials}, Finals: ${ex.finals}, Tones: ${ex.tones}`)
    // Reconstruct pinyins
    const pys = []
    for (let i = 0; i < 4; i++) {
      pys.push(reconstructPinyin(ex.initials[i], ex.finals[i], ex.tones[i]))
    }
    console.log(`  Reconstructed pinyins: ${pys}`)
    console.log()
  }
}