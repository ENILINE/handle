import type { MatchResult, ParsedChar } from '../logic/types'
import { WORD_LENGTH } from '../logic/constants'
import { FINALS, FINAL_BITS, INITIAL_BITS, NULL_INITIAL_ID } from './data'

const NONE = 0
const MISPLACED = 1
const EXACT = 2
export const FEEDBACK_BUCKETS = 3 ** WORD_LENGTH

export function packTuple(values: readonly number[], bits: number): number {
  let packed = 0
  for (let position = 0; position < WORD_LENGTH; position++)
    packed |= values[position] << (position * bits)
  return packed >>> 0
}

export function tupleValue(tuple: number, bits: number, position: number): number {
  return tuple >>> (position * bits) & ((1 << bits) - 1)
}

/**
 * Encode the four-position Wordle feedback for one pinyin dimension.
 * Base-3 digits are none=0, misplaced=1, exact=2.
 * A skipped value (the null initial) is not a query and always contributes 0.
 */
export function feedbackCode(
  guess: number,
  target: number,
  bits: number,
  skippedValue = -1,
): number {
  const g0 = tupleValue(guess, bits, 0)
  const g1 = tupleValue(guess, bits, 1)
  const g2 = tupleValue(guess, bits, 2)
  const g3 = tupleValue(guess, bits, 3)
  const a0 = tupleValue(target, bits, 0)
  const a1 = tupleValue(target, bits, 1)
  const a2 = tupleValue(target, bits, 2)
  const a3 = tupleValue(target, bits, 3)

  return feedbackCodeValues(g0, g1, g2, g3, a0, a1, a2, a3, skippedValue)
}

function feedbackCodeValues(
  g0: number,
  g1: number,
  g2: number,
  g3: number,
  a0: number,
  a1: number,
  a2: number,
  a3: number,
  skippedValue = -1,
): number {
  let s0 = NONE
  let s1 = NONE
  let s2 = NONE
  let s3 = NONE
  let used = 0

  if (g0 !== skippedValue && g0 === a0) {
    s0 = EXACT
    used |= 1
  }
  if (g1 !== skippedValue && g1 === a1) {
    s1 = EXACT
    used |= 2
  }
  if (g2 !== skippedValue && g2 === a2) {
    s2 = EXACT
    used |= 4
  }
  if (g3 !== skippedValue && g3 === a3) {
    s3 = EXACT
    used |= 8
  }

  const usedBefore0 = used
  if (g0 !== skippedValue && s0 !== EXACT) {
    if (!(used & 1) && g0 === a0)
      used |= 1
    else if (!(used & 2) && g0 === a1)
      used |= 2
    else if (!(used & 4) && g0 === a2)
      used |= 4
    else if (!(used & 8) && g0 === a3)
      used |= 8
    if (used !== usedBefore0)
      s0 = MISPLACED
  }
  const usedAfter0 = used
  if (g1 !== skippedValue && s1 !== EXACT) {
    if (!(used & 1) && g1 === a0)
      used |= 1
    else if (!(used & 2) && g1 === a1)
      used |= 2
    else if (!(used & 4) && g1 === a2)
      used |= 4
    else if (!(used & 8) && g1 === a3)
      used |= 8
    if (used !== usedAfter0)
      s1 = MISPLACED
  }
  const usedAfter1 = used
  if (g2 !== skippedValue && s2 !== EXACT) {
    if (!(used & 1) && g2 === a0)
      used |= 1
    else if (!(used & 2) && g2 === a1)
      used |= 2
    else if (!(used & 4) && g2 === a2)
      used |= 4
    else if (!(used & 8) && g2 === a3)
      used |= 8
    if (used !== usedAfter1)
      s2 = MISPLACED
  }
  const usedAfter2 = used
  if (g3 !== skippedValue && s3 !== EXACT) {
    if (!(used & 1) && g3 === a0)
      used |= 1
    else if (!(used & 2) && g3 === a1)
      used |= 2
    else if (!(used & 4) && g3 === a2)
      used |= 4
    else if (!(used & 8) && g3 === a3)
      used |= 8
    if (used !== usedAfter2)
      s3 = MISPLACED
  }

  return s0 + s1 * 3 + s2 * 9 + s3 * 27
}

function pinyinValue(initial: number, final: number, position: number): number {
  return tupleValue(initial, INITIAL_BITS, position) * (1 << FINAL_BITS)
    + tupleValue(final, FINAL_BITS, position)
}

