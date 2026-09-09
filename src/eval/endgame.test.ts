import { beforeAll, describe, expect, it } from 'vitest'
import { FINAL_BITS, FINALS, INITIAL_BITS, INITIALS, NULL_INITIAL_ID, SAMPLED_WORDS, TONE_BITS } from './data'
import { advanceEvaluation, compressPercentile, compressionForInformation, createEvalState, evalTesting, evaluate, feedbackEntropy, getPosteriorSizes, ratingFromPercentile, toneWeightForInformation } from './index'
import type { EvalState } from './index'
import { enumerateEndgame, satisfiesHistory } from './endgame'
import type { EndgamePrior, PinyinHistoryEntry } from './endgame'
import { endgameStructureSignature, feedbackCode, jointFeedbackCode, observedCode, packTuple, pinyinFeedbackCode, tupleValue } from './feedback'
import { parseChar, parseWord, testAnswer } from '../logic/utils'

const firstFive = ['研经铸史', '先来后到', '投其所好', '分我杯羹', '按部就班']
const secondFive = [...firstFive.slice(0, 4), '生不逢时']
let firstState: EvalState
let secondState: EvalState

function replay(answer: string, words: readonly string[]): EvalState {
  const state = createEvalState()
  for (const word of words) {
    const guess = parseWord(word, answer)
    advanceEvaluation(state, guess, testAnswer(guess, parseWord(answer)), { rank: false })
  }
  return state
}

function tuple(pinyins: string[]) {
  return evalTesting.parseParsedTuples(pinyins.map(p => parseChar('字', `${p}1`)))
}

function historyEntry(guess: ReturnType<typeof tuple>, target: ReturnType<typeof tuple>): PinyinHistoryEntry {
  return {
    guessInitial: guess.initial, guessFinal: guess.final,
    initialCode: feedbackCode(guess.initial, target.initial, INITIAL_BITS, NULL_INITIAL_ID),
    finalCode: feedbackCode(guess.final, target.final, FINAL_BITS),
    code: pinyinFeedbackCode(guess.initial, guess.final, target.initial, target.final),
  }
}

function spell(initial: number, final: number): string {
  return Array.from({ length: 4 }, (_, p) => {
    const i = INITIALS[tupleValue(initial, INITIAL_BITS, p)]
    return `${i === 'null' ? '' : i}${FINALS[tupleValue(final, FINAL_BITS, p)]}`
  }).join(' ')
}

beforeAll(() => {
  firstState = replay('笔酣墨饱', firstFive)
  secondState = replay('狂风怒号', secondFive)
}, 15000)

