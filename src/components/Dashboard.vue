<script setup lang="ts">
import DashboardItem from './DashboardItem.vue'
import type { CareerGameFilter, CareerPlayFilter, CareerRecord } from '~/logic/types'
import { careerRecordToShareGame, filterCareerRecords, summarizeCareer } from '~/logic/career'
import { careerRecords, saveCareerRatings } from '~/career'
import { startCareerEvaluation } from '~/career-evaluation'
import { EVAL_VERSION, canReuseRatings } from '~/eval/version'
import { evaluationEnabled, isDev, showDashboard } from '~/state'
import { formatDuration } from '~/storage'
import { locale, t } from '~/i18n'

const playFilter = ref<CareerPlayFilter>('all')
const gameFilter = ref<CareerGameFilter>('all')
const page = ref<'main' | 'detail' | 'share'>('main')
const selectedId = ref('')
const detailRatings = ref<CareerRecord['ratings']>([])
const evaluationLoading = ref(false)
const evaluationError = ref(false)
let stopEvaluation: (() => void) | undefined
let evaluationRun = 0

const filteredRecords = computed(() => filterCareerRecords(careerRecords.value, {
  play: playFilter.value,
  game: gameFilter.value,
}))
const stats = computed(() => summarizeCareer(filteredRecords.value))
const selectedRecord = computed(() => careerRecords.value.find(record => record.id === selectedId.value))
const canShowRecordEvaluation = computed(() => !!selectedRecord.value
  && evaluationEnabled.value
  && selectedRecord.value.gameMode !== 'strict')
const shouldLoadRecordEvaluation = computed(() => page.value !== 'main' && canShowRecordEvaluation.value)
const shareGame = computed(() => selectedRecord.value
  ? careerRecordToShareGame({ ...selectedRecord.value, ratings: detailRatings.value })
  : undefined)
const histogram = computed(() => [
  ...stats.value.guessDistribution.map((count, index) => ({ label: String(index + 1), count })),
  { label: t('career-failed'), count: stats.value.failures },
])
const histogramMax = computed(() => Math.max(1, ...histogram.value.map(item => item.count)))

function stopRatingWorker() {
  evaluationRun++
  const stop = stopEvaluation
  stopEvaluation = undefined
  stop?.()
  evaluationLoading.value = false
}

function ratingRunIsCurrent(run: number, recordId: string) {
  return run === evaluationRun
    && selectedRecord.value?.id === recordId
    && shouldLoadRecordEvaluation.value
}

