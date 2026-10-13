/**
 * A-13 잔액 이력 날짜 묶음 테스트.
 *
 * 이 자리는 **두 번 틀렸다.** 두 번 다 리뷰가 잡았고 테스트는 놓쳤다. 왜 놓쳤는지가 중요하다.
 *
 * ① 앞 10자 자르기(MR !56, 정용기) — 서버가 UTC로 주면 머리글과 행이 하루 어긋난다.
 * ② 브라우저 로컬 날짜(MR !61 자동 리뷰) — 행에 실제로 찍히는 값은 서버가 **회원 시간대**로
 *    만들어 준 문자열이라, 브라우저가 그 시간대가 아니면 여전히 어긋난다.
 *
 * ②를 놓친 이유는 이전 테스트가 `expect(dayKey(iso)).toBe(ymd(new Date(iso)))`처럼
 * **구현을 그대로 다시 쓴 식**이었기 때문이다. 구현이 로컬을 쓰면 기대값도 로컬이 되어
 * 무엇을 하든 통과한다. 그래서 이번에는 **구현을 재현하지 않고 알려진 정답을 박아 둔다.**
 * 시간대를 인자로 받으므로 실행 환경의 `TZ`와 무관하게 결과가 고정된다.
 */

import { describe, expect, it } from 'vitest'

import { dayKey, groupByDay, ymdIn } from './walletGrouping'
import type { WalletTx } from './WalletScreen'

const KST = 'Asia/Seoul'
const NY = 'America/New_York'

function tx(occurredAt: string, walletTxId: string, label = '표시 전용'): WalletTx {
  return {
    walletTxId,
    type: 'PURCHASE',
    status: 'CONFIRMED',
    direction: 'OUT',
    amount: 1000,
    occurredAt,
    occurredAtLabel: label,
    title: '테스트 공연',
  }
}

describe('잔액 이력 날짜 묶음', () => {
  it('UTC로 와도 표시 시간대의 날짜가 된다', () => {
    // 2026-09-08T16:00:00Z = KST 9월 9일 오전 1시 = 뉴욕 9월 8일 정오
    const iso = '2026-09-08T16:00:00Z'
    expect(dayKey(iso, KST)).toBe('2026-09-09')
    expect(dayKey(iso, NY)).toBe('2026-09-08')
  })

  it('실행 환경의 시간대가 결과를 바꾸지 않는다', () => {
    // 같은 인자면 언제 어디서 돌려도 같은 값이다. 구현이 로컬 시간대를 몰래 쓰면 여기서 깨진다
    const iso = '2026-09-08T16:00:00Z'
    expect(dayKey(iso, KST)).toBe('2026-09-09')
    expect(ymdIn(iso, 'UTC')).toBe('2026-09-08')
    expect(ymdIn(iso, 'Pacific/Kiritimati')).toBe('2026-09-09')
  })

  it('행에 찍히는 라벨과 머리글이 같은 날을 가리킨다', () => {
    // 목 데이터가 실제로 쓰는 모양 — 라벨은 KST로 만들어져 있다
    const iso = '2026-09-08T14:12:00+09:00'
    expect(dayKey(iso, KST)).toBe('2026-09-08') // 라벨 "9월 8일 오후 2:12 KST"와 같은 날
  })

  it('같은 순간을 다른 표기로 줘도 한 묶음이다', () => {
    const utc = '2026-09-08T16:00:00Z'
    const kst = '2026-09-09T01:00:00+09:00'
    expect(dayKey(utc, KST)).toBe(dayKey(kst, KST))
    expect(groupByDay([tx(utc, 'a'), tx(kst, 'b')], KST)).toHaveLength(1)
  })

  it('다른 날이면 묶음이 갈리고, 같은 날은 이어진다', () => {
    const groups = groupByDay(
      [
        tx('2026-09-09T20:00:00+09:00', 'a'),
        tx('2026-09-09T09:00:00+09:00', 'b'),
        tx('2026-09-08T23:00:00+09:00', 'c'),
      ],
      KST,
    )
    expect(groups.map((g) => g.items.length)).toEqual([2, 1])
  })

  it('시간대가 바뀌면 묶음도 바뀐다', () => {
    // KST로는 같은 9월 9일, 뉴욕으로는 8일과 9일로 갈린다
    const list = [tx('2026-09-09T20:00:00+09:00', 'a'), tx('2026-09-09T09:00:00+09:00', 'b')]
    expect(groupByDay(list, KST)).toHaveLength(1)
    expect(groupByDay(list, NY)).toHaveLength(2)
  })

  it('파싱할 수 없는 값이 와도 목록이 사라지지 않고 머리글이 NaN이 되지 않는다', () => {
    const groups = groupByDay([tx('not-a-date', 'a')], KST)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(1)
    expect(groups[0].label).not.toContain('NaN')
  })
})
