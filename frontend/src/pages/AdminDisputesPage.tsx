/**
 * M-02 이의제기 처리 페이지 — 라우트 `/admin/disputes`.
 *
 * 조립만 한다. 껍데기(`AdminShell`)와 본문(`DisputeQueue`)은 `features/admin`에 있고,
 * 여기서는 **훅만** 쓴다 — `api`를 직접 부르지 않는다.
 *
 * ── API (S15P21B204-103) ───────────────────────────────────────────────
 *   목록: `GET /api/v1/admin/disputes` (API-admin-09) — `useAdminDisputes`
 *         `{ summary: { openCount, releaseHeldCount }, items[], pageInfo }`.
 *         `summary.releaseHeldCount`는 **보류된 정산 수**다(이의 건수가 아니다).
 *   상세: `GET /api/v1/performances/{id}/settlement` (API-settlement-01) — `useSettlement`.
 *         선택한 행이 있을 때만 켠다.
 *         ⚠ **관리자 role이 명세에 없다**(`x-role: [PERFORMER]`). 403이면 목록은 그대로 두고
 *           **상세 패널만** 안내로 바꾼다 — 목록까지 죽이면 이의를 처리할 수 없다.
 *   처리: `PATCH /api/v1/admin/disputes/{disputeId}` (API-admin-06) — `useResolveDispute`.
 *         동기 200이며 온체인 tx가 없다. 목록 무효화는 훅이 한다.
 *
 * **낙관적 UI를 쓰지 않는다.** 눌린 즉시 목록을 옮기지 않고 응답이 온 뒤에 옮긴다 —
 * 409(이미 처리됨)는 서버만 알 수 있다.
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useEffect, useMemo, useState } from 'react'

import { AdminShell } from '@/features/admin/AdminShell'
import { DisputeQueue } from '@/features/admin/DisputeQueue'
import { AdminCode, toAdminError } from '@/features/admin/adminMessages'
import type {
  AdminResult,
  DisputeResolveRequest,
  DisputeResolveResult,
  DisputeStatus,
} from '@/features/admin/adminTypes'
import { isApiError } from '@/shared/api/client'
import { useAdminDisputes, useResolveDispute } from '@/shared/queries/admin'
import { useSettlement } from '@/shared/queries/settlement'

/** admin_09 `size` 기본값. §0.2 상한은 100이다 */
const PAGE_SIZE = 20

export function AdminDisputesPage() {
  const [status, setStatus] = useState<DisputeStatus>('OPEN')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const list = useAdminDisputes({ status, page, size: PAGE_SIZE })
  const resolve = useResolveDispute()

  const items = useMemo(() => list.data?.items ?? [], [list.data])
  const selected = items.find((d) => d.disputeId === selectedId) ?? null

  /**
   * 선택 건 공연의 정산. 고른 행이 없으면 `undefined`를 넘겨 **훅이 꺼져 있게** 한다
   * (`useSettlement`는 id > 0일 때만 enabled).
   */
  const detail = useSettlement(selected?.performanceId)

  // 필터·쪽을 바꿔 선택 건이 목록에서 빠지면 상세를 닫는다.
  // 본문 컴포넌트가 아니라 여기서 처리한다 — 선택 상태의 주인이 페이지이기 때문이다
  useEffect(() => {
    if (selectedId != null && !items.some((d) => d.disputeId === selectedId)) setSelectedId(null)
  }, [items, selectedId])

  /** 상태 탭·쪽을 바꾸면 선택을 놓고 첫 쪽으로 돌아간다 */
  const changeStatus = (next: DisputeStatus) => {
    setStatus(next)
    setPage(0)
    setSelectedId(null)
  }

  /**
   * admin_06. **응답이 온 뒤에만** 목록이 움직인다(무효화는 훅이 한다).
   *
   * 409 `COMMON_CONFLICT`는 다른 관리자가 먼저 처리한 경우다 — 안내 문구가 "목록을 다시
   * 불러왔습니다"라고 말하므로 실제로 다시 불러온다. 문구만 그렇게 적고 두면 거짓말이다.
   */
  const onResolve = async (
    disputeId: number,
    req: DisputeResolveRequest,
  ): Promise<AdminResult<DisputeResolveResult>> => {
    try {
      return { ok: true, data: await resolve.mutateAsync({ disputeId, body: req }) }
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === AdminCode.CONFLICT) void list.refetch()
        return { ok: false, code: error.code, msg: error.msg }
      }
      return { ok: false, code: AdminCode.INTERNAL_ERROR }
    }
  }

  return (
    <AdminShell title="이의제기 처리">
      <DisputeQueue
        loading={list.isPending}
        error={toAdminError(list.error)}
        summary={list.data?.summary ?? null}
        items={items}
        status={status}
        onStatusChange={changeStatus}
        pageInfo={list.data?.pageInfo ?? null}
        onPageChange={setPage}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detail={{
          // 선택 전에는 훅이 꺼져 있어 `isPending`이 true로 남는다 — 그때는 로딩이 아니다
          loading: selected != null && detail.isPending,
          error: selected != null ? toAdminError(detail.error) : null,
          data: detail.data ?? null,
        }}
        onResolve={onResolve}
        onRetry={() => void list.refetch()}
        onRetryDetail={() => void detail.refetch()}
      />
    </AdminShell>
  )
}

export default AdminDisputesPage
