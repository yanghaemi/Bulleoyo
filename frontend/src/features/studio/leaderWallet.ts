/**
 * 리더 지갑(= 팀 지갑) 타입과 거래 이력 라벨 — P-02·P-03 공용.
 *
 * 정본 — 화면설계 v6 §5.1 `WalletTx.type`(6종) · `ChainJob.status`(4종) 행
 *        · API 명세 v6 wallet_02 `WalletTransactionItem`
 *
 * P-02 컴포넌트 표가 요구하는 열 순서가 그대로 여기 담긴다 —
 * 유형(지급·결제·환불·정산 수령·보증금·보증금 반환) · 금액 · 시각(KST) · tx 링크 · 상태.
 *
 * ⚠ A-13(관객 잔액 이력)에도 같은 6종 라벨이 있다(`features/wallet/WalletScreen.tsx`).
 * features끼리 import하지 않는 구조 규칙(기술 스택 §3.2) 때문에 표를 공유하지 않는다.
 * 값이 §5.1 한 곳에서 왔으므로 문구는 같다 — §5.1이 바뀌면 두 곳을 함께 고친다.
 * (공유하려면 `shared/ui`로 올려야 하는데, 관객·공연자의 노출 규칙이 달라 보류했다.)
 */

import type { MyPerformanceListItem } from '@/shared/api/domains/performance'
import type { WalletTransactionView, WalletView } from '@/shared/api/domains/wallet'

/** `WalletTransactionItem.type`(wallet_02) */
export type StudioWalletTxType =
  'GRANT' | 'PURCHASE' | 'REFUND' | 'RELEASE' | 'DEPOSIT' | 'DEPOSIT_RETURN'

/** `WalletTransactionItem.status`. §5.1 `ChainJob.status` 라벨을 쓴다 */
export type StudioWalletTxStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

/** §5.1 `WalletTx.type` 행 — en/ko 둘 다 정의돼 있다(관객 화면에도 쓰이는 표라) */
export const WALLET_TX_LABEL: Record<StudioWalletTxType, { en: string; ko: string }> = {
  GRANT: { en: 'Credit', ko: '지급' },
  PURCHASE: { en: 'Payment', ko: '결제' },
  REFUND: { en: 'Refund', ko: '환불' },
  RELEASE: { en: 'Payout', ko: '정산 수령' },
  DEPOSIT: { en: 'Deposit', ko: '보증금' },
  DEPOSIT_RETURN: { en: 'Deposit returned', ko: '보증금 반환' },
}

/**
 * §5.1 `ChainJob.status` 행 — `PENDING`과 `SUBMITTED`가 **같은 라벨**("처리 중")이다.
 * 명세가 그렇게 정했다. 사용자에게 두 단계를 구분해 말할 이유가 없기 때문이다.
 */
export const WALLET_TX_STATUS_LABEL: Record<StudioWalletTxStatus, string> = {
  PENDING: '처리 중',
  SUBMITTED: '처리 중',
  CONFIRMED: '처리 완료',
  FAILED: '처리 실패',
}

/**
 * 상태 배지 색. `FAILED`만 눈에 걸려야 하고 나머지는 중립이다.
 * 색은 보조이고 구분은 라벨이 갖는다(§1.2 · `StatusBadge`와 같은 규칙).
 */
export const WALLET_TX_STATUS_CLASS: Record<StudioWalletTxStatus, string> = {
  PENDING: 'border-warning text-warning',
  SUBMITTED: 'border-warning text-warning',
  CONFIRMED: 'border-line text-muted',
  FAILED: 'border-danger text-danger',
}

/**
 * 입출 방향 → 금액 부호 — §5.4 "들어온 값은 `+15,000 YoYo`, 나간 값은 `−15,000 YoYo`".
 *
 * 색이 아니라 **부호와 유형 라벨**로 구분한다. 서버가 `direction`을 주므로 금액의 양수·음수를
 * 클라이언트가 추론하지 않는다(`amount`는 언제나 양의 정수다). 문자열은 `formatYoyo(amount, sign)`이 만든다.
 *
 * 빼기 기호는 하이픈이 아니라 U+2212다 — §5.4 표기를 그대로 옮겼다.
 */
export function directionSign(direction: 'IN' | 'OUT'): '+' | '−' {
  return direction === 'IN' ? '+' : '−'
}

/* ── 타입: wallet_01 `WalletMe` · wallet_02 `WalletTransactionItem` ────── */

/**
 * 리더 지갑 — **리더 지갑이 곧 팀 지갑이다**(wallet_01 설명 · P-02 "이 지갑이 팀 지갑입니다").
 *
 * `WalletMe`에서 P-02·P-03이 쓰는 필드만 옮겼다. 값이 `undefined`인 곳은
 * 서버가 주지 않을 수 있는 자리이지, 화면이 만들어 낸 필드가 아니다.
 */
export interface StudioLeaderWallet {
  /** `WalletMe.provider` — §5.15 배지의 입력 */
  provider: 'WEB3AUTH' | 'EXTERNAL'
  address: string
  /** `SUSPENDED`면 결제·보증금·동의 액션을 비활성화한다(§5.15) */
  status: 'LINKED' | 'SUSPENDED'
  /** `balance.amount` — YoYo 정수. 조회 실패면 undefined → 패널이 `—`로 그린다(§5.10) */
  balanceAmount?: number
  /** `balance.display`를 서버 문구 그대로. 클라이언트가 환율을 재계산하지 않는다(§5.4) */
  approxLabel?: string
  /** `explorerUrl` — 탭하면 Kaia Kairos 익스플로러를 새 창으로 연다(§5.3) */
  explorerUrl?: string
  /** `cachedAt`(ISO). 표시는 `formatKst`가 만든다 */
  cachedAt?: string
  /** `stale` — 노드 장애로 마지막 캐시값을 준 경우 true */
  stale?: boolean
}

