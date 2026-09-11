// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { acquireModalScrollLock } from './modal-scroll-lock'

describe('modal page scroll lock', () => {
  it('keeps the page locked until every open modal releases it', () => {
    document.documentElement.style.overflow = 'auto'
    document.documentElement.style.overscrollBehavior = 'auto'
    document.body.style.overflow = 'scroll'
    document.body.style.overscrollBehavior = 'auto'
    document.body.style.paddingRight = '3px'

    const releaseFirst = acquireModalScrollLock()
    const releaseSecond = acquireModalScrollLock()
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overscrollBehavior).toBe('none')

    releaseFirst()
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    releaseSecond()
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(document.documentElement.style.overscrollBehavior).toBe('auto')
    expect(document.body.style.overflow).toBe('scroll')
    expect(document.body.style.overscrollBehavior).toBe('auto')
    expect(document.body.style.paddingRight).toBe('3px')

    // Releasing a token twice must not affect a later modal.
    const releaseThird = acquireModalScrollLock()
    releaseSecond()
    expect(document.body.style.overflow).toBe('hidden')
    releaseThird()
  })
})
