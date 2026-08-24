/**
 * Validate the V2 pinyin tuple convention against every jsonl row.
 * Run: node scripts/validate-eval.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const jsonlPath = resolve(scriptDir, '../playground/idioms.jsonl')

function splitPinyin(syllable) {
  const base = syllable.replace(/[\d]$/, '')
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

const rows = readFileSync(jsonlPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .map(line => JSON.parse(line))

let syllableCount = 0
for (const row of rows) {
  for (let position = 0; position < 4; position++) {
    const expectedInitial = row.initial[position]
    const expectedFinal = row.final[position]
    const syllable = `${expectedInitial === 'null' ? '' : expectedInitial}${expectedFinal}${row.tone[position]}`
    const [actualInitial, actualFinal] = splitPinyin(syllable)
    if (actualInitial !== expectedInitial || actualFinal !== expectedFinal) {
      throw new Error(
        `${row.word.join('')}[${position}] expected ${expectedInitial}/${expectedFinal}, got ${actualInitial}/${actualFinal}`,
      )
    }
    syllableCount++
  }
}

console.log(`Validated ${syllableCount} syllables across ${rows.length} idioms`)
