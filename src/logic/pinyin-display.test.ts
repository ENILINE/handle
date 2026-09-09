import { describe, expect, it } from 'vitest'
import { displayFinalWithTone } from './pinyin-display'

describe('pinyin tone display', () => {
  it('keeps the dot on a neutral-tone i in symbol mode', () => {
    expect(displayFinalWithTone('i', 0, 0, false)).toBe('i')
  })

  it('uses dotless i only beneath a visible tone mark', () => {
    expect(displayFinalWithTone('ing', 0, 2, false)).toBe('ıng')
    expect(displayFinalWithTone('ing', 0, 2, true)).toBe('ing')
  })
})
