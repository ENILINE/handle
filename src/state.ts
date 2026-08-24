import { breakpointsTailwind } from '@vueuse/core'
import type { MatchType, ParsedChar } from './logic'
import { START_DATE, TRIES_LIMIT, WORD_LENGTH, parseWord as _parseWord, testAnswer as _testAnswer, checkPass, getHint, isDstObserved, numberToHanzi } from './logic'
import { playMode as _playMode, useNumberTone as _useNumberTone, customMeta, frequencyLevel, gameMode as _gameMode, inputMode, meta, randomMeta, spMode, tries } from './storage'
import { getAnswerOfDay } from './answers'
import { getRandomAnswer } from './logic/random'
import { decodeCustom, encodeCustom } from './logic/encode'
import type { CustomPayload } from './logic/types'
import { EVAL_VERSION, canAppendEvaluation, canReuseRatings, createEvalState, evaluate, updateState } from './logic/eval'
import type { EvalResult, EvalState } from './logic/eval'

export const isIOS = /iPad|iPhone|iPod/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isMobile = isIOS || /iPad|iPhone|iPod|Android|Phone|webOS/i.test(navigator.userAgent)
export const breakpoints = useBreakpoints(breakpointsTailwind)

export const now = useNow({ interval: 1000 })
export const isDark = useDark()
export const showHint = ref(false)
export const showSettings = ref(false)
export const showHelp = ref(false)
export const showShare = ref(false)
export const showFailed = ref(false)
export const showDashboard = ref(false)
export const showVariants = ref(false)
export const showCheatSheet = ref(false)
export const showShareDialog = ref(false)
export const useMask = ref(false)
export const showIdiomExplanation = ref(false)
export const idiomSearchWord = ref('')
export const showCustomShare = ref(false)
export const showCustomAnswer = ref(false)

export const playMode = ref(_playMode.value)
export const isSwitchingMode = ref(false)
watch(playMode, (v) => {
  _playMode.value = v
  useMask.value = false
  isSwitchingMode.value = true
  nextTick(() => { isSwitchingMode.value = false })
})
watch(_playMode, (v) => {
  playMode.value = v
})

export const randomSeed = ref(0)

export function newRandomGame() {
  randomMeta.value = {}
  randomSeed.value++
}

watch(frequencyLevel, () => {
  if (playMode.value === 'random')
    newRandomGame()
})

export const randomAnswer = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  randomSeed.value // dependency: regenerates when randomSeed changes
  return getRandomAnswer(frequencyLevel.value)
})

export const useNumberTone = computed(() => {
  if (inputMode.value === 'sp')
    return true
  if (inputMode.value === 'zy')
    return false
  return _useNumberTone.value
})

const params = new URLSearchParams(window.location.search)
export const isDev = !!import.meta.hot || params.get('dev') === 'hey'
export const daySince = useDebounce(computed(() => {
  // Adjust date for daylight saving time, assuming START_DATE is not in DST
  const adjustedNow = isDstObserved(now.value) ? new Date(+now.value + 3600000) : now.value
  return Math.floor((+adjustedNow - +START_DATE) / 86400000)
}))

// Custom mode: decode URL param
const customParam = params.get('custom')
const customPayload = ref<CustomPayload | null>(customParam ? decodeCustom(customParam) : null)

export const customOrigin = computed(() => customPayload.value?.s || 'own')

if (customPayload.value) {
  playMode.value = 'custom'
  // Pre-load shared state
  if (customPayload.value.m)
    _gameMode.value = customPayload.value.m
  if (customPayload.value.t && customPayload.value.t.length > 0) {
    customMeta.value = { tries: customPayload.value.t }
  }
}

if (params.get('mode') === 'random' && !customPayload.value)
  playMode.value = 'random'

export const dayNo = ref(+(params.get('d') || daySince.value))
export const dayNoHanzi = computed(() => `${numberToHanzi(dayNo.value)}日`)

export const answer = computed(() => {
  if (playMode.value === 'custom') {
    if (!customPayload.value?.a)
      return { word: '', hint: '' }
    const hKey = customPayload.value && 'h' in customPayload.value
    return {
      word: customPayload.value.a,
      hint: hKey ? (customPayload.value!.h || '') : getHint(customPayload.value!.a),
    }
  }
  if (playMode.value === 'random')
    return randomAnswer.value
  if (params.get('word'))
    return {
      word: params.get('word')!,
      hint: getHint(params.get('word')!),
    }
  return getAnswerOfDay(dayNo.value)
})

export const hint = computed(() => answer.value?.hint || '')
export const parsedAnswer = computed(() => answer.value?.word ? parseWord(answer.value.word) : [] as unknown as ReturnType<typeof parseWord>)

export const isPassed = computed(() => meta.value.passed || (tries.value.length > 0 && checkPass(testAnswer(parseWord(tries.value[tries.value.length - 1])))))
export const isFailed = computed(() => {
  if (playMode.value === 'custom' && customOrigin.value === 'own')
    return false
  return !isPassed.value && tries.value.length >= TRIES_LIMIT
})
export const isFinished = computed(() => {
  if (playMode.value === 'custom' && customOrigin.value === 'own')
    return isPassed.value
  return isPassed.value || !!meta.value.answer
})

