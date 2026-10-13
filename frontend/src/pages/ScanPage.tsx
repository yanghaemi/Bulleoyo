/**
 * S-02 검표 — QR 스캔 페이지. 라우트 `/entry/:performanceId`(+ 옛 `/scan/:token`).
 *
 * 이 파일은 **조립만** 한다. 화면 본문은 `features/entry/ScanScreen`이고 여기서 조회·판정 호출을 건다.
 *
 * 진입 경로 — 공연 생성자에게 공유받은 검표 페이지 링크(P-04). **로그인하지 않은 STAFF**가 연다.
 * 그래서 이 페이지는 `AppHeader`·`BottomNav`·`StudioShell` 중 어느 것도 쓰지 않는다(§5.18).
 * 토큰은 **화면에 찍지 않는다**(1393행) — API 인증 헤더로만 쓴다.
 *
 * ── API (S15P21B204-101) ───────────────────────────────────────────────
 *   판정   : `POST /api/v1/entries/verify` (API-entry-01) — `useVerifyEntry(auth)`
 *            본문 `{ performanceId, qrToken, scannedAt }`. 실패는 **던지지 않고 판정으로** 돌려준다.
 *   입장 수 : `GET /api/v1/performances/{id}/entries` (API-entry-02) — `useEntries`의 `summary`.
 *            헤더의 "입장 완료/총 티켓 수"가 이 값이다. 서버가 5초 캐시하므로 폴링도 5초다.
 *   공연명·일시·장소 : `GET /api/v1/performances/{id}` (API-performance-03) — `usePerformanceDetail`.
 *            비로그인도 부를 수 있는 유일한 공연 정보다(`security: [{}, bearerAuth]`).
 *
 * ── 인증이 두 갈래다 ───────────────────────────────────────────────────
 *   링크 토큰이 있으면 `X-Entry-Token`, 없으면 로그인 회원의 `Authorization`으로 나간다
 *   (`shared/api/domains/entry`가 가른다). 여기서는 `auth`만 만들어 넘긴다.
 *
 * ⚠ **라우트가 명세와 어긋난다(고치지 않고 양쪽을 받는다).**
 *   화면설계 v6(74·184·1426행)는 `/scan/:token`이라 적었지만, 서버가 실제로 발급하는 링크는
 *   performance-10 `entryUrl` = `{base}/entry/{performanceId}?token=…`이다
 *   (`AppProperties.entryUrl` + `PerformanceService`). P-04는 서버가 준 URL을 그대로 공유하므로
 *   **스태프가 여는 주소는 `/entry/{id}?token=…`뿐이다.** `/scan/:token`만 받으면 모든 검표 링크가
 *   404가 된다. 그래서 라우터에 `/entry/:performanceId`를 더했고 옛 경로도 남겨 뒀다.
 *   옛 경로에는 `performanceId`가 없어 entry-01 본문을 만들 수 없다 — 그 경우 카메라를 열지 않고
 *   "검표 정보를 불러오지 못했습니다" 안내만 남긴다(값을 지어내지 않는다).
 *
 * ⚠ **입장 허용 시간대는 STAFF가 받을 수 없다.** 그 값은 performance-10에만 있고 `bearerAuth`가
 *   필수다. `ScanContext.entryWindow`를 비워 두면 화면이 그 줄을 지운다(`entryTypes` 참조).
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { ScanScreen } from '@/features/entry/ScanScreen'
import type { ScanContext, ScanOutcome } from '@/features/entry/entryTypes'
import { isApiError } from '@/shared/api/client'
import type { EntryAuth } from '@/shared/api/domains/entry'
import { CommonCode } from '@/shared/api/errorCodes'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { useEntries, useVerifyEntry } from '@/shared/queries/entry'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회도 판정도 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function ScanPage() {
  const params = useParams()
  const [search] = useSearchParams()

  /** 검표 링크 토큰. 서버가 준 링크는 `?token=`이고, 옛 라우트는 경로 인자였다 */
  const entryToken = params.token ?? search.get('token') ?? undefined
  const performanceId = toPerformanceId(params.performanceId)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  // 토큰이 없으면 빈 객체 — 그때는 로그인 회원의 Authorization으로 나간다
  const auth = useMemo<EntryAuth>(() => (entryToken ? { entryToken } : {}), [entryToken])

  const detail = usePerformanceDetail(id, { enabled })
  // 헤더 숫자만 필요하다. 이력은 S-03이 보여주므로 한 건만 받는다(size 최소값)
  const entries = useEntries({ performanceId, size: 1 }, auth, { enabled })
  const { mutateAsync: verify } = useVerifyEntry(auth)

  /**
   * 한 번의 판정. **실패를 던지지 않는다** — 화면이 `code`로 갈라 그리는 판정 결과다.
   * `ENTRY_QR_EXPIRED`·`ENTRY_QR_SIGNATURE_INVALID`는 401이지만 세션 만료가 아니라서
   * 클라이언트가 가로채지 않고(`isPassthroughUnauthorized`) 여기까지 그대로 온다.
   */
  const handleScan = useCallback(
    async (qrToken: string): Promise<ScanOutcome> => {
      if (performanceId === undefined) {
        return { result: 'FAILED', code: CommonCode.VALIDATION_FAILED }
      }
      try {
        const entry = await verify({
          performanceId,
          qrToken,
          // 로그용이다. 판정 기준은 서버 시각이다(entry-01)
          scannedAt: new Date().toISOString(),
        })
        return { result: 'SUCCESS', entry }
      } catch (error) {
        // qrToken은 서명 토큰이다 — 에러 경로에서도 로그에 남기지 않는다
        if (isApiError(error)) return { result: 'FAILED', code: error.code, msg: error.msg }
        // 네트워크 단절은 `code`가 없다. 코드를 지어내지 않고 "잠시 후 다시" 안내만 맞춘다
        return { result: 'FAILED', code: CommonCode.INTERNAL_ERROR }
      }
    },
    [performanceId, verify],
  )

  /**
   * 검표 컨텍스트. 한 API가 주지 않아 두 조회를 합친다.
   * 못 받은 값은 `undefined`로 둔다 — 0·빈 문자열로 채우면 스태프가 그 값을 믿는다.
   */
  const context: ScanContext | undefined = enabled
    ? {
        performanceId: id,
        performanceTitle: detail.data?.title,
        startAt: detail.data?.startAt,
        venue: detail.data?.venueName,
        enteredCount: entries.data?.summary?.enteredCount,
        totalIssuedCount: entries.data?.summary?.totalIssuedCount,
        // entryWindow — STAFF가 받을 수 있는 응답에 없다(머리말 ⚠). 넘기지 않는다
      }
    : undefined

  /**
   * 토큰·권한 실패는 entry-02가 알려준다(공연 상세는 비로그인도 200이라 링크 상태를 모른다).
   * `ENTRY_SCANNER_NOT_AUTHORIZED`·`COMMON_UNAUTHORIZED`면 화면이 카메라를 열지 않는다.
   * 그 밖의 코드(404·5xx)는 헤더 숫자만 못 채울 뿐 스캔은 계속할 수 있어야 한다.
   */
  const entriesError = isApiError(entries.error) ? entries.error : undefined

  return (
    <ScanScreen
      context={context}
      // 두 조회 중 하나라도 첫 응답 전이면 스켈레톤이다. 하나만 보면 멀쩡한 조회가 오류로 보인다
      loading={enabled && (detail.isPending || entries.isPending)}
      errorCode={entriesError?.code}
      errorMsg={entriesError?.msg}
      onScan={handleScan}
      // S-03으로. 같은 토큰을 유지한다 — 서버가 준 링크와 같은 모양이다
      entriesTo={`/entry/${id}/entries${entryToken ? `?token=${encodeURIComponent(entryToken)}` : ''}`}
    />
  )
}

export default ScanPage
