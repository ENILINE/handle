import { describe, expect, it } from 'vitest'
import type { MatchResult, Rating } from '../logic/types'
import { checkHardMode, parseChar, parseWord, testAnswer } from '../logic/utils'
import { higherRating, matchesAllFeedback, specialRatingForGuess } from './rating'
import { advanceEvaluation, createEvalState, evaluate, ratingFromPercentile } from './index'

function rawWord(chars: string, pinyins: string[]) {
  return pinyins.map((pinyin, i) => parseChar(chars[i], pinyin))
}

describe('six normal rating bands', () => {
  it('uses strict thresholds at .99/.90/.70/.50/.30', () => {
    const bands: [number, Rating][] = [
      [0, 'incorrect'], [0.30, 'incorrect'], [0.300001, 'mistake'],
      [0.50, 'mistake'], [0.500001, 'average'], [0.70, 'average'],
      [0.700001, 'good'], [0.90, 'good'], [0.900001, 'excellent'],
      [0.99, 'excellent'], [0.990001, 'brilliant'], [1, 'brilliant'],
    ]
    for (const [percentile, rating] of bands) expect(ratingFromPercentile(percentile)).toBe(rating)
  })
})

describe('special rating boundaries and precedence', () => {
  it('only rewards a compatible non-winning guess above 13 bits', () => {
    for (const information of [0, 12.999, 13]) expect(specialRatingForGuess(information, true, false)).toBeUndefined()
    for (const information of [13.000001, 22.999999]) expect(specialRatingForGuess(information, true, false)).toBe('brilliant')
    for (const information of [23, 25.999999]) expect(specialRatingForGuess(information, true, false)).toBe('excellent')
    for (const information of [26, 30, 100]) expect(specialRatingForGuess(information, true, false)).toBe('good')
    for (const information of [0, 13, 20, 23, 26, 30]) expect(specialRatingForGuess(information, false, false)).toBeUndefined()
  })

  it('gives a winning guess Brilliant at or below 13, then the same special bands', () => {
    for (const information of [0, 12.999, 13, 13.001, 22.999]) expect(specialRatingForGuess(information, true, true)).toBe('brilliant')
    expect(specialRatingForGuess(23, true, true)).toBe('excellent')
    expect(specialRatingForGuess(26, true, true)).toBe('good')
  })

  it('takes the higher rating after normal compression, including Average', () => {
    const ordered: Rating[] = ['incorrect', 'mistake', 'average', 'good', 'excellent', 'brilliant']
    for (const normal of ordered) {
      expect(higherRating(normal, undefined)).toBe(normal)
      for (const special of ordered)
        expect(higherRating(normal, special)).toBe(ordered[Math.max(ordered.indexOf(normal), ordered.indexOf(special))])
    }
    expect(higherRating(null, undefined)).toBeNull()
    expect(higherRating(null, 'excellent')).toBe('excellent')
  })
})

