import type { GameMode } from './types'
import { WORD_LENGTH } from './constants'
import { getIdiom } from './idioms'

export function filterNonChineseChars(input: string) {
  return Array.from(input)
    .filter(i => /\p{Script=Han}/u.test(i))
    .slice(0, WORD_LENGTH)
    .join('')
}

export function checkValidIdiom(word: string, mode: GameMode = 'normal'): boolean {
  if (mode === 'unlimited')
    return true
  return !!getIdiom(word)
}
