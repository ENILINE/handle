import { describe, expect, it } from 'vitest'
import { FINAL_BITS, INITIAL_BITS, INITIALS, NULL_INITIAL_ID } from '../data/eval-data'
import {
  createEvalState,
  canAppendEvaluation,
  canReuseRatings,
  EVAL_VERSION,
  evalTesting,
  evaluate,
  feedbackCode,
  feedbackEntropy,
  updateState,
} from './eval'
import { parseWord, testAnswer } from './utils'

const initialId = new Map<string, number>(INITIALS.map((value, index) => [value, index]))

function initials(...values: string[]): number {
  return evalTesting.packTuple(values.map(value => initialId.get(value)!), INITIAL_BITS)
}

function applyGuess(state: ReturnType<typeof createEvalState>, guessWord: string, answerWord: string) {
  const answer = parseWord(answerWord)
  const guess = parseWord(guessWord, answerWord)
  updateState(state, guess, testAnswer(guess, answer))
}

describe('joint feedback encoding', () => {
  it('marks exact matches before misplaced matches and leaves excess duplicates gray', () => {
    const guess = initials('sh', 'sh', 'x', 'x')
    const target = initials('sh', 'b', 'x', 'x')

    expect(feedbackCode(guess, target, INITIAL_BITS, NULL_INITIAL_ID))
      .toBe(2 + 0 * 3 + 2 * 9 + 2 * 27)
  })

  it('matches repeated misplaced elements from left to right', () => {
    const guess = initials('sh', 'sh', 'null', 'null')
    const target = initials('b', 'c', 'sh', 'd')

    expect(feedbackCode(guess, target, INITIAL_BITS, NULL_INITIAL_ID)).toBe(1)
  })

  it('does not turn a null initial into a visible query', () => {
    const guess = initials('null', 'b', 'c', 'd')

    expect(feedbackCode(guess, guess, INITIAL_BITS, NULL_INITIAL_ID))
      .toBe(0 + 2 * 3 + 2 * 9 + 2 * 27)
  })
})

describe('joint feedback entropy', () => {
  it('is log2(3) when two sh queries distinguish three equiprobable positions', () => {
    const guess = initials('null', 'sh', 'sh', 'null')
    const targets = Uint32Array.from([
      initials('b', 'sh', 'c', 'd'),
      initials('b', 'c', 'sh', 'd'),
      initials('b', 'c', 'd', 'sh'),
    ])

    expect(feedbackEntropy(guess, targets, INITIAL_BITS, NULL_INITIAL_ID))
      .toBeCloseTo(Math.log2(3), 10)
  })

  it('is zero for deterministic feedback', () => {
    const guess = initials('sh', 'b', 'c', 'd')
    const target = initials('b', 'sh', 'd', 'c')

    expect(feedbackEntropy(
      guess,
      Uint32Array.from([target, target, target]),
      INITIAL_BITS,
      NULL_INITIAL_ID,
    )).toBe(0)
  })
})

describe('posterior filtering and ranking', () => {
  it('retains the real answer tuple in both independent posteriors', () => {
    const answer = parseWord('东拼西凑')
    const guess = parseWord('研经铸史', '东拼西凑')
    const state = createEvalState()

    expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
    expect(evalTesting.stateContains(state, answer)).toEqual({ initial: true, final: true })
    expect(state.initialRows.length).toBeGreaterThan(0)
    expect(state.finalRows.length).toBeGreaterThan(0)
  })

  it('does not delete the real tuple when feedback contains repeated elements', () => {
    const state = createEvalState()
    const answer = parseWord('抽抽搭搭')
    const guess = parseWord('搭搭撒撒', '抽抽搭搭')

    expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
    expect(evalTesting.stateContains(state, answer)).toEqual({ initial: true, final: true })
  })

  it('produces a stable score and rank for the same state and guess', () => {
    const state = createEvalState()
    const guess = parseWord('研经铸史')
    const first = evaluate(state, guess)
    const second = evaluate(state, guess)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second!.playerEI).toBe(first!.playerEI)
    expect(second!.rank).toBe(first!.rank)
    expect(first!.initialParticles).toBe(4096)
    expect(first!.finalParticles).toBe(4096)
    expect(first!.elapsedMs).toBeLessThan(3000)
  })

  it('keeps common diverse openings above a heavily repeated opening', () => {
    const state = createEvalState()
    const diverse = evaluate(state, parseWord('研经铸史'))
    const repeated = evaluate(state, parseWord('搭搭撒撒'))

    expect(diverse).not.toBeNull()
    expect(repeated).not.toBeNull()
    expect(diverse!.rank).toBeGreaterThan(repeated!.rank)
  })

  it('distinguishes moving known reds from spreading new elements in a prompt position', () => {
    const state = createEvalState()
    applyGuess(state, '研经铸史', '筚路蓝缕')

    const moved = evaluate(state, parseWord('慈眉善目', '筚路蓝缕'))
    const spread = evaluate(state, parseWord('先来后到', '筚路蓝缕'))

    expect(moved).not.toBeNull()
    expect(spread).not.toBeNull()
    expect(moved!.playerEI).not.toBe(spread!.playerEI)
    expect(moved!.rank).toBeGreaterThan(0)
    expect(spread!.rank).toBeGreaterThan(0)
  })

  it('does not let a third guess that keeps ignoring known reds beat every benchmark', () => {
    const state = createEvalState()
    applyGuess(state, '研经铸史', '东拼西凑')
    applyGuess(state, '先来后到', '东拼西凑')

    const third = evaluate(state, parseWord('瑟调琴弄', '东拼西凑'))

    expect(third).not.toBeNull()
    expect(third!.rank).toBeLessThan(third!.total)
  })
})

describe('pinyin tuple conventions', () => {
  it('treats y and w as initials and preserves zero initials', () => {
    expect(evalTesting.splitPinyin('yan2')).toEqual(['y', 'an'])
    expect(evalTesting.splitPinyin('wu2')).toEqual(['w', 'u'])
    expect(evalTesting.splitPinyin('an1')).toEqual(['null', 'an'])
    expect(evalTesting.splitPinyin('lv4')).toEqual(['l', 'v'])
  })

  it('packs final tuples within six bits per position', () => {
    expect(FINAL_BITS).toBe(6)
  })
})

describe('evaluation session reconciliation', () => {
  it('only appends when the game is unchanged and the old guesses are an exact prefix', () => {
    expect(canAppendEvaluation('daily:1:a', ['甲乙丙丁'], 'daily:1:a', ['甲乙丙丁', '戊己庚辛']))
      .toBe(true)
    expect(canAppendEvaluation('daily:1:a', ['甲乙丙丁'], 'random:1:a', ['甲乙丙丁', '戊己庚辛']))
      .toBe(false)
    expect(canAppendEvaluation('custom:a', ['甲乙丙丁'], 'custom:a', ['戊己庚辛']))
      .toBe(false)
  })

  it('invalidates V1 ratings and mismatched restored arrays', () => {
    expect(canReuseRatings(undefined, 2, 2)).toBe(false)
    expect(canReuseRatings(EVAL_VERSION - 1, 2, 2)).toBe(false)
    expect(canReuseRatings(EVAL_VERSION, 1, 2)).toBe(false)
    expect(canReuseRatings(EVAL_VERSION, 2, 2)).toBe(true)
  })
})
