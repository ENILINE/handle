import { breakpointsTailwind } from '@vueuse/core'
import type { MatchType, ParsedChar } from './logic'
import { START_DATE, TRIES_LIMIT, WORD_LENGTH, parseWord as _parseWord, testAnswer as _testAnswer, checkPass, getHint, isDstObserved, numberToHanzi } from './logic'
import { playMode as _playMode, useNumberTone as _useNumberTone, customMeta, frequencyLevel, gameMode as _gameMode, inputMode, meta, randomMeta, showEval, spMode, tries } from './storage'
import { getAnswerOfDay } from './answers'
import { getRandomAnswer } from './logic/random'
import { decodeCustom, encodeCustom } from './logic/encode'
import type { CustomPayload } from './logic/types'
import { EVAL_VERSION, canAppendEvaluation, canReuseRatings } from './eval/version'
import type { EvalResult } from './eval'
import type { EvalDebugTraceEntry, EvalSessionSnapshot, EvalWorkerRequest, EvalWorkerResponse } from './eval/worker'
import { createEvaluationWorker } from './eval/worker-factory'
import { isEvaluationAvailable } from './eval/presentation'

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

export const activeGameMode = computed(() => meta.value.strict ?? _gameMode.value)
export const evaluationAvailable = computed(() => isEvaluationAvailable(inputMode.value, activeGameMode.value))
export const evaluationEnabled = computed(() => evaluationAvailable.value && showEval.value)

const params = new URLSearchParams(window.location.search)
export const isDev = import.meta.env.DEV || params.get('dev') === 'hey'
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
const hasActiveAnswer = computed(() => parsedAnswer.value.length === WORD_LENGTH)

export const isPassed = computed(() => hasActiveAnswer.value
  && (meta.value.passed || (tries.value.length > 0 && checkPass(testAnswer(parseWord(tries.value[tries.value.length - 1]))))))
