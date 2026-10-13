/**
 * S-03 입장 현황 — **검표 담당자 경로**. 라우트 `/entry/:performanceId/entries`(+ 옛 `/scan/:token/entries`).
 *
 * 조립만 한다. 본문은 `features/entry/EntryStatus`이고 공연자 경로(`StudioEntriesPage`)가
 * **같은 컴포넌트·같은 엔드포인트**를 쓴다. 차이는 껍데기와 인증 경로다 —
 *   · 여기는 검표 링크 토큰으로 들어온 **로그인하지 않은 STAFF**다. `StudioShell`로 감싸지 않고
 *     (사이드 메뉴·`AppHeader`에 로그인 진입이 달려 있다) `scanTo`를 넘겨 스캔 복귀 버튼을 켠다(1417행).
 *   · 공연자 경로는 로그인한 참여팀 리더라 `StudioShell`로 감싸고 `scanTo`를 넘기지 않는다.
 * 토큰은 화면에 찍지 않는다 — API 인증 헤더로만 쓴다.
 *
 * ── API (S15P21B204-101) ───────────────────────────────────────────────
 *   현황   : `GET /api/v1/performances/{performanceId}/entries` (API-entry-02) — `useEntries`
 *            인증 `X-Entry-Token`(링크 토큰). 실패 건(중복·만료)도 함께 온다.
 *            요약값을 서버가 5초 캐시하므로 폴링 주기도 5초다(훅 기본값).
 *   공연명 : `GET /api/v1/performances/{id}` (API-performance-03) — `usePerformanceDetail`.
 *            ⚠ entry-02 응답에 공연명이 없다. 비로그인도 부를 수 있는 이 조회로 채운다.
 *
 * ⚠ **라우트가 명세와 어긋난다(고치지 않고 양쪽을 받는다).** 서버가 발급하는 링크는
 *   `{base}/entry/{performanceId}?token=…`이다(`ScanPage` 머리말 ⚠ 참조). 옛 `/scan/:token/entries`
 *   에는 `performanceId`가 없어 entry-02 경로를 만들 수 없다 — 그때는 링크 무효 안내를 띄운다.
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { EntryStatus } from '@/features/entry/EntryStatus'
import { EntryCode } from '@/features/entry/entryErrors'
import { isApiError } from '@/shared/api/client'
import type { EntryAuth } from '@/shared/api/domains/entry'
import { useEntries } from '@/shared/queries/entry'
import { usePerformanceDetail } from '@/shared/queries/performance'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function ScanEntriesPage() {
  const params = useParams()
  const [search] = useSearchParams()

  const entryToken = params.token ?? search.get('token') ?? undefined
  const performanceId = toPerformanceId(params.performanceId)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const auth = useMemo<EntryAuth>(() => (entryToken ? { entryToken } : {}), [entryToken])

  const entries = useEntries({ performanceId }, auth, { enabled })
  const detail = usePerformanceDetail(id, { enabled })

  const error = isApiError(entries.error) ? entries.error : undefined

  /*
   * 공연을 알 수 없는 링크(옛 `/scan/:token/entries`)는 재시도로 낫지 않는다.
   * 링크 무효와 스태프가 할 행동이 같으므로(담당자에게 링크를 다시 받는다) 같은 안내를 쓴다.
   * ⚠ 서버가 준 코드가 아니라 이 화면이 고른 표시용 코드다 — 응답 분기에는 쓰지 않는다.
   */
  const errorCode = enabled ? error?.code : EntryCode.UNAUTHORIZED

  return (
    <EntryStatus
      // ⚠ 공연명은 entry-02에 없다. 상세가 아직·끝내 안 오면 화면 이름으로 둔다(지어내지 않는다)
      title={detail.data?.title ?? '입장 현황'}
      data={entries.data}
      // 두 조회 중 하나라도 첫 응답 전이면 스켈레톤이다(하나만 보면 멀쩡한 조회가 오류로 보인다)
      loading={enabled && (entries.isPending || detail.isPending)}
      errorCode={errorCode}
      errorMsg={enabled ? error?.msg : undefined}
      // 검표 링크 진입 표식 — 이 prop이 있으면 자체 헤더 + 스캔 복귀 버튼이 켜진다
      scanTo={`/entry/${id}${entryToken ? `?token=${encodeURIComponent(entryToken)}` : ''}`}
      onRefresh={() => void entries.refetch()}
      onRetry={() => void entries.refetch()}
    />
  )
}

export default ScanEntriesPage