/** `WalletTransactionItem`(wallet_02)에서 P-02 거래 이력 표가 쓰는 필드만 */
export interface StudioWalletTx {
  walletTxId: string
  type: StudioWalletTxType
  direction: 'IN' | 'OUT'
  /** 양의 정수. 부호는 `direction`이 정한다(§5.4) */
  amount: number
  status: StudioWalletTxStatus
  /** 사람이 읽는 설명. 예 "합정 3밴드 합동공연 · 일반 2매" */
  title?: string
  txHash?: string | null
  explorerUrl?: string | null
  /** ISO. 표시는 `formatKst`(§5.13) */
  occurredAt: string
}

/* ─────────────────── 응답 → 화면 (P-02 생성·관리 공용) ─────────────────── */

/**
 * `WalletView`(wallet_01) → `StudioLeaderWallet`.
 *
 * `provider`·`status`·`address` 중 하나라도 없으면 **그리지 않는다**(`undefined`). 없는 값을
 * 기본값으로 지어내면 정지된 지갑이 정상으로 보일 수 있고, 그 화면에서 결제·보증금 액션이
 * 열린다(§5.15). "미등록"과 같게 다루는 편이 안전하다.
 *
 * 잔액은 없을 수 있다 — 노드 장애면 `balance: null` 이다. 그때 금액 자리는 `—` 가 되고
 * 패널 전체를 에러로 덮지 않는다(§5.10).
 */
export function toLeaderWallet(
  wallet: WalletView | undefined,
  formatApprox: (currency: string, approx: number) => string,
): StudioLeaderWallet | undefined {
  if (!wallet || !wallet.provider || !wallet.status || !wallet.address) return undefined
  const balance = wallet.balance
  return {
    provider: wallet.provider,
    address: wallet.address,
    status: wallet.status,
    balanceAmount: balance?.amount,
    // 환산은 서버가 준 `display`를 그대로 쓴다 — 클라이언트가 환율을 다시 계산하지 않는다(§5.4)
    approxLabel: balance?.display
      ? formatApprox(balance.display.currency, balance.display.approx)
      : undefined,
    explorerUrl: wallet.explorerUrl ?? undefined,
    cachedAt: wallet.cachedAt ?? undefined,
    stale: wallet.stale,
  }
}

/**
 * `WalletTransactionView`(wallet_02) → P-02 이력 행.
 *
 * 종류·방향·상태·시각이 없는 행은 그릴 수 없어 `null` 을 돌려준다(호출부가 건너뛴다).
 * 명세상 항상 오는 값이라 실제로는 걸리지 않지만, 없는 값을 지어내지 않는다 — A-13 의
 * `toWalletTx` 와 같은 규칙이다.
 */
export function toStudioWalletTx(item: WalletTransactionView): StudioWalletTx | null {
  if (!item.type || !item.direction || !item.status || !item.occurredAt) return null
  return {
    walletTxId: item.walletTxId,
    type: item.type,
    direction: item.direction,
    amount: item.amount,
    status: item.status,
    title: item.title ?? undefined,
    txHash: item.txHash,
    explorerUrl: item.explorerUrl,
    occurredAt: item.occurredAt,
  }
}

/* ─────────────────── §5.16 보증금 잔액 부족 안내 (P-02) ─────────────────── */

/**
 * "보증금 미납 공연이 있고 리더 지갑 잔액이 모자란가"를 판정한다.
 *
 * P-02 컴포넌트 표는 이 안내의 연결 API를 `GET /wallets/me` 하나로 적었지만 `WalletMe`에는
 * "보증금 미납 공연이 있는가"를 알 수단이 없다. performance_06의 `depositStatus === 'UNPAID'`이고
 * `host === true`인 행을 함께 봐야 성립한다 — 그래서 두 응답을 받아 여기서 가른다.
 *
 * 지어내지 않는 것 —
 *  · **잔액을 모르면(`undefined`) 안내하지 않는다.** 노드 장애로 못 읽은 것과 잔액 0원은 다르다(§5.10).
 *    0으로 치면 잔액이 넉넉한 리더에게 "50,000 YoYo가 모자랍니다"가 뜬다.
 *  · 식별자·상태가 없는 행은 건너뛴다.
 *  · 미납 공연이 여럿이면 **응답 순서의 첫 행**을 쓴다(목록 정렬이 곧 우선순위다).
 *
 * ⚠ `depositAmount`는 호출부가 준다. 읽기 전용 API 어디에도 보증금 **금액**이 없기 때문이다
 *   (performance_01 `deposit.amount` · performance_13 `depositAmount`뿐). 지금은 명세가 고정한
 *   50,000 YoYo를 쓴다 — performance_06 응답에 `depositAmount`를 더하는 개정이 제대로 된 해법이다.
 */
export function pickDepositShortfall(
  rows: readonly MyPerformanceListItem[],
  balanceAmount: number | undefined,
  depositAmount: number,
):
  | {
      depositAmount: number
      balanceAmount: number
      shortAmount: number
      performanceTitle?: string
      performanceId?: number
    }
  | undefined {
  if (balanceAmount == null) return undefined
  const shortAmount = depositAmount - balanceAmount
  if (shortAmount <= 0) return undefined

  const unpaid = rows.find(
    (row) => row.host && row.depositStatus === 'UNPAID' && row.performanceId != null,
  )
  if (!unpaid) return undefined

  return {
    depositAmount,
    balanceAmount,
    shortAmount,
    performanceTitle: unpaid.title,
    performanceId: unpaid.performanceId,
  }
}
