/**
 * A-13 잔액 이력의 **날짜 묶음**.
 *
 * 화면(`WalletScreen`)에서 떼어냈다. 컴포넌트 파일은 컴포넌트만 export해야 해서(Fast Refresh)
 * 이 함수들을 테스트할 방법이 없었는데, 여기가 조용히 틀리기 쉬운 자리다 — 아래 dayKey의 ⚠ 참고.
 */

import type { WalletTx } from './WalletScreen'

/**
 * 시각을 **주어진 시간대**의 `YYYY-MM-DD`로. `Intl`이 시간대 변환을 맡는다.
 *
 * `Date`의 `getFullYear()` 같은 것을 쓰지 않는다 — 그건 브라우저 로컬 시간대로 고정이라
 * 인자로 받은 시간대를 무시한다. 바로 그것이 아래 ⚠에 적힌 사고의 원인이었다.
 */
export function ymdIn(iso: string, timeZone: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // en-CA를 쓰는 이유는 이 로케일의 기본 포맷이 정확히 YYYY-MM-DD이기 때문이다
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * 거래 시각 → 묶음 키(**표시 시간대** 기준 날짜).
 *
 * ⚠ **이 자리는 두 번 틀렸다.** 같은 실수를 세 번 하지 않게 적어 둔다.
 *
 * ① 처음에는 ISO 문자열의 앞 10자를 잘랐다. 그 값은 "문자열에 적힌 날짜"이지 화면에 보이는
 *    날짜가 아니다. 서버가 UTC로 주면 갈라진다 — `2026-09-08T16:00:00Z`는 KST로 9월 9일
 *    오전 1시인데 잘라내면 9월 8일이다(MR !56 리뷰, 정용기).
 * ② 그래서 파싱한 뒤 **브라우저 로컬** 날짜를 썼다. 이것도 틀렸다. 행에 실제로 찍히는 값은
 *    `tx.occurredAtLabel` — **서버가 회원 시간대로 만들어 준 문자열**이다(WalletScreen).
 *    브라우저가 KST가 아니면 머리글과 행이 여전히 어긋난다. 자르기에서 로컬로 **자리만 옮긴**
 *    셈이었다(MR !61 자동 리뷰).
 *
 * 그래서 시간대를 **인자로 받는다.** 호출부는 `occurredAtLabel`을 만든 것과 **같은 시간대**를
 * 넘겨야 한다. 그래야 머리글·오늘 판정·행 셋이 한 시간대를 본다. 기본값을 두지 않는 것도
 * 일부러다 — 기본값이 있으면 호출부가 생각 없이 지나간다.
 *
 * 파싱 실패는 앞 10자로 물러선다. 묶음이 조금 이상해질지언정 목록이 사라지지는 않는다.
 */
export function dayKey(occurredAt: string, timeZone: string): string {
  return ymdIn(occurredAt, timeZone) ?? occurredAt.slice(0, 10)
}

/**
 * 날짜 머리글. 오늘·어제만 말로 쓰고 나머지는 날짜 그대로 둔다 —
 * "3일 전"처럼 상대 표현을 늘리면 읽는 사람이 매번 날짜를 역산해야 한다.
 *
 * "오늘"도 **같은 시간대**에서 판정한다. 브라우저 로컬로 판정하면 자정 근처에서
 * 머리글만 하루 어긋난다.
 */
export function dayLabel(key: string, timeZone: string, language: 'ko' | 'en' = 'ko'): string {
  const now = new Date()
  const today = ymdIn(now.toISOString(), timeZone)
  if (key === today) return language === 'ko' ? '오늘' : 'Today'
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === ymdIn(y.toISOString(), timeZone)) return language === 'ko' ? '어제' : 'Yesterday'
  // 그 외에는 날짜 그대로. 행의 시각 표기(§5.13)와 결을 맞춰 "9월 6일"로 쓴다.
  // ⚠ dayKey의 폴백(파싱 실패 시 앞 10자)이 여기로 오면 숫자가 아니다. 그대로 두면
  // 머리글이 "NaN월 NaN일"로 찍힌다(MR !61 자동 리뷰). 숫자가 아니면 키를 그대로 보여준다
  const [, mo, d] = key.split('-')
  if (!Number.isFinite(Number(mo)) || !Number.isFinite(Number(d))) return key
  if (language === 'ko') return `${Number(mo)}월 ${Number(d)}일`
  const date = new Date(`${key}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return key
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    date,
  )
}

export interface TxGroup {
  key: string
  label: string
  items: WalletTx[]
}

/** 최신순으로 들어온 목록을 날짜별로 묶는다. 순서를 바꾸지 않으므로 정렬이 필요 없다 */
export function groupByDay(
  txs: WalletTx[],
  timeZone: string,
  language: 'ko' | 'en' = 'ko',
): TxGroup[] {
  const groups: TxGroup[] = []
  for (const tx of txs) {
    const key = dayKey(tx.occurredAt, timeZone)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(tx)
    else groups.push({ key, label: dayLabel(key, timeZone, language), items: [tx] })
  }
  return groups
}
