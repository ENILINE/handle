import type { GameMode, InputMode, Rating } from '../logic/types'

export const RATING_LABEL_KEYS = {
  brilliant: 'eval-brilliant',
  excellent: 'eval-excellent',
  good: 'eval-good',
  average: 'eval-average',
  mistake: 'eval-mistake',
  incorrect: 'eval-incorrect',
} as const satisfies Record<Rating, string>

export function isEvaluationAvailable(inputMode: InputMode, gameMode: GameMode): boolean {
  return inputMode === 'py' && gameMode !== 'strict'
}

export function formatRatedShareRow(
  symbols: string,
  rating: Rating | null | undefined,
  enabled: boolean,
  translate: (key: typeof RATING_LABEL_KEYS[Rating]) => string,
): string {
  return (enabled && rating)
    ? `${symbols} ${translate(RATING_LABEL_KEYS[rating])}`
    : symbols
}

export function formatShareGameMode(
  mode: GameMode | undefined,
  translate: (key: 'game-mode-unlimited' | 'game-mode-strict') => string,
): string {
  if (!mode || mode === 'normal')
    return ''
  const label = translate(mode === 'unlimited' ? 'game-mode-unlimited' : 'game-mode-strict')
  return mode === 'unlimited' ? label : label.slice(0, 2)
}

export function imageVariantKey(masked: boolean, evaluation: boolean): string {
  return `${masked ? 'masked' : 'plain'}:${evaluation ? 'rated' : 'unrated'}`
}

export function clearRatedImageVariants(cache: Record<string, string>): void {
  delete cache[imageVariantKey(false, true)]
  delete cache[imageVariantKey(true, true)]
}
