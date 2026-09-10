import type { CareerRecord, Rating } from './logic/types'
import { parseWord, testAnswer } from './logic/utils'
import type { EvalWorkerRequest, EvalWorkerResponse } from './eval/worker'
import { createEvaluationWorker } from './eval/worker-factory'

let nextSessionId = 1

export interface CareerEvaluationCallbacks {
  update: (ratings: Array<Rating | null>) => void
  complete: (ratings: Array<Rating | null>) => void
  error?: (message: string) => void
}

export function startCareerEvaluation(record: CareerRecord, callbacks: CareerEvaluationCallbacks): () => void {
  const worker = createEvaluationWorker()
  const sessionId = nextSessionId++
  const ratings: Array<Rating | null> = Array.from({ length: record.tries.length }, () => null)
  let stopped = false

  worker.onmessage = (event: MessageEvent<EvalWorkerResponse>) => {
    if (stopped || event.data.sessionId !== sessionId)
      return
    const response = event.data
    if (response.type === 'error') {
      callbacks.error?.(response.message)
      worker.terminate()
      stopped = true
      return
    }
    if (response.type === 'guess' && response.applyRating) {
      ratings[response.index] = response.rating
      callbacks.update([...ratings])
      return
    }
    if (response.type === 'ready' && response.index === record.tries.length) {
      callbacks.complete([...ratings])
      worker.terminate()
      stopped = true
    }
  }
  worker.onerror = (event) => {
    if (!stopped)
      callbacks.error?.(event.message || 'Worker error')
    worker.terminate()
    stopped = true
  }

  const parsedAnswer = parseWord(record.answer, record.answer, 'py')
  const request: EvalWorkerRequest = {
    type: 'init',
    sessionId,
    ratingsCurrent: false,
    includeDebug: false,
    prepareNext: false,
    guesses: record.tries.map((word, index) => {
      const parsed = parseWord(word, record.answer, 'py')
      return {
        index,
        word,
        parsed,
        feedback: testAnswer(parsed, parsedAnswer),
      }
    }),
  }
  worker.postMessage(request)

  return () => {
    if (stopped)
      return
    stopped = true
    worker.terminate()
  }
}

