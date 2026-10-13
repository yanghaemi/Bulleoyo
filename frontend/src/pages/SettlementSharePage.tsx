/**
 * V-03 정산 공유(공개) 페이지 — 라우트 `/settlement/share/:token`.
 *
 * 이 파일은 **조립만** 한다. 본문은 `features/settlement/SettlementShareView`에 있고
 * 여기서는 조회 훅 하나를 붙여 넘긴다.
 *
 * ── API (S15P21B204-102) ───────────────────────────────────────────────
 *   조회: `GET /api/v1/public/settlement/{shareToken}` (API-settlement-07) — `usePublicSettlement`
 *   인증: **없다**(`security: []` · `x-role: [GUEST]`). 도메인 함수가 `public: true`로 부르므로
 *         Authorization 을 붙이지 않고 401 재발급·강제 로그아웃 경로도 타지 않는다
 *         (`shared/api/domains/settlement`의 `fetchPublicSettlement` 주석). 여기서 더 할 일이 없다.
 *   에러: `COMMON_NOT_FOUND`(404) 하나 — "존재하지 않거나 무효화된 토큰". 재발급으로 무효가 된
 *         이전 토큰도 여기로 온다. 분기는 `code`로만 한다(응답 규격 §1).
 *
 * ⚠ 화면 ID `V-03`은 제안값이다(화면설계 v6 1544행, 신현경·이강륜 확인 전) `(확인 필요)`.
 *
 * ⚠ 라우트 파라미터 이름이 두 문서에서 다르다 — 화면설계 v6 1546행은 `:shareToken`,
 *   `app/router.tsx`에 잡힌 경로는 `:token`이다. 라우터를 고치지 않고 **둘 다 읽는다**.
 *   어느 쪽으로 확정할지는 라우트를 붙이는 쪽에서 정한다(산출 문서의 명세 불일치 목록).
 */

import { useParams } from 'react-router'

import { SettlementShareView } from '@/features/settlement/SettlementShareView'
import type { PublicSettlementError } from '@/features/settlement/publicShare'
import { isApiError } from '@/shared/api/client'
import { usePublicSettlement } from '@/shared/queries/settlement'

export function SettlementSharePage() {
  // 라우터는 `:token`, 화면설계는 `:shareToken` — 둘 다 읽는다(위 ⚠ 참고)
  const params = useParams<{ token?: string; shareToken?: string }>()
  const shareToken = params.shareToken ?? params.token

  const share = usePublicSettlement(shareToken)

  /*
   * 토큰이 없는 주소(`/settlement/share/`)로는 조회 자체가 걸리지 않는다. 그 링크로 볼 수 있는
   * 정산이 실제로 없으므로 404와 같은 안내로 받는다 — 로딩에 매달아 두지 않는다.
   */
  const apiError = isApiError(share.error) ? share.error : undefined
  const error: PublicSettlementError | undefined = !shareToken
    ? { code: 'COMMON_NOT_FOUND' }
    : apiError
      ? { code: apiError.code, msg: apiError.msg }
      : undefined

  return (
    <div className="min-h-dvh bg-ground">
      <SettlementShareView
        data={share.data}
        loading={Boolean(shareToken) && share.isPending}
        error={error}
      />
    </div>
  )
}

export default SettlementSharePage
