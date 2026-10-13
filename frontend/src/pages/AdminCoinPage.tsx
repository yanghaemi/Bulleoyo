/**
 * M-03 표시 환율·코인 지급 페이지 — 라우트 `/admin/coin`.
 *
 * 조립만 한다. 껍데기(`AdminShell`)와 본문(`CoinOperations`)은 `features/admin`에 있고,
 * 여기서는 **훅만** 쓴다 — `api`를 직접 부르지 않는다.
 *
 * ── API (S15P21B204-103) ───────────────────────────────────────────────
 *   발행량: `GET /api/v1/coin/supply` (API-coin-01) — `useCoinSupply`
 *   환율:   `GET /api/v1/coin/rates` (API-coin-02) — `useExchangeRates`
 *           `PUT /api/v1/admin/coin/rates` (API-coin-03) — `useRegisterExchangeRates`
 *   지급:   `PUT /api/v1/admin/coin/grants` (API-coin-07) — `useGrantCoin` → **202 + jobId**
 *   폴링:   `GET /api/v1/chain/jobs/{jobId}` (API-chain-01) — `useChainJob`
 *   이력:   `GET /api/v1/admin/coin/grants` (API-coin-08) — `useCoinGrants`
 *
 * ── 202는 성공이 아니다 ────────────────────────────────────────────────
 * 지급은 **접수**까지만 돌아온다. 확정은 `useChainJob`이 판단하고, `CONFIRMED`가 된 뒤에야
 * 이력·발행량이 갱신된다(무효화 대상은 `invalidatedBy('MINT')` = 지갑·`coin.supply`·`coin.grants*`).
 * 화면이 202에서 "지급 완료"라고 적으면 실패한 tx도 완료로 보인다.
 *
 * ── `Idempotency-Key`(§0.8) ────────────────────────────────────────────
 * 키는 `CoinGrantForm`이 만들어 보관하고 **요청 내용이 같으면 같은 키를 다시 넘긴다**(그 자리가
 * "직전 요청과 같은 내용인가"를 아는 유일한 곳이다). 이 페이지는 받은 키를 그대로 훅에 넘길 뿐
 * 새로 만들지 않는다 — 재시도에서 키가 바뀌면 같은 회원에게 두 번 발행된다.
 *
 * ⚠ **회원 검색 API가 명세에 없다.** 화면설계 M-03은 `GET /api/v1/admin/members`라고 적었지만
 *   API v6·openapi.yaml에 그 경로가 없다. 만들지 않았고, 지급 대상은 지갑 주소 직접 입력으로
 *   줄였다(`CoinGrantForm` 머리말에 복구 조건을 적어 두었다).
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useMemo, useState } from 'react'

import { AdminShell } from '@/features/admin/AdminShell'
import { CoinOperations } from '@/features/admin/CoinOperations'
import { isAddressLike } from '@/features/admin/adminForms'
import type { GrantFormValues } from '@/features/admin/adminForms'
import { AdminCode, toAdminError } from '@/features/admin/adminMessages'
import type {
  AdminResult,
  ChainJobAccepted,
  CoinGrantHistoryItem,
  CoinGrantListParams,
  CoinGrantRequest,
  ExchangeRateRegisterItem,
  ExchangeRateRegisterResult,
  GrantHistoryFilter,
} from '@/features/admin/adminTypes'
import { isApiError } from '@/shared/api/client'
import { useChainJob } from '@/shared/queries/chain'
import {
  useCoinGrants,
  useCoinSupply,
  useExchangeRates,
  useGrantCoin,
  useRegisterExchangeRates,
} from '@/shared/queries/coin'

const EMPTY_FILTER: GrantHistoryFilter = { target: '', from: '', to: '' }

/**
 * 화면 필터 → `coin_08` 쿼리.
 *
 * ⚠ 대상은 **회원 ID(숫자)나 지갑 주소일 때만** 서버가 거른다 — 표시명 검색 파라미터가 없다.
 *   그 외 문자열은 조건에서 빼고, 걸리지 않았다는 사실을 이력 패널이 문구로 알린다.
 *   여기서 클라이언트 필터를 흉내 내면 서버가 준 `summary`(전체 합계)와 표가 어긋난다.
 */
