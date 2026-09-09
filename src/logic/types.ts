export type MatchType = 'exact' | 'misplaced' | 'none' | 'deleted'

export type InputMode = 'py' | 'zy' | 'sp'

export type GameMode = 'normal' | 'unlimited' | 'strict'

export type PlayMode = 'daily' | 'random' | 'custom'

export type FrequencyLevel = 'common' | 'normal' | 'rare'

export interface CustomPayload {
  a: string
  s: 'own' | 'shared'
  m?: GameMode
  h?: string
  t?: string[]
}

export interface ParsedChar {
  char: string
  _1: string
  _2?: string
  _3?: string
  parts: string[]
  yin: string
  tone: number
}

export interface MatchResult {
  char: MatchType
  _1: MatchType
  _2: MatchType
  _3: MatchType
  py: MatchType
  tone: MatchType
}

export type Rating = 'brilliant' | 'excellent' | 'good' | 'average' | 'mistake' | 'incorrect'

export interface TriesMeta {
  answer?: boolean
  start?: number
  end?: number
  duration?: number
  failed?: boolean
  passed?: boolean
  tries?: string[]
  hint?: boolean
  hintLevel?: number
  strict?: GameMode
  sent?: boolean
  ratings?: Array<Rating | null>
  /** Numeric values are retained only so old localStorage records can be read and invalidated. */
  ratingsVersion?: number | string
}
