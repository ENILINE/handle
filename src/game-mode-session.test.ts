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
    if (descriptor)
      Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

it('keeps each started game locked to its snapshotted mode', async () => {
  window.history.replaceState({}, '', '/handle/?d=0')
  localStorage.clear()
  localStorage.setItem('handle-mode', 'zy')
  localStorage.setItem('handle-game-mode', 'strict')
  localStorage.setItem('handle-tries-meta', JSON.stringify({
    0: { tries: ['研经铸史'], strict: 'normal' },
  }))
  localStorage.setItem('handle-random-meta', JSON.stringify({
    randomAnswer: { word: '狂风怒号', hint: '风', frequency: 'normal' },
  }))

  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()

  expect(app.activeGameMode.value).toBe('normal')

  app.playMode.value = 'random'
  await nextTick()
  expect(app.activeGameMode.value).toBe('strict')

  storage.gameMode.value = 'unlimited'
  storage.meta.value.strict = app.activeGameMode.value
  storage.tries.value = ['先来后到']

  app.playMode.value = 'daily'
  await nextTick()
  storage.gameMode.value = 'strict'
  expect(app.activeGameMode.value).toBe('normal')

  app.playMode.value = 'random'
  await nextTick()
  expect(app.activeGameMode.value).toBe('unlimited')
})
