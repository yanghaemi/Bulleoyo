/**
 * 공연 단위 진입 가드 — `/studio/performances/:id/*`(P-03~P-08 · S-03 공연자 경로).
 *
 * 로그인만 통과하면 주소창에 남의 공연 id를 넣어 스튜디오 화면이 그려졌다. 데이터가 새는 것은
 * 아니다 — 서버가 `isInsider`·`requireParticipant`로 전부 403을 낸다(`PerformanceService`·
 * `SettlementService`). 새지 않을 뿐 **남의 공연 관리 화면이 열려 있는 것처럼 보였다.**
 * 이 가드는 그 화면을 아예 열지 않는다.
 *
 * ── 판정 근거 ────────────────────────────────────────────────────
 * `GET /performances/me`(performance_06)는 **내가 리더인 팀이 걸린 공연만** 돌려준다.
 * 목록에 이 공연이 있으면 참여자다. 초대만 받은 팀(`INVITED`)도 이 목록에 있어 수락 화면
 * (P-04)에 들어갈 수 있다. 스튜디오 화면들이 이미 같은 쿼리를 쓰므로 캐시를 공유한다 —
 * 가드가 요청을 하나 더 만들지 않는다.
 *
 * ── 관리자 ───────────────────────────────────────────────────────
 * M-02 이의제기 큐가 P-08로 링크한다(`DisputeQueue`). 관리자는 그 공연의 참여자가 아니라
 * 목록으로 판정하면 막힌다. 관리자 여부는 access token의 `adm` 클레임에만 있어
 * (`JwtTokenProvider.CLAIM_ADMIN`, `RequireAuth` 머리말) 그것을 읽는다. **서명을 검증하지
 * 않는다** — 토큰을 위조해 이 가드를 넘겨도 서버가 같은 자리에서 403을 낸다. 경계는 서버고
 * 여기는 화면을 고르는 일만 한다.
 *
 * ── 막지 않는 경우 ───────────────────────────────────────────────
 * 목록 조회가 실패하면 통과시킨다. 네트워크가 한 번 흔들렸다고 자기 공연에서 쫓겨나는 것이
 * 남의 공연 화면이 잠깐 열리는 것보다 나쁘다 — 어차피 그 화면의 API도 같이 실패한다.
 */

import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { tokenStore } from '@/shared/api/client'
import { useLocale } from '@/shared/i18n/useLocale'
import { useMyPerformanceList } from '@/shared/queries/performance'
import { BrandLoader, BrandMark, Button } from '@/shared/ui'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 판정하지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** access token의 `adm` 클레임. 서명은 보지 않는다 — 위 머리말 참고 */
function isAdminToken(): boolean {
  const payload = tokenStore.getAccessToken()?.split('.')[1]
  if (!payload) return false
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { adm?: unknown }).adm === true
  } catch {
    return false
  }
}

/** §0.2 상한. 주최 공연이 쌓여도 행을 찾아야 한다(P-04가 같은 값을 쓰는 이유) */
const PAGE_SIZE = 100

function Denied() {
  const { text } = useLocale()
  return (
    <main className="mx-auto flex min-h-dvh max-w-[600px] flex-col items-center justify-center px-6 py-12 text-center">
      <section className="w-full rounded-[24px] border border-line bg-surface px-6 py-10 shadow-[0_24px_80px_#00000038] md:px-12 md:py-12">
        <BrandMark size={48} />
        <div className="mt-7">
          <h1 className="m-0 font-sans text-2xl font-bold tracking-[-0.035em] text-ink md:text-3xl">
            {text('이 공연의 참여자가 아니에요', 'You are not on this show')}
          </h1>
          <p className="mx-auto mt-4 max-w-[390px] font-sans text-[13px] leading-7 text-muted">
            {text(
              '공연 관리 화면은 주최팀과 참여팀만 볼 수 있어요. 초대를 받았다면 스튜디오에서 수락한 뒤 다시 들어와 주세요.',
              'Show management is for the host and participating teams. If you were invited, accept it in your studio and come back.',
            )}
          </p>
        </div>
        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          <Link
            to="/studio"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-sans text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {text('내 스튜디오로', 'My studio')}
          </Link>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {text('이전 화면으로', 'Go back')}
          </Button>
        </div>
      </section>
    </main>
  )
}

export function RequirePerformanceAccess({ children }: { children: ReactNode }) {
  const { text } = useLocale()
  const performanceId = toPerformanceId(useParams().id)
  const admin = isAdminToken()
  // 관리자는 목록으로 판정하지 않는다 — 요청도 만들지 않는다
  const enabled = performanceId !== undefined && !admin
  const mine = useMyPerformanceList({ size: PAGE_SIZE }, { enabled })

  if (!enabled) return <>{children}</>
  const checking = <BrandLoader label={text('참여 여부를 확인하고 있어요', 'Checking your access')} />

  if (mine.isPending) return checking
  if (mine.isError) return <>{children}</>

  const items = mine.data?.items ?? []
  if (items.some((item) => item.performanceId === performanceId)) return <>{children}</>

  // 여기부터는 "목록에 없다"는 뜻이다. 그것만으로 거부하기 전에 두 가지를 더 본다.

  /**
   * 갱신 중인 목록으로 거부를 확정하지 않는다.
   *
   * 공연을 만들면 {@code useCreatePerformance}가 `qk.performance.all`을 무효화한 직후
   * P-05로 이동한다. 같은 세션에서 이 쿼리를 이미 한 번 썦다면 캐시가 남아 있어
   * `isPending`은 false고 `data`는 **방금 만든 공연이 없는 옵 목록**이다. 그대로 판정하면
   * 자기 공연에서 거부 화면이 한 번 깜빡인다.
   *
   * 통과 쪽은 먼저 끝내고 여기서만 기다린다 — 이미 통과한 사람은 백그라운드 재조회에
   * 화면을 빼앗기지 않는다.
   */
  if (mine.isFetching) return checking

  /**
   * 한 장만 본다 — 뒤가 더 있으면 "없다"고 말할 수 없다.
   *
   * 리더인 팀이 걸린 공연이 {@link PAGE_SIZE}를 넘어가면 다음 장에 있는 자기 공연이
   * 여기에는 안 보인다. 장을 더 받으러 가는 대신 통과시킨다 — 이 가드는 화면을 고를 뿐이고
   * 진짜 판정은 서버가 403으로 한다. 모르면 서버에 넘긴다.
   */
  if (mine.data?.pageInfo?.hasNext) return <>{children}</>

  return <Denied />
}