function startRecordRatingWorker(record: CareerRecord, run: number, retry: number) {
  const fail = (message: string) => {
    if (!ratingRunIsCurrent(run, record.id))
      return
    stopEvaluation = undefined
    if (retry < 1) {
      queueMicrotask(() => {
        if (ratingRunIsCurrent(run, record.id))
          startRecordRatingWorker(record, run, retry + 1)
      })
      return
    }
    evaluationLoading.value = false
    evaluationError.value = true
    if (isDev)
      console.warn('[career] historical evaluation failed', { id: record.id, message })
  }

  evaluationLoading.value = true
  try {
    const stop = startCareerEvaluation(record, {
      update(ratings) {
        if (ratingRunIsCurrent(run, record.id))
          detailRatings.value = ratings
      },
      complete(ratings) {
        if (!ratingRunIsCurrent(run, record.id))
          return
        stopEvaluation = undefined
        detailRatings.value = ratings
        evaluationLoading.value = false
        saveCareerRatings(record, ratings, EVAL_VERSION)
      },
      error: fail,
    })
    if (ratingRunIsCurrent(run, record.id))
      stopEvaluation = stop
    else
      stop()
  }
  catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function loadRecordRatings() {
  stopRatingWorker()
  evaluationError.value = false
  const record = selectedRecord.value
  if (!record || !canShowRecordEvaluation.value) {
    detailRatings.value = []
    return
  }
  if (!shouldLoadRecordEvaluation.value)
    return
  if (canReuseRatings(record.ratingsVersion, record.ratings.length, record.tries.length)) {
    detailRatings.value = [...record.ratings]
    return
  }

  detailRatings.value = Array.from({ length: record.tries.length }, () => null)
  startRecordRatingWorker(record, evaluationRun, 0)
}

watch(
  [() => selectedRecord.value?.id, () => selectedRecord.value?.ratingsVersion, shouldLoadRecordEvaluation],
  loadRecordRatings,
)

watch(showDashboard, (visible) => {
  if (!visible) {
    stopRatingWorker()
    page.value = 'main'
    selectedId.value = ''
  }
})

onBeforeUnmount(stopRatingWorker)

function close() {
  showDashboard.value = false
}

function openDetail(record: CareerRecord) {
  detailRatings.value = canReuseRatings(record.ratingsVersion, record.ratings.length, record.tries.length)
    ? [...record.ratings]
    : Array.from({ length: record.tries.length }, () => null)
  selectedId.value = record.id
  page.value = 'detail'
}

function backToMain() {
  page.value = 'main'
  selectedId.value = ''
}

function percent(value: number | null) {
  return value == null ? '-' : `${Math.round(value * 100)}%`
}

function average(value: number | null) {
  return value == null ? '-' : value.toFixed(1)
}

function playModeLabel(record: CareerRecord) {
  if (record.playMode === 'daily')
    return t('career-daily')
  if (record.frequency === 'common')
    return t('career-random-common')
  if (record.frequency === 'rare')
    return t('career-random-rare')
  return t('career-random-normal')
}

function gameModeLabel(record: CareerRecord) {
  if (record.gameMode === 'unlimited')
    return t('game-mode-unlimited')
  if (record.gameMode === 'strict')
    return t('game-mode-strict')
  return t('game-mode-normal')
}

function playedAt(record: CareerRecord) {
  return new Intl.DateTimeFormat(locale.value === 'hant' ? 'zh-TW' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(record.resultAt)
}
</script>

<template>
  <div p5 flex="~ col center" relative w-full max-w-190 min-w-0 mx-auto>
    <div fixed z-10 top-4 right-4 flex="~ gap-3">
      <button icon-btn @click="close">
        <div i-carbon-close />
      </button>
    </div>
    <button v-if="page === 'detail'" fixed z-10 top-4 left-4 icon-btn @click="backToMain">
      <div i-carbon-arrow-left />
    </button>

    <template v-if="page === 'main'">
      <p text-xl font-serif mb4>
        <b>{{ t('dashboard') }}</b>
      </p>

      <div flex="~ center wrap gap-3" mb4>
        <label flex="~ center gap-2">
          <span op50>{{ t('career-filter-play') }}</span>
          <select v-model="playFilter" class="career-select" border="~ base" px2 py1>
            <option value="all">{{ t('career-all') }}</option>
            <option value="daily">{{ t('career-daily') }}</option>
            <option value="random">{{ t('career-random') }}</option>
            <option value="random-common">{{ t('career-random-common') }}</option>
            <option value="random-normal">{{ t('career-random-normal') }}</option>
            <option value="random-rare">{{ t('career-random-rare') }}</option>
          </select>
        </label>
        <label flex="~ center gap-2">
          <span op50>{{ t('career-filter-game') }}</span>
          <select v-model="gameFilter" class="career-select" border="~ base" px2 py1>
            <option value="all">{{ t('career-all') }}</option>
            <option value="unlimited">{{ t('game-mode-unlimited') }}</option>
            <option value="normal">{{ t('game-mode-normal') }}</option>
            <option value="strict">{{ t('game-mode-strict') }}</option>
          </select>
        </label>
      </div>

      <div flex="~ wrap gap-x-6 gap-y-4" justify-center min-w-100px py2>
        <DashboardItem :value="stats.games" :text="t('games-count')" />
        <DashboardItem :value="stats.wins" :text="t('win-count')" />
        <DashboardItem :value="percent(stats.winRate)" :text="t('win-rate')" />
        <DashboardItem :value="percent(stats.noHintWinRate)" :text="t('win-no-hint-rate')" />
        <DashboardItem :value="average(stats.averageTries)" :text="t('average-tries-count')" />
        <DashboardItem :value="stats.averageDuration == null ? '-' : formatDuration(stats.averageDuration)" :text="t('average-durations')" />
      </div>

      <section w-full max-w-120 bg-gray:5 p4 my5>
        <p text-lg font-serif mb3 mt--1 text-center tracking-widest>
          {{ t('guess-dist') }}
        </p>
        <div v-for="item of histogram" :key="item.label" flex items-center gap-2 my1>
          <div w-8 flex-none text-right op50>{{ item.label }}</div>
          <div flex-1 h-5 bg-gray-500:5>
            <div bg-primary h-full :style="{ width: `${item.count / histogramMax * 100}%` }" />
          </div>
          <div w-8 flex-none text-left text-sm>{{ item.count }}</div>
        </div>
      </section>

      <section w-full max-w-150>
        <p text-lg font-serif mb3 text-center tracking-widest>
          {{ t('career-history') }}
        </p>
        <div v-if="!filteredRecords.length" op50 py6>
          {{ t('career-no-history') }}
        </div>
        <div v-else flex="~ col gap-2">
          <button
            v-for="record of filteredRecords"
            :key="record.id"
            w-full border="~ base" p3 text-left
            class="hover:bg-gray:5"
            @click="openDetail(record)"
          >
            <div flex="~ justify-between items-center gap-3">
              <b text-xl font-serif>{{ record.answer }}</b>
              <span :class="record.outcome === 'failed' ? 'text-mis' : 'text-ok'">
                {{ record.outcome === 'failed' ? t('career-failed') : t('career-tries', record.tries.length) }}
              </span>
            </div>
            <div mt1 text-sm op60 flex="~ wrap gap-x-3 gap-y-1">
              <span>{{ formatDuration(record.duration) }}</span>
              <span>{{ playModeLabel(record) }}</span>
              <span>{{ gameModeLabel(record) }}</span>
              <span>{{ playedAt(record) }}</span>
            </div>
          </button>
        </div>
      </section>
    </template>

    <template v-else-if="page === 'detail' && selectedRecord">
      <p text-xl font-serif mb4>
        <b>{{ t('career-detail') }}</b>
      </p>
      <WordBlocks :word="selectedRecord.answer" :answer="selectedRecord.answer" :animate="false" :masked="false" />
      <div my2 text-sm op60 flex="~ center wrap gap-x-3 gap-y-1">
        <span>{{ selectedRecord.outcome === 'failed' ? t('career-failed') : t('career-tries', selectedRecord.tries.length) }}</span>
        <span>{{ formatDuration(selectedRecord.duration) }}</span>
        <span>{{ playModeLabel(selectedRecord) }}</span>
        <span>{{ gameModeLabel(selectedRecord) }}</span>
        <span>{{ playedAt(selectedRecord) }}</span>
      </div>
      <div v-if="evaluationLoading" op50 text-sm mb2>
        {{ t('career-evaluation-loading') }}
      </div>
      <div v-else-if="evaluationError" text-mis text-sm mb2>
        {{ t('career-evaluation-failed') }}
      </div>
      <div flex="~ col" items-center>
        <WordBlocks
          v-for="word, index of selectedRecord.tries"
          :key="`${selectedRecord.id}-${index}`"
          :word="word"
          :answer="selectedRecord.answer"
          :revealed="true"
          :animate="false"
          :masked="false"
          :rating="canShowRecordEvaluation ? detailRatings[index] : null"
        />
      </div>
      <button btn mt5 flex="~ gap-2 center" @click="page = 'share'">
        <div i-carbon-share />
        {{ t('share') }}
      </button>
    </template>

    <ShareDialog
      v-else-if="page === 'share' && shareGame"
      :game="shareGame"
      :embedded="true"
      @close="page = 'detail'"
    />
  </div>
</template>

<style>
.career-select,
.career-select option {
  color: #222;
  background-color: #fff;
}

html.dark .career-select {
  color-scheme: dark;
}

html.dark .career-select,
html.dark .career-select option {
  color: #eee;
  background-color: #242424;
}
</style>