describe('complete endgame regressions', () => {
  it('restores bo han ri bao and nonzero r information after the first five guesses', () => {
    const search = enumerateEndgame(firstState.history, evalTesting.getEndgamePrior())
    expect(getPosteriorSizes(firstState).posteriorProduct).toBe(2)
    expect(search.status).toBe('complete')
    expect(search.candidatesFound).toBe(10)
    expect(search.initials.some((initial, p) => spell(initial, search.finals[p]) === 'bo han ri bao')).toBe(true)
    const guess = parseWord('人迹罕至', '笔酣墨饱')
    const result = evaluate(firstState, guess, true, testAnswer(guess, parseWord('笔酣墨饱')))!
    expect(result.model).toBe('endgame')
    expect(result.e1).toBeGreaterThan(0)
    expect(result.i1Details).toBeUndefined()
    expect(result.search?.complete).toBe(true)
    expect(result.compression).toBe(1)
    expect(result.elapsedMs).toBeLessThan(3000)
    expect(result.sampled).toHaveLength(1000)
    console.info('笔酣墨饱末盘', { candidates: search.candidatesFound, nodes: search.nodes, e1: result.e1, ms: result.elapsedMs })
  })

  it('restores er and c possibilities in the second endgame without hardcoding grades', () => {
    const search = enumerateEndgame(secondState.history, evalTesting.getEndgamePrior())
    expect(getPosteriorSizes(secondState).posteriorProduct).toBe(12)
    expect(search.status).toBe('complete')
    expect(search.candidatesFound).toBe(744)
    const spellings = Array.from(search.initials, (i, p) => spell(i, search.finals[p]).split(' '))
    expect(spellings.some(row => row.includes('er'))).toBe(true)
    expect(spellings.some(row => row.some(py => py.startsWith('c') && !py.startsWith('ch')))).toBe(true)
    for (const word of ['掉头而去', '潦潦草草']) {
      const result = evaluate(secondState, parseWord(word, '狂风怒号'))!
      expect(result.model).toBe('endgame')
      expect(result.e1).toBeGreaterThan(0)
      expect(result.elapsedMs).toBeLessThan(3000)
      console.info(`${word}末盘`, { candidates: search.candidatesFound, nodes: search.nodes, e1: result.e1, ms: result.elapsedMs })
    }
  })

  it('only emits legal tuples satisfying every feedback, with normalized positive Float64 weights', () => {
    for (const state of [firstState, secondState]) {
      const search = enumerateEndgame(state.history, evalTesting.getEndgamePrior())
      expect(search.weights).toBeInstanceOf(Float64Array)
      expect(search.weights.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12)
      expect(Array.from(search.weights).every(p => p > 0)).toBe(true)
      const keys = new Set<string>()
      for (let n = 0; n < search.initials.length; n++) {
        const initial = search.initials[n]
        const final = search.finals[n]
        expect(satisfiesHistory(initial, final, state.history)).toBe(true)
        keys.add(`${initial}:${final}`)
        for (let p = 0; p < 4; p++)
          expect(evalTesting.isLegalPinyin(tupleValue(initial, INITIAL_BITS, p), tupleValue(final, FINAL_BITS, p))).toBe(true)
      }
      expect(keys.size).toBe(search.candidatesFound)
    }
  })

  it('computes exact weighted I1 and uses the very same weights for every benchmark', () => {
    const search = enumerateEndgame(firstState.history, evalTesting.getEndgamePrior())
    const guess = parseWord('人迹罕至', '笔酣墨饱')
    const feedback = testAnswer(guess, parseWord('笔酣墨饱'))
    const g = evalTesting.parseParsedTuples(guess)
    const observed = observedCode(guess, feedback, 'initial') + 81 * observedCode(guess, feedback, 'final') + 6561 * observedCode(guess, feedback, 'pinyin')
    let probability = 0
    search.initials.forEach((initial, p) => {
      if (jointFeedbackCode(g.initial, g.final, initial, search.finals[p]) === observed) probability += search.weights[p]
    })
    const result = evaluate(firstState, guess, true, feedback)!
    expect(result.i1).toBeCloseTo(-Math.log2(probability), 12)
    for (const benchmark of result.sampled!) {
      const parsed = evalTesting.parseWordTuples(benchmark.word)
      expect(benchmark.e1).toBeCloseTo(evalTesting.jointFeedbackEntropy(parsed.initial, parsed.final, search), 12)
      expect(benchmark.ei).toBeCloseTo(benchmark.e1 + result.toneWeight * benchmark.e2, 12)
    }
    expect(result.rank).toBe(result.sampled!.filter(entry => entry.ei < result.playerEI).length)
  })
})

