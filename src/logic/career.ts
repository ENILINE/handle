import { toSimplified } from '@hankit/tools'
import type {
  CareerGameFilter,
  CareerPlayFilter,
  CareerPlayMode,
  CareerRecord,
  FrequencyLevel,
  GameMode,
  ShareGameSnapshot,
  TriesMeta,
} from './types'
import { TRIES_LIMIT } from './constants'

export interface CareerRecordSource {
  id: string
  playMode: CareerPlayMode
  answer: string
  meta: TriesMeta
  fallbackTime: number
  day?: number
  frequency?: FrequencyLevel
}

export interface CareerFilters {
  play: CareerPlayFilter
  game: CareerGameFilter
}

export interface CareerStats {
  games: number
  wins: number
  noHintWins: number
  winRate: number | null
  noHintWinRate: number | null
  averageTries: number | null
  averageDuration: number | null
  guessDistribution: number[]
  failures: number
}

export function normalizeCareerGameMode(value: unknown): GameMode {
  if (value === false)
    return 'unlimited'
  if (value === 'unlimited' || value === 'strict')
    return value
  return 'normal'
}

export function createCareerRecord(source: CareerRecordSource): CareerRecord | null {
  const { meta } = source
  // A ten-guess soft failure remains playable and must not reveal the answer
  // through Career until the player solves it or explicitly reveals it.
  if (!meta.passed && !meta.answer)
    return null

  const tries = [...(meta.tries || [])]
  const simplifiedAnswer = toSimplified(source.answer)
  const answerIndex = tries.findIndex(word => toSimplified(word) === simplifiedAnswer)
  const outcome = answerIndex >= 0 && answerIndex < TRIES_LIMIT ? 'win' : 'failed'
  const hintLevel = meta.hintLevel && meta.hintLevel >= 2
    ? 2
    : meta.hint || meta.hintLevel
      ? 1
      : 0

  return {
    id: source.id,
    playMode: source.playMode,
    answer: source.answer,
    day: source.day,
    frequency: source.frequency,
    gameMode: normalizeCareerGameMode(meta.strict),
    tries,
    hintUsed: hintLevel > 0,
    hintLevel,
    outcome,
    resultAt: meta.resultAt || meta.end || meta.start || source.fallbackTime,
    duration: meta.resultDuration ?? meta.duration ?? 0,
    ratings: [...(meta.ratings || [])],
    ratingsVersion: meta.ratingsVersion,
  }
}

export function filterCareerRecords(records: readonly CareerRecord[], filters: CareerFilters): CareerRecord[] {
  return records.filter((record) => {
    const playMatches = filters.play === 'all'
      || filters.play === record.playMode
      || (filters.play.startsWith('random-')
        && record.playMode === 'random'
        && record.frequency === filters.play.slice('random-'.length))
    const gameMatches = filters.game === 'all' || filters.game === record.gameMode
    return playMatches && gameMatches
  })
}

export function summarizeCareer(records: readonly CareerRecord[]): CareerStats {
  const guessDistribution = Array.from({ length: TRIES_LIMIT }, () => 0)
  let wins = 0
  let noHintWins = 0
  let failures = 0
  let totalTries = 0
  let totalDuration = 0

  for (const record of records) {
    const attempts = Math.min(record.tries.length, TRIES_LIMIT)
    totalTries += attempts
    totalDuration += record.duration
    if (record.outcome === 'win') {
      wins++
      if (!record.hintUsed)
        noHintWins++
      if (attempts > 0)
        guessDistribution[attempts - 1]++
    }
    else {
      failures++
    }
  }

  const games = records.length
  return {
    games,
    wins,
    noHintWins,
    winRate: games ? wins / games : null,
    noHintWinRate: games ? noHintWins / games : null,
    averageTries: games ? totalTries / games : null,
    averageDuration: games ? totalDuration / games : null,
    guessDistribution,
    failures,
  }
}

export function careerRecordToShareGame(record: CareerRecord): ShareGameSnapshot {
  return {
    answer: record.answer,
    playMode: record.playMode,
    day: record.day,
    gameMode: record.gameMode,
    tries: [...record.tries],
    hintUsed: record.hintUsed,
    hintLevel: record.hintLevel,
    duration: record.duration,
    ratings: [...record.ratings],
    ratingsVersion: record.ratingsVersion,
  }
}
