import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { StudioShell } from './StudioShell'
import { performanceBackPath, studioBackPath } from './studioNavigation'

vi.mock('@/shared/ui', () => ({ AppHeader: () => null }))

describe('StudioShell back navigation', () => {
  it('대시보드는 상위 경로가 없고 팀·생성 화면은 스튜디오로 돌아간다', () => {
    expect(studioBackPath('/studio')).toBeNull()
    expect(studioBackPath('/studio/teams/7')).toBe('/studio')
    expect(studioBackPath('/studio/performances/new')).toBe('/studio')
  })

  it('권한을 모르는 공연별 세부 작업은 안전하게 스튜디오로 돌아간다', () => {
    expect(studioBackPath('/studio/performances/7/rules')).toBe('/studio')
    expect(studioBackPath('/studio/performances/7/agreements')).toBe('/studio')
    expect(studioBackPath('/studio/performances/7/poster')).toBe('/studio')
    expect(studioBackPath('/studio/performances/7/edit')).toBe('/studio')
  })

  it('주최자만 공연 관리로, 참여팀과 권한 미확인 사용자는 스튜디오로 돌아간다', () => {
    expect(performanceBackPath(7, true)).toBe('/studio/performances/7/edit')
    expect(performanceBackPath(7, false)).toBe('/studio')
    expect(performanceBackPath(7, undefined)).toBe('/studio')
  })

  it('모바일과 데스크톱 모두 좌측 상단에 명시적인 돌아가기 링크를 둔다', () => {
    render(
      <MemoryRouter initialEntries={['/studio/performances/7/rules']}>
        <StudioShell title="정산 규칙" backTo="/studio/performances/7/edit">
          <div>본문</div>
        </StudioShell>
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link', { name: /공연 관리로 돌아가기|Back to show management/ })
    expect(links).toHaveLength(2)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/studio/performances/7/edit'))
  })
})