describe('constraints, duplicate feedback and position-free prior', () => {
  const globalPrior = evalTesting.getEndgamePrior()
  const ids = ['a', 'an', 'ba', 'pa'].map(py => {
    const packed = tuple([py, py, py, py])
    return tupleValue(packed.initial, INITIAL_BITS, 0) * 64 + tupleValue(packed.final, FINAL_BITS, 0)
  })
  const prior: EndgamePrior = { ...globalPrior, syllables: globalPrior.syllables.filter(s => ids.includes(s.values[2])) }

  it('matches exhaustive reference filtering, including zero initials and excess duplicates', () => {
    const full = enumerateEndgame([], prior)
    expect(full.candidatesFound).toBe(4 ** 4)
    const guesses = [tuple(['a', 'ba', 'ba', 'an']), tuple(['ba', 'pa', 'a', 'ba']), tuple(['an', 'an', 'pa', 'pa'])]
    for (const index of [0, 1, 17, 43, 105, 255]) {
      const target = { initial: full.initials[index], final: full.finals[index], tone: 0 }
      const history: PinyinHistoryEntry[] = []
      for (const guess of guesses) {
        history.push(historyEntry(guess, target))
        const expected = Array.from(full.initials, (initial, p) => ({ initial, final: full.finals[p] }))
          .filter(row => satisfiesHistory(row.initial, row.final, history)).map(row => `${row.initial}:${row.final}`).sort()
        const actual = enumerateEndgame(history, prior)
        expect(actual.status).toBe('complete')
        expect(Array.from(actual.initials, (initial, p) => `${initial}:${actual.finals[p]}`).sort()).toEqual(expected)
      }
    }
  })

  it('agrees with visible game feedback on repeated and zero-initial syllables', () => {
    const guess = ['a', 'ba', 'ba', 'pa'].map((py, i) => parseChar('甲乙丙丁'[i], `${py}1`))
    const target = ['pa', 'ba', 'an', 'ba'].map((py, i) => parseChar('戊己庚辛'[i], `${py}1`))
    const feedback = testAnswer(guess, target)
    const entry = historyEntry(evalTesting.parseParsedTuples(guess), evalTesting.parseParsedTuples(target))
    expect(entry.initialCode).toBe(observedCode(guess, feedback, 'initial'))
    expect(entry.finalCode).toBe(observedCode(guess, feedback, 'final'))
    expect(entry.code).toBe(observedCode(guess, feedback, 'pinyin'))
  })

  it('has symmetric weights for permutations and responds to syllable frequency ratios', () => {
    const full = enumerateEndgame([], prior)
    const probabilities = new Map(Array.from(full.initials, (initial, p) => [spell(initial, full.finals[p]), full.weights[p]]))
    expect(probabilities.get('ba ba a pa')).toBeCloseTo(probabilities.get('pa ba a ba')!, 14)
    const a = tuple(['ba', 'ba', 'a', 'pa'])
    const b = tuple(['pa', 'ba', 'a', 'ba'])
    expect(endgameStructureSignature(a.initial, a.final)).toBe(endgameStructureSignature(b.initial, b.final))
    const qBa = prior.syllables.find(s => s.values[2] === ids[2])!.probability
    const qPa = prior.syllables.find(s => s.values[2] === ids[3])!.probability
    expect(probabilities.get('ba ba ba ba')! / probabilities.get('pa pa pa pa')!).toBeCloseTo((qBa / qPa) ** 4, 10)
    // Missing signature still has strictly positive prior support.
    const uncovered = enumerateEndgame([], { ...prior, signatureWeights: new Map() })
    expect(uncovered.weights.every(p => p > 0)).toBe(true)
  })

  it('derives the .918/log2(3) red-position information without manual red weights', () => {
    const targets = [tuple(['ba', 'sha', 'ba', 'ba']), tuple(['ba', 'ba', 'sha', 'ba']), tuple(['ba', 'ba', 'ba', 'sha'])]
    const particles = { initials: Uint32Array.from(targets, t => t.initial), finals: Uint32Array.from(targets, t => t.final), weights: Float64Array.from([1 / 3, 1 / 3, 1 / 3]) }
    const queries = [tuple(['a', 'sha', 'a', 'a']), tuple(['a', 'sha', 'sha', 'a']), tuple(['a', 'sha', 'sha', 'sha'])]
    const scores = queries.map(q => evalTesting.jointFeedbackEntropy(q.initial, q.final, particles))
    expect(scores[0]).toBeCloseTo(0.9182958340544896, 12)
    expect(scores[1]).toBeCloseTo(Math.log2(3), 12)
    expect(scores[2]).toBeCloseTo(scores[1], 12)
  })

  it('never exposes partial candidates and detects contradictory feedback', () => {
    const limited = enumerateEndgame([], prior, { maxCandidates: 2 })
    expect(limited.status).toBe('candidate-limit')
    expect(limited.complete).toBe(false)
    expect(limited.candidatesFound).toBe(3)
    expect(limited.initials.length).toBe(0)
    expect(limited.weights.length).toBe(0)
    const noNodes = enumerateEndgame([], prior, { maxNodes: 0 })
    expect(noNodes.status).toBe('node-limit')
    expect(noNodes.nodes).toBe(0)
    const a = tuple(['ba', 'ba', 'ba', 'ba'])
    const b = tuple(['pa', 'pa', 'pa', 'pa'])
    const contradictory = enumerateEndgame([historyEntry(a, a), historyEntry(a, b)], prior)
    expect(contradictory.status).toBe('contradiction')
    expect(contradictory.complete).toBe(true)
    expect(contradictory.initials.length).toBe(0)
  })

  it('completes exactly 4096 candidates and scores all 1000 benchmarks within the time target', () => {
    const startedAt = performance.now()
    const search = enumerateEndgame([], { ...globalPrior, syllables: globalPrior.syllables.slice(0, 8) })
    expect(search.status).toBe('complete')
    expect(search.candidatesFound).toBe(4096)
    const tones = Uint32Array.from({ length: 4096 }, (_, n) =>
      packTuple(Array.from({ length: 4 }, (_, p) => Math.floor(n / 5 ** p) % 5), TONE_BITS))
    const scores = SAMPLED_WORDS.map((word) => {
      const guess = evalTesting.parseWordTuples(word)
      return evalTesting.jointFeedbackEntropy(guess.initial, guess.final, search)
        + feedbackEntropy(guess.tone, tones, TONE_BITS)
    })
    expect(scores.every(Number.isFinite)).toBe(true)
    const elapsedMs = performance.now() - startedAt
    expect(elapsedMs).toBeLessThan(3000)
    console.info('4096加权候选 × 1000词（含声调）', { ms: elapsedMs })
  })
})

