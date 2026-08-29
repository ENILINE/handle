// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'
import { setEvaluationWorkerFactoryForTests } from './logic/eval-worker-factory'

vi.mock('./logic/random', () => ({ getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }) }))

const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
setEvaluationWorkerFactoryForTests(() => { throw new Error('worker blocked') })

afterAll(() => {
  setEvaluationWorkerFactoryForTests()
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

it('disables evaluation after retrying without falling back to the main thread', async () => {
  window.history.replaceState({}, '', '/handle/?word=举一反三&d=0&dev=hey')
  localStorage.clear()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()

  expect(app.evalWorkerDisabled.value).toBe(true)
  storage.tries.value = ['研经铸史']
  await nextTick()
  expect(storage.meta.value.ratings).toEqual([null])
  expect(storage.meta.value.ratingsVersion).toBeUndefined()
  expect(app.evalSessionSnapshot.value.historyLength).toBe(0)
  expect(warn).toHaveBeenCalledWith(
    '[evaluation] worker unavailable; evaluation disabled for this game',
    expect.anything(),
  )
  warn.mockRestore()
})