/** Encode full-pinyin feedback while preserving the initial/final pairing. */
export function pinyinFeedbackCode(
  guessInitial: number,
  guessFinal: number,
  targetInitial: number,
  targetFinal: number,
): number {
  return feedbackCodeValues(
    pinyinValue(guessInitial, guessFinal, 0),
    pinyinValue(guessInitial, guessFinal, 1),
    pinyinValue(guessInitial, guessFinal, 2),
    pinyinValue(guessInitial, guessFinal, 3),
    pinyinValue(targetInitial, targetFinal, 0),
    pinyinValue(targetInitial, targetFinal, 1),
    pinyinValue(targetInitial, targetFinal, 2),
    pinyinValue(targetInitial, targetFinal, 3),
  )
}

function matchValue(value: string): number {
  if (value === 'exact')
    return EXACT
  if (value === 'misplaced')
    return MISPLACED
  return NONE
}

export function observedCode(
  parsed: readonly ParsedChar[],
  results: readonly MatchResult[],
  dimension: 'initial' | 'final' | 'pinyin' | 'tone',
): number {
  let code = 0
  let factor = 1
  for (let position = 0; position < WORD_LENGTH; position++) {
    const skipped = dimension === 'initial' && !parsed[position]._1
    const result = dimension === 'initial'
      ? results[position]._1
      : dimension === 'final'
        ? results[position]._2
        : dimension === 'pinyin'
          ? results[position].py
          : results[position].tone
    code += (skipped ? NONE : matchValue(result)) * factor
    factor *= 3
  }
  return code
}

function equalityPattern4(v0: number, v1: number, v2: number, v3: number): number {
  let next = 1
  const l1 = v1 === v0 ? 0 : next++
  const l2 = v2 === v0 ? 0 : v2 === v1 ? l1 : next++
  const l3 = v3 === v0 ? 0 : v3 === v1 ? l1 : v3 === v2 ? l2 : next
  return l1 << 2 | l2 << 4 | l3 << 6
}

export function structureSignature(initial: number, final: number): number {
  const i0 = tupleValue(initial, INITIAL_BITS, 0)
  const i1 = tupleValue(initial, INITIAL_BITS, 1)
  const i2 = tupleValue(initial, INITIAL_BITS, 2)
  const i3 = tupleValue(initial, INITIAL_BITS, 3)
  const f0 = tupleValue(final, FINAL_BITS, 0)
  const f1 = tupleValue(final, FINAL_BITS, 1)
  const f2 = tupleValue(final, FINAL_BITS, 2)
  const f3 = tupleValue(final, FINAL_BITS, 3)
  return equalityPattern4(i0, i1, i2, i3)
    | equalityPattern4(f0, f1, f2, f3) << 8
    | equalityPattern4(
      i0 * FINALS.length + f0,
      i1 * FINALS.length + f1,
      i2 * FINALS.length + f2,
      i3 * FINALS.length + f3,
    ) << 16
}

const orbitCache = new Map<number, number>()

/** A position-invariant signature, used only by the iid endgame prior. */
export function endgameStructureSignature(initial: number, final: number): number {
  const signature = structureSignature(initial, final)
  const cached = orbitCache.get(signature)
  if (cached != null)
    return cached
  const patterns = [0, 8, 16].map(shift =>
    Array.from({ length: 4 }, (_, p) => signature >>> (shift + p * 2) & 3))
  let key = Infinity
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (b === a)
        continue
      for (let c = 0; c < 4; c++) {
        if (c === a || c === b)
          continue
        const d = 6 - a - b - c
        const code = patterns.reduce((value, p, dim) =>
          value | equalityPattern4(p[a], p[b], p[c], p[d]) << (dim * 8), 0)
        key = Math.min(key, code)
      }
    }
  }
  orbitCache.set(signature, key)
  return key
}

export function jointFeedbackCode(
  guessInitial: number,
  guessFinal: number,
  targetInitial: number,
  targetFinal: number,
): number {
  const initialCode = feedbackCode(
    guessInitial,
    targetInitial,
    INITIAL_BITS,
    NULL_INITIAL_ID,
  )
  const finalCode = feedbackCode(guessFinal, targetFinal, FINAL_BITS)
  const pinyinCode = pinyinFeedbackCode(
    guessInitial,
    guessFinal,
    targetInitial,
    targetFinal,
  )
  return initialCode + finalCode * FEEDBACK_BUCKETS
    + pinyinCode * FEEDBACK_BUCKETS * FEEDBACK_BUCKETS
}
