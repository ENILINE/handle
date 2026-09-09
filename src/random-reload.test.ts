// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'

vi.mock('./logic/random', () => ({
  getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }),
}))

const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
afterAll(() => {
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

it('restores a random answer with its guesses and can reveal it after ten guesses', async () => {
  window.history.replaceState({}, '', '/handle/?mode=random')
  localStorage.clear()
  localStorage.setItem('handle-play-mode', 'random')
  localStorage.setItem('handle-game-mode', 'strict')
  localStorage.setItem('handle-random-meta', JSON.stringify({
    tries: Array.from({ length: 10 }, () => '先来后到'),
    strict: 'strict',
    randomAnswer: {
      word: '举一反三',
      hint: '一',
      frequency: 'normal',
    },
  }))

  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()

  expect(app.answer.value).toEqual({ word: '举一反三', hint: '一' })
  expect(storage.tries.value).toHaveLength(10)
  expect(app.isFailed.value).toBe(true)
  expect(app.isFinished.value).toBe(false)

  app.showGiveUp.value = true
  app.revealAnswerAsFailure()
  expect(app.showGiveUp.value).toBe(false)
  expect(storage.meta.value.failed).toBe(true)
  expect(storage.meta.value.answer).toBe(true)
  expect(app.isFinished.value).toBe(true)
})