export const isFailed = computed(() => {
  if (!hasActiveAnswer.value)
    return false
  if (playMode.value === 'custom' && customOrigin.value === 'own')
    return false
  return !isPassed.value && tries.value.length >= TRIES_LIMIT
})
export const isFinished = computed(() => {
  if (!hasActiveAnswer.value)
    return false
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

export const parsedTries = computed(() => {
  if (!hasActiveAnswer.value)
    return []
  return tries.value.map((i) => {
    const word = parseWord(i)
    const result = testAnswer(word)
    return {
      word,
      result,
    }
  })
})

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

function emptyEvalSnapshot(): EvalSessionSnapshot {
  return {
    historyLength: 0,
    visibleHistoryLength: 0,
    information: { i1: 0, i2: 0, missingI1: 0, missingI2: 0 },
    valid: true,
    diagnostics: null,
  }
}

export const evalSessionSnapshot = ref<EvalSessionSnapshot>(emptyEvalSnapshot())
export const triesRatings = computed(() => meta.value.ratings || [])
export const lastEvalDebug = ref<EvalResult | null>(null)
export const evalDebugTrace = ref<EvalDebugTraceEntry[]>([])
export const evalReadyIndex = ref(-1)
export const evalWorkerDisabled = ref(false)

const evalGameKey = computed(() => {
  if (playMode.value === 'daily')
    return `daily:${dayNo.value}:${answer.value.word}`
  if (playMode.value === 'random')
    return `random:${randomSeed.value}:${answer.value.word}`
  return `custom:${customOrigin.value}:${answer.value.word}`
})

let evaluatedGameKey = ''
let evaluatedWords: string[] = []
let evalWorker: Worker | null = null
let evalSessionId = 0
let evalWorkerFailures = 0
let activeEvalGameKey = ''
let activeEvalWords: string[] = []
let pendingEvalRatings = new Set<number>()

function terminateEvalWorker(): void {
  evalWorker?.terminate()
  evalWorker = null
  evalReadyIndex.value = -1
}

function createWorkerGuess(word: string, index: number) {
  const parsed = parseWord(word)
  return {
    index,
    word,
    parsed,
    feedback: testAnswer(parsed),
  }
}

function isCurrentEvalSession(sessionId: number): boolean {
  return sessionId === evalSessionId
    && activeEvalGameKey === evalGameKey.value
    && hasActiveAnswer.value
    && evaluationAvailable.value
}

function persistRatingsVersionIfComplete(): void {
  if (pendingEvalRatings.size || meta.value.ratings?.length !== activeEvalWords.length)
    return
  meta.value.ratingsVersion = EVAL_VERSION
}

function handleEvalWorkerMessage(event: MessageEvent<EvalWorkerResponse>): void {
  const response = event.data
  if (!isCurrentEvalSession(response.sessionId))
    return
  if (response.type === 'error') {
    handleEvalWorkerFailure(response.sessionId, response.message)
    return
  }

  evalSessionSnapshot.value = response.snapshot
  if (response.type === 'ready') {
    evalReadyIndex.value = response.index
    persistRatingsVersionIfComplete()
    return
  }
  if (activeEvalWords[response.index] !== response.word)
    return

  if (response.trace) {
    const trace = [...evalDebugTrace.value]
    trace[response.index] = response.trace
    evalDebugTrace.value = trace
  }
  if (response.result && response.index === activeEvalWords.length - 1)
    lastEvalDebug.value = response.result
  if (response.applyRating) {
    const ratings = [...(meta.value.ratings || [])]
    ratings[response.index] = response.rating
    meta.value.ratings = ratings
    pendingEvalRatings.delete(response.index)
    persistRatingsVersionIfComplete()
  }
  if (response.result?.reason && isDev)
    console.warn('[evaluation] guess paused', { word: response.word, reason: response.result.reason })
  if (!response.snapshot.valid && isDev)
    console.warn('[evaluation] posterior became empty', { word: response.word })
}

function launchEvalWorker(request: EvalWorkerRequest): void {
  const sessionId = request.sessionId
  try {
    const worker = createEvaluationWorker()
    evalWorker = worker
    worker.onmessage = handleEvalWorkerMessage
    worker.onerror = event => handleEvalWorkerFailure(sessionId, event.message || 'Worker error')
    worker.postMessage(request)
  }
  catch (error) {
    handleEvalWorkerFailure(sessionId, error instanceof Error ? error.message : String(error))
  }
}

function handleEvalWorkerFailure(sessionId: number, message: string): void {
  if (!isCurrentEvalSession(sessionId))
    return
  terminateEvalWorker()
  evalWorkerFailures++
  if (evalWorkerFailures <= 1) {
    startEvaluationSession(activeEvalGameKey, activeEvalWords, false, false)
    return
  }
  evalWorkerDisabled.value = true
  meta.value.ratingsVersion = undefined
  if (isDev)
    console.warn('[evaluation] worker unavailable; evaluation disabled for this game', { message })
}

function startEvaluationSession(
  gameKey: string,
  words: readonly string[],
  replacedHistory: boolean,
  resetFailures = true,
): void {
  terminateEvalWorker()
  evalSessionId++
  activeEvalGameKey = gameKey
  activeEvalWords = [...words]
  if (resetFailures)
    evalWorkerFailures = 0
  evalWorkerDisabled.value = false
  evalSessionSnapshot.value = emptyEvalSnapshot()
  lastEvalDebug.value = null
  evalDebugTrace.value = []

  const ratingsCurrent = !replacedHistory && canReuseRatings(
    meta.value.ratingsVersion,
    meta.value.ratings?.length,
    words.length,
  )
  if (ratingsCurrent) {
    pendingEvalRatings = new Set()
  }
  else {
    pendingEvalRatings = new Set(words.map((_, index) => index))
    meta.value.ratings = Array.from({ length: words.length }, () => null)
    meta.value.ratingsVersion = undefined
  }

  const request: EvalWorkerRequest = {
    type: 'init',
    sessionId: evalSessionId,
    guesses: words.map(createWorkerGuess),
    ratingsCurrent,
    includeDebug: isDev,
  }
  launchEvalWorker(request)
}

function appendEvaluations(words: readonly string[]): void {
  const ratings = [...(meta.value.ratings || [])]
  activeEvalWords = [...words]
  for (let index = evaluatedWords.length; index < words.length; index++) {
    ratings[index] = null
    pendingEvalRatings.add(index)
  }
  meta.value.ratings = ratings
  meta.value.ratingsVersion = undefined

  if (!evalWorker)
    return
  for (let index = evaluatedWords.length; index < words.length; index++) {
    const request: EvalWorkerRequest = {
      type: 'append',
      sessionId: evalSessionId,
      guess: createWorkerGuess(words[index], index),
      readyWhenSubmitted: evalReadyIndex.value === index,
      submittedAt: Date.now(),
    }
    evalWorker.postMessage(request)
  }
}

watch(
  [evalGameKey, () => hasActiveAnswer.value ? tries.value.join('\u0000') : '', evaluationAvailable],
  ([gameKey, , available]) => {
    const words = hasActiveAnswer.value ? [...tries.value] : []
    if (!hasActiveAnswer.value || !available) {
      terminateEvalWorker()
      evalSessionId++
      activeEvalGameKey = ''
      activeEvalWords = []
      pendingEvalRatings = new Set()
      evalSessionSnapshot.value = emptyEvalSnapshot()
      lastEvalDebug.value = null
      evalDebugTrace.value = []
      // Force a full replay when evaluation becomes available again.
      evaluatedGameKey = ''
      evaluatedWords = []
      return
    }
    const canAppend = canAppendEvaluation(evaluatedGameKey, evaluatedWords, gameKey, words)

    if (canAppend)
      appendEvaluations(words)
    else if (gameKey !== evaluatedGameKey || words.join('\u0000') !== evaluatedWords.join('\u0000'))
      startEvaluationSession(gameKey, words, gameKey === evaluatedGameKey)

    evaluatedGameKey = gameKey
    evaluatedWords = words
  },
  // Mode, answer and storage switch together within a tick. Do not score an
  // intermediate combination (new answer + previous mode's guesses/ratings).
  { immediate: true, flush: 'post' },
)
