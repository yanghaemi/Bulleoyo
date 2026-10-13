/**
 * A-13 내 지갑 페이지 — 라우트 `/wallet`. 모바일 하단 탭 3번째.
 *
 * ── API ────────────────────────────────────────────────────────────────────
 *   잔액 : `GET /api/v1/wallets/me` (API-wallet-01) — 화면의 잔액 패널 전체가 이 응답이다.
 *          환산은 응답 `balance.display`를 **그대로** 쓴다(§5.4 — 클라이언트가 재계산하지 않는다)
 *   이력 : `GET /api/v1/wallets/me/transactions` (API-wallet-02) — **`type` 필터를 보내지 않고**
 *          한 페이지(100건)를 받아 화면이 거른다. A-13의 `Deposit` 필터는 `DEPOSIT`과
 *          `DEPOSIT_RETURN` 둘을 함께 보라는데 쿼리 `type`은 단일 값이라, 두 번 호출하면
 *          페이지네이션이 두 벌이 된다. 그래서 `WalletScreen`의 클라이언트 필터를 쓴다
 *   시간대·리더 여부는 `GET /api/v1/members/me`에서 온다(묶음 머리글과 행 시각이 같은 시간대여야
 *   한다 — `WalletScreen`의 `timeZone` 주석 참고).
 *
 *   에러 : 404 `WALLET_NOT_FOUND` → C-05 `/onboarding/wallet`으로 보낸다(명세 지시 그대로) ·
 *          403 `COMMON_FORBIDDEN`(지갑 정지)·502 `COMMON_EXTERNAL_SERVICE_ERROR`(노드 조회 실패,
 *          캐시도 없음) → 금액 자리만 `—`와 "다시 시도"로 두고 이력은 그대로 보여준다(§5.10).
 *          **실측(2026-09-13 로컬): 컨트랙트 미배포 상태에서 이 API가 502를 준다.**
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { formatApprox } from '@/features/member/localeOptions'
import { isTeamLeader } from '@/features/member/memberView'
import { WalletScreen } from '@/features/wallet/WalletScreen'
import { toWalletTx } from '@/features/wallet/walletView'
import { useMyMember } from '@/shared/queries/member'
import {
  isWalletNotFound,
  myWalletQuery,
  myWalletTransactionsQuery,
  normalizeWalletTxQuery,
} from '@/shared/queries/wallet'
import type { WalletTransactionView } from '@/shared/queries/wallet'
import { formatKst, toastApiError } from '@/shared/ui'

/** 미확정 행이 남아 있는 동안의 갱신 주기. 확정되면 멈춘다(§0.3 — PENDING·SUBMITTED일 때만) */
const PENDING_REFRESH_MS = 5000

/** 클라이언트 필터를 쓰므로 한 페이지에 몰아 받는다(size 상한 100 — §0.2) */
const TX_QUERY = normalizeWalletTxQuery({ size: 100 })

function hasPending(items: WalletTransactionView[] | undefined): boolean {
  return Boolean(items?.some((t) => t.status === 'PENDING' || t.status === 'SUBMITTED'))
}

function toastKey(error: unknown): string {
  if (error instanceof Error) return `${error.name}:${error.message}`
  return String(error)
}

export function WalletPage() {
  const navigate = useNavigate()
  const me = useMyMember()
  const lastTransactionError = useRef<string | null>(null)

  // 쿼리 정의(키·요청)는 `shared/queries/wallet`이 정본이고, 폴링 주기만 이 화면이 얹는다 —
  // 미확정 행이 있는 동안 잔액·이력이 함께 따라 돈다
  const transactions = useQuery({
    ...myWalletTransactionsQuery(TX_QUERY),
    refetchInterval: (query) => (hasPending(query.state.data?.items) ? PENDING_REFRESH_MS : false),
  })

  const wallet = useQuery({
    ...myWalletQuery(),
    refetchInterval: hasPending(transactions.data?.items) ? PENDING_REFRESH_MS : false,
  })

  // 지갑이 없는 회원은 A-13에 머물 이유가 없다 — 등록 온보딩으로 보낸다(API-wallet-01 지시)
  const missing = isWalletNotFound(wallet.error) || isWalletNotFound(transactions.error)
  useEffect(() => {
    if (missing) navigate('/onboarding/wallet', { replace: true })
  }, [missing, navigate])

  useEffect(() => {
    const error = transactions.error
    if (!error || isWalletNotFound(error)) {
      lastTransactionError.current = null
      return
    }
    const key = toastKey(error)
    if (lastTransactionError.current === key) return
    lastTransactionError.current = key
    toastApiError(error)
  }, [transactions.error])

  const timeZone = me.data?.timezone || 'Asia/Seoul'
  const balance = wallet.data?.balance
  const rows = (transactions.data?.items ?? []).flatMap((item) => {
    const row = toWalletTx(item, transactions.data?.rate, timeZone)
    return row ? [row] : []
  })

  return (
    <WalletScreen
      balanceKrw={balance?.amount}
      balanceStale={wallet.data?.stale || (wallet.error != null && balance?.amount != null)}
      approxLabel={
        balance?.display
          ? formatApprox(balance.display.currency, balance.display.approx)
          : undefined
      }
      updatedAtLabel={wallet.data?.cachedAt ? formatKst(wallet.data.cachedAt, timeZone) : undefined}
      transactions={rows}
      isTeamLeader={isTeamLeader(me.data)}
      timeZone={timeZone}
      onRetryBalance={() => void wallet.refetch()}
    />
  )
}

export default WalletPage
