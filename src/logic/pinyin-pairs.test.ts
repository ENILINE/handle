import { describe, expect, it } from 'vitest'
import { pinyinFinals } from '@hankit/tools'
import { NULL_INITIAL, getFinalsForInitial, getInitialsForFinal } from './pinyin-pairs'

describe('legal pinyin initial-final pairs', () => {
  it('lists the legal initials for ie', () => {
    expect(getInitialsForFinal('ie')).toEqual([
      'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x',
    ])
  })

  it('uses u after j/q/x/y and keeps v for n/l', () => {
    expect(getInitialsForFinal('ue')).toEqual(['j', 'q', 'x', 'y'])
    expect(getInitialsForFinal('v')).toEqual(['n', 'l'])
    expect(getInitialsForFinal('ve')).toEqual(['n', 'l'])
    expect(getInitialsForFinal('van')).toEqual([])
    expect(getInitialsForFinal('vn')).toEqual([])
  })

  it('includes zero-initial syllables', () => {
    expect(getFinalsForInitial(NULL_INITIAL)).toContain('er')
  })

  it('keeps the cheat-sheet finals in sync with the parser convention', () => {
    expect(pinyinFinals).toContain('ue')
    expect(pinyinFinals).not.toContain('van')
    expect(pinyinFinals).not.toContain('vn')
  })
})

