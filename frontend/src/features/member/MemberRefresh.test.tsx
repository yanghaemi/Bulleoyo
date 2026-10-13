import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MyPageScreen } from './MyPageScreen'
import { SignupScreen } from './SignupScreen'
import { PreferencesScreen } from './PreferencesScreen'
import { ProfileEditSheet } from './ProfileEditSheet'
import { SearchPicker } from './SearchPicker'

const locale = vi.hoisted(() => ({ language: 'ko' }))
vi.mock('@/shared/i18n/useLocale', () => ({ useLocale: () => ({ language: locale.language, text: (ko: string, en: string) => locale.language === 'ko' ? ko : en }) }))
beforeEach(() => { locale.language = 'ko' })

const values = { countryCode: 'KR', locale: 'ko' as const, displayCurrency: 'USD', timezone: 'Asia/Seoul', preferredGenres: [] }

it('groups social setup fields without adding credentials and submits the existing callback', () => {
  const onSubmit = vi.fn()
  render(<SignupScreen values={values} onChange={vi.fn()} onSubmit={onSubmit} onBack={vi.fn()} />)
  expect(within(screen.getByRole('group', { name: '지역과 시간' })).getByText('국가')).toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: '화면 표시' })).getByLabelText('표시 통화')).toHaveValue('USD')
  expect(screen.queryByLabelText(/password|비밀번호/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '계속하기' }))
  expect(onSubmit).toHaveBeenCalledOnce()
})

it('renders one identity action and prevents editing unconfirmed member data', () => {
  const onEditName = vi.fn()
  const props = { data: { name: 'Alex', email: 'alex@example.test', languageLabel: '한국어' }, onEditName, onRetryBalance: vi.fn(), onSignOut: vi.fn() }
  const view = render(<MemoryRouter><MyPageScreen {...props} memberState="pending" /></MemoryRouter>)
  expect(screen.getByRole('button', { name: '수정' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: /지갑 등록이 필요/ })).not.toBeInTheDocument()
  view.rerender(<MemoryRouter><MyPageScreen {...props} memberState="ready" /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: '수정' }))
  expect(onEditName).toHaveBeenCalledOnce()
})

it('labels the preview as an example, preserves source amount on rate failure, and retries', () => {
  const retry = vi.fn()
  render(<MemoryRouter><PreferencesScreen values={values} onChange={vi.fn()} ratesFailed saveDisabled onSave={vi.fn()} onRetryRates={retry} /></MemoryRouter>)
  expect(screen.getByText('설정에 따른 표시 예시')).toBeInTheDocument()
  expect(screen.getByText('15,000 YoYo')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('저장할 변경 사항이 없거나 아직 설정을 확인할 수 없어요')
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.getByRole('option', { name: 'USD — 미국 달러' })).toBeInTheDocument()
})

it('keeps profile keyboard focus in a modal and submits only a trimmed name', () => {
  const save = vi.fn()
  render(<ProfileEditSheet open initialName="Alex" onClose={vi.fn()} onSave={save} />)
  const dialog = screen.getByRole('dialog', { name: '이름 수정' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  const cancel = within(dialog).getByRole('button', { name: '취소' })
  cancel.focus()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(dialog.contains(document.activeElement)).toBe(true)
  expect(cancel).not.toHaveFocus()
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: '  Mina  ' } })
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(save).toHaveBeenCalledWith('Mina')
})

it('announces empty picker results and traps keyboard focus', () => {
  render(<SearchPicker open title="국가" placeholder="국가 검색" options={[{ value: 'KR', label: '대한민국' }]} onSelect={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xyz' } })
  expect(screen.getByRole('status')).toHaveTextContent('결과가 없어요')
  screen.getByRole('searchbox').focus()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' })).toHaveFocus()
})

it('renders English controls and unavailable rates without claiming an unregistered currency', () => {
  locale.language = 'en'
  render(<MemoryRouter><PreferencesScreen values={{ ...values, locale: 'en' }} onChange={vi.fn()} onSave={vi.fn()} onRetryRates={vi.fn()} /></MemoryRouter>)
  expect(screen.getByText('Example with your preferences')).toBeInTheDocument()
  expect(screen.getByText(/September 20/)).toBeInTheDocument()
  expect(screen.queryByText(/9월 20일/)).not.toBeInTheDocument()
  expect(screen.getByText('Rate information is not available yet.')).toBeInTheDocument()
  expect(screen.queryByText('No rate registered for this currency yet.')).not.toBeInTheDocument()
  expect(screen.queryByText('영어')).not.toBeInTheDocument()
})

it('restores picker focus to its trigger and restores page scroll after closing', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const props = { title: '국가', placeholder: '국가 검색', options: [], onSelect: vi.fn(), onClose: vi.fn() }
  const view = render(<SearchPicker {...props} open />)
  expect(document.body.style.overflow).toBe('hidden')
  expect(screen.getByRole('searchbox')).toHaveFocus()
  view.rerender(<SearchPicker {...props} open={false} />)
  expect(trigger).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
  trigger.remove()
})
