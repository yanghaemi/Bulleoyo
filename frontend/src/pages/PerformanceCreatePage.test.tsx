import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { ApiError } from '@/shared/api/client'
import i18n from '@/shared/i18n'

import { PerformanceCreatePage } from './PerformanceCreatePage'

const navigate = vi.hoisted(() => vi.fn())
const performance = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  setTicketTypes: vi.fn(),
}))
const state = vi.hoisted(() => ({
  teams: [{ teamId: 7, teamName: '블루노트', leader: true }] as unknown[],
}))

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: state.teams }, isPending: false }),
}))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined, error: undefined }),
}))
vi.mock('@/shared/queries/performance', () => ({
  useCreatePerformance: () => ({ mutateAsync: performance.create }),
  useUpdatePerformance: () => ({ mutateAsync: performance.update }),
  useSetTicketTypes: () => ({ mutateAsync: performance.setTicketTypes }),
}))

/** 폼보다 먼저 뜨는 공연 형태 모달에서 하나를 고른다(9/26) */
function chooseShowType(joint = false) {
  fireEvent.click(
    screen.getByRole('button', { name: joint ? /With other teams/ : /Just our team/ }),
  )
}

/** 공연 형태를 이미 고른 뒤 필수 입력을 채운다 */
function fillFields({ start = '19:00', end = '21:00' } = {}) {
  fireEvent.change(screen.getByLabelText(/Show title/), {
    target: { value: '단독 공연' },
  })
  fireEvent.change(screen.getByLabelText(/^Show date/), { target: { value: '2030-09-22' } })
  fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: start } })
  fireEvent.change(screen.getByLabelText(/^End time/), { target: { value: end } })
  fireEvent.change(screen.getByLabelText(/^Venue/), { target: { value: '롤링홀' } })
  fireEvent.change(screen.getByLabelText(/^Address/), {
    target: { value: '서울시 마포구 어울마당로 35' },
  })
  fireEvent.change(screen.getByLabelText('Ticket type'), { target: { value: '일반' } })
  fireEvent.change(screen.getByLabelText('Price (YoYo)'), { target: { value: '25000' } })
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '50' } })
}

function fillForm(times: { start?: string; end?: string } = {}) {
  chooseShowType()
  fillFields(times)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.clearAllMocks()
  state.teams = [{ teamId: 7, teamName: '블루노트', leader: true }]
  performance.create.mockResolvedValue({ performanceId: 12 })
  performance.update.mockResolvedValue({ performanceId: 12 })
})

it('모바일 스튜디오 제목은 선택한 언어 하나로 표시한다', async () => {
  await i18n.changeLanguage('ko')
  render(
    <MemoryRouter>
      <PerformanceCreatePage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: '새 공연', level: 1 })).toBeInTheDocument()
  expect(screen.queryByText('New show / 새 공연')).not.toBeInTheDocument()
})

it('티켓 옵션 저장 실패 뒤 재시도해도 공연을 중복 생성하지 않는다', async () => {
  performance.setTicketTypes
    .mockRejectedValueOnce(
      new ApiError({ code: 'COMMON_INTERNAL_ERROR', status: 500, msg: '옵션 저장 실패' }),
    )
    .mockResolvedValueOnce({ performanceId: 12 })

  render(
    <MemoryRouter>
      <PerformanceCreatePage />
    </MemoryRouter>,
  )
  fillForm()

  fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])
  await screen.findByText('Could not complete the request')
  // 부분 성공을 숨기지 않는다 — 공연이 안 만들어진 줄 알면 처음부터 다시 만들어 DRAFT 를 쌓는다
  expect(screen.getByText(/공연은 준비 중\(DRAFT\)으로 만들어졌고/)).toBeInTheDocument()

  fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))

  expect(performance.create).toHaveBeenCalledTimes(1)
  expect(performance.create).toHaveBeenCalledWith(
    expect.objectContaining({ hostTeamId: 7, jointPerformance: false }),
  )
  expect(performance.update).toHaveBeenCalledTimes(1)
  expect(performance.update).toHaveBeenCalledWith(expect.objectContaining({ performanceId: 12 }))
  expect(performance.setTicketTypes).toHaveBeenCalledTimes(2)
  // 정보 저장 뒤 포스터·티켓 디자인을 확인하고 정산 규칙으로 이어 간다
  expect(navigate).toHaveBeenCalledWith('/studio/performances/12/poster', { replace: true })
})

/**
 * MR !142 자동 리뷰 🔴 — `performance_04`(재시도의 `PATCH`)에는 `hostTeamId` 가 없다.
 * 팀만 바꿔 다시 누르면 공연이 최초 팀 소유로 남는데 화면은 성공으로 끝난다.
 */
