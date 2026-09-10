import { describe, expect, it } from 'vitest'
import type { CareerRecord, TriesMeta } from './types'
import { careerRecordToShareGame, createCareerRecord, filterCareerRecords, normalizeCareerGameMode, summarizeCareer } from './career'

function record(overrides: Partial<CareerRecord> = {}): CareerRecord {
  return {
    id: 'daily:1',
    playMode: 'daily',
    answer: '举一反三',
    day: 1,
    gameMode: 'normal',
    tries: ['举一反三'],
    hintUsed: false,
    hintLevel: 0,
    outcome: 'win',
    resultAt: 100,
    duration: 1000,
    ratings: [],
    ...overrides,
  }
}

function fromMeta(meta: TriesMeta) {
  return createCareerRecord({
    id: 'daily:1',
    playMode: 'daily',
    answer: '举一反三',
    day: 1,
    meta,
    fallbackTime: 1,
  })
}

describe('career records', () => {
  it('returns stable empty statistics when no records match', () => {
    expect(summarizeCareer([])).toEqual({
      games: 0,
      wins: 0,
      noHintWins: 0,
      winRate: null,
      noHintWinRate: null,
      averageTries: null,
      averageDuration: null,
      guessDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      failures: 0,
    })
  })

  it('keeps a soft failure private until the answer is resolved', () => {
    expect(fromMeta({ failed: true, tries: Array.from({ length: 10 }, () => '先来后到') })).toBeNull()
    expect(fromMeta({ failed: true, passed: true, tries: [...Array.from({ length: 10 }, () => '先来后到'), '举一反三'] })?.outcome).toBe('failed')
  })

  it('counts guesses one through ten as wins and later answers as failures', () => {
    expect(fromMeta({ passed: true, tries: ['举一反三'] })?.outcome).toBe('win')
    expect(fromMeta({ passed: true, tries: [...Array.from({ length: 9 }, () => '先来后到'), '举一反三'] })?.outcome).toBe('win')
    expect(fromMeta({ passed: true, failed: true, tries: [...Array.from({ length: 10 }, () => '先来后到'), '举一反三'] })?.outcome).toBe('failed')
    expect(fromMeta({ answer: true, failed: true, tries: ['先来后到'] })?.outcome).toBe('failed')
  })

  it('normalizes legacy game modes', () => {
    expect(normalizeCareerGameMode(undefined)).toBe('normal')
    expect(normalizeCareerGameMode(true)).toBe('normal')
    expect(normalizeCareerGameMode(false)).toBe('unlimited')
    expect(normalizeCareerGameMode('strict')).toBe('strict')
  })

  it('filters daily, aggregate random, random frequencies and game modes', () => {
    const records = [
      record(),
      record({ id: 'r1', playMode: 'random', day: undefined, frequency: 'common', gameMode: 'unlimited' }),
      record({ id: 'r2', playMode: 'random', day: undefined, frequency: 'normal', gameMode: 'normal' }),
      record({ id: 'r3', playMode: 'random', day: undefined, frequency: 'rare', gameMode: 'strict' }),
    ]
    expect(filterCareerRecords(records, { play: 'daily', game: 'all' }).map(item => item.id)).toEqual(['daily:1'])
    expect(filterCareerRecords(records, { play: 'random', game: 'all' })).toHaveLength(3)
    expect(filterCareerRecords(records, { play: 'random-common', game: 'all' }).map(item => item.id)).toEqual(['r1'])
    expect(filterCareerRecords(records, { play: 'random-normal', game: 'all' }).map(item => item.id)).toEqual(['r2'])
    expect(filterCareerRecords(records, { play: 'random-rare', game: 'all' }).map(item => item.id)).toEqual(['r3'])
    expect(filterCareerRecords(records, { play: 'all', game: 'unlimited' }).map(item => item.id)).toEqual(['r1'])
    expect(filterCareerRecords(records, { play: 'all', game: 'normal' }).map(item => item.id)).toEqual(['daily:1', 'r2'])
    expect(filterCareerRecords(records, { play: 'all', game: 'strict' }).map(item => item.id)).toEqual(['r3'])
  })

  it('summarizes official outcomes, no-hint wins and the histogram', () => {
    const records = [
      record({ tries: ['举一反三'], duration: 1000 }),
      record({ id: 'd2', tries: ['先来后到', '举一反三'], hintUsed: true, duration: 2000 }),
      record({ id: 'd3', outcome: 'failed', tries: Array.from({ length: 12 }, () => '先来后到'), duration: 3000 }),
      record({ id: 'd4', outcome: 'failed', tries: ['先来后到'], duration: 4000 }),
    ]
    expect(summarizeCareer(records)).toEqual({
      games: 4,
      wins: 2,
      noHintWins: 1,
      winRate: 0.5,
      noHintWinRate: 0.25,
      averageTries: 3.5,
      averageDuration: 2500,
      guessDistribution: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      failures: 2,
    })
  })

  it('creates a read-only sharing snapshot from the archived result', () => {
    const source = record({
      id: 'r1',
      playMode: 'random',
      day: undefined,
      frequency: 'rare',
      gameMode: 'unlimited',
      tries: ['先来后到', '举一反三'],
      hintUsed: true,
      hintLevel: 2,
      duration: 4321,
      ratings: ['good', 'brilliant'],
      ratingsVersion: '5:test',
    })
    const snapshot = careerRecordToShareGame(source)

    expect(snapshot).toEqual({
      answer: '举一反三',
      playMode: 'random',
      day: undefined,
      gameMode: 'unlimited',
      tries: ['先来后到', '举一反三'],
      hintUsed: true,
      hintLevel: 2,
      duration: 4321,
      ratings: ['good', 'brilliant'],
      ratingsVersion: '5:test',
    })
    expect(snapshot.tries).not.toBe(source.tries)
    expect(snapshot.ratings).not.toBe(source.ratings)
  })
})
