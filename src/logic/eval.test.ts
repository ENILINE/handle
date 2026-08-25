import { describe, expect, it } from 'vitest'
import { FINAL_BITS, FINALS, INITIAL_BITS, INITIALS, NULL_INITIAL_ID } from '../data/eval-data'
import {
  createEvalState,
  canAppendEvaluation,
  canReuseRatings,
  EVAL_VERSION,
  evalTesting,
  evaluate,
  feedbackCode,
  feedbackEntropy,
  getEvalDiagnosticSnapshot,
  pinyinFeedbackCode,
  updateState,
} from './eval'
import { parseWord, testAnswer } from './utils'

const initialId = new Map<string, number>(INITIALS.map((value, index) => [value, index]))
const finalId = new Map<string, number>(FINALS.map((value, index) => [value, index]))

function initials(...values: string[]): number {
  return evalTesting.packTuple(values.map(value => initialId.get(value)!), INITIAL_BITS)
}

function finals(...values: string[]): number {
  return evalTesting.packTuple(values.map(value => finalId.get(value)!), FINAL_BITS)
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

  it('matches full-pinyin pairs with exact priority and excess duplicates gray', () => {
    const guessInitial = initials('sh', 'sh', 'x', 'x')
    const guessFinal = finals('i', 'i', 'an', 'an')
    const targetInitial = initials('sh', 'b', 'x', 'x')
    const targetFinal = finals('i', 'a', 'an', 'an')

    expect(pinyinFeedbackCode(guessInitial, guessFinal, targetInitial, targetFinal))
      .toBe(2 + 0 * 3 + 2 * 9 + 2 * 27)
  })

  it('matches repeated misplaced full pinyin from left to right', () => {
    const guessInitial = initials('sh', 'sh', 'x', 'y')
    const guessFinal = finals('i', 'i', 'ian', 'ang')
    const targetInitial = initials('b', 'c', 'sh', 'd')
    const targetFinal = finals('a', 'e', 'i', 'o')

    expect(pinyinFeedbackCode(guessInitial, guessFinal, targetInitial, targetFinal)).toBe(1)
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

describe('joint posterior diagnostics', () => {
  it('is opt-in and does not change the V2 score', () => {
    const production = createEvalState()
    const diagnostic = createEvalState({ diagnostics: true })
    const firstGuess = parseWord('研经铸史')
    const answer = parseWord('东拼西凑')

    expect(production.diagnostics).toBeUndefined()
    expect(diagnostic.diagnostics).toBeDefined()
    expect(evaluate(diagnostic, firstGuess)!.playerEI).toBe(evaluate(production, firstGuess)!.playerEI)
    expect(evaluate(diagnostic, firstGuess)!.rank).toBe(evaluate(production, firstGuess)!.rank)
    const feedback = testAnswer(firstGuess, answer)
    updateState(production, firstGuess, feedback)
    updateState(diagnostic, firstGuess, feedback)
    const secondGuess = parseWord('先来后到', '东拼西凑')
    expect(evaluate(diagnostic, secondGuess)!.playerEI).toBe(evaluate(production, secondGuess)!.playerEI)
    expect(evaluate(diagnostic, secondGuess)!.rank).toBe(evaluate(production, secondGuess)!.rank)
    expect(EVAL_VERSION).toBe(2)
  })

  it('retains the real answer in IF and IF+PY and keeps the sets nested', () => {
    const state = createEvalState({ diagnostics: true })
    const answer = parseWord('抽抽搭搭')
    const guess = parseWord('搭搭撒撒', '抽抽搭搭')

    expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
    expect(evalTesting.stateContains(state, answer)).toEqual({
      initial: true,
      final: true,
      if: true,
      ifPy: true,
    })

    const snapshot = getEvalDiagnosticSnapshot(state)!
    expect(snapshot.ifRows).toBeLessThanOrEqual(snapshot.initialRows)
    expect(snapshot.ifRows).toBeLessThanOrEqual(snapshot.finalRows)
    expect(snapshot.ifPyRows).toBeLessThanOrEqual(snapshot.ifRows)
    expect(snapshot.ifPyUnique).toBeLessThanOrEqual(snapshot.ifUnique)
  })

  it('counts homophones as repeated weight rather than distinct pinyin hypotheses', () => {
    const first = evalTesting.pinyinTupleKey(parseWord('哀声叹气'))
    const second = evalTesting.pinyinTupleKey(parseWord('唉声叹气'))
    const stats = evalTesting.hypothesisStats([first, second, 'different'])

    expect(first).toBe(second)
    expect(stats.unique).toBe(2)
    expect(stats.effective).toBeGreaterThan(1)
    expect(stats.effective).toBeLessThan(3)
  })

  it('records non-increasing joint trajectories for all three prompt positions', () => {
    const cases = [
      { answer: '东拼西凑', guesses: ['研经铸史', '先来后到', '瑟调琴弄'] },
      { answer: '筚路蓝缕', guesses: ['研经铸史', '慈眉善目'] },
      { answer: '避重就轻', guesses: ['研经铸史', '脍炙人口', '急中生智', '亲密无间'] },
    ]

    for (const item of cases) {
      const state = createEvalState({ diagnostics: true })
      const answer = parseWord(item.answer)
      let previous = getEvalDiagnosticSnapshot(state)!

      for (const word of item.guesses) {
        const guess = parseWord(word, item.answer)
        expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
        const current = getEvalDiagnosticSnapshot(state)!
        expect(current.ifRows).toBeLessThanOrEqual(previous.ifRows)
        expect(current.ifPyRows).toBeLessThanOrEqual(current.ifRows)
        expect(current.ifPyRows).toBeLessThanOrEqual(previous.ifPyRows)
        expect(evalTesting.stateContains(state, answer).ifPy).toBe(true)
        previous = current
      }
    }
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