export function parseWord(word: string, _ans: string = answer.value?.word || '', mode = inputMode.value, spM = spMode.value) {
  return _parseWord(word, _ans, mode, spM)
}

export function testAnswer(word: ParsedChar[], ans = parsedAnswer.value) {
  return _testAnswer(word, ans)
}

export const parsedTries = computed(() => tries.value.map((i) => {
  const word = parseWord(i)
  const result = testAnswer(word)
  return {
    word,
    result,
  }
}))

export function getSymbolState(symbol?: string | number, key?: '_1' | '_2' | 'tone' | 'py') {
  const results: MatchType[] = []
  for (const t of parsedTries.value) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const w = t.word[i]
      const r = t.result[i]
      if (key) {
        if (key === 'py') {
          if (w.yin === symbol)
            results.push(r.py)
        }
        else if (w[key] === symbol) {
          results.push(r[key])
        }
      }
      else {
        if (w._1 === symbol)
          results.push(r._1)
        if (w._2 === symbol)
          results.push(r._2)
        if (w._3 === symbol)
          results.push(r._3)
      }
    }
  }
  if (results.includes('exact'))
    return 'exact'
  if (results.includes('misplaced'))
    return 'misplaced'
  if (results.includes('none'))
    return 'none'
  return null
}

// Custom mode actions
export function newCustomGame(payload: CustomPayload) {
  customMeta.value = {}
  customPayload.value = payload
  const encoded = encodeCustom(payload)
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('custom', encoded)
  window.history.replaceState({}, '', url.toString())
}

export function resetCustomGame() {
  customMeta.value = {}
  customPayload.value = null
  showCustomAnswer.value = false
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('mode', 'custom')
  window.history.replaceState({}, '', url.toString())
}

// ============ Evaluation ============

export const evalState = ref<EvalState>(createEvalState())
export const triesRatings = computed(() => meta.value.ratings || [])
export const lastEvalDebug = ref<EvalResult | null>(null)

const evalGameKey = computed(() => {
  if (playMode.value === 'daily')
    return `daily:${dayNo.value}:${answer.value.word}`
  if (playMode.value === 'random')
    return `random:${randomSeed.value}:${answer.value.word}`
  return `custom:${customOrigin.value}:${answer.value.word}`
})

let evaluatedGameKey = ''
let evaluatedWords: string[] = []

function evaluateAndApply(
  state: EvalState,
  word: string,
  shouldEvaluate: boolean,
  includeDebug: boolean,
): EvalResult | null {
  try {
    const startedAt = performance.now()
    const parsed = parseWord(word)
    const feedback = testAnswer(parsed)
    const result = shouldEvaluate ? evaluate(state, parsed, includeDebug) : null
    const valid = updateState(state, parsed, feedback)
    if (result) {
      result.initialPosterior = state.initialRows.length
      result.finalPosterior = state.finalRows.length
      result.elapsedMs = performance.now() - startedAt
    }
    if (!valid && isDev)
      console.warn('[evaluation] posterior became empty', { word, feedback })
    return valid ? result : null
  }
  catch (error) {
    state.valid = false
    if (isDev)
      console.warn('[evaluation] unsupported guess; evaluation disabled for this game', { word, error })
    return null
  }
}

function rebuildEvaluation(words: readonly string[]): void {
  const state = createEvalState()
  const storedRatingsAreCurrent = canReuseRatings(
    meta.value.ratingsVersion,
    meta.value.ratings?.length,
    words.length,
  )
  const ratings = storedRatingsAreCurrent
    ? [...meta.value.ratings!]
    : Array.from({ length: words.length }, () => null)

  lastEvalDebug.value = null
  for (let index = 0; index < words.length; index++) {
    const shouldEvaluate = !storedRatingsAreCurrent || (isDev && index === words.length - 1)
    const result = evaluateAndApply(
      state,
      words[index],
      shouldEvaluate,
      isDev && index === words.length - 1,
    )
    if (!storedRatingsAreCurrent)
      ratings[index] = result?.rating ?? null
    else if (!state.valid)
      ratings[index] = null
    if (isDev && index === words.length - 1)
      lastEvalDebug.value = result
  }

  evalState.value = state
  meta.value.ratings = ratings
  meta.value.ratingsVersion = EVAL_VERSION
}

function appendEvaluations(words: readonly string[]): void {
  const ratings = meta.value.ratingsVersion === EVAL_VERSION
    ? [...(meta.value.ratings || [])]
    : []

  for (let index = evaluatedWords.length; index < words.length; index++) {
    const result = evaluateAndApply(evalState.value, words[index], true, isDev)
    ratings[index] = result?.rating ?? null
    if (isDev)
      lastEvalDebug.value = result
  }

  meta.value.ratings = ratings
  meta.value.ratingsVersion = EVAL_VERSION
}

watch(
  [evalGameKey, () => tries.value.join('\u0000')],
  ([gameKey]) => {
    const words = [...tries.value]
    const canAppend = canAppendEvaluation(evaluatedGameKey, evaluatedWords, gameKey, words)

    if (canAppend)
      appendEvaluations(words)
    else if (gameKey !== evaluatedGameKey || words.join('\u0000') !== evaluatedWords.join('\u0000'))
      rebuildEvaluation(words)

    evaluatedGameKey = gameKey
    evaluatedWords = words
  },
  { immediate: true, flush: 'sync' },
)