function toGrantParams(filter: GrantHistoryFilter): CoinGrantListParams {
  const target = filter.target.trim()
  return {
    memberId: /^\d+$/.test(target) ? Number(target) : undefined,
    address: isAddressLike(target) ? target : undefined,
    // `format: date`라 `<input type="date">` 값(YYYY-MM-DD)이 그대로 맞는다
    from: filter.from || undefined,
    to: filter.to || undefined,
  }
}

export function AdminCoinPage() {
  const supply = useCoinSupply()
  const rates = useExchangeRates()
  const registerRates = useRegisterExchangeRates()
  const grant = useGrantCoin()

  const [filter, setFilter] = useState<GrantHistoryFilter>(EMPTY_FILTER)
  const grants = useCoinGrants(useMemo(() => toGrantParams(filter), [filter]))

  /** 접수한 지급 작업. `null`이면 폴링을 걸지 않는다 */
  const [jobId, setJobId] = useState<string | null>(null)
  const chainJob = useChainJob(jobId)

  /** 실패한 이력 행을 지급 폼에 채우기 위한 값. 누를 때마다 새 객체라 폼이 다시 채운다 */
  const [prefill, setPrefill] = useState<GrantFormValues | null>(null)

  /** 중단 배너 확인 처리 — 감사 로그 API가 v6에 없어 이 화면 안에서만 산다(불일치 목록) */
  const [acknowledged, setAcknowledged] = useState(false)

  /** coin_07 → 202. 확정이 아니다 — 폼은 `chainJob`이 종단 상태를 말할 때까지 "처리 중"이다 */
  const onGrant = async (
    body: CoinGrantRequest,
    idempotencyKey: string,
  ): Promise<AdminResult<ChainJobAccepted>> => {
    try {
      return { ok: true, data: await grant.mutateAsync({ body, idempotencyKey }) }
    } catch (error) {
      if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
      return { ok: false, code: AdminCode.INTERNAL_ERROR }
    }
  }

  const onRegister = async (
    list: ExchangeRateRegisterItem[],
  ): Promise<AdminResult<ExchangeRateRegisterResult>> => {
    try {
      return { ok: true, data: await registerRates.mutateAsync({ rates: list }) }
    } catch (error) {
      if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
      return { ok: false, code: AdminCode.INTERNAL_ERROR }
    }
  }

  /**
   * 실패 행 "지급 폼에 채우기" — **여기서 지급하지 않는다.**
   * 원 요청의 멱등키를 알 수 없어(응답의 `grantRef`는 해시다) 재요청은 새 키가 된다.
   * 조용히 보내면 앞선 요청이 사실은 확정돼 있었을 때 두 번 발행되므로, 관리자가 확인 모달을
   * 다시 지나게 한다. 대상은 주소를 우선한다 — 주소·memberId는 택일이다(둘 다 보내면 400).
   */
  const onRetryGrant = (item: CoinGrantHistoryItem) => {
    setPrefill({
      memberId: item.address ? null : (item.memberId ?? null),
      address: item.address ?? '',
      amount: String(item.amount),
      memo: item.memo,
    })
  }

  return (
    <AdminShell title="코인 운영">
      <CoinOperations
        supply={{
          loading: supply.isPending,
          error: toAdminError(supply.error),
          data: supply.data ?? null,
          refreshing: supply.isFetching && !supply.isPending,
          onRefresh: () => void supply.refetch(),
        }}
        halt={{ acknowledged, onAcknowledge: () => setAcknowledged(true) }}
        grantForm={{
          onGrant,
          onAccepted: setJobId,
          job: chainJob.job ?? null,
          timedOut: chainJob.timedOut,
          prefill,
        }}
        grantHistory={{
          loading: grants.isPending,
          error: toAdminError(grants.error),
          history: grants.data ?? null,
          filter,
          onFilterChange: setFilter,
          onRetry: () => void grants.refetch(),
          onRetryGrant,
        }}
        rateForm={{ current: rates.data ?? null, onRegister }}
        rateHistory={{
          loading: rates.isPending,
          error: toAdminError(rates.error),
          data: rates.data ?? null,
          onRetry: () => void rates.refetch(),
        }}
      />
    </AdminShell>
  )
}

export default AdminCoinPage
