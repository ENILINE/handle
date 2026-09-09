import { describe, expect, it } from 'vitest'
import { FINAL_BITS, FINALS, INITIAL_BITS, INITIALS, NULL_INITIAL_ID, TONE_BITS } from './data'
import {
  analyzeGuess,
  blendI1Probability,
  combineActualInformation,
  combineExpectedInformation,
  createEvalState,
  canAppendEvaluation,
  canReuseRatings,
  EVAL_ALGORITHM_VERSION,
  EVAL_CORPUS_VERSION,
  EVAL_VERSION,
  evalTesting,
  evaluate,
  feedbackCode,
  feedbackEntropy,
  getEvalDiagnosticSnapshot,
  I1_PARTICLE_FULL_WEIGHT_HITS,
  pinyinFeedbackCode,
  updateState,
  v3RealMixRatio,
} from './index'
import { parseWord, testAnswer } from '../logic/utils'

const initialId = new Map<string, number>(INITIALS.map((value, index) => [value, index]))
const finalId = new Map<string, number>(FINALS.map((value, index) => [value, index]))

function initials(...values: string[]): number {
  return evalTesting.packTuple(values.map(value => initialId.get(value)!), INITIAL_BITS)
}

function finals(...values: string[]): number {
  return evalTesting.packTuple(values.map(value => finalId.get(value)!), FINAL_BITS)
}

