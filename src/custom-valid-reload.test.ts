// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'
import { encodeCustom } from './logic/encode'
import { setEvaluationWorkerFactoryForTests } from './eval/worker-factory'
import { createInlineEvaluationWorker } from './eval/worker-test'

vi.mock('./logic/random', () => ({ getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }) }))

const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
setEvaluationWorkerFactoryForTests(createInlineEvaluationWorker)
afterAll(() => {
  setEvaluationWorkerFactoryForTests()
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

function customKey(encoded: string): string {
  let hash = 5381
  for (let i = 0; i < encoded.length; i++) hash = ((hash << 5) + hash + encoded.charCodeAt(i)) | 0
  return `handle-custom-${Math.abs(hash)}`
}

async function waitUntil(check: () => boolean, timeout = 15000): Promise<void> {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout)
      throw new Error('Timed out waiting for evaluation worker')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

it('restores saved guesses when a valid custom URL supplies the answer', async () => {
  const encoded = encodeCustom({ a: '举一反三', s: 'shared', m: 'normal', h: '' })
  window.history.replaceState({}, '', `/handle/?custom=${encoded}`)
  localStorage.clear()
  localStorage.setItem('handle-play-mode', 'custom')
  localStorage.setItem(customKey(encoded), JSON.stringify({ tries: ['先来后到'] }))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()
  await waitUntil(() => app.evalSessionSnapshot.value.historyLength === 1)

  expect(app.answer.value.word).toBe('举一反三')
  expect(storage.tries.value).toEqual(['先来后到'])
  expect(app.parsedAnswer.value).toHaveLength(4)
  expect(app.parsedTries.value).toHaveLength(1)
  expect(app.parsedTries.value[0].result).toHaveLength(4)
  expect(app.evalSessionSnapshot.value.historyLength).toBe(1)
  expect(warn).not.toHaveBeenCalledWith(
    '[evaluation] unsupported guess; evaluation disabled for this game',
    expect.anything(),
  )
  warn.mockRestore()
}, 15000)