describe('information weights and percentile compression', () => {
  it('uses the continuous tone-weight curve at all boundaries', () => {
    for (const j of [0, 9.999, 10]) expect(toneWeightForInformation(j)).toBe(0.5)
    expect(toneWeightForInformation(10.001)).toBeCloseTo(0.50005, 12)
    expect(toneWeightForInformation(15)).toBe(0.75)
    expect(toneWeightForInformation(19.999)).toBeCloseTo(0.99995, 12)
    for (const j of [20, 20.001, 30]) expect(toneWeightForInformation(j)).toBe(1)
  })

  it('forces full compression at product32 and otherwise interpolates from J23 to J30', () => {
    for (const j of [0, 22.999, 23, 26.5, 30, 30.001]) expect(compressionForInformation(j, 32)).toBe(1)
    expect(compressionForInformation(23, 33)).toBe(0)
    expect(compressionForInformation(22.999, 33)).toBe(0)
    expect(compressionForInformation(23.001, 33)).toBeCloseTo(0.001 / 7, 12)
    expect(compressionForInformation(26.5, 33)).toBe(0.5)
    expect(compressionForInformation(29.999, 33)).toBeCloseTo(6.999 / 7, 12)
    expect(compressionForInformation(30, 33)).toBe(1)
    expect(compressionForInformation(30.001, 33)).toBe(1)
    for (const r of [0, 0.40, 0.699, 0.70]) {
      for (const t of [0, 0.5, 1]) expect(compressPercentile(r, t)).toBe(r)
    }
    for (const r of [0.701, 0.90, 0.99, 1]) {
      expect(compressPercentile(r, 0)).toBe(r)
      expect(compressPercentile(r, 0.5)).toBe((r + 0.701) / 2)
      expect(compressPercentile(r, 1)).toBe(0.701)
    }
    expect(ratingFromPercentile(0.70)).toBe('average')
    expect(ratingFromPercentile(0.701)).toBe('good')
    expect(ratingFromPercentile(0.90)).toBe('good')
    expect(ratingFromPercentile(0.900001)).toBe('excellent')
    expect(ratingFromPercentile(0.99)).toBe('excellent')
    expect(ratingFromPercentile(0.990001)).toBe('brilliant')
    expect(ratingFromPercentile(0.50)).toBe('mistake')
    expect(ratingFromPercentile(0.500001)).toBe('average')
    expect(ratingFromPercentile(0.30)).toBe('incorrect')
    expect(ratingFromPercentile(0.300001)).toBe('mistake')
  })

  it('never lets the actual answer feedback change this guess score or percentile', () => {
    const guess = parseWord('人迹罕至')
    const alternative = ['bo', 'han', 'ri', 'bao'].map((py, p) => parseChar('甲乙丙丁'[p], `${py}1`))
    const first = evaluate(firstState, guess, false, testAnswer(guess, parseWord('笔酣墨饱')))!
    const second = evaluate(firstState, guess, false, testAnswer(guess, alternative))!
    expect(second.playerEI).toBe(first.playerEI)
    expect(second.rank).toBe(first.rank)
    expect(second.percentile).toBe(first.percentile)
    expect(second.toneWeight).toBe(first.toneWeight)
    expect(second.i1).not.toBe(first.i1)
  })
})

