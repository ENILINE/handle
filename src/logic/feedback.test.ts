import { describe, expect, it } from 'vitest'
import { getIdiomFeedbackUrl } from './feedback'

describe('idiom feedback URL', () => {
  it('creates general and word-specific GitHub issue links', () => {
    const general = new URL(getIdiomFeedbackUrl())
    const specific = new URL(getIdiomFeedbackUrl('举一反三'))

    expect(general.pathname).toBe('/ENILINE/handle/issues/new')
    expect(general.searchParams.get('title')).toBe('成语数据错误反馈')
    expect(specific.searchParams.get('title')).toBe('成语数据错误：举一反三')
    expect(specific.searchParams.get('labels')).toBe('数据纠错')
  })
})
