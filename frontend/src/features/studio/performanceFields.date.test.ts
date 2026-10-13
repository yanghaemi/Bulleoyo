/**
 * 공연 일시 입력의 왕복 — S15P21B204-144 (리허설 2 D-71).
 *
 * 리허설에서 공연 13·15 의 공연일이 **생성 몇 분 뒤인 당일**로 저장됐고, 입력 실수인지
 * 날짜 입력 버그인지가 불분명했다. 이 저장소에는 그때까지 이 변환을 덮는 테스트가 없어서
 * 코드를 읽는 것 말고는 판정할 방법이 없었다.
 *
 * 그래서 두 변환의 계약을 고정한다:
 *   `isoToKstInput`  서버 ISO → `datetime-local` 값(KST 벽시계)
 *   `kstInputToIso`  그 값 → 서버로 보낼 ISO(오프셋 명시)
 *
 * **판정에 필요한 성질은 두 개다.**
 *   ① 생성 화면은 빈 값으로 시작한다 — 현재 시각을 미리 채우지 않는다. 채우면 사용자가
 *      건드리지 않아도 "지금 몇 분 뒤"가 저장돼 이번 증상과 똑같아진다.
 *   ② 입력값이 그대로 돌아온다 — 변환이 날짜를 밀지 않는다.
 *
 * ⚠ 이 파일은 **프론트 경계까지만** 본다. 서버가 저장한 `performance_at` 이 보낸 `startAt`
 *   과 같은지는 백엔드 테스트가 없다(2026-09-18 확인). 그쪽은 별도 과제다.
 */

import { describe, expect, it } from 'vitest'

import { isoToKstInput, kstInputToIso, validateInfo } from './performanceFields'

describe('공연 일시 입력 왕복', () => {
  it('생성 화면은 빈 값으로 시작한다 — 현재 시각을 미리 채우지 않는다', () => {
    // 생성 모드에서 폼이 넘기는 값이다(`data?.startAt` 이 undefined)
    expect(isoToKstInput(undefined)).toBe('')
    expect(isoToKstInput(null)).toBe('')
    expect(isoToKstInput('')).toBe('')
  })

  it('빈 값은 서버로 나가지 않는다', () => {
    expect(kstInputToIso('')).toBe('')
  })

  it('입력값이 오프셋만 붙어 그대로 나간다', () => {
    expect(kstInputToIso('2026-09-22T19:00')).toBe('2026-09-22T19:00:00+09:00')
  })

  it('서버 ISO → 입력값 → 서버 ISO 가 같은 순간을 가리킨다', () => {
    const fromServer = '2026-09-22T19:00:00+09:00'
    const input = isoToKstInput(fromServer)
    expect(input).toBe('2026-09-22T19:00')
    expect(new Date(kstInputToIso(input)).getTime()).toBe(new Date(fromServer).getTime())
  })

  it('서버가 다른 오프셋으로 줘도 KST 벽시계로 옮긴다 — 날짜가 밀리지 않는다', () => {
    // 같은 순간을 UTC 로 표기한 값. KST 는 +9 이므로 9/22 19:00 이어야 한다
    const input = isoToKstInput('2026-09-22T10:00:00Z')
    expect(input).toBe('2026-09-22T19:00')
    expect(new Date(kstInputToIso(input)).getTime()).toBe(
      new Date('2026-09-22T10:00:00Z').getTime(),
    )
  })

  it('자정을 하루 앞으로 밀지 않는다', () => {
    // ⚠ 이 테스트는 `hour === '24'` 되돌림 분기를 **지키지 못한다.** 현행 V8/ICU 는
    // `hour12:false` 에 `00` 을 주므로 그 분기는 실행되지 않고, 분기가 깨져도 초록이다.
    // 여기서 고정하는 것은 "자정이 전날로 밀리지 않는다" 하나다
    const input = isoToKstInput('2026-09-22T00:00:00+09:00')
    expect(input).toBe('2026-09-22T00:00')
  })

  it('파싱할 수 없는 값은 입력에 넣지 않는다', () => {
    expect(isoToKstInput('어제')).toBe('')
  })

  it('초까지 있는 입력은 오프셋만 붙여 내보낸다', () => {
    // 길이 19 는 `:00` 을 덧대지 않는 갈래다(`value.length === 16` 이 아닌 쪽)
    expect(kstInputToIso('2026-09-22T19:00:30')).toBe('2026-09-22T19:00:30+09:00')
  })

  it('⚠ 오프셋이 이미 붙은 값은 받지 않는다 — 지금은 도달 불가이지만 계약을 적어 둔다', () => {
    // `kstInputToIso` 는 `datetime-local` 값만 받는다. 오프셋이 붙은 값을 넘기면 `+09:00` 을
    // 덧붙여 Invalid Date 가 된다. 현재 호출부는 `isoToKstInput` 출력만 넘겨 닿지 않는데,
    // 누가 서버 ISO 를 그대로 넘기면 조용히 깨지므로 그 사실을 여기 남긴다
    expect(Number.isNaN(new Date(kstInputToIso('2026-09-22T19:00:00+09:00')).getTime())).toBe(true)
  })

  describe('과거 일시는 저장 전에 막힌다 — 서버 PERFORMANCE_DATE_INVALID 앞의 1차 게이트다', () => {
    // `now` 를 주입해 실시간에 기대지 않는다. 실시간이면 분 경계에 걸릴 때 결과가 흔들리고,
    // 경계인 `start === now`(`performanceFields.ts` 의 `start <= now`)를 겨냥할 수도 없다.
    const NOW_ISO = '2026-09-22T19:00:00+09:00'
    const now = new Date(NOW_ISO).getTime()

    function startAtErrorFor(startAt: string) {
      return validateInfo(
        {
          title: '테스트 공연',
          description: '',
          venueName: '롤링홀',
          venueAddress: '서울시 마포구',
          startAt,
          endAt: isoToKstInput('2026-09-22T23:00:00+09:00'),
          jointPerformance: false,
          hostTeamId: 1,
        },
        { now },
      ).startAt
    }

    it('지난 시각은 막는다', () => {
      expect(startAtErrorFor(isoToKstInput('2026-09-22T18:59:00+09:00'))).toBeTruthy()
    })

    it('같은 분은 막는다 — 경계가 `start <= now` 다', () => {
      expect(startAtErrorFor(isoToKstInput(NOW_ISO))).toBeTruthy()
    })

    it('1분 뒤는 통과한다', () => {
      expect(startAtErrorFor(isoToKstInput('2026-09-22T19:01:00+09:00'))).toBeUndefined()
    })

    it('시스템 시간대와 무관하다 — 입력이 오프셋을 명시해 나간다', () => {
      // CI 가 UTC 여도 `kstInputToIso` 가 `+09:00` 을 붙이므로 9시간 미래로 읽히지 않는다.
      // 판정에 쓰이는 값이 실제로 그 순간인지 직접 못 박는다
      expect(new Date(kstInputToIso(isoToKstInput(NOW_ISO))).getTime()).toBe(now)
    })
  })
})
