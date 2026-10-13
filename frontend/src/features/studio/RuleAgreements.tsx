import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-06 규칙 동의·판매 시작 — 각 팀 리더가 **지갑 서명으로 동의**하고, 전원 동의 후 생성자가 판매를 연다.
 *
 * 정본 — 화면설계 v6 §4 P-06(영역 구성·레이아웃·컴포넌트 표 7행·상태·입력 검증·접근성)
 *        · §5.1 상태 배지 · §5.3 tx·주소 축약 · §5.6 확인 모달 · §5.13 KST 병기
 *        · §5.14 지갑 서명 단계 · §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기
 *        · API 명세 v6 rule_02(규칙·동의 현황) · rule_03(동의 서명 파라미터)
 *          · rule_05(발신자 서명 RLP 보고) · rule_04(판매 시작)
 *
 * 본문 순서는 P-06 **영역 구성** 그대로다 — 규칙 요약(읽기 전용) → 규칙 해시 →
 * 팀별 동의 현황 → 서명 요약. 레이아웃 항목대로 PC는 **최대폭 1200px 2열**(좌 규칙 요약·해시 /
 * 우 동의 현황)이고 두 버튼은 우측 목록 아래 본문에 둔다. 모바일은 1열이고
 * **하단 고정에는 "우리 팀 동의" 하나만** 둔다 — 판매 시작은 본문에 남긴다(§5.19가 이 화면을
 * 예시로 들어 "두 개를 겹쳐 두면 잘못 누른다"고 적었다).
 *
 * **서명은 P-03 보증금과 같은 모양이다**(§5.14 — 요약 → 대기 → 확인 중 → 완료, 거부는 에러가 아님).
 * 이 화면도 서명 파라미터를 만들지도 개인키를 다루지도 않는다. `onAgree`가 그 일을 하고
 * 여기는 단계 표시와 거부 복귀만 그린다. **`senderSignedRlp`는 이 파일을 지나가지 않는다.**
 *
 * **낙관적 UI를 쓰지 않는다.** 동의도 판매 시작도 서버 응답(그리고 job 확정)을 받은 뒤에만
 * 배지·상태를 옮긴다. 온체인 확정 전에 `AGREED`로 그려 두면 실패했을 때 되돌릴 수 없는
 * 인상을 남긴다 — 중간 상태 `SIGNING`("서명 확인 중")이 명세에 있는 이유가 이것이다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * ⚠ **명세 공백 3건**(보고 대상)
 *   ① **rule_02 응답에 "내가 생성자인가"가 없다.** 판매 시작 버튼은 생성자에게만 보여야 하는데
 *      (`PERFORMANCE_NOT_OWNER` 403) 응답에 `host`·`isOwner`가 없다. performance_03
 *      `participants[].host`와 performance_06의 내 팀을 대조해야 하고, 화면은 `isOwner`를
 *      **props로 받는다**.
 *   ② **rule_02 응답에 공연명이 없다.** P-05와 같은 공백이다 — performance_03의 `title`을
 *      함께 받아 넘긴다.
 *   ③ **rule_02의 `agreements[].walletAddress`·`myAgreement.nextAction`이 선택 필드다**
 *      (2026-09-15 추가). required로 받으면 페이지가 없는 값을 지어내야 해서 두 Props를
 *      optional로 내렸다(아래 타입 주석). 서버가 항상 채워 준다면 스키마를 required로 올리는
 *      편이 맞고, 그때 이 화면은 지금 그대로 둬도 된다.
 *
 * TODO(API 연결)
 *   조회:   rule_02 `GET /api/v1/performances/{performanceId}/rules` → `RuleStatusResponseData`
 *           — performanceStatus·depositStatus·locked·rulesHash
 *             ·rule{fixedRatioBp,selectionRatioBp,teamShares[]}
 *             ·agreements[{teamId,teamName,walletAddress,status,txHash,explorerUrl,agreedAt}]
 *             ·myAgreement{teamId,status,nextAction}·startSaleAvailable·startSaleBlockedReason
 *           **다른 팀의 동의는 폴링으로 자동 갱신된다**(P-06 상태 항목) — 이 조회를 주기적으로 다시 부른다
 *   동의:   rule_03 `POST …/rules/agreements/prepare` `{ teamId, rulesHash }`
 *           → `{ rulesHash, prerequisiteJobId, signRequests[1건: kind AGREE], expiresAt }`
 *           ⚠ `prerequisiteJobId`가 있으면 **`createShow` job 확정 후** 서명한다
 *           ⚠ 이미 온체인 동의가 있으면 `signRequests: []`로 오고 DB만 `AGREED`로 동기화된다
 *           → `WalletAdapter`로 발신자 서명 → rule_05 `POST …/rules/agreements/signed-tx`
 *             `{ teamId, senderSignedRlp }` → 202 `{ jobId, pollAfterMs, agreementStatus: SIGNING,
 *             txHash, explorerUrl, allAgreed, pendingTeamIds[], startSaleAvailable }`
 *           → `GET /api/v1/chain/jobs/{jobId}`를 `pollAfterMs` 간격으로 CONFIRMED/FAILED까지
 *           ⚠ `senderSignedRlp`는 **localStorage·로그에 남기지 않는다.** 화면 상태로도 들지 않는다
 *   판매:   rule_04 `POST …/sale/start` `{ rulesHash }` → 202 `{ jobId, pollAfterMs,
 *             nextStatus: ON_SALE, splitterAddress, teamWallets[{teamId,teamIndex,walletAddress}] }`
 *           **서명이 없다** — 운영자(운영지갑)가 `startSale`을 실행한다
 *   에러:   409 `RULE_NOT_AGREED_BY_ALL`(미동의 팀 강조) · 409 `RULE_HASH_MISMATCH`(새로고침 안내)
 *           · 409 `RULE_ALREADY_LOCKED` · 409 `TEAM_MIN_COUNT_NOT_MET` · 403 `PERFORMANCE_NOT_OWNER`
 *           · 409 `PAYMENT_AMOUNT_MISMATCH`(= §8.2 `PAYMENT_TX_MISMATCH`) → 재시도 안내
 *           · 409 `COMMON_CONFLICT`(= §8.2 `PAYMENT_SIGNATURE_REJECTED`) → **에러 아님**
 *           · 500 `CHAIN_GAS_INSUFFICIENT` · 504 `CHAIN_TX_TIMEOUT`(jobId로 계속 폴링)
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import {
  Button,
  ConfirmDialog,
  FixedBottom,
  InfoRow,
  Spinner,
  StatusBadge,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import type { DepositStatus } from '@/shared/ui'
import { NextStepDialog } from '@/features/studio/NextStepDialog'
import type { NextStepAction } from '@/features/studio/NextStepDialog'
import { WalletAddressCopy } from '@/features/studio/WalletAddressCopy'
import { useClipboard } from '@/features/studio/useClipboard'
import {
  StudioErrorPanel,
  StudioHeading,
  StudioForbidden,
  StudioNotice,
  StudioSkeleton,
} from '@/features/studio/StudioStates'
import {
  StudioCode,
  agreeFailureText,
  isSignatureRejectedCode,
  studioFailureText,
  studioMessage,
} from '@/features/studio/studioErrors'
import { bpToPercentLabel } from '@/features/studio/settlementRuleCalc'
import { MIN_JOINT_PARTICIPANTS, SETUP_STEP_DEPOSIT } from '@/features/studio/setupSteps'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceStatus } from '@/features/studio/showStatus'

