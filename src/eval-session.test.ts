// @vitest-environment jsdom
import { afterAll, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useBreakpoints, useDark, useDebounce, useNow, useStorage } from '@vueuse/core'
import { advanceEvaluation, createEvalState, EVAL_VERSION } from './logic/eval'
import { parseWord, testAnswer } from './logic/utils'

vi.mock('./logic/random', () => ({ getRandomAnswer: () => ({ word: '狂风怒号', hint: '风' }) }))

// Auto-import transforms are disabled by this repository's TEST configuration.
const globals = { computed, nextTick, ref, watch, useBreakpoints, useDark, useDebounce, useNow, useStorage }
const previousGlobals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals))
  vi.stubGlobal(name, value)
afterAll(() => {
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

function expectedInformation(answer: string, words: string[]) {
  const state = createEvalState()
  for (const word of words) {
    const guess = parseWord(word, answer)
    advanceEvaluation(state, guess, testAnswer(guess, parseWord(answer)), { rank: false })
  }
  return state.information
}

it('isolates modes, reconstructs persisted information and handles replaced same-length histories', async () => {
  window.history.replaceState({}, '', '/handle/?word=笔酣墨饱')
  localStorage.clear()
  const dailyWords = ['研经铸史', '先来后到', '投其所好', '分我杯羹', '按部就班']
  // Even current-version cached grades must not skip cumulative information replay.
  localStorage.setItem('handle-tries-meta', JSON.stringify({
    0: { tries: dailyWords, ratings: dailyWords.map(() => 'good'), ratingsVersion: EVAL_VERSION },
  }))
  window.history.replaceState({}, '', '/handle/?word=笔酣墨饱&d=0')
  const app = await import('./state')
  const storage = await import('./storage')
  await nextTick()
  expect(app.evalState.value.history.length).toBe(5)
  expect(app.evalState.value.information).toEqual(expectedInformation('笔酣墨饱', dailyWords))
  const dailyInfo = { ...app.evalState.value.information }
  const dailyRatings = [...storage.meta.value.ratings!]
  storage.showEval.value = false
  await nextTick()
  storage.showEval.value = true
  await nextTick()
  expect(app.evalState.value.information).toEqual(dailyInfo)

  const randomWords = [...dailyWords.slice(0, 4), '生不逢时']
  storage.randomMeta.value = { tries: randomWords, ratings: randomWords.map(() => 'good'), ratingsVersion: EVAL_VERSION }
  app.playMode.value = 'random'
  await nextTick()
  expect(app.evalState.value.information).toEqual(expectedInformation('狂风怒号', randomWords))
  app.playMode.value = 'daily'
  await nextTick()
  expect(app.evalState.value.information).toEqual(dailyInfo)
  expect(storage.meta.value.ratings).toEqual(dailyRatings)

  app.newCustomGame({ a: '举一反三', s: 'shared', h: '' })
  app.playMode.value = 'custom'
  await nextTick()
  storage.tries.value = ['研经铸史']
  await nextTick()
  expect(app.evalState.value.information).toEqual(expectedInformation('举一反三', ['研经铸史']))
  const oldRating = storage.meta.value.ratings![0]
  // A same-length change must not reuse old ratings just because the length matches.
  storage.tries.value = ['搭搭撒撒']
  await nextTick()
  expect(app.evalState.value.information).toEqual(expectedInformation('举一反三', ['搭搭撒撒']))
  expect(storage.meta.value.ratings![0]).not.toBe(oldRating)

  // V3 records require V4 re-evaluation, not just information replay.
  app.playMode.value = 'daily'
  await nextTick()
  storage.customMeta.value = { tries: ['研经铸史'], ratings: ['incorrect'], ratingsVersion: 3 }
  app.playMode.value = 'custom'
  await nextTick()
  expect(storage.meta.value.ratingsVersion).toBe(4)
  expect(storage.meta.value.ratings![0]).not.toBe('incorrect')
  expect(app.evalState.value.information).toEqual(expectedInformation('举一反三', ['研经铸史']))
}, 60000)
