import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CareerRecord } from './logic/types'
import type { EvalWorkerRequest, EvalWorkerResponse } from './eval/worker'
import { setEvaluationWorkerFactoryForTests } from './eval/worker-factory'
import { startCareerEvaluation } from './career-evaluation'

class FakeWorker {
  onmessage: ((event: MessageEvent<EvalWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  requests: EvalWorkerRequest[] = []
  terminate = vi.fn()

  postMessage(request: EvalWorkerRequest) {
    this.requests.push(request)
  }

  emit(response: EvalWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<EvalWorkerResponse>)
  }
}

function record(): CareerRecord {
  return {
    id: 'random:test',
    playMode: 'random',
    answer: '举一反三',
    frequency: 'normal',
    gameMode: 'normal',
    tries: ['研经铸史'],
    hintUsed: false,
    hintLevel: 0,
    outcome: 'win',
    resultAt: 1,
    duration: 1000,
    ratings: [],
  }
}

afterEach(() => setEvaluationWorkerFactoryForTests())

describe('career evaluation worker', () => {
  it('uses an isolated replay session and ignores messages after leaving details', () => {
    const worker = new FakeWorker()
    setEvaluationWorkerFactoryForTests(() => worker as unknown as Worker)
    const update = vi.fn()
    const complete = vi.fn()
    const stop = startCareerEvaluation(record(), { update, complete })
    const request = worker.requests[0]

    expect(request).toMatchObject({
      type: 'init',
      ratingsCurrent: false,
      includeDebug: false,
      prepareNext: false,
    })
    expect(request.type === 'init' && request.guesses).toHaveLength(1)

    const sessionId = request.sessionId
    worker.emit({
      type: 'guess',
      sessionId,
      index: 0,
      word: '研经铸史',
      applyRating: true,
      rating: 'good',
      result: null,
      snapshot: {
        historyLength: 1,
        visibleHistoryLength: 1,
        information: { i1: 0, i2: 0, missingI1: 0, missingI2: 0 },
        valid: true,
        diagnostics: null,
      },
    })
    expect(update).toHaveBeenCalledWith(['good'])

    stop()
    worker.emit({
      type: 'ready',
      sessionId,
      index: 1,
      preparationMs: 0,
      generationMs: 0,
      rankingMs: 0,
      snapshot: {
        historyLength: 1,
        visibleHistoryLength: 1,
        information: { i1: 0, i2: 0, missingI1: 0, missingI2: 0 },
        valid: true,
        diagnostics: null,
      },
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
  })
})
