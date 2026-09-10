import type { CareerRecord, Rating, TriesMeta } from './logic/types'
import { START_DATE, createCareerRecord } from './logic'
import { getAnswerOfDay } from './answers'
import { history, legacyTries, randomHistory, randomMeta } from './storage'

function dailyRecord(day: number, sourceMeta: TriesMeta): CareerRecord | null {
  const answer = getAnswerOfDay(day).word
  if (!answer)
    return null
  const legacy = legacyTries.value[day]
  const meta = legacy
    ? { ...sourceMeta, tries: legacy }
    : sourceMeta
  return createCareerRecord({
    id: `daily:${day}`,
    playMode: 'daily',
    answer,
    day,
    meta,
    fallbackTime: +START_DATE + day * 86400000,
  })
}

export const careerRecords = computed<CareerRecord[]>(() => {
  const daily = Object.entries(history.value)
    .map(([day, meta]) => dailyRecord(Number(day), meta))
    .filter((record): record is CareerRecord => !!record)
  return [...daily, ...Object.values(randomHistory.value)]
    .sort((a, b) => b.resultAt - a.resultAt)
})

export const careerGamesCount = computed(() => careerRecords.value.length)

export function saveCareerRatings(record: CareerRecord, ratings: Array<Rating | null>, ratingsVersion: string) {
  if (record.playMode === 'daily' && record.day != null) {
    const meta = history.value[record.day]
    if (!meta)
      return
    history.value[record.day] = { ...meta, ratings: [...ratings], ratingsVersion }
    return
  }

  const stored = randomHistory.value[record.id]
  if (!stored)
    return
  randomHistory.value = {
    ...randomHistory.value,
    [record.id]: { ...stored, ratings: [...ratings], ratingsVersion },
  }
  if (randomMeta.value.randomAnswer?.roundId === record.id) {
    randomMeta.value = {
      ...randomMeta.value,
      ratings: [...ratings],
      ratingsVersion,
    }
  }
}
