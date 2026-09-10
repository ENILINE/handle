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
  const career = await import('./career')
  await nextTick()

  expect(app.answer.value).toEqual({ word: '举一反三', hint: '一' })
  expect(storage.tries.value).toHaveLength(10)
  expect(app.isFailed.value).toBe(true)
  expect(app.isFinished.value).toBe(false)
  const formalFailureTime = storage.meta.value.resultAt
  expect(formalFailureTime).toBeTypeOf('number')

  app.showGiveUp.value = true
  app.revealAnswerAsFailure()
  await nextTick()
  expect(app.showGiveUp.value).toBe(false)
  expect(storage.meta.value.failed).toBe(true)
  expect(storage.meta.value.answer).toBe(true)
  expect(storage.meta.value.resultAt).toBe(formalFailureTime)
  expect(app.isFinished.value).toBe(true)
  const firstRoundId = storage.randomMeta.value.randomAnswer!.roundId!
  expect(storage.randomHistory.value[firstRoundId]).toMatchObject({
    answer: '举一反三',
    playMode: 'random',
    frequency: 'normal',
    outcome: 'failed',
  })

  app.newRandomGame()
  await nextTick()
  const secondRoundId = storage.randomMeta.value.randomAnswer!.roundId!
  expect(secondRoundId).not.toBe(firstRoundId)
  expect(storage.randomHistory.value[firstRoundId]).toBeTruthy()
  expect(storage.tries.value).toEqual([])

  storage.tries.value = ['先来后到']
  app.revealAnswerAsFailure()
  await nextTick()
  expect(storage.randomHistory.value[secondRoundId]).toMatchObject({
    answer: '狂风怒号',
    outcome: 'failed',
  })
  career.saveCareerRatings(storage.randomHistory.value[secondRoundId], ['good'], 'test-version')
  expect(storage.randomHistory.value[secondRoundId].ratings).toEqual(['good'])
  expect(storage.randomMeta.value.ratings).toEqual(['good'])

  const storedAnswer = app.answer.value
  app.resetRandomGameProgress()
  expect(app.answer.value).toEqual(storedAnswer)
  expect(storage.tries.value).toEqual([])
  expect(storage.randomMeta.value).toMatchObject({
    randomAnswer: {
      word: '狂风怒号',
      hint: '风',
      frequency: 'normal',
    },
    tries: [],
  })
  expect(storage.randomHistory.value[secondRoundId]).toBeUndefined()
  expect(storage.randomHistory.value[firstRoundId]).toBeTruthy()

  storage.tries.value = ['先来后到']
  app.newRandomGame()
  expect(app.answer.value).toEqual({ word: '狂风怒号', hint: '风' })
  expect(storage.tries.value).toEqual([])
})
