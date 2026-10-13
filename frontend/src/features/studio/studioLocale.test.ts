import i18n from '@/shared/i18n'
import { validateTeamForm } from './teamForm'
import { studioMessage } from './studioErrors'
import { formatRemaining, settlementMessage } from './settlementMessages'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

it('resolves validation and code messages in the current language after switching', async () => {
  await i18n.changeLanguage('ko')
  expect(validateTeamForm({ teamName: '', introduction: '', genre: '' }).teamName).toBe(
    '팀 이름을 입력해 주세요.',
  )
  expect(studioMessage('PERFORMANCE_NOT_FOUND')).toBe('존재하지 않는 공연입니다.')
  await i18n.changeLanguage('en')
  expect(validateTeamForm({ teamName: '', introduction: '', genre: '' }).teamName).toBe('Enter a team name.')
  expect(studioMessage('PERFORMANCE_NOT_FOUND')).toBe('This show does not exist.')
  expect(settlementMessage('SETTLEMENT_NOT_PARTICIPANT')).toBe(
    'Only participating teams can view this settlement.',
  )
  expect(studioMessage('UNRECOGNIZED_CODE')).toContain('UNRECOGNIZED_CODE')
})

it('localizes the dispute countdown without changing its duration', async () => {
  const now = Date.parse('2026-09-18T00:00:00Z')
  await i18n.changeLanguage('ko')
  expect(formatRemaining('2026-09-18T01:30:00Z', now)).toBe('1시간 30분 남음')
  await i18n.changeLanguage('en')
  expect(formatRemaining('2026-09-18T01:30:00Z', now)).toBe('1h 30m remaining')
})
