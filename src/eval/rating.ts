import { WORD_LENGTH } from '../logic/constants'
import type { MatchResult, ParsedChar, Rating } from '../logic/types'
import { testAnswer } from '../logic/utils'

export interface VisibleGuess {
  guess: ParsedChar[]
  feedback: MatchResult[]
}

const feedbackDimensions = ['char', '_1', '_2', '_3', 'py', 'tone'] as const
const ratingOrder: readonly Rating[] = ['incorrect', 'mistake', 'average', 'good', 'excellent', 'brilliant']

/** Treat the candidate as an answer, not as a hard-mode input. Gray, position,
 * duplicate-count, character and tone constraints must all replay exactly. */
export function matchesAllFeedback(candidate: readonly ParsedChar[], history: readonly VisibleGuess[]): boolean {
  if (candidate.length !== WORD_LENGTH)
    return false
  const answer = [...candidate]
  return history.every(({ guess, feedback }) => {
    const predicted = testAnswer(guess, answer)
    return predicted.every((result, position) =>
      feedbackDimensions.every(dimension => result[dimension] === feedback[position][dimension]))
  })
}

export function specialRatingForGuess(informationBefore: number, matchesHistory: boolean, won: boolean): Rating | undefined {
  if (!matchesHistory && !won)
    return undefined
  if (informationBefore <= 13)
    return won ? 'brilliant' : undefined
  if (informationBefore < 23)
    return 'brilliant'
  if (informationBefore < 26)
    return 'excellent'
  return 'good'
}

/** A special rating is a floor; it must never lower the normal rating. */
export function higherRating(normal: Rating | null | undefined, special: Rating | undefined): Rating | null {
  if (!normal)
    return special ?? null
  if (!special)
    return normal
  return ratingOrder.indexOf(normal) >= ratingOrder.indexOf(special) ? normal : special
}
