import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))

export const projectRoot = resolve(scriptDir, '../..')
export const idiomSourcePath = resolve(projectRoot, 'data/idioms.jsonl')

export const INITIALS = [
  'null', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'r', 'z', 'c', 's', 'zh', 'ch', 'sh', 'y', 'w',
]

export const FINALS = [
  'a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er',
  'i', 'ia', 'ian', 'iang', 'iao', 'ie', 'in', 'ing', 'iong', 'iu',
  'o', 'ong', 'ou', 'u', 'ua', 'uai', 'uan', 'uang', 'ue', 'ui',
  'un', 'uo', 'v', 've',
]

const INITIAL_MATCH_ORDER = [
  'zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'w', 'y',
]
const finalSet = new Set(FINALS)

export function compareWords(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function parsePinyinSyllable(syllable, context = syllable) {
  const match = syllable.match(/^([a-z]+)([0-4])?$/)
  if (!match)
    throw new Error(`Invalid pinyin syllable ${syllable} in ${context}`)

  const body = match[1]
  const initial = INITIAL_MATCH_ORDER.find(value => body.startsWith(value)) || 'null'
  const final = body.slice(initial === 'null' ? 0 : initial.length)
  if (!finalSet.has(final))
    throw new Error(`Unknown final ${final || '(empty)'} in ${context}`)

  return {
    initial,
    final,
    tone: Number(match[2] || 0),
  }
}

export function parseIdiomPinyin(row) {
  const syllables = row.pinyin.trim().split(/\s+/)
  if (syllables.length !== 4)
    throw new Error(`Expected four pinyin syllables in ${row.word}, got ${syllables.length}`)
  return syllables.map((syllable, position) =>
    parsePinyinSyllable(syllable, `${row.word}[${position}]`))
}

export function readIdiomSource() {
  const lines = readFileSync(idiomSourcePath, 'utf8').trim().split(/\r?\n/)
  const rows = []
  const words = new Set()

  for (let index = 0; index < lines.length; index++) {
    let row
    try {
      row = JSON.parse(lines[index])
    }
    catch (error) {
      throw new Error(`Invalid JSON at ${idiomSourcePath}:${index + 1}`, { cause: error })
    }

    for (const key of ['word', 'pinyin', 'explanation', 'derivation', 'example']) {
      if (typeof row[key] !== 'string')
        throw new TypeError(`Expected string field ${key} at ${idiomSourcePath}:${index + 1}`)
    }
    if (!/^\p{Script=Han}{4}$/u.test(row.word))
      throw new Error(`Expected a four-character idiom at ${idiomSourcePath}:${index + 1}: ${row.word}`)
    if (!row.explanation)
      throw new Error(`Missing explanation for ${row.word}`)
    if (words.has(row.word))
      throw new Error(`Duplicate idiom ${row.word}`)
    parseIdiomPinyin(row)
    words.add(row.word)
    rows.push(row)
  }

  return rows
}