it('재시도 전에 주최 팀을 바꾸면 최초 팀 소유로 남기지 않고 새로 만든다', async () => {
  state.teams = [
    { teamId: 7, teamName: '블루노트', leader: true },
    { teamId: 9, teamName: '새벽세시', leader: true },
  ]
  performance.create
    .mockResolvedValueOnce({ performanceId: 12 })
    .mockResolvedValueOnce({ performanceId: 13 })
  performance.setTicketTypes
    .mockRejectedValueOnce(
      new ApiError({ code: 'COMMON_INTERNAL_ERROR', status: 500, msg: '옵션 저장 실패' }),
    )
    .mockResolvedValueOnce({ performanceId: 13 })

  render(
    <MemoryRouter>
      <PerformanceCreatePage />
    </MemoryRouter>,
  )
  fillForm()
  fireEvent.change(screen.getByLabelText(/Host team/), { target: { value: '7' } })

  fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])
  await screen.findByText('Could not complete the request')

  // 팀을 바꾸고 재시도 — 옮길 API 가 없으니 이어 쓰면 안 된다
  fireEvent.change(screen.getByLabelText(/Host team/), { target: { value: '9' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))

  expect(performance.create).toHaveBeenCalledTimes(2)
  expect(performance.create).toHaveBeenLastCalledWith(expect.objectContaining({ hostTeamId: 9 }))
  // 주최 팀을 옮길 수 없는 `PATCH` 로 이어 가지 않았다
  expect(performance.update).not.toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith('/studio/performances/13/poster', { replace: true })
})

/**
 * 9/26 — 하루 공연이다. 날짜 1개 + 시작·종료 시각을 받아 기존 `startAt`·`endAt` ISO(KST)로 합친다.
 * 종료가 시작보다 이르면 다음 날 종료로 읽는다(서버 검증은 `endAt > startAt` 하나).
 */
it('날짜와 시각을 합쳐 보내고, 종료가 시작보다 이르면 다음 날 종료로 보낸다', async () => {
  performance.setTicketTypes.mockResolvedValueOnce({ performanceId: 12 })
  render(
    <MemoryRouter>
      <PerformanceCreatePage />
    </MemoryRouter>,
  )
  fillForm({ start: '22:00', end: '02:00' })

  expect(screen.getByText('Ends at 02:00 the next day')).toBeInTheDocument()

  fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])
  await waitFor(() => expect(performance.create).toHaveBeenCalledTimes(1))
  expect(performance.create).toHaveBeenCalledWith(
    expect.objectContaining({
      startAt: '2030-09-22T22:00:00+09:00',
      endAt: '2030-09-23T02:00:00+09:00',
    }),
  )
})

describe('공연 형태 선택 모달(9/26)', () => {
  it('폼보다 먼저 두 선택 카드를 띄우고, 고르기 전에는 폼을 그리지 않는다', () => {
    render(
      <MemoryRouter>
        <PerformanceCreatePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('dialog', { name: 'What kind of show is it?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Just our team/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /With other teams/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Show title/)).not.toBeInTheDocument()
  })

  it('합동을 고르면 폼이 그 값으로 열리고 저장에 jointPerformance: true 를 보낸다', async () => {
    performance.setTicketTypes.mockResolvedValueOnce({ performanceId: 12 })
    render(
      <MemoryRouter>
        <PerformanceCreatePage />
      </MemoryRouter>,
    )
    chooseShowType(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('joint-choice')).toHaveTextContent('Joint show')

    fillFields()
    fireEvent.click(screen.getAllByRole('button', { name: 'Save and continue' })[0])

    await waitFor(() => expect(performance.create).toHaveBeenCalledTimes(1))
    expect(performance.create).toHaveBeenCalledWith(
      expect.objectContaining({ jointPerformance: true }),
    )
  })

  it('"변경"으로 다시 열어 바꿀 수 있고, 그때 닫으면 값을 그대로 둔다', () => {
    render(
      <MemoryRouter>
        <PerformanceCreatePage />
      </MemoryRouter>,
    )
    chooseShowType(false)
    expect(screen.getByTestId('joint-choice')).toHaveTextContent('Single-team show')

    fireEvent.click(screen.getByRole('button', { name: 'Change show type' }))
    expect(screen.getByRole('button', { name: /Just our team/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('joint-choice')).toHaveTextContent('Single-team show')
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Change show type' }))
    chooseShowType(true)
    expect(screen.getByTestId('joint-choice')).toHaveTextContent('Joint show')
  })

  it('고르지 않고 닫으면 공연을 만들지 않고 떠난다 — 주소로 바로 열었으면 스튜디오 홈으로', () => {
    render(
      <MemoryRouter>
        <PerformanceCreatePage />
      </MemoryRouter>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(navigate).toHaveBeenCalledWith('/studio', { replace: true })
    expect(performance.create).not.toHaveBeenCalled()
  })

  it('앱 안에서 들어왔으면 고르지 않고 닫을 때 이전 화면으로 돌아간다', () => {
    render(
      <MemoryRouter initialEntries={['/studio', '/studio/performances/new']} initialIndex={1}>
        <PerformanceCreatePage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(navigate).toHaveBeenCalledWith(-1)
  })
})
