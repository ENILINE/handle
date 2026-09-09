import { describe, expect, it } from 'vitest'
import { createEvalCorpusVersion } from './eval-corpus-version.mjs'

const first = {
  word: '测试成语',
  pinyin: 'ce4 shi4 cheng2 yu3',
  explanation: '原解释',
  derivation: '原出处',
  example: '原示例',
}
const second = {
  word: '一心一意',
  pinyin: 'yi1 xin1 yi1 yi4',
  explanation: '',
  derivation: '',
  example: '',
}

describe('evaluation corpus version', () => {
  it('ignores fields that do not affect evaluation', () => {
    const edited = {
      ...first,
      explanation: '新解释',
      derivation: '新出处',
      example: '新示例',
    }

    expect(createEvalCorpusVersion([edited]))
      .toBe(createEvalCorpusVersion([first]))
  })

  it('changes with words, pinyin and row order', () => {
    const current = createEvalCorpusVersion([first, second])

    expect(createEvalCorpusVersion([{ ...first, word: '测验成语' }, second])).not.toBe(current)
    expect(createEvalCorpusVersion([{ ...first, pinyin: 'ce4 shi4 cheng2 yu4' }, second])).not.toBe(current)
    expect(createEvalCorpusVersion([second, first])).not.toBe(current)
  })
})