function tones(...values: number[]): number {
  return evalTesting.packTuple(values, TONE_BITS)
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

  it('matches repeated tones with exact priority and excess duplicates gray', () => {
    const guess = tones(1, 1, 2, 2)
    const target = tones(1, 3, 2, 4)

    expect(feedbackCode(guess, target, TONE_BITS))
      .toBe(2 + 0 * 3 + 2 * 9 + 0 * 27)
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
    expect(evalTesting.stateContains(state, answer)).toMatchObject({ initial: true, final: true, tone: true })
    expect(state.initialRows.length).toBeGreaterThan(0)
    expect(state.finalRows.length).toBeGreaterThan(0)
  })

  it('does not delete the real tuple when feedback contains repeated elements', () => {
    const state = createEvalState()
    const answer = parseWord('抽抽搭搭')
    const guess = parseWord('搭搭撒撒', '抽抽搭搭')

    expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
    expect(evalTesting.stateContains(state, answer)).toMatchObject({ initial: true, final: true, tone: true })
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
    expect(first!.playerEI).toBeCloseTo(first!.e1 + 0.5 * first!.e2, 12)
    expect(first!.toneParticles).toBe(4096)
    expect(first!.initialParticles).toBe(4096)
    expect(first!.finalParticles).toBe(4096)
    expect(first!.elapsedMs).toBeLessThan(3000)
  })

  it('keeps expected tone information weighted but actual tone information unweighted', () => {
    const state = createEvalState()
    const answer = parseWord('东拼西凑')
    const guess = parseWord('研经铸史', '东拼西凑')
    const analysis = analyzeGuess(state, guess, testAnswer(guess, answer))

    expect(analysis).not.toBeNull()
    expect(analysis!.playerEI).toBeCloseTo(analysis!.e1! + analysis.toneWeight * analysis!.e2, 12)
    expect(analysis!.i1).toBeTypeOf('number')
    expect(analysis!.i2).toBeTypeOf('number')
    expect(combineExpectedInformation(4, 2, 0.25)).toBe(4.5)
    expect(combineActualInformation(4, 2)).toBe(6)
  })

  it('smoothly moves I1 from the real posterior to particle frequency over eight hits', () => {
    const zero = blendI1Probability(0, 4096, 1, 44010)!
    const middle = blendI1Probability(4, 4096, 1, 44010)!
    const full = blendI1Probability(8, 4096, 1, 44010)!

    expect(I1_PARTICLE_FULL_WEIGHT_HITS).toBe(8)
    expect(zero.particleWeight).toBe(0)
    expect(zero.blendedProbability).toBe(zero.realProbability)
    expect(middle.particleWeight).toBeCloseTo(0.5, 12)
    expect(full.particleWeight).toBe(1)
    expect(full.blendedProbability).toBe(full.particleProbability)
  })

  it('uses the full real posterior when a high-information opening misses all particles', () => {
    const state = createEvalState()
    const answer = parseWord('举一反三')
    const guess = parseWord('研经铸史', '举一反三')
    const analysis = analyzeGuess(state, guess, testAnswer(guess, answer))!

    expect(analysis.i1Details).toBeDefined()
    expect(analysis.i1Details!.particleHits).toBe(0)
    expect(analysis.i1Details!.particleWeight).toBe(0)
    expect(analysis.i1Details!.realHits).toBeGreaterThan(0)
    expect(analysis.i1).toBeCloseTo(-Math.log2(analysis.i1Details!.realProbability), 12)
  })

  it('recovers I1 after a repeated opening followed by a zero-hit diverse guess', () => {
    const state = createEvalState()
    const answerWord = '举一反三'
    applyGuess(state, '慌慌张张', answerWord)
    const answer = parseWord(answerWord)
    const guess = parseWord('研经铸史', answerWord)
    const analysis = analyzeGuess(state, guess, testAnswer(guess, answer))!

    expect(analysis.i1Details).toBeDefined()
    expect(analysis.i1Details!.particleHits).toBe(0)
    expect(analysis.i1Details!.particleWeight).toBe(0)
    expect(analysis.i1Details!.realHits).toBeGreaterThan(0)
    expect(analysis.i1).toBeTypeOf('number')
    expect(analysis.i1).toBeCloseTo(-Math.log2(analysis.i1Details!.realProbability), 12)
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
  it('uses joint state for V3 and invalidates the previous persisted version', () => {
    const diagnostic = createEvalState()
    expect(diagnostic.diagnostics).toBeDefined()
    expect(EVAL_ALGORITHM_VERSION).toBe(5)
    expect(EVAL_CORPUS_VERSION).toMatch(/^[0-9a-f]{16}$/)
    expect(EVAL_VERSION).toBe(`5:${EVAL_CORPUS_VERSION}`)
    expect(canReuseRatings(4, 2, 2)).toBe(false)
  })

  it('retains the real answer in IF and IF+PY and keeps the sets nested', () => {
    const state = createEvalState({ diagnostics: true })
    const answer = parseWord('抽抽搭搭')
    const guess = parseWord('搭搭撒撒', '抽抽搭搭')

    expect(updateState(state, guess, testAnswer(guess, answer))).toBe(true)
    expect(evalTesting.stateContains(state, answer)).toEqual({
      initial: true,
      final: true,
      tone: true,
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
    expect(TONE_BITS).toBe(3)
  })
})

describe('V3 calibrated particles', () => {
  it('only permits corpus-backed syllables, including v after l or n', () => {
    let legal = 0
    const vFinal = finalId.get('v')!
    const vInitials: string[] = []
    for (let initial = 0; initial < INITIALS.length; initial++) {
      for (let final = 0; final < FINALS.length; final++) {
        if (evalTesting.isLegalPinyin(initial, final))
          legal++
      }
      if (evalTesting.isLegalPinyin(initial, vFinal))
        vInitials.push(INITIALS[initial])
    }

    expect(legal).toBe(evalTesting.legalPinyinCount)
    expect(vInitials).toEqual(['n', 'l'])
  })

  it('uses the continuous real/virtual mixing formula', () => {
    for (const hypotheses of [1000, 100, 20, 10, 1])
      expect(v3RealMixRatio(hypotheses)).toBeCloseTo(hypotheses / (hypotheses + 32), 12)
  })

  it('generates deterministic particles that satisfy all prior feedback', () => {
    const state = createEvalState()
    applyGuess(state, '研经铸史', '东拼西凑')
    const first = evalTesting.createV3Particles(state)
    const second = evalTesting.createV3Particles(state)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first!.initials.length).toBe(4096)
    expect(first!.finals.length).toBe(4096)
    expect(first!.tones.length).toBeLessThanOrEqual(4096)
    expect(evalTesting.particlesAreValid(state, first!)).toBe(true)
    expect(Array.from(second!.initials)).toEqual(Array.from(first!.initials))
    expect(Array.from(second!.finals)).toEqual(Array.from(first!.finals))
    expect(Array.from(second!.tones)).toEqual(Array.from(first!.tones))
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

  it('invalidates legacy versions and mismatched restored arrays', () => {
    expect(canReuseRatings(undefined, 2, 2)).toBe(false)
    expect(canReuseRatings(`4:${EVAL_CORPUS_VERSION}`, 2, 2)).toBe(false)
    expect(canReuseRatings(5, 2, 2)).toBe(false)
    expect(canReuseRatings(EVAL_VERSION, 1, 2)).toBe(false)
    expect(canReuseRatings(EVAL_VERSION, 2, 2)).toBe(true)
  })
})
