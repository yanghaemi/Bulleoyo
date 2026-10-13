import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { usePageTitle } from './usePageTitle'

function PageMeta({ title, description }: { title?: string; description?: string }) {
  usePageTitle(title, description)
  return null
}

const DEFAULT_DESCRIPTION =
  '소규모 공연 티켓팅과 공동 정산. 티켓을 사고, 응원할 팀을 고르고, 정산 결과를 누구나 확인합니다.'

describe('usePageTitle', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="description" content="${DEFAULT_DESCRIPTION}" />
      <meta property="og:title" content="불러요" />
      <meta property="og:description" content="${DEFAULT_DESCRIPTION}" />
    `
  })

  afterEach(() => {
    document.head.innerHTML = ''
    document.title = ''
  })

  it('restores the default description after leaving a route with custom metadata', () => {
    const view = render(<PageMeta title="정산" description="공연 정산 상세" />)
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '공연 정산 상세',
    )

    view.rerender(<PageMeta />)

    expect(document.title).toBe('불러요')
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '불러요',
    )
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      DEFAULT_DESCRIPTION,
    )
    expect(document.querySelector('meta[property="og:description"]')).toHaveAttribute(
      'content',
      DEFAULT_DESCRIPTION,
    )
  })
})
