import { EVAL_CORPUS_VERSION } from './corpus-version'

export { EVAL_CORPUS_VERSION }

// Increment this only when evaluation semantics change. Corpus changes are
// tracked automatically by EVAL_CORPUS_VERSION.
export const EVAL_ALGORITHM_VERSION = 5
export const EVAL_VERSION = `${EVAL_ALGORITHM_VERSION}:${EVAL_CORPUS_VERSION}` as const

export function canReuseRatings(
  ratingsVersion: number | string | undefined,
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