describe('all public feedback, not just hard-mode requirements', () => {
  const answer = parseWord('举一反三')
  const guess = parseWord('研经铸史', '举一反三')
  const feedback = testAnswer(guess, answer)

  it('replays every visible feedback dimension, including characters, full pinyin and tones', () => {
    expect(matchesAllFeedback(answer, [])).toBe(true)
    expect(matchesAllFeedback(answer, [{ guess, feedback }])).toBe(true)
    for (const dimension of ['char', '_1', '_2', '_3', 'py', 'tone'] as const) {
      const altered: MatchResult[] = feedback.map(result => ({ ...result }))
      altered[0][dimension] = altered[0][dimension] === 'exact' ? 'none' : 'exact'
      expect(matchesAllFeedback(answer, [{ guess, feedback: altered }])).toBe(false)
    }
  })

  it('does not confuse satisfying hard mode with being a possible answer', () => {
    const previous = rawWord('甲乙丙丁', ['zha1', 'zha1', 'zha1', 'zha1'])
    const target = parseWord('举棋不定')
    const result = testAnswer(previous, target)
    expect(checkHardMode(previous, [{ word: previous, result }])).toBe(true)
    expect(matchesAllFeedback(previous, [{ guess: previous, feedback: result }])).toBe(false)
  })

  it('rejects wrong characters and wrong tones despite identical initial/final/full-pinyin tuples', () => {
    const target = rawWord('甲乙丙丁', ['jia3', 'yi3', 'bing3', 'ding1'])
    const differentChars = rawWord('假以饼钉', ['jia3', 'yi3', 'bing3', 'ding1'])
    const differentTone = target.map((char, i) => ({ ...char, tone: i === 0 ? 4 : char.tone }))
    const history = [{ guess: target, feedback: testAnswer(target, target) }]
    expect(matchesAllFeedback(differentChars, history)).toBe(false)
    expect(matchesAllFeedback(differentTone, history)).toBe(false)
  })

  it('enforces red positions and duplicate upper bounds while allowing invisible zero initials', () => {
    const previous = rawWord('甲乙丙丁', ['ba1', 'ba1', 'ba1', 'pa1'])
    const target = rawWord('戊己庚辛', ['pa1', 'ba1', 'a1', 'a1'])
    const tooMany = rawWord('戊己庚辛', ['pa1', 'ba1', 'ba1', 'a1'])
    const redUnmoved = rawWord('戊己庚辛', ['a1', 'ba1', 'a1', 'pa1'])
    const history = [{ guess: previous, feedback: testAnswer(previous, target) }]
    expect(matchesAllFeedback(target, history)).toBe(true)
    expect(matchesAllFeedback(tooMany, history)).toBe(false)
    expect(matchesAllFeedback(redUnmoved, history)).toBe(false)
  })
})

describe('special ratings in the evaluation pipeline', () => {
  it('uses pre-guess I, applies the special floor after compression and preserves E/percentiles', () => {
    const state = createEvalState()
    const answer = parseWord('笔酣墨饱')
    for (const word of ['研经铸史', '先来后到', '投其所好', '分我杯羹', '按部就班']) {
      const guess = parseWord(word, '笔酣墨饱')
      advanceEvaluation(state, guess, testAnswer(guess, answer), { rank: false })
    }
    // A consistent candidate earns the floor even without a winning result.
    for (const [information, floor] of [[13, undefined], [20, 'brilliant'], [23, 'excellent'], [26, 'good']] as const) {
      state.information = { i1: information, i2: 0, missingI1: 0, missingI2: 0 }
      const candidate = evaluate(state, answer)!
      const winner = evaluate(state, answer, false, testAnswer(answer, answer))!
      expect(candidate.matchesHistory).toBe(true)
      expect(candidate.specialRating).toBe(floor)
      expect(candidate.informationBefore).toBe(information)
      expect(candidate.compression).toBe(1)
      expect(candidate.rating).toBe(higherRating(candidate.normalRating, floor))
      expect(winner.specialRating).toBe(information === 13 ? 'brilliant' : floor)
      expect(winner.playerEI).toBe(candidate.playerEI)
      expect(winner.rank).toBe(candidate.rank)
      expect(winner.percentile).toBe(candidate.percentile)
      expect(state.information.i1).toBe(information)
    }
    // A special floor can still be decided when the normal search is paused.
    state.information = { i1: 13, i2: 0, missingI1: 0, missingI2: 0 }
    const won = advanceEvaluation(state, answer, testAnswer(answer, answer), { budget: { maxNodes: 0 } })
    expect(won.result).toBeNull()
    expect(won.analysis.e1).toBeUndefined()
    expect(won.rating).toBe('brilliant')
    expect(won.analysis.informationBefore).toBe(13)
  })

  it('rewards even a low-information winning opening, but not an ordinary opening', () => {
    const state = createEvalState()
    const guess = parseWord('搭搭撒撒')
    const opening = evaluate(state, guess)!
    const win = advanceEvaluation(state, guess, testAnswer(guess, guess))
    expect(opening.matchesHistory).toBe(true)
    expect(opening.specialRating).toBeUndefined()
    expect(opening.rating).not.toBe('brilliant')
    expect(win.rating).toBe('brilliant')
    expect(win.result!.playerEI).toBe(opening.playerEI)
    expect(win.result!.normalRating).toBe(opening.normalRating)
    expect(win.analysis.informationBefore).toBe(0)
    expect(state.visibleHistory).toHaveLength(1)
  })
})
