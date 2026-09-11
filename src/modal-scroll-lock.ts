let lockCount = 0
let savedHtmlOverflow = ''
let savedHtmlOverscroll = ''
let savedBodyOverflow = ''
let savedBodyOverscroll = ''
let savedBodyPaddingRight = ''

function lockDocumentScroll() {
  if (typeof document === 'undefined')
    return

  const html = document.documentElement
  const body = document.body
  savedHtmlOverflow = html.style.overflow
  savedHtmlOverscroll = html.style.overscrollBehavior
  savedBodyOverflow = body.style.overflow
  savedBodyOverscroll = body.style.overscrollBehavior
  savedBodyPaddingRight = body.style.paddingRight

  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth)
  if (scrollbarWidth) {
    const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
    body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
  }
  html.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
  body.style.overflow = 'hidden'
  body.style.overscrollBehavior = 'none'
}

function unlockDocumentScroll() {
  if (typeof document === 'undefined')
    return

  const html = document.documentElement
  const body = document.body
  html.style.overflow = savedHtmlOverflow
  html.style.overscrollBehavior = savedHtmlOverscroll
  body.style.overflow = savedBodyOverflow
  body.style.overscrollBehavior = savedBodyOverscroll
  body.style.paddingRight = savedBodyPaddingRight
}

/**
 * Locks the page behind an overlay. The reference count keeps nested modals
 * from unlocking the page while another modal is still visible.
 */
export function acquireModalScrollLock(): () => void {
  if (lockCount++ === 0)
    lockDocumentScroll()

  let released = false
  return () => {
    if (released)
      return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0)
      unlockDocumentScroll()
  }
}
