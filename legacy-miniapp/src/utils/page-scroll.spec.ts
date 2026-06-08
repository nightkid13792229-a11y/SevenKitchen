import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollPageToTop } from './page-scroll'

const pageScrollTo = vi.fn()

vi.stubGlobal('uni', {
  pageScrollTo,
})

describe('page-scroll', () => {
  beforeEach(() => {
    pageScrollTo.mockReset()
  })

  it('scrolls the current page back to the top without animation by default', () => {
    scrollPageToTop()

    expect(pageScrollTo).toHaveBeenCalledWith({
      scrollTop: 0,
      duration: 0,
    })
  })
})
