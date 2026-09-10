export type MatchType = 'exact' | 'misplaced' | 'none' | 'deleted'

export type InputMode = 'py' | 'zy' | 'sp'

export type GameMode = 'normal' | 'unlimited' | 'strict'

export type PlayMode = 'daily' | 'random' | 'custom'

export type FrequencyLevel = 'common' | 'normal' | 'rare'

export interface StoredRandomAnswer {
  word: string
  hint: string
  frequency: FrequencyLevel
  roundId?: string
  createdAt?: number
}

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

export type CareerPlayMode = Exclude<PlayMode, 'custom'>
export type CareerOutcome = 'win' | 'failed'
export type CareerPlayFilter = 'all' | 'daily' | 'random' | `random-${FrequencyLevel}`
export type CareerGameFilter = 'all' | GameMode

export interface CareerRecord {
  id: string
  playMode: CareerPlayMode
  answer: string
  day?: number
  frequency?: FrequencyLevel
  gameMode: GameMode
  tries: string[]
  hintUsed: boolean
  hintLevel: 0 | 1 | 2
  outcome: CareerOutcome
  resultAt: number
  duration: number
  ratings: Array<Rating | null>
  ratingsVersion?: number | string
}

export interface ShareGameSnapshot {
  readonly answer: string
  readonly playMode: PlayMode
  readonly day?: number
  readonly gameMode: GameMode
  readonly tries: readonly string[]
  readonly hintUsed: boolean
  readonly hintLevel: 0 | 1 | 2
  readonly duration: number
  readonly ratings: ReadonlyArray<Rating | null>
  readonly ratingsVersion?: number | string
}

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
  randomAnswer?: StoredRandomAnswer
  /** First formal win/failure, which may precede the end of soft-failed play. */
  resultAt?: number
  resultDuration?: number
  /** Numeric values are retained only so old localStorage records can be read and invalidated. */
  ratingsVersion?: number | string
}
