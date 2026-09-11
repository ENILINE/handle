import seedrandom from 'seedrandom'
import type { SpMode } from '@hankit/tools'
import { pinyinInitials, toShuangpin, toSimplified, toZhuyin } from '@hankit/tools'
import type { InputMode, MatchResult, ParsedChar } from './types'
import { getPinyin } from './idioms'
import { WORD_LENGTH } from './constants'

export function parsePinyin(pinyin: string, mode: InputMode = 'py', spMode: SpMode = 'sougou') {
  let parts: string[] = []
  if (pinyin) {
    if (mode === 'zy') {
      parts = Array.from(pinyin.trim() ? toZhuyin(pinyin) : '')
    }
    else if (mode === 'sp') {
      parts = Array.from(toShuangpin(pinyin, spMode))
    }
    else {
      let rest = pinyin
      const one = pinyinInitials.find(i => rest.startsWith(i))
      if (one)
        rest = rest.slice(one.length)
      parts = [one, rest].filter(Boolean) as string[]
    }
  }
  return parts
}

export function parseChar(char: string, pinyin?: string, mode?: InputMode, spMode?: SpMode): ParsedChar {
  if (!pinyin)
    pinyin = getPinyin(char)[0]
  const tone = pinyin.match(/[\d]$/)?.[0] || ''
  if (tone)
    pinyin = pinyin.slice(0, -tone.length).trim()

  const parts = parsePinyin(pinyin, mode, spMode)
  // if there is no final, actually it's no intital
  if (parts[0] && !parts[1]) {
    parts[1] = parts[0]
    parts[0] = ''
  }

  const [one, two, three] = parts

  return {
    char,
    _1: one,
    _2: two,
    _3: three,
    parts,
    yin: pinyin,
    tone: +tone || 0,
  }
}

export function parseWord(word: string, answer?: string, mode?: InputMode, spMode?: SpMode) {
  const pinyins = getPinyin(word)
  const chars = Array.from(word)
  const answerPinyin = answer ? getPinyin(answer) : undefined

  return chars.map((char, i): ParsedChar => {
    let pinyin = pinyins[i] || ''
    // try match the pinyin from the answer word
    if (answerPinyin && answer && answer.includes(char))
      pinyin = answerPinyin[answer.indexOf(char)] || pinyin
    return parseChar(char, pinyin, mode, spMode)
  })
}

export function testAnswer(input: ParsedChar[], answer: ParsedChar[]) {
  // During mode restoration the answer can temporarily be unavailable. An
  // incomplete pair has no meaningful feedback and must not be indexed.
  if (!input.length || input.length !== answer.length)
    return []

  const unmatched = {
    char: answer
      .map((a, i) => toSimplified(input[i].char) === toSimplified(a.char) ? undefined : toSimplified(a.char))
      .filter(i => i != null),
    tone: answer
      .map((a, i) => input[i].tone === a.tone ? undefined : a.tone)
      .filter(i => i != null),
    py: answer
      .map((a, i) => input[i].yin === a.yin ? undefined : a.yin)
      .filter(i => i != null),
    parts: answer
      .flatMap((a, i) => a.parts.filter(p => !input[i].parts.includes(p)))
      .filter(i => i != null) as string[],
  }

  function includesAndRemove<T>(arr: T[], v: T) {
    if (arr.includes(v)) {
      arr.splice(arr.indexOf(v), 1)
      return true
    }
    return false
  }

  return input.map((a, i): MatchResult => {
    const char = toSimplified(a.char)
    return {
      char: (answer[i].char === char || answer[i].char === a.char)
        ? 'exact'
        : includesAndRemove(unmatched.char, char)
          ? 'misplaced'
          : 'none',
      tone: answer[i].tone === a.tone
        ? 'exact'
        : includesAndRemove(unmatched.tone, a.tone)
          ? 'misplaced'
          : 'none',
      _1: (!a._1 || answer[i].parts.includes(a._1))
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._1)
          ? 'misplaced'
          : 'none',
      _2: (!a._2 || answer[i].parts.includes(a._2))
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._2)
          ? 'misplaced'
          : 'none',
      _3: (!a._3 || answer[i].parts.includes(a._3))
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._3)
          ? 'misplaced'
          : 'none',
      py: a.yin === answer[i].yin
        ? 'exact'
        : includesAndRemove(unmatched.py, a.yin)
          ? 'misplaced'
          : 'none',
    }
  })
}

export function checkPass(result: MatchResult[]) {
  return result.length > 0 && result.every(r => r.char === 'exact')
}

export function getHint(word: string) {
  return word[Math.floor(seedrandom(word)() * word.length)]
}

const numberChar = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const tens = ['', '十', '百', '千']

export function numberToHanzi(number: number) {
  const digits = Array.from(number.toString()).map(i => +i)
  const chars = digits.map((i, idx) => {
    const unit = i !== 0 ? tens[digits.length - 1 - idx] : ''
    return numberChar[i] + unit
  })
  const str = chars.join('')
  return str
    .replace('一十', '十')
    .replace('一百', '百')
    .replace('二十', '廿')
    .replace(/零+/, '零')
    .replace(/(.)零$/, '$1')
}

export function checkHardMode(
  input: ParsedChar[],
  previousTries: { word: ParsedChar[]; result: MatchResult[] }[],
): boolean {
  type Dim = 'char' | '_1' | '_2' | '_3' | 'tone' | 'py'
  const dims: Dim[] = ['char', '_1', '_2', '_3', 'tone', 'py']

  for (const dim of dims) {
    const exacts = new Map<number, string | number>()
    const mustCount = new Map<string | number, number>()

    for (const t of previousTries) {
      for (let i = 0; i < WORD_LENGTH; i++) {
        const val = dim === 'char' ? toSimplified(t.word[i].char) : dim === 'py' ? t.word[i].yin : t.word[i][dim]
        const result = t.result[i][dim]

        if (val === '' || val === undefined)
          continue

        if (result === 'exact' || result === 'misplaced')
          mustCount.set(val, (mustCount.get(val) || 0) + 1)

        if (result === 'exact')
          exacts.set(i, val)
      }
    }

    for (const [pos, val] of exacts) {
      const inputVal = dim === 'char' ? toSimplified(input[pos].char) : dim === 'py' ? input[pos].yin : input[pos][dim]
      if (inputVal !== val)
        return false
    }

    const inputCounts = new Map<string | number, number>()
    for (let i = 0; i < WORD_LENGTH; i++) {
      const val = dim === 'char' ? toSimplified(input[i].char) : dim === 'py' ? input[i].yin : input[i][dim]
      if (val === '' || val === undefined)
        continue
      inputCounts.set(val, (inputCounts.get(val) || 0) + 1)
    }

    for (const [val, required] of mustCount) {
      if ((inputCounts.get(val) || 0) < required)
        return false
    }
  }

  return true
}

/**
* Checks whether a given date is in daylight saving time.
* @param date the date object to be checked.
* @returns true if the date is in daylight saving time, false if it's not.
*/
export function isDstObserved(date: Date) {
  const jan = new Date(date.getFullYear(), 0, 1)
  const jul = new Date(date.getFullYear(), 6, 1)
  const standardTimezoneOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
  return date.getTimezoneOffset() < standardTimezoneOffset
}
