import commonRaw from '../data/question_bank/common.txt?raw'
import normalRaw from '../data/question_bank/normal.txt?raw'
import rareRaw from '../data/question_bank/rare.txt?raw'
import frequencyCsv from '../data/frequency.csv?raw'
import { getHint } from './utils'
import type { FrequencyLevel } from './types'

const poolMap: Record<string, string[]> = {
  common: commonRaw.trim().split(/\r?\n/).filter(Boolean),
  normal: normalRaw.trim().split(/\r?\n/).filter(Boolean),
  rare: rareRaw.trim().split(/\r?\n/).filter(Boolean),
}

let frequencyMap: Map<string, number> | null = null

function getFrequencyMap(): Map<string, number> {
  if (frequencyMap)
    return frequencyMap
  frequencyMap = new Map()
  try {
    const lines = frequencyCsv.trim().split('\n')
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(',')
      if (parts.length >= 2)
        frequencyMap.set(parts[0], Number.parseInt(parts[1], 10))
    }
  }
  catch {
    // frequency data unavailable; fallback to random hint
  }
  return frequencyMap
}

export function getHintByFrequency(word: string): string {
  const map = getFrequencyMap()
  if (map.size === 0)
    return getHint(word)

  const chars = word.split('')
  const scored = chars.map((char, idx) => ({ char, idx, freq: map.get(char) || 0 }))
  scored.sort((a, b) => b.freq - a.freq)

  // Pick the 2nd most frequent character; if all same, fallback to seedrandom
  if (scored.length < 2 || scored[0].freq === scored[scored.length - 1].freq)
    return getHint(word)

  return scored[1].char
}

export function getRandomAnswerPool(frequency: FrequencyLevel): string[] {
  switch (frequency) {
    case 'common':
      return poolMap.common
    case 'normal':
      return poolMap.normal
    case 'rare':
      return [...poolMap.normal, ...poolMap.rare]
  }
}

export function getRandomAnswer(frequency: FrequencyLevel): { word: string; hint: string } {
  const pool = getRandomAnswerPool(frequency)
  if (pool.length === 0)
    throw new Error('No idioms available for the selected frequency level')
  const idx = Math.floor(Math.random() * pool.length)
  const word = pool[idx]
  return {
    word,
    hint: getHintByFrequency(word),
  }
}
