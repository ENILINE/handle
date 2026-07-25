//Although illegal idioms cannot pass in strict mode, for ease of understanding, the following test may contain illegal idioms.
import { describe, expect, it } from 'vitest'
import { checkHardMode } from './utils'
import type { MatchResult, ParsedChar } from './types'

function pc(char: string, _1 = '', _2 = '', _3 = '', tone = 0): ParsedChar {
  return { char, _1, _2, _3: _3 || undefined, parts: [_1, _2, _3].filter(Boolean), yin: '', tone }
}

describe('checkHardMode', () => {
  it('allows first guess (empty previousTries)', () => {
    const input = [pc('一', 'y', 'i', '', 1), pc('举', 'j', 'v', '', 3), pc('两', 'l', 'iang', '', 3), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [])).toBe(true)
  })

  it('passes when exact matches are preserved', () => {
    const prev = {
      word: [pc('一', 'y', 'i', '', 1), pc('举', 'j', 'v', '', 3), pc('三', 's', 'an', '', 1), pc('得', 'd', 'e', '', 2)],
      result: [
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
      ] as MatchResult[],
    }
    const input = [pc('一', 'y', 'i', '', 1), pc('举', 'j', 'v', '', 3), pc('两', 'l', 'iang', '', 3), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [prev])).toBe(true)
  })

  it('fails when exact match is broken', () => {
    const prev = {
      word: [pc('一', 'y', 'i', '', 1), pc('举', 'j', 'v', '', 3), pc('三', 's', 'an', '', 1), pc('得', 'd', 'e', '', 2)],
      result: [
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
      ] as MatchResult[],
    }
    const input = [pc('两', 'l', 'iang', '', 3), pc('举', 'j', 'v', '', 3), pc('三', 's', 'an', '', 1), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [prev])).toBe(false)
  })

  it('fails when misplaced character does not appear enough times', () => {
    const prev = {
      word: [pc('一', 'y', 'i', '', 1), pc('心', 'x', 'in', '', 1), pc('一', 'y', 'i', '', 1), pc('意', 'y', 'i', '', 4)],
      result: [
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'misplaced', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
      ] as MatchResult[],
    }
    // prev had two '一' (pos 0 exact + pos 2 misplaced). Input needs at least 2 '一'.
    const input = [pc('一', 'y', 'i', '', 1), pc('举', 'j', 'v', '', 3), pc('两', 'l', 'iang', '', 3), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [prev])).toBe(false)
  })

  it('passes when misplaced character appears enough times', () => {
    const prev = {
      word: [pc('一', 'y', 'i', '', 1), pc('心', 'x', 'in', '', 1), pc('一', 'y', 'i', '', 1), pc('意', 'y', 'i', '', 4)],
      result: [
        { char: 'exact', _1: 'exact', _2: 'exact', _3: 'none', tone: 'exact' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'misplaced', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
      ] as MatchResult[],
    }
    // prev had two '一' → input must have at least 2 '一'
    const input = [pc('一', 'y', 'i', '', 1), pc('一', 'y', 'i', '', 1), pc('两', 'l', 'iang', '', 3), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [prev])).toBe(true)
  })

  it('passes when misplaced char stays in same position', () => {
    const prev = {
      word: [pc('一', 'y', 'i', '', 1), pc('心', 'x', 'in', '', 1), pc('三', 's', 'an', '', 1), pc('意', 'y', 'i', '', 4)],
      result: [
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'misplaced', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
        { char: 'none', _1: 'none', _2: 'none', _3: 'none', tone: 'none' },
      ] as MatchResult[],
    }
    // '心' was misplaced at pos 1, but it's allowed to stay at pos 1 in the new guess
    const input = [pc('一', 'y', 'i', '', 1), pc('心', 'x', 'in', '', 1), pc('两', 'l', 'iang', '', 3), pc('得', 'd', 'e', '', 2)]
    expect(checkHardMode(input, [prev])).toBe(true)
  })
})