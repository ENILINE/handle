// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'
import { EvalWorkerEngine } from './worker'
import type { EvalWorkerRequest, EvalWorkerResponse } from './worker'
import { EVAL_VERSION } from './version'
import { setEvaluationWorkerFactoryForTests } from './worker-factory'

vi.mock('../logic/random', () => ({ getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }) }))

const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)

class ControlledWorker {
  onmessage: ((event: MessageEvent<EvalWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly requests: EvalWorkerRequest[] = []
  readonly engine = new EvalWorkerEngine()
  terminated = false

  postMessage(request: EvalWorkerRequest): void {
    this.requests.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  flushOne(): void {
    const request = this.requests.shift()
    if (!request)
      throw new Error('No worker request to flush')
    this.engine.handle(request, response => this.onmessage?.({ data: response } as MessageEvent<EvalWorkerResponse>))
  }

  force(response: EvalWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<EvalWorkerResponse>)
  }
}

const workers: ControlledWorker[] = []
setEvaluationWorkerFactoryForTests(() => {
  const worker = new ControlledWorker()
  workers.push(worker)
  return worker as unknown as Worker
})

afterAll(() => {
  setEvaluationWorkerFactoryForTests()
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

it('persists only resolved ratings and ignores responses from a terminated mode session', async () => {
  window.history.replaceState({}, '', '/handle/?word=举一反三&d=0')
  localStorage.clear()
  const app = await import('../state')
  const storage = await import('../storage')
  await nextTick()
  const dailyWorker = workers[0]
  const dailySession = (dailyWorker.requests[0] as Extract<EvalWorkerRequest, { type: 'init' }>).sessionId

  storage.tries.value = ['研经铸史']
  await nextTick()
  expect(storage.meta.value.ratings).toEqual([null])
  expect(storage.meta.value.ratingsVersion).toBeUndefined()
  expect(dailyWorker.requests.map(request => request.type)).toEqual(['init', 'append'])

  dailyWorker.flushOne()
  expect(storage.meta.value.ratingsVersion).toBeUndefined()
  dailyWorker.flushOne()
  expect(storage.meta.value.ratings?.[0]).not.toBeNull()
  expect(storage.meta.value.ratingsVersion).toBe(EVAL_VERSION)
  expect(app.evalSessionSnapshot.value.historyLength).toBe(1)

  app.playMode.value = 'random'
  await nextTick()
  expect(dailyWorker.terminated).toBe(true)
  expect(app.evalSessionSnapshot.value.historyLength).toBe(0)
  dailyWorker.force({
    type: 'ready',
    sessionId: dailySession,
    index: 99,
    preparationMs: 0,
    generationMs: 0,
    rankingMs: 0,
    snapshot: {
      historyLength: 99,
      visibleHistoryLength: 99,
      information: { i1: 99, i2: 99, missingI1: 0, missingI2: 0 },
      valid: true,
      diagnostics: null,
    },
  })
  expect(app.evalSessionSnapshot.value.historyLength).toBe(0)

  const randomWorker = workers[1]
  expect(randomWorker.terminated).toBe(false)
  storage.tries.value = ['研经铸史']
  await nextTick()
  storage.showEval.value = true
  storage.inputMode.value = 'zy'
  await nextTick()
  expect(app.evaluationAvailable.value).toBe(false)
  expect(app.evaluationEnabled.value).toBe(false)
  expect(storage.showEval.value).toBe(true)
  expect(randomWorker.terminated).toBe(true)

  const workerCount = workers.length
  storage.inputMode.value = 'sp'
  await nextTick()
  expect(workers).toHaveLength(workerCount)

  storage.inputMode.value = 'py'
  await nextTick()
  expect(app.evaluationAvailable.value).toBe(true)
  expect(app.evaluationEnabled.value).toBe(true)
  expect(workers).toHaveLength(workerCount + 1)
  const restoredWorker = workers.at(-1)!
  expect((restoredWorker.requests[0] as Extract<EvalWorkerRequest, { type: 'init' }>).guesses.map(guess => guess.word)).toEqual(['研经铸史'])

  storage.showEval.value = false
  await nextTick()
  expect(app.evaluationEnabled.value).toBe(false)
  expect(restoredWorker.terminated).toBe(false)

  storage.gameMode.value = 'strict'
  await nextTick()
  expect(app.evaluationAvailable.value).toBe(false)
  expect(storage.showEval.value).toBe(false)
  expect(restoredWorker.terminated).toBe(true)

  storage.gameMode.value = 'unlimited'
  await nextTick()
  expect(app.evaluationAvailable.value).toBe(true)
  expect(app.evaluationEnabled.value).toBe(false)
  expect(workers.at(-1)?.terminated).toBe(false)
}, 15000)
