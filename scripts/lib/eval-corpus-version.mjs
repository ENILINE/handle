import { createHash } from 'node:crypto'
import { parseIdiomPinyin } from './idiom-source.mjs'

const FINGERPRINT_SCHEMA = 1

/**
 * Hash only the canonical fields that affect evaluation. Explanations and
 * examples deliberately stay outside this fingerprint.
 */
export function createEvalCorpusVersion(rows) {
  const hash = createHash('sha256')
  hash.update(`handle-eval-corpus-v${FINGERPRINT_SCHEMA}\n`)

  for (const row of rows) {
    const pinyin = parseIdiomPinyin(row)
      .map(value => [value.initial, value.final, value.tone])
    hash.update(JSON.stringify([row.word, pinyin]))
    hash.update('\n')
  }

  return hash.digest('hex').slice(0, 16)
}
