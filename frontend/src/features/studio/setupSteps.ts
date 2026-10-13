/**
 * 공연 준비 단계 — P-03(정보·티켓 옵션 · 참여팀 · 규칙 동의 · 보증금)과 P-05(정산 규칙)가
 * **같은 표시를 쓴다.**
 *
 * 준비 흐름은 화면 하나에 담기지 않는다. 정산 규칙은 편집기가 따로 있어 P-05 가, 참여팀 초대는
 * P-04 가, 규칙 동의는 P-06 이 맡고, 나머지는 P-03 이 맡는다. 그래도 사용자에게는 **한 줄기
 * 진행**이므로 라벨과 순서를 여기 한 곳에 두고 여러 화면이 같은 값을 그린다 — 한쪽만 고치면
 * 어긋난다.
 *
 * 순서의 근거는 서버다.
 *   ① **참여팀이 규칙보다 먼저** — 규칙 화면은 공연 상세의 `participants[]` 로 팀 몫을 나눈다.
 *      초대 전에는 생성 팀 하나뿐이라 공동 공연의 규칙이 1팀으로 굳는다. 서버도 공동 공연이면
 *      보증금 prepare 와 판매 시작에서 수락 참여팀 2 이상을 요구한다(`TEAM_MIN_COUNT_NOT_MET`).
 *   ② **규칙이 동의보다 먼저** — 동의(API-rule-03)는 온체인 `agreeToRules` 라 `createShow` 가
 *      끝나 있어야 하고, `createShow` 를 거는 것은 규칙 저장이다(`RuleService`). 규칙을 저장해야
 *      공연이 `DRAFT → PENDING_AGREEMENT` 로 가고 서명할 `rulesHash` 가 생긴다.
 *   ③ **동의가 보증금보다 먼저** — 이건 서버 제약이 아니라 **팀 결정(2026-09-21)** 이다.
 *      동의(API-rule-03)의 선행 조건은 `참여팀 리더 · ACCEPTED · PENDING_AGREEMENT · 지갑 LINKED`
 *      뿐이고 보증금을 보지 않는다. 반대로 판매 시작은 컨트랙트가 `DepositRequired` ·
 *      `NotAllAgreed` 둘 다로 막으므로, 보증금은 **판매 직전 마지막 잠금**에 두는 편이 맞다.
 *      순서를 되돌리면 "보증금부터 내라"는 옛 안내로 돌아간다(S15P21B204-136).
 * 이 배열의 순서를 바꾸려면 위 근거부터 바뀌어야 한다.
 */
export const SETUP_STEPS = [
  ['공연 정보·티켓 옵션', 'Details & tickets'],
  ['참여팀', 'Participants'],
  ['정산 규칙', 'Settlement rules'],
  ['규칙 동의', 'Rule agreements'],
  ['보증금', 'Deposit'],
] as const

/** P-03 이 여는 첫 단계 */
export const SETUP_STEP_BASICS = 0
/** P-04 가 맡는 단계. 단독 공연은 **표시에서도** 숨긴다 */
export const SETUP_STEP_PARTICIPANTS = 1
/** P-05 가 맡는 단계 */
export const SETUP_STEP_RULES = 2
/** P-06 이 맡는 단계. **단독 공연에도 있다** — 생성 팀 리더 본인이 서명해야 한다 */
export const SETUP_STEP_AGREEMENTS = 3
/** P-03 이 맡는 마지막 단계 */
export const SETUP_STEP_DEPOSIT = 4

/**
 * 공동 공연이 규칙·보증금으로 넘어가기 위한 최소 참여팀 수 — **생성 팀을 포함해서** 센다.
 * 서버 판정과 같은 숫자다(`TEAM_MIN_COUNT_NOT_MET`, 보증금 prepare · 판매 시작).
 */
export const MIN_JOINT_PARTICIPANTS = 2