/* ── 타입 ─────────────────────────────────────────────────────────────── */

/** `RuleAgreementStatus`(rule_02) — 3단계. `SIGNING`은 tx 보고 후 receipt 대기다 */
export type AgreementStatus = 'PENDING' | 'SIGNING' | 'AGREED'

/** `myAgreement.nextAction`(rule_02) */
export type AgreementNextAction = 'SIGN' | 'WAIT' | 'NONE'

/** `agreements[]` 한 줄 */
export interface AgreementRow {
  teamId: number
  teamName: string
  /**
   * 리더 지갑 주소. 공연자 화면이라 노출이 허용된다(§1.2 원칙 11).
   *
   * ⚠ rule_02의 `agreements[].walletAddress`가 선택 필드라 **없이 올 수 있다**(2026-09-15).
   * required로 두면 페이지가 주소를 지어내거나 그 팀을 목록에서 지워야 한다 — 후자는
   * "n / m 동의" 셈까지 틀어진다. `undefined`는 "주소 없음"이 아니라 **"모른다"**이고,
   * 그때는 이 칸만 비운다(§5.10).
   */
  walletAddress?: string
  status: AgreementStatus
  txHash?: string | null
  /** 서버가 완성해 준 익스플로러 URL. 클라이언트가 조립하지 않는다(§5.3) */
  explorerUrl?: string | null
  agreedAt?: string | null
}

/** rule_02 `RuleStatusResponseData`에서 이 화면이 쓰는 것만 */
export interface AgreementScreenData {
  performanceId: number
  performanceStatus: PerformanceStatus
  depositStatus: DepositStatus
  /** `startSale` 완료 여부. true면 동의·판매 시작 액션이 모두 끝난 상태다 */
  locked: boolean
  /** `0x` + 64 hex(66자) */
  rulesHash: string
  rule: {
    fixedRatioBp: number
    selectionRatioBp: number
    teamShares: { teamId: number; shareBp: number }[]
  }
  agreements: AgreementRow[]
  /**
   * 내 팀의 동의. 참여팀이 아니면(생성자 관전 등) 없을 수 있다.
   *
   * ⚠ `nextAction`은 rule_02에서 선택 필드다(2026-09-15). 없으면 **지금 서명할 것이 있는지
   * 모르는** 상태이고, 화면은 `SIGN`일 때만 버튼을 연다 — 모르는 값을 `NONE`으로 채워 넣지
   * 않는다(그것도 결국 화면이 지어낸 판단이다).
   */
  myAgreement?: { teamId: number; status: AgreementStatus; nextAction?: AgreementNextAction }
  /** 서버가 정하는 버튼 활성 조건 [권] — 화면이 다시 계산하지 않는다 */
  startSaleAvailable: boolean
  /** 막힌 이유 **코드**(예 `RULE_NOT_AGREED_BY_ALL`). 문구는 `studioMessage`가 만든다 */
  startSaleBlockedReason?: string | null
  /** ⚠ 머리말 ① — rule_02 응답에 없다. 상위가 대조해 넘긴다 */
  isOwner: boolean
  /**
   * 공동 공연인가 — performance_03 `jointPerformance`. rule_02 응답에 없어 상위가 넘긴다.
   * 동의 확정 모달이 "초대 수락이 모자라 보증금이 막힌다"를 가를 때만 쓴다. `undefined`는
   * **모른다**이고, 그때는 수락 팀 수로 막혔다고 단정하지 않는다(보증금 미리 납부 안내).
   */
  jointPerformance?: boolean
}

/**
 * §5.14의 네 단계 + 거부. **P-03 보증금(`DepositSignStage`)과 같은 모양이다.**
 *
 * 같은 이름의 타입을 `PerformanceForm.tsx`가 이미 갖고 있지만, 그 파일에서 가져오려면
 * 화면 컴포넌트 모듈을 서로 물리게 된다. 단계 정의는 §5.14 한 곳에서 왔으므로 값이 같고,
 * 다른 것은 ④ 완료 문구뿐이다(P-03 "납부 완료" / P-06 "동의 완료").
 * §5.14가 바뀌면 두 곳을 함께 고친다.
 */
export type AgreeSignStage =
  | { kind: 'idle' }
  /** ② 대기 — 지갑 팝업. 동의는 `approve`가 없어 서명이 **1건**이다(rule_03) */
  | { kind: 'signing' }
  /** ③ 확정 대기 — RLP 보고 후 서버가 대납 서명·전송·receipt를 검증하는 동안 */
  | { kind: 'confirming' }
  /**
   * ②' **선행 작업이 방금 확정됐다 — 서명은 다음 클릭에서 한다**(D-77 · §5.14).
   *
   * 온체인 `createShow`를 기다린 뒤(수 초) 같은 클릭 안에서 팝업을 열면 브라우저의 사용자
   * 활성화(user activation)가 이미 만료돼 있을 수 있다. 새 클릭 = 새 활성화이므로 여기서
   * 한 번 멈추고 "서명하기"를 다시 누르게 한다. 선행 작업이 없는 보통의 경우에는 이 단계를
   * 거치지 않는다(한 클릭으로 끝난다).
   */
  | { kind: 'ready-to-sign' }
  /** ④ 완료 */
  | { kind: 'done' }

/**
 * 즉시 실패 뒤 동의 버튼을 잠가 두는 시간. 같은 값이 P-03 보증금(`PerformanceForm.tsx`)에도 있다 —
 * 두 화면의 서명 버튼이 §5.14를 같이 쓰므로 함께 고친다.
 */
const RETRY_LOCK_MS = 1_200

export interface AgreeResult {
  ok: boolean
  /** 실패 코드. `code`로만 분기한다 */
  code?: string
  msg?: string
  /**
   * **실패가 아니다** — 선행 작업(온체인 `createShow`)이 방금 확정됐고 서명이 남아 있다.
   * 화면은 `ready-to-sign` 단계로 가서 클릭을 한 번 더 받는다(위 단계 주석 · D-77).
   */
  readyToSign?: boolean
}

