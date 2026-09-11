import { describe, expect, it } from 'vitest'
import { parseWord, testAnswer } from '../logic/utils'
import { EvalWorkerEngine } from './worker'
import type { EvalWorkerResponse } from './worker'
import {
  advancePreparedEvaluation,
  analyzeInternalLegacy,
  createEvalState,
  prepareEvaluation,
  rankAnalysisLegacy,
  strictLowerBound,
  updateState,
} from './index'

describe('prepared evaluation parity', () => {
  it('keeps V3 entropy, strict rank, rating and actual information unchanged', () => {
    const answer = parseWord('举一反三')
    const guess = parseWord('研经铸史', '举一反三')
    const feedback = testAnswer(guess, answer)
    const legacyState = createEvalState()
    const preparedState = createEvalState()

    const legacyContext = analyzeInternalLegacy(legacyState, guess, feedback)
    const legacy = rankAnalysisLegacy(legacyState, legacyContext, true)!
    updateState(legacyState, guess, feedback, legacyContext.analysis)

    const prepared = prepareEvaluation(preparedState, { includeDebug: true })
    const current = advancePreparedEvaluation(preparedState, prepared, guess, feedback)

    expect(current.result).not.toBeNull()
    expect(current.result!.e1).toBeCloseTo(legacy.e1, 12)
    expect(current.result!.e2).toBeCloseTo(legacy.e2, 12)
    expect(current.result!.playerEI).toBeCloseTo(legacy.playerEI, 12)
    expect(current.result!.rank).toBe(legacy.rank)
    expect(current.result!.rawPercentile).toBe(legacy.rawPercentile)
    expect(current.result!.percentile).toBe(legacy.percentile)
    expect(current.rating).toBe(legacy.rating)
    expect(current.analysis.i1).toBeCloseTo(legacyContext.analysis.i1!, 12)
    expect(current.analysis.i2).toBeCloseTo(legacyContext.analysis.i2!, 12)
    expect(preparedState.information).toEqual(legacyState.information)
    expect(current.result!.sampled).toEqual(legacy.sampled)
  })

  it('counts only scores strictly lower than the player score', () => {
    const scores = Float64Array.from([1, 2, 2, 2, 3, 4])
    expect(strictLowerBound(scores, 2)).toBe(1)
    expect(strictLowerBound(scores, 2.5)).toBe(4)
    expect(strictLowerBound(scores, 0)).toBe(0)
    expect(strictLowerBound(scores, 5)).toBe(6)
  })
})

describe('evaluation worker engine', () => {
  it('can replay history without preparing a score for a nonexistent next guess', () => {
    const engine = new EvalWorkerEngine()
    const responses: EvalWorkerResponse[] = []

    engine.handle({
      type: 'init',
      sessionId: 6,
      guesses: [],
      ratingsCurrent: false,
      includeDebug: false,
      prepareNext: false,
    }, response => responses.push(response))

    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({
      type: 'ready',
      sessionId: 6,
      index: 0,
      preparationMs: 0,
      generationMs: 0,
      rankingMs: 0,
    })
  })

  it('processes rapid guesses in order and prepares the following turn', () => {
    const engine = new EvalWorkerEngine()
    const responses: EvalWorkerResponse[] = []
    const emit = (response: EvalWorkerResponse) => responses.push(response)
    const answer = parseWord('举一反三')
    const first = parseWord('研经铸史', '举一反三')
    const second = parseWord('先来后到', '举一反三')

    engine.handle({
      type: 'init',
      sessionId: 7,
      guesses: [],
      ratingsCurrent: false,
      includeDebug: false,
    }, emit)
    engine.handle({
      type: 'append',
      sessionId: 7,
      guess: { index: 0, word: '研经铸史', parsed: first, feedback: testAnswer(first, answer) },
      readyWhenSubmitted: true,
      submittedAt: Date.now(),
    }, emit)
    engine.handle({
      type: 'append',
      sessionId: 7,
      guess: { index: 1, word: '先来后到', parsed: second, feedback: testAnswer(second, answer) },
      readyWhenSubmitted: false,
      submittedAt: Date.now(),
    }, emit)

    const guesses = responses.filter(response => response.type === 'guess')
    const ready = responses.filter(response => response.type === 'ready')
    expect(guesses.map(response => response.type === 'guess' && response.index)).toEqual([0, 1])
    expect(guesses.map(response => response.type === 'guess' && response.word)).toEqual(['研经铸史', '先来后到'])
    expect(guesses[0].type === 'guess' && guesses[0].result?.readyBeforeSubmit).toBe(true)
    expect(guesses[1].type === 'guess' && guesses[1].result?.readyBeforeSubmit).toBe(false)
    expect(ready.at(-1)?.type === 'ready' && ready.at(-1)?.index).toBe(2)
    expect(ready.at(-1)?.type === 'ready' && ready.at(-1)?.snapshot.historyLength).toBe(2)
  }, 15000)
})
