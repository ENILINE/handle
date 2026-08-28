// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'

vi.mock('./logic/random', () => ({ getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }) }))

const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
afterAll(() => {
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

it('opens the custom creation screen safely when persisted tries have no URL answer', async () => {
  window.history.replaceState({}, '', '/handle/?mode=custom')
  localStorage.clear()
  localStorage.setItem('handle-play-mode', 'custom')
  localStorage.setItem('handle-custom-own', JSON.stringify({
    tries: ['先来后到'], ratings: ['good'], ratingsVersion: 5,
  }))
  const warnings: unknown[][] = []
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => warnings.push(args))
  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()

  expect(app.playMode.value).toBe('custom')
  expect(app.answer.value.word).toBe('')
  // The orphaned data is preserved, but ignored until a URL supplies an answer
  // or the user confirms a replacement puzzle.
  expect(storage.customMeta.value.tries).toEqual(['先来后到'])
  expect(storage.tries.value).toEqual(['先来后到'])
  expect(app.parsedAnswer.value).toEqual([])
  expect(app.parsedTries.value).toEqual([])
  expect(app.isPassed.value).toBe(false)
  expect(app.isFailed.value).toBe(false)
  expect(app.isFinished.value).toBe(false)
  expect(app.evalState.value.history).toEqual([])
  expect(warnings.some(args => args[0] === '[evaluation] unsupported guess; evaluation disabled for this game')).toBe(false)
  warn.mockRestore()
}, 15000)

it('ignores a late orphaned guess instead of throwing during a scheduler flush', async () => {
  const app = await import('./state')
  const storage = await import('./storage')
  storage.customMeta.value = { tries: ['先来后到'] }
  await nextTick()
  expect(app.parsedTries.value).toEqual([])
  expect(app.isPassed.value).toBe(false)
  expect(app.evalState.value.history).toEqual([])
})
