import { describe, expect, it } from 'vitest'
import { clearRatedImageVariants, formatRatedShareRow, formatShareGameMode, imageVariantKey, isEvaluationAvailable } from './presentation'

describe('evaluation presentation rules', () => {
  it('is available only for pinyin in normal or unlimited mode', () => {
    expect(isEvaluationAvailable('py', 'normal')).toBe(true)
    expect(isEvaluationAvailable('py', 'unlimited')).toBe(true)
    expect(isEvaluationAvailable('py', 'strict')).toBe(false)
    expect(isEvaluationAvailable('zy', 'normal')).toBe(false)
    expect(isEvaluationAvailable('sp', 'unlimited')).toBe(false)
  })

  it('adds a translated rating only when sharing evaluation is enabled', () => {
    const translate = (key: string) => `translated:${key}`
    expect(formatRatedShareRow('🟩🟩🟩🟩', 'brilliant', true, translate)).toBe('🟩🟩🟩🟩 translated:eval-brilliant')
    expect(formatRatedShareRow('🟩🟩🟩🟩', 'brilliant', false, translate)).toBe('🟩🟩🟩🟩')
    expect(formatRatedShareRow('🟩🟩🟩🟩', null, true, translate)).toBe('🟩🟩🟩🟩')
  })

  it('keeps the full unlimited-mode label in text shares', () => {
    const translate = (key: string) => key === 'game-mode-unlimited' ? '无限制模式' : '严格模式'
    expect(formatShareGameMode('normal', translate)).toBe('')
    expect(formatShareGameMode('unlimited', translate)).toBe('无限制模式')
    expect(formatShareGameMode('strict', translate)).toBe('严格')
  })

  it('uses four image variants and invalidates only rated variants', () => {
    const cache = {
      [imageVariantKey(false, false)]: 'plain',
      [imageVariantKey(true, false)]: 'masked',
      [imageVariantKey(false, true)]: 'plain-rated',
      [imageVariantKey(true, true)]: 'masked-rated',
    }
    expect(Object.keys(cache).sort()).toEqual([
      'masked:rated',
      'masked:unrated',
      'plain:rated',
      'plain:unrated',
    ])

    clearRatedImageVariants(cache)
    expect(cache).toEqual({
      'plain:unrated': 'plain',
      'masked:unrated': 'masked',
    })
  })
})