/** 판매 시작 결과 — 서명이 없어 동의와 같은 모양이다(실패 코드만 다르다) */
export type StartSaleResult = AgreeResult

/* ── 배지 ─────────────────────────────────────────────────────────────── */

/**
 * 동의 상태 배지 — 라벨은 P-06 컴포넌트 표 그대로다.
 * 상수를 export하면 Fast Refresh가 끊기므로 내보내지 않는다.
 */
const AGREEMENT: Record<AgreementStatus, { label: [string, string]; className: string }> = {
  PENDING: { label: ['동의 대기', 'Awaiting agreement'], className: 'border-line text-muted' },
  SIGNING: {
    label: ['서명 확인 중', 'Confirming signature'],
    className: 'border-warning text-warning',
  },
  AGREED: { label: ['동의 완료', 'Agreed'], className: 'border-primary text-primary' },
}

function AgreementBadge({ status }: { status: AgreementStatus }) {
  const { text } = useLocale()
  const s = AGREEMENT[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${s.className}`}
    >
      {text(...s.label)}
    </span>
  )
}

function AgreementProgress({ agreements }: { agreements: AgreementRow[] }) {
  const { text } = useLocale()
  const total = agreements.length
  const agreed = agreements.filter((agreement) => agreement.status === 'AGREED').length
  const ratio = total === 0 ? 0 : Math.round((agreed / total) * 100)

  return (
    <section
      role="status"
      aria-label={text('동의 진행률', 'Agreement progress')}
      className="overflow-hidden rounded-card border border-primary/25 bg-primary/5 px-4 py-4 md:px-6 md:py-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="studio-section-label m-0 text-xs font-semibold text-muted">
            {text('동의 진행률', 'Agreement progress')}
          </p>
          <p className="m-0 mt-2 font-sans text-lg font-semibold tracking-tight text-ink md:text-xl">
            {text(
              `${total}개 팀 중 ${agreed}개 팀 동의 완료`,
              `${agreed} of ${total} teams agreed`,
            )}
          </p>
        </div>
        <span className="font-num text-3xl font-semibold tabular-nums text-ink">{ratio}%</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ground-2" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
      </div>
    </section>
  )
}

/* ── 규칙 요약 · 규칙 해시 ────────────────────────────────────────────── */

const EMPTY = '—'

/** 팀 이름을 `agreements[]`에서 찾는다 — `teamShares`에는 teamId뿐이다 */
function teamNameOf(
  data: AgreementScreenData,
  teamId: number,
  text: (ko: string, en: string) => string,
): string {
  return (
    data.agreements.find((a) => a.teamId === teamId)?.teamName ??
    text(`팀 #${teamId}`, `Team #${teamId}`)
  )
}

/**
 * 확정된 규칙 요약(읽기 전용) — 1단계 두 비율, 2단계 팀별 비율, dust 귀속 규칙.
 * bp는 그대로 두고 % 환산을 함께 적는다(P-05와 같은 표기).
 */
function RuleSummary({ data }: { data: AgreementScreenData }) {
  const { text } = useLocale()
  return (
    <section
      aria-label={text('확정된 정산 규칙', 'Confirmed settlement rules')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h2 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('확정된 정산 규칙', 'Confirmed settlement rules')}
      </h2>

      <h3 className="m-0 mb-1 font-sans text-[13px] font-semibold text-ink">
        {text('1단계 — 매출 분배', 'Step 1 — Revenue split')}
      </h3>
      <InfoRow label={text('고정 분배', 'Fixed share')}>
        {data.rule.fixedRatioBp}bp · {bpToPercentLabel(data.rule.fixedRatioBp)}
      </InfoRow>
      <InfoRow label={text('관객 선택', 'Audience choice')}>
        {data.rule.selectionRatioBp}bp · {bpToPercentLabel(data.rule.selectionRatioBp)}
      </InfoRow>

      <h3 className="m-0 mb-1 mt-3 font-sans text-[13px] font-semibold text-ink">
        {text('2단계 — 팀별 고정 분배 비율', 'Step 2 — Fixed share by team')}
      </h3>
      {data.rule.teamShares.map((s) => (
        <InfoRow key={s.teamId} label={teamNameOf(data, s.teamId, text)}>
          {s.shareBp}bp · {bpToPercentLabel(s.shareBp)}
        </InfoRow>
      ))}

      <p className="m-0 mt-3 font-sans text-[11px] leading-relaxed text-muted md:text-xs">
        {text(
          '나눗셈에서 남는 1 YoYo 단위 잔액은 공연을 만든 팀에 귀속됩니다',
          'Any whole-YoYo remainder goes to the host team.',
        )}
      </p>
    </section>
  )
}

/**
 * 규칙 해시 — 축약 표기 + 전체 복사(P-06 **모바일·접근성 고려**).
 *
 * 이 값이 서명 대상이자 대조 기준이다. 전체를 `title`에 남겨 두어야 익스플로러의 tx 입력과
 * 눈으로 맞춰 볼 수 있다.
 */
function RulesHashPanel({ hash, copyKey }: { hash: string; copyKey: string }) {
  const { text } = useLocale()
  const clipboard = useClipboard()
  const copied = clipboard.copiedKey === copyKey
  return (
    <section
      aria-label={text('규칙 해시', 'Rules hash')}
      className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4"
    >
      <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('규칙 해시', 'Rules hash')}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] text-ink" title={hash}>
          {shortenHex(hash)}
        </span>
        <Button variant="secondary" sm onClick={() => clipboard.copy(copyKey, hash)}>
          {text('전체 복사', 'Copy full value')}
        </Button>
        {copied && (
          <span role="status" className="font-sans text-[11px] text-muted">
            {clipboard.failed ? text('복사 실패', 'Copy failed') : text('복사됨', 'Copied')}
          </span>
        )}
      </div>
      <p className="m-0 mt-1 break-all font-mono text-[11px] leading-relaxed text-faint">{hash}</p>
    </section>
  )
}

/* ── 팀별 동의 현황 ───────────────────────────────────────────────────── */

/** PC 표의 열 순서. 모바일 패널도 **같은 순서**로 쌓는다(§5.21) */
const AGREEMENT_COLUMNS = [
  ['리더 지갑', 'Leader wallet'],
  ['동의', 'Agreement'],
  ['동의 tx', 'Agreement transaction'],
  ['동의 시각', 'Agreed at'],
] as const

function TxLink({ url, hash }: { url?: string | null; hash?: string | null }) {
  if (!url || !hash) return <span className="font-sans text-[13px] text-muted">{EMPTY}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-primary underline underline-offset-2"
    >
      {shortenHex(hash)}
    </a>
  )
}