describe('actual information and session reconstruction', () => {
  it('uses full tone feedback counts, even when the expected tone entropy is sampled', () => {
    const state = createEvalState()
    const answer = parseWord('举一反三')
    const guess = parseWord('研经铸史', '举一反三')
    const before = state.toneRows.length
    const result = advanceEvaluation(state, guess, testAnswer(guess, answer))
    expect(result.result!.toneParticles).toBe(4096)
    expect(result.analysis.i2).toBeCloseTo(-Math.log2(state.toneRows.length / before), 12)
    expect(result.analysis.informationBefore).toBe(0)
    expect(state.information.i1 + state.information.i2).toBe(result.analysis.i1! + result.analysis.i2!)
  })

  it('rebuilds the same cumulative information when historical ranking is skipped', () => {
    const replayed = replay('笔酣墨饱', firstFive)
    expect(replayed.information).toEqual(firstState.information)
    const guess = parseWord('人迹罕至', '笔酣墨饱')
    const feedback = testAnswer(guess, parseWord('笔酣墨饱'))
    const result = advanceEvaluation(replayed, guess, feedback)
    const reference = evaluate(firstState, guess, false, feedback)!
    expect(result.result!.playerEI).toBe(reference.playerEI)
    expect(result.result!.rank).toBe(reference.rank)
    expect(result.result!.percentile).toBe(reference.percentile)
    expect(result.result!.informationBefore).toBe(firstState.information.i1 + firstState.information.i2)
    expect(result.analysis.i1! + firstState.information.i1).toBe(replayed.information.i1)
  })

  it('records missing I1 as a lower bound and resumes after a budget failure', () => {
    const state = structuredClone(firstState)
    const guess = parseWord('人迹罕至', '笔酣墨饱')
    const failed = advanceEvaluation(state, guess, testAnswer(guess, parseWord('笔酣墨饱')), { budget: { maxNodes: 0 } })
    expect(failed.result).toBeNull()
    expect(failed.analysis.search?.status).toBe('node-limit')
    expect(failed.analysis.e1).toBeUndefined()
    expect(failed.analysis.i1).toBeUndefined()
    expect(failed.valid).toBe(true)
    expect(state.history.length).toBe(firstState.history.length + 1)
    expect(state.information.i1).toBe(firstState.information.i1)
    expect(state.information.missingI1).toBe(firstState.information.missingI1 + 1)
    const next = parseWord('墨守成规', '笔酣墨饱')
    const recovered = advanceEvaluation(state, next, testAnswer(next, parseWord('笔酣墨饱')))
    expect(recovered.result).not.toBeNull()
    expect(recovered.analysis.search?.status).toBe('complete')
    expect(recovered.analysis.compression).toBe(1)
    expect(recovered.analysis.informationIsLowerBound).toBe(true)
    expect(recovered.analysis.toneWeight).toBe(toneWeightForInformation(failed.analysis.informationBefore + (failed.analysis.i2 || 0)))
  })
})