/**
 * 참여팀 단계를 끝냈는가 — P-03 폼과 P-03 페이지가 **같은 판정**을 쓴다.
 *
 * 단독 공연은 초대할 팀이 없으므로 언제나 끝난 것으로 본다. 공동 공연은 수락을 마친 팀이
 * 둘 이상이어야 한다 — 하나뿐이면 규칙이 1팀으로 굳고 보증금 prepare 가 409 로 막힌다.
 * `jointPerformance`를 모르면 단독으로 본다(`PerformanceEditData.jointPerformance` 주석).
 */
export function participantsStepDone(show: {
  jointPerformance?: boolean
  acceptedParticipantCount?: number
}): boolean {
  if (!show.jointPerformance) return true
  return (show.acceptedParticipantCount ?? 0) >= MIN_JOINT_PARTICIPANTS
}

/**
 * 규칙 동의 단계를 끝냈는가 — **rule_02 `agreements[]` 로만 판정한다.**
 *
 * ⚠ `startSaleBlockedReason !== 'RULE_NOT_AGREED_BY_ALL'` 로 뒤집어 읽으면 **틀린다.**
 * 서버(`RuleService.startSaleBlockedReason`)는 이유를 **하나만** 돌려주고 그 순서가
 * `잠금 → 해시 동기화 → 보증금 → 참여팀 수 → 티켓 옵션 → 미동의` 다. 보증금이 마지막 단계가
 * 된 지금 이 단계에서는 보증금이 늘 미납이라 이유가 항상 `PERFORMANCE_INVALID_STATUS` 로 오고,
 * 뒤집어 읽으면 아무도 동의하지 않았는데 "전원 동의"로 보인다.
 *
 * `agreements[]` 는 **수락한 참여팀 전원**을 담고 동의 기록이 없는 팀은 `PENDING` 으로 채워
 * 내려온다(`RuleService` 320행) — 서버의 `pendingTeamIds().isEmpty()` 와 같은 판정이다.
 * 배열이 비어 있으면 아직 모른다는 뜻이므로 끝나지 않은 것으로 본다.
 */
export function agreementsStepDone(
  agreements: readonly { status?: string }[] | undefined,
): boolean {
  if (agreements == null || agreements.length === 0) return false
  return agreements.every((agreement) => agreement.status === 'AGREED')
}

/**
 * 진행 표시에 실제로 그릴 단계 — 단독 공연은 **참여팀만** 뺀다.
 *
 * 규칙 동의는 단독 공연에도 남는다. 컨트랙트가 `agreedCount == teamWallets.length` 를 요구해
 * 생성 팀 리더 본인이 자기 지갑으로 서명해야 하기 때문이다.
 *
 * 내부 단계 상수(`SETUP_STEP_*`)는 **건드리지 않는다.** 숨김은 표시 계층의 일이고, 상수를
 * 공연 형태에 따라 바꾸면 `state.step` 으로 오가는 값의 뜻이 화면마다 달라진다.
 */
export function visibleSetupSteps(joint: boolean): readonly (typeof SETUP_STEPS)[number][] {
  return joint ? SETUP_STEPS : SETUP_STEPS.filter((_, i) => i !== SETUP_STEP_PARTICIPANTS)
}

/**
 * 내부 단계 번호 → `visibleSetupSteps(joint)` 안의 위치. `Stepper` 는 `<ol>` 이라 표시 배열과
 * `active` 를 **같은 좌표계로** 넘겨야 한다 — 안 그러면 단독 공연에서 한 칸씩 밀린다.
 *
 * 단독 공연이 숨긴 참여팀 단계에 들어오는 경우가 있다(`state.step` · 히스토리). 그때는 바로
 * 뒤인 정산 규칙 자리를 켠다 — 그 단계의 카드가 "건너뜁니다, 정산 규칙으로" 를 말하므로
 * 표시와 안내가 같은 곳을 가리킨다.
 */
export function visibleStepIndex(step: number, joint: boolean): number {
  if (joint) return step
  return step <= SETUP_STEP_PARTICIPANTS ? Math.min(step, SETUP_STEP_PARTICIPANTS) : step - 1
}
