/**
 * 표시용 포맷 유틸.
 *
 * 금액은 YoYo 정수이고 `decimals = 0`이라 소수가 없다(API v6 §0.1). 1 YoYo = 이 세계의 1원.
 * 계산·요청에 실리는 값은 언제나 정수이며, 여기서는 표시 문자열만 만든다.
 */

/**
 * 금액 표기 — `10,000 YoYo`. 천 단위 쉼표, 숫자 뒤 공백 + `YoYo`. ko·en 동일.
 *
 * 2026-09-24 사용자 결정으로 ₩·KRW·"원" 표기를 폐기했다 — 원화 표기는 관객이 현금·카드 결제로 오해한다.
 * 부호가 필요하면 `sign`에 `+` 또는 `−`(U+2212)를 넘긴다(`+15,000 YoYo` / `−15,000 YoYo`).
 * 부호를 넘길 때 `amount`는 절댓값이어야 한다 — 음수를 넘기면 `toLocaleString`의 `-`가 겹친다.
 */
export function formatYoyo(amount: number, sign?: '+' | '−'): string {
  return `${sign ?? ''}${amount.toLocaleString('en-US')} YoYo`
}

/**
 * 주소·tx 해시 축약 — 화면설계 v6 §5.3.
 *
 * "앞 6자리…뒤 4자리". 앞 6자리는 `0x` 두 글자를 포함한 값이다(`0x7a3f9c…9a1b`).
 * 축약할 만큼 길지 않으면 원문을 그대로 돌려준다 — 잘라서 더 짧아지면 의미가 없다.
 *
 * 공연자·관리자·검증 화면(P·M·V)에서만 쓴다. 관객 화면에는 주소를 노출하지 않는다(§1.2 원칙 11).
 */
export function shortenHex(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}

/**
 * 시각 표기 — 화면설계 v6 §5.13 KST 병기.
 *
 * 회원(브라우저) 시간대로 쓰고 KST를 괄호로 병기하되, **회원 시간대가 KST면 병기를 생략**한다.
 * 공연은 한국에서 열려 마감·입장이 KST 기준이므로, 회원 시간대만 보여주면 착오가 난다.
 *
 * 서버 ISO 문자열을 그대로 받는다. 파싱에 실패하면 원문을 돌려준다 — 값을 숨기지 않는다.
 *
 * 2026-09-09 P-08 작업에서 `SalesStatus`의 지역 함수를 여기로 올렸다.
 * 시각을 찍는 화면이 늘어나는데(P-07 갱신 시각, P-08 단계·수령·반환 시각) 같은 규칙을
 * 화면마다 다시 쓰면 병기 규칙이 갈라진다.
 *
 * 2026-09-09 C-04 작업에서 `timeZone` 인자를 더했다(기본값은 브라우저 시간대 — 기존 동작 그대로).
 * C-04 미리보기 패널은 **아직 저장하지 않은 시간대**로 시각을 다시 그려야 하는데
 * (화면설계 v6 C-04 "선택 시 미리보기 시각 갱신"), 브라우저 시간대로만 찍으면
 * 시간대를 바꿔도 미리보기가 꿈쩍하지 않는다. 화면이 자기만의 포맷 함수를 새로 만들면
 * §5.13 병기 규칙이 두 벌이 되므로 인자를 여는 쪽을 택했다.
 */
export function formatKst(iso: string, timeZone?: string, language: 'ko' | 'en' = 'ko'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // §5.13의 보기: "9월 20일 오후 7:00 (KST 19:00)" — 연도 없이 월·일, 12시간제
  const opts: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    // undefined를 넘기면 Intl이 브라우저 시간대를 쓴다 — 인자를 주지 않은 호출은 이전과 같다
    ...(timeZone ? { timeZone } : {}),
  }
  const locale = language === 'ko' ? 'ko-KR' : 'en-US'
  const local = new Intl.DateTimeFormat(locale, opts).format(d)
  const kst = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'Asia/Seoul' }).format(d)
  if (local !== kst) {
    // 회원 시간대가 KST가 아니면 §5.13대로 KST 시:분을 괄호로 병기한다
    const kstTime = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(d)
    return `${local} (KST ${kstTime})`
  }
  // 회원 시간대가 KST면 §5.13은 "병기 생략"이다. 다만 표식 없이 두면 외국인 관객이
  // 어느 시간대인지 알 수 없어, 괄호 병기 대신 `KST` 한 마디만 뒤에 남긴다.
  // ⚠ 명세를 문자 그대로 따르면 이 `KST`도 없어야 한다 — 의도한 해석이다.
  return `${kst} KST`
}

/** 한 주문 안의 팀별 수량 배분 한 줄(표시용). 팀 하나여도 같은 표현을 쓴다 */
export interface TeamAllocationView {
  teamName: string
  quantity: number
}

/**
 * "블루노트 1장 · 노이즈캔슬 2장" — 주문의 팀별 수량 배분(API-ticket-01 `teamAllocations`).
 *
 * A-04 요약·A-05 결제·A-06 완료·A-12 주문 상세가 **같은 문자열**을 쓴다.
 * 배분이 없으면(단독 공연) 빈 문자열이라 화면이 행 자체를 접을 수 있다.
 */
export function formatTeamAllocations(
  allocations: readonly TeamAllocationView[] | undefined,
  language: 'ko' | 'en' = 'ko',
): string {
  return (allocations ?? [])
    .map((a) => (language === 'ko' ? `${a.teamName} ${a.quantity}장` : `${a.teamName} × ${a.quantity}`))
    .join(' · ')
}