/** 리더 지갑 — 주소를 모르면(조회에 없으면) 칸만 비운다. 지어내지 않는다 */
function LeaderWallet({
  row,
  copyKey,
  clipboard,
}: {
  row: AgreementRow
  copyKey: string
  clipboard: ReturnType<typeof useClipboard>
}) {
  const { text } = useLocale()
  if (!row.walletAddress) return <span className="font-sans text-[13px] text-muted">{EMPTY}</span>
  return (
    <WalletAddressCopy
      address={row.walletAddress}
      copyKey={copyKey}
      clipboard={clipboard}
      label={text(
        `${row.teamName} 리더 지갑 주소 복사`,
        `Copy leader wallet address for ${row.teamName}`,
      )}
    />
  )
}

function AgreementList({
  data,
  highlightPending,
}: {
  data: AgreementScreenData
  /** `RULE_NOT_AGREED_BY_ALL`을 받았을 때 미동의 팀을 강조한다(P-06 상태 항목) */
  highlightPending: boolean
}) {
  const { text } = useLocale()
  const clipboard = useClipboard()
  const rows = data.agreements
  const mine = data.myAgreement?.teamId

  const pendingClass = (row: AgreementRow) =>
    highlightPending && row.status !== 'AGREED' ? 'border-danger' : 'border-line'

  return (
    <section aria-label={text('팀별 동의 현황', 'Team agreements')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('팀별 동의 현황', 'Team agreements')}
        </h2>
        <span className="font-num text-[11px] tabular-nums text-muted">
          {rows.filter((r) => r.status === 'AGREED').length} / {rows.length}{' '}
          {text('동의', 'Agreement')}
        </span>
      </div>

      {/* ── PC: 표 ── */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
              >
                {text('팀명', 'Team name')}
              </th>
              {AGREEMENT_COLUMNS.map((c) => (
                <th
                  key={c[0]}
                  scope="col"
                  className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {text(c[0], c[1])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.teamId}
                className={`border-b last:border-b-0 ${pendingClass(row)} ${
                  highlightPending && row.status !== 'AGREED' ? 'bg-ground-2' : ''
                }`}
              >
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="block font-sans text-[13px] font-bold text-ink">
                    {row.teamName}
                  </span>
                  {row.teamId === mine && (
                    <span className="block font-sans text-[11px] text-muted">
                      {text('우리 팀', 'Your team')}
                    </span>
                  )}
                </th>
                <td className="px-4 py-3">
                  <LeaderWallet row={row} copyKey={`wallet-${row.teamId}`} clipboard={clipboard} />
                </td>
                <td className="px-4 py-3">
                  <AgreementBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <TxLink url={row.explorerUrl} hash={row.txHash} />
                </td>
                <td className="px-4 py-3 font-sans text-[13px] text-ink">
                  {row.agreedAt ? formatKst(row.agreedAt) : EMPTY}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC와 같다 ── */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {rows.map((row) => (
          <li
            key={row.teamId}
            className={`rounded-card border bg-surface px-4 py-3 ${pendingClass(row)}`}
          >
            <span className="block font-sans text-[13px] font-bold text-ink">{row.teamName}</span>
            {row.teamId === mine && (
              <span className="mb-1 block font-sans text-[11px] text-muted">
                {text('우리 팀', 'Your team')}
              </span>
            )}
            <InfoRow label={text(...AGREEMENT_COLUMNS[0])}>
              <LeaderWallet row={row} copyKey={`m-wallet-${row.teamId}`} clipboard={clipboard} />
            </InfoRow>
            <InfoRow label={text(...AGREEMENT_COLUMNS[1])}>
              <AgreementBadge status={row.status} />
            </InfoRow>
            <InfoRow label={text(...AGREEMENT_COLUMNS[2])}>
              <TxLink url={row.explorerUrl} hash={row.txHash} />
            </InfoRow>
            <InfoRow label={text(...AGREEMENT_COLUMNS[3])}>
              {row.agreedAt ? formatKst(row.agreedAt) : EMPTY}
            </InfoRow>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── §5.14 서명 요약 · 진행 표시 ──────────────────────────────────────── */

/**
 * 동의 서명 요약 — 팝업 **전에 반드시** 보여준다(§5.14 ①).
 * 문구는 P-06 컴포넌트 표 그대로이고, 해시는 §5.3 축약(앞6…뒤4)이다.
 */
function AgreeSummary({ hash }: { hash: string }) {
  const { text } = useLocale()
  return (
    <div className="rounded-card border border-line bg-ground-2 px-3 py-3">
      <p className="m-0 font-sans text-[13px] leading-relaxed font-semibold text-ink">
        {text('이 규칙에 동의합니다. 규칙 해시:', 'You are agreeing to these rules. Rules hash:')}{' '}
        <span className="font-mono">{shortenHex(hash)}</span>.{' '}
        {text(
          '판매가 시작되기 전에 규칙이 바뀌면 동의가 초기화됩니다.',
          'If the rules change before ticket sales begin, your agreement will be reset.',
        )}
      </p>
      <p className="m-0 mt-1 font-sans text-[11px] text-muted">
        {text(
          '한 번 서명합니다. 네트워크 수수료는 내지 않습니다.',
          'One signature is required. Network fees are covered.',
        )}
      </p>
    </div>
  )
}

/**
 * §5.14 ②③④ 진행 인디케이터.
 *
 * 문구는 §5.14 표 그대로다 — "지갑에서 확인해 주세요" → "확인 중…" → "동의 완료".
 * 동의는 `approve`가 없어 **카운터를 쓰지 않는다**(서명 1건, rule_03).
 */
function AgreeProgress({ stage }: { stage: AgreeSignStage }) {
  const { text } = useLocale()
  // `ready-to-sign`은 **기다리는 단계가 아니다** — 버튼이 그 자리를 쓴다(아래 `busy` 판정)
  if (stage.kind === 'idle' || stage.kind === 'ready-to-sign') return null
  return (
    <p
      role="status"
      className="m-0 flex items-center gap-2 font-sans text-[13px] font-semibold text-ink"
    >
      {/* 완료는 기다릴 것이 없다 — 여기서 스피너가 돌면 아직 처리 중으로 읽힌다 */}
      {stage.kind === 'done' ? (
        <span aria-hidden className="font-sans text-ok">
          ✓
        </span>
      ) : (
        <Spinner size={18} />
      )}
      {stage.kind === 'signing' && text('지갑에서 확인해 주세요', 'Confirm in your wallet')}
      {stage.kind === 'confirming' && text('확인 중…', 'Confirming…')}
      {stage.kind === 'done' && text('동의 완료', 'Agreed')}
    </p>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /** 공연명. ⚠ 머리말 ② — rule_02 응답에 없어 상위가 넘긴다 */
  title: string
  loading?: boolean
  data?: AgreementScreenData
  /** 403 `PERFORMANCE_NOT_OWNER`·`SETTLEMENT_NOT_PARTICIPANT` */
  forbidden?: string
  /** 조회 실패 문구(`PERFORMANCE_NOT_FOUND`·`COMMON_NOT_FOUND` 등) */
  error?: string
  onRetry?: () => void
  /**
   * 지갑 SDK가 서명을 받을 준비가 됐는가(`useWalletReady`). `false`면 동의 버튼을 잠그고
   * 준비 중 문구를 보인다 — 로그인 화면(C-01)과 같은 게이트다(D-73·D-77). 기본 준비됨.
   */
  walletReady?: boolean
  /**
   * 우리 팀 동의. prepare → 지갑 서명 → RLP 보고 → job 폴링까지 **전부 끝난 뒤** resolve한다.
   * 진행 단계는 `report`로 알린다 — 화면은 §5.14 문구만 그린다.
   *
   * 핸들러가 `undefined`를 돌려주면 **아무것도 단정하지 않는다** — 지갑 세션이 끊겨 로그인으로
   * 보내는 경우가 그렇다. 라우트가 바뀌는 찰나에 실패 배너를 띄우면 사용자는 방금 무엇이
   * 실패했는지로 읽는다.
   */
  onAgree?: (report: (stage: AgreeSignStage) => void) => Promise<AgreeResult | undefined>
  /** 판매 시작(rule_04). 202 폴링까지 끝난 뒤 resolve한다. **서명이 없다** */
  onStartSale?: () => Promise<StartSaleResult>
}

export function RuleAgreements({
  title,
  loading = false,
  data,
  forbidden,
  error,
  onRetry,
  walletReady = true,
  onAgree,
  onStartSale,
}: Props) {
  const { text } = useLocale()
  const [stage, setStage] = useState<AgreeSignStage>({ kind: 'idle' })
  /** §5.14 ④' 서명 거부 — 에러가 아니라 안내 한 줄이다 */
  const [rejected, setRejected] = useState(false)
  /**
   * 즉시 실패 뒤의 연타 잠금.
   *
   * `busy`는 서명이 진행 중일 때만 선다. 지갑이 시작도 못 하고 바로 실패하면 `stage`가 그
   * 자리에서 `idle`로 돌아와 버튼이 다시 살아난다 — 리허설 2에서 5초에 21번 눌려 prepare가
   * 그만큼 서버로 나갔다. 새 상태 기계를 두지 않고, 실패 직후 잠깐만 잠근다.
   */
  const [retryLocked, setRetryLocked] = useState(false)
  /**
   * 잠금 해제 타이머. 언마운트 때 지운다 — 남겨 두면 화면이 사라진 뒤 `setState`가 불리고,
   * 테스트에서는 환경이 내려간 뒤 `window`가 없어 unhandled error가 된다(Jenkins !172 frontend).
   */
  const retryTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current)
    },
    [],
  )
  const [agreeFailure, setAgreeFailure] = useState<string | undefined>(undefined)
  const [startingSale, setStartingSale] = useState(false)
  const [saleFailure, setSaleFailure] = useState<string | undefined>(undefined)
  /** 미동의 팀 강조 — `RULE_NOT_AGREED_BY_ALL`을 받았을 때만 켠다 */
  const [highlightPending, setHighlightPending] = useState(false)
  /** 판매 시작 확인 모달 */
  const [confirming, setConfirming] = useState(false)
  /**
   * 우리 팀 동의 확정 안내 모달(9/24). **이 화면에서 방금 확정된 경우에만** 연다 —
   * 이미 동의가 끝난 상태로 들어온 사람에게는 띄우지 않는다(서버 `AGREED`만으로는 열지 않는다).
   */
  const [agreeDoneOpen, setAgreeDoneOpen] = useState(false)

  /**
   * 실패·취소로 초기 상태로 돌아간다. 돌아간 직후 잠깐 잠근다 — 위 `retryLocked` 주석.
   * 성공(④ 완료)은 이 길로 오지 않는다.
   */
  const backToIdle = useCallback(() => {
    setStage({ kind: 'idle' })
    setRetryLocked(true)
    if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current)
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      setRetryLocked(false)
    }, RETRY_LOCK_MS)
  }, [])

  const runAgree = useCallback(() => {
    void (async () => {
      setAgreeFailure(undefined)
      setRejected(false)
      // ② 대기 — 지갑 팝업. 요약은 이 버튼 위에 이미 떠 있다(§5.14 ①)
      setStage({ kind: 'signing' })
      try {
        const result = await onAgree?.((next) => setStage(next))
        // 핸들러가 없으면(목·미연결) 아무것도 단정하지 않는다
        if (!result) {
          backToIdle()
          return
        }
        // ②' 선행 작업이 방금 확정됐다 — 실패가 아니고, 서명은 다음 클릭에서 한다(D-77)
        if (result.readyToSign) {
          setStage({ kind: 'ready-to-sign' })
          return
        }
        if (!result.ok) {
          /*
            ④' **거부만** 문구 없이 되돌린다 — 자기가 닫은 팝업이라 사유를 알고 있다(§1.2 원칙 6).

            ⚠ 예전에는 `COMMON_CONFLICT`도 같은 묶음이었다. 그쪽은 사용자가 한 일이 아니라
            "이미 진행 중"인 서버 상태이고, 문구 없이 초기 상태로 돌아가면 **안 눌린 것으로
            읽혀 다시 누르게 된다**(D-77 원인 C). 이제 `agreeFailureText`가 한 줄을 남긴다.

            `RULE_HASH_MISMATCH`·`PAYMENT_TX_MISMATCH`는 그대로 실패로 알린다 —
            전자는 새로고침, 후자는 처음부터 다시 시도가 다음 행동이고 문구가 그것을 담고 있다.
          */
          if (isSignatureRejectedCode(result.code)) {
            setRejected(true)
            // 거부는 **잠그지 않는다** — 사용자가 스스로 닫은 팝업이고, 다시 누르려고
            // 기다리게 할 이유가 없다
            setStage({ kind: 'idle' })
            return
          }
          setAgreeFailure(agreeFailureText(result.code, result.msg))
          backToIdle()
          return
        }
        // 낙관적 UI가 아니다 — 확정이 끝난 뒤에만 완료로 옮긴다. 배지는 상위가 재조회해 갱신한다
        setStage({ kind: 'done' })
        setAgreeDoneOpen(true)
      } catch {
        backToIdle()
      }
    })()
  }, [backToIdle, onAgree])

  const runStartSale = useCallback(() => {
    void (async () => {
      setSaleFailure(undefined)
      setHighlightPending(false)
      setStartingSale(true)
      try {
        const result = await onStartSale?.()
        if (!result) return
        if (!result.ok) {
          if (result.code === StudioCode.NOT_AGREED_BY_ALL) setHighlightPending(true)
          setSaleFailure(studioFailureText(result.code, result.msg))
        }
        // 성공(202 확정)해도 화면이 스스로 `ON_SALE`로 바꾸지 않는다 — 상위가 재조회한다
      } finally {
        setStartingSale(false)
      }
    })()
  }, [onStartSale])

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioSkeleton
          label={text('규칙 동의 현황을 불러오는 중', 'Loading agreements')}
          rows={1}
        />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioForbidden msg={forbidden} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioErrorPanel
          title={text('규칙 동의 현황을 불러오지 못했습니다', 'Could not load agreements')}
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
          action={
            // 규칙이 아직 없으면 rule_02가 404다(`COMMON_NOT_FOUND`) — 갈 곳은 P-05다
            <Link
              to="/studio"
              className="inline-flex min-h-11 items-center rounded-control border border-line px-5 font-sans text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
            >
              {text('대시보드로', 'Back to dashboard')}
            </Link>
          }
        />
      </div>
    )
  }

  /**
   * `done`도 진행 중으로 친다 — 확정 뒤 `nextAction`이 `SIGN`에서 내려오기까지(rule_02 재조회)
   * 버튼이 살아 있으면 같은 동의를 또 서명한다. P-03 보증금(`DepositStep`)과 같은 판정이다.
   */
  const busy = stage.kind !== 'idle' && stage.kind !== 'ready-to-sign'
  /** 선행 작업이 확정돼 서명만 남았다 — 버튼 문구를 "서명하기"로 바꿔 다시 누르게 한다(D-77) */
  const readyToSign = stage.kind === 'ready-to-sign'
  const myStatus = data.myAgreement?.status
  /**
   * 동의 버튼 활성 조건 — 서버가 정한 `nextAction`을 그대로 쓴다(rule_02).
   * `SIGN`이 아니면 지금 서명할 것이 없다: `WAIT`는 확정 대기, `NONE`은 이미 동의했거나 잠김이다.
   */
  const canAgree = data.myAgreement?.nextAction === 'SIGN' && !data.locked
  const blockedText = studioMessage(data.startSaleBlockedReason)
  /**
   * 우리 팀 동의가 끝났는가 — 서버 `AGREED` 또는 이 화면에서 방금 확정(`done`).
   * `done`을 함께 보는 이유: 확정 직후 rule_02 재조회가 돌아오기 전에도 순서 안내가 맞아야 한다.
   */
  const myAgreementDone = myStatus === 'AGREED' || stage.kind === 'done'
  /**
   * 보증금 안내 노출 — **우리 팀 동의가 끝나기 전에는 숨긴다**(9/24). "보증금 화면으로"와
   * "우리 팀 동의하기"가 한 화면에 같이 있으면 무엇을 먼저 할지 헷갈린다. 동의할 팀이 없는
   * 사람(`myAgreement` 없음)은 기다릴 동의가 없으니 그대로 보인다.
   */
  const showDepositNotice =
    data.depositStatus !== 'PAID' && !data.locked && (!data.myAgreement || myAgreementDone)
  /**
   * 공동 공연인데 수락한 팀이 최소 미만 — 보증금 prepare 가 `TEAM_MIN_COUNT_NOT_MET`으로 막는다.
   * `agreements[]`는 서버가 **수락을 마친 참여팀만** 담는다(`RuleService.ruleStatus` →
   * `acceptedParticipants`). 보증금 prepare 가 세는 목록과 같다(`jointTeamCountUnmet`).
   * `startSaleBlockedReason`은 쓸 수 없다 — 미납이면 이유가 늘 `PERFORMANCE_INVALID_STATUS`로
   * 먼저 온다(판정 순서 `잠금 → 해시 → 보증금 → 참여팀 수 …`).
   */
  const jointTeamsShort =
    data.jointPerformance === true && data.agreements.length < MIN_JOINT_PARTICIPANTS
  /** 모든 팀이 동의했는가 — 방금 확정한 우리 팀(`myAgreementDone`)은 AGREED로 센다 */
  const everyTeamAgreed =
    data.agreements.length > 0 &&
    data.agreements.every(
      (row) =>
        row.status === 'AGREED' ||
        (myAgreementDone && row.teamId === data.myAgreement?.teamId),
    )
  const depositAction: NextStepAction = {
    label: text('보증금 납부하러 가기', 'Go pay the deposit'),
    to: `/studio/performances/${data.performanceId}/edit`,
    state: { step: SETUP_STEP_DEPOSIT },
  }
  /**
   * 동의 확정 모달 내용 — 서버 값(`isOwner`·`depositStatus`·`startSaleAvailable`·`agreements[]`·
   * `jointPerformance`)으로만 가른다. 주최·미납은 셋으로 갈린다(9/26): 초대 수락 부족 /
   * 다른 팀 동의 대기(보증금은 미리 낼 수 있음) / 전원 동의.
   */
  const agreeDone: { body: string; primary?: NextStepAction } = !data.isOwner
    ? {
        body: text(
          '공연을 만든 팀이 보증금을 내고 판매를 시작합니다.',
          'The host team will pay the deposit and start ticket sales.',
        ),
      }
    : data.depositStatus === 'UNPAID'
      ? jointTeamsShort
        ? {
            body: text(
              '다른 팀이 초대를 수락해야 보증금을 낼 수 있어요.',
              'Another team needs to accept your invitation before you can pay the deposit.',
            ),
            primary: {
              label: text('참여팀 초대', 'Invite teams'),
              to: `/studio/performances/${data.performanceId}/participants`,
            },
          }
        : {
            body: everyTeamAgreed
              ? text(
                  '이제 보증금을 납부하면 판매를 시작할 수 있어요.',
                  'Pay the deposit next, and you can start ticket sales.',
                )
              : text(
                  '보증금은 지금 미리 낼 수 있어요. 다른 팀이 모두 동의하면 판매를 시작할 수 있어요.',
                  'You can pay the deposit now. Ticket sales can start once every other team agrees.',
                ),
            primary: depositAction,
          }
      : data.startSaleAvailable
        ? {
            body: text(
              '모든 팀이 동의했어요. 판매 시작을 눌러 예매를 여세요.',
              'Every team has agreed. Start ticket sales to open bookings.',
            ),
            primary: {
              label: text('판매 시작', 'Start ticket sales'),
              // 같은 화면의 판매 시작 확인 모달(§5.6)로 잇는다 — 비가역 확인을 건너뛰지 않는다
              onClick: () => {
                setAgreeDoneOpen(false)
                setConfirming(true)
              },
            },
          }
        : {
            body: text(
              '다른 팀 동의가 끝나면 판매를 시작할 수 있어요.',
              'Once the other teams agree, you can start ticket sales.',
            ),
          }

  /**
   * 우리 팀 동의 버튼 — PC 본문과 모바일 하단 고정이 같은 것을 쓴다.
   *
   * **지갑 준비 전에는 잠근다**(`walletReady`) — 그 창에 눌린 클릭이 계정 없는 지갑으로 나가
   * 조용히 실패했다(D-77 원인 A). 준비 문구는 아래 `role="status"` 한 줄이 함께 알린다.
   */
  const agreeButton = (full?: boolean) => (
    <Button
      full={full}
      disabled={!canAgree || busy || retryLocked || !walletReady}
      onClick={runAgree}
    >
      {readyToSign
        ? text('서명하기', 'Sign now')
        : myStatus === 'AGREED'
          ? text('동의 완료', 'Agreed')
          : text('우리 팀 동의하기', 'Agree for your team')}
    </Button>
  )

  return (
    <div
      className={[
        'flex w-full max-w-[1200px] flex-col gap-4 px-3 pt-3 md:gap-6 md:px-0 md:pt-0 md:pb-0',
        // 모바일 하단 고정 버튼이 본문 끝을 가리지 않게 여백을 둔다
        canAgree || busy ? 'pb-28' : 'pb-8',
      ].join(' ')}
    >
      {/* 헤더 — 공연명 + 공연 상태 배지. 모바일은 `StudioShell` 상단 바가 공연명을 갖는다 */}
      <StudioHeading title={title} section={['규칙 동의', 'Rule agreements']}>
        <StatusBadge status={SHOW_STATUS[data.performanceStatus]} />
      </StudioHeading>

      {data.myAgreement && myStatus && (
        <section
          aria-label={text('내 팀의 동의 상태', 'Your team agreement status')}
          className="rounded-card border border-primary/30 bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold text-ink">
              {text('내 팀', 'Your team')} #{data.myAgreement.teamId}
              {' · '}
              {data.agreements.find((row) => row.teamId === data.myAgreement?.teamId)?.teamName}
            </h2>
            <span
              role="status"
              className="rounded-chip bg-ground-2 px-3 py-1.5 text-sm font-semibold text-ink"
            >
              {stage.kind === 'signing'
                ? text('지갑 서명 대기', 'Waiting for wallet signature')
                : stage.kind === 'confirming'
                  ? text('체인 확정 대기', 'Awaiting chain confirmation')
                  : text(...AGREEMENT[myStatus].label)}
            </span>
          </div>
          <p className="mb-0 mt-2 text-sm leading-relaxed text-muted">
            {myStatus === 'AGREED'
              ? text(
                  '서버에서 현재 규칙에 대한 우리 팀의 동의를 확인했습니다. 다른 팀의 상태는 아래에서 확인할 수 있습니다.',
                  'The server has confirmed your team’s agreement to the current rules. Check the other teams below.',
                )
              : canAgree
                ? text(
                    '아래 정산 비율과 규칙을 검토한 뒤 우리 팀 동의하기를 눌러 주세요. 지갑 서명만으로 완료되지 않으며 체인 확정까지 기다려야 합니다.',
                    'Review the settlement shares and rules below, then select Agree for your team. A wallet signature is not completion; chain confirmation is required.',
                  )
                : text(
                    '아래에서 현재 상태와 다음 작업을 확인해 주세요. 확정되지 않은 동의를 완료로 표시하지 않습니다.',
                    'Check the current status and next action below. An unconfirmed agreement is not marked complete.',
                  )}
          </p>
        </section>
      )}

      <AgreementProgress agreements={data.agreements} />

      {/* 판매 시작 후 — 규칙이 잠겼다(RULE_ALREADY_LOCKED). 남은 것은 읽기뿐이다 */}
      {data.locked && (
        <StudioNotice
          tone="info"
          title={text(
            '판매가 시작돼 규칙과 참여팀이 잠겼습니다',
            'Ticket sales have started. Rules and teams are locked.',
          )}
        >
          {text(
            '이 화면은 지금부터 읽기 전용입니다. 판매 현황은 판매·선택 현황에서 볼 수 있습니다.',
            'This page is read-only. Open sales overview to check ticket sales.',
          )}
        </StudioNotice>
      )}

      {/*
        보증금 미납 — rule_04가 `PERFORMANCE_INVALID_STATUS`로 막는다. 갈 곳을 함께 준다.

        ⚠ 이건 **동의를 막는 안내가 아니다.** 동의(rule_03)는 보증금을 선행 조건으로 보지 않고
        (참여팀 리더 · ACCEPTED · PENDING_AGREEMENT · 지갑 LINKED 뿐), 준비 흐름에서 보증금은
        동의 **뒤**다(팀 결정 2026-09-21). 그래서 이 카드가 동의 버튼을 잠그지 않는다 —
        남은 마지막 단계가 무엇인지만 알린다.

        링크는 `state.step` 으로 **보증금 단계**를 실어 보낸다. 안 실으면 P-03 첫 단계가 열려
        동의를 마친 리더가 공연 정보부터 다시 훑게 된다(P-05 → P-03 과 같은 이유).

        우리 팀 동의가 끝나기 전에는 그리지 않는다(`showDepositNotice` · 9/24).
      */}
      {showDepositNotice && (
        <StudioNotice
          tone="warning"
          title={text(
            '보증금이 아직 납부되지 않아 판매를 시작할 수 없습니다',
            'Pay the deposit before starting ticket sales.',
          )}
          // 보증금 화면(P-03 편집)은 공연 생성 팀만 쓸 수 있다 — 참여팀에게 링크를 주면 막다른 길이다.
          action={
            data.isOwner ? (
            <Link
              to={`/studio/performances/${data.performanceId}/edit`}
              state={{ step: SETUP_STEP_DEPOSIT }}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
            >
              {text('보증금 화면으로', 'Go to deposit')}
            </Link>
            ) : undefined
          }
        >
          {data.isOwner
            ? text(
                '보증금은 준비의 마지막 단계입니다. 동의는 지금 바로 할 수 있습니다.',
                'The deposit is the last step. You can agree to the rules right now.',
              )
            : text(
                '공연을 만든 팀이 보증금을 내면 판매를 시작할 수 있어요.',
                'Ticket sales can start once the host team pays the deposit.',
              )}
        </StudioNotice>
      )}

      {/* PC 2열 — 좌 규칙 요약·해시 / 우 동의 현황. 두 버튼은 우측 목록 아래 본문에 둔다 */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
          <RuleSummary data={data} />
          <RulesHashPanel hash={data.rulesHash} copyKey="rules-hash" />
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 md:w-[440px] md:gap-5">
          <AgreementList data={data} highlightPending={highlightPending} />

          {/* ── 우리 팀 동의 ── */}
          {data.myAgreement && !data.locked && (
            <section
              aria-label={text('우리 팀 동의', 'Your team’s agreement')}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
            >
              {/* §5.14 ① 요약 — 서명할 것이 남아 있을 때만 그린다 */}
              {canAgree && <AgreeSummary hash={data.rulesHash} />}

              {myStatus === 'SIGNING' && (
                <p className="m-0 font-sans text-[13px] text-muted">
                  {text(
                    '보고한 트랜잭션을 확인하고 있습니다. 확정되면 동의 완료로 바뀝니다.',
                    'Your submitted transaction is being confirmed. Your agreement will update when it is final.',
                  )}
                </p>
              )}
              {myStatus === 'AGREED' && (
                <p className="m-0 font-sans text-[13px] font-semibold text-ink">
                  {text(
                    '우리 팀은 이 규칙에 동의했습니다.',
                    'Your team has agreed to these rules.',
                  )}
                </p>
              )}

              {/*
                지갑 준비 게이트(D-77 · §5.14 상태 항목). 로그인 화면과 **같은 문구**를 쓴다 —
                같은 기다림이라 사용자가 두 화면에서 같은 말을 들어야 한다
              */}
              {canAgree && !walletReady && (
                <p
                  role="status"
                  aria-live="polite"
                  className="m-0 font-sans text-[13px] font-semibold text-muted"
                >
                  {text('지갑을 준비하고 있어요…', 'Preparing your wallet…')}
                </p>
              )}

              {/* ②' 선행 작업 확정 — 서명은 새 클릭에서 한다(브라우저 팝업 정책, §5.14) */}
              {readyToSign && (
                <p
                  role="status"
                  aria-live="polite"
                  className="m-0 font-sans text-[13px] font-semibold text-ink"
                >
                  {text(
                    '공연 등록이 확정됐어요. 서명하기를 눌러 동의를 마쳐 주세요.',
                    'Your show is registered. Tap “Sign now” to finish agreeing.',
                  )}
                </p>
              )}

              {/* §5.14 ④' 거부 — 에러가 아니다. 명세 문구를 그대로 쓴다 */}
              {rejected && (
                <p className="m-0 font-sans text-[13px] font-semibold text-ink">
                  {text(
                    '동의를 취소했어요. 언제든 다시 동의할 수 있습니다',
                    'Signature cancelled. You can agree again at any time.',
                  )}
                </p>
              )}
              {agreeFailure && (
                <p role="alert" className="m-0 font-sans text-[13px] leading-relaxed text-danger">
                  {agreeFailure}
                </p>
              )}

              {/*
                PC 액션 자리(§5.19). **서명 진행 중에는 같은 자리가 진행 표시로 바뀐다** —
                버튼과 진행이 자리를 나눠 쓰면 시선이 옮겨진다
              */}
              <div className="hidden justify-end md:flex">
                {busy ? <AgreeProgress stage={stage} /> : agreeButton()}
              </div>
              {/* 모바일에서는 진행 표시가 하단 고정 자리로 간다 — 여기서는 버튼을 그리지 않는다 */}
            </section>
          )}

          {/* ── 판매 시작(생성자만) ── */}
          {data.isOwner && !data.locked && (
            <section
              aria-label={text('판매 시작', 'Start ticket sales')}
              className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
            >
              <h2 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
                {text('판매 시작', 'Start ticket sales')}
              </h2>
              <p className="m-0 font-sans text-[11px] leading-relaxed text-muted">
                {text(
                  '판매를 시작하면 규칙과 참여팀이 잠기고 예매가 열립니다. 서명은 필요하지 않습니다.',
                  'Starting sales locks the rules and participants and opens bookings. No signature is needed.',
                )}
              </p>

              {/* 비활성 이유를 문구로도 알린다 — 회색 버튼만 두면 왜 못 누르는지 알 수 없다 */}
              {!data.startSaleAvailable && blockedText && (
                <p className="m-0 font-sans text-[11px] font-semibold text-warning">
                  {blockedText}
                </p>
              )}
              {saleFailure && (
                <p role="alert" className="m-0 font-sans text-[13px] leading-relaxed text-danger">
                  {saleFailure}
                </p>
              )}

              <div className="flex justify-end">
                {startingSale ? (
                  <p
                    role="status"
                    className="m-0 flex items-center gap-2 font-sans text-[13px] font-semibold text-ink"
                  >
                    <Spinner size={18} />
                    {text('판매를 여는 중…', 'Opening sales…')}
                  </p>
                ) : (
                  <Button
                    disabled={!data.startSaleAvailable || startingSale}
                    onClick={() => setConfirming(true)}
                  >
                    {text('판매 시작', 'Start ticket sales')}
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/*
        모바일 하단 고정 — **"우리 팀 동의" 하나만**(§5.19가 이 화면을 예시로 들었다).
        진행 중에는 같은 자리가 진행 표시로 바뀐다.
      */}
      {(canAgree || busy) && (
        <FixedBottom>{busy ? <AgreeProgress stage={stage} /> : agreeButton(true)}</FixedBottom>
      )}

      {/* 판매 시작은 되돌릴 수 없다(one-way `locked=true`) → 어느 폭에서든 확인 모달(§5.6) */}
      <ConfirmDialog
        open={confirming}
        title={text('판매를 시작할까요?', 'Start ticket sales?')}
        body={text(
          '판매를 시작하면 규칙과 참여팀이 잠깁니다. 계속할까요?',
          'The rules and participating teams will be locked. Continue?',
        )}
        confirmLabel={text('판매 시작', 'Start ticket sales')}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={startingSale}
        onConfirm={() => {
          setConfirming(false)
          runStartSale()
        }}
        onClose={() => setConfirming(false)}
      />

      {/* 우리 팀 동의 확정 → 다음 할 일 안내(9/24). 주최·납부 여부로 문구와 주 버튼이 갈린다 */}
      <NextStepDialog
        open={agreeDoneOpen}
        title={text('우리 팀 동의를 마쳤어요', 'Your team has agreed')}
        body={agreeDone.body}
        primary={agreeDone.primary}
        onClose={() => setAgreeDoneOpen(false)}
      />
    </div>
  )
}
