/**
 * 주소를 찾지 못했을 때(라우터 `*`).
 *
 * 화면설계 v6에 절이 없는 화면이다 — 32개 화면 목록의 어디에도 속하지 않는다.
 * 골격 단계에는 개발용 플레이스홀더가 그대로 서 있어서, 주소를 잘못 친 사용자가
 * "프로젝트 골격 플레이스홀더"라는 개발 문구를 봤다. 그것만 걷어낸다.
 *
 * ── 무엇을 두지 않았나 ───────────────────────────────────────────
 * · **검색·추천·인기 공연 같은 것을 두지 않는다.** 여기 온 사람은 길을 잃은 것이지
 *   둘러보러 온 것이 아니다. 고를 것을 늘리면 원래 가려던 곳에서 더 멀어진다.
 * · **어떤 주소를 시도했는지 화면에 찍지 않는다.** 주소에는 토큰이 들어오는 경로가 여럿
 *   있고(`/scan/:token`·`/settlement/share/:token`), 만료·오타로 여기 떨어질 수 있다.
 *   그 값을 화면에 그리면 어깨너머로 읽히고 스크린샷에 남는다.
 * · 로그인 상태를 묻지 않는다 — 비로그인 공개 화면(V-02·V-03)에서도 이 화면으로 떨어진다.
 *   `AppHeader`를 쓰지 않는 이유도 같다. 그 헤더는 로그인·마이 진입을 달고 있다.
 *
 * ── 무엇을 두었나 ────────────────────────────────────────────────
 * 홈으로 가는 길 하나와 **뒤로 가기** 하나. 뒤로 가기는 오타로 한 번 잘못 눌린 경우에
 * 가장 짧은 복구 경로다. 방문 기록이 없으면(주소를 직접 붙여 넣고 들어온 경우) 홈으로 보낸다.
 */

import { Link, useNavigate } from 'react-router'

import { useLocale } from '@/shared/i18n/useLocale'
import { BrandMark, Button } from '@/shared/ui'

export function NotFoundPage() {
  const navigate = useNavigate()
  const { text } = useLocale()

  return (
    <main className="mx-auto flex min-h-dvh max-w-[600px] flex-col items-center justify-center px-6 py-12 text-center">
      <section className="w-full rounded-[24px] border border-line bg-surface px-6 py-10 shadow-[0_24px_80px_#00000038] md:px-12 md:py-12">
        <BrandMark size={48} />

        <div className="mt-7">
          <p className="m-0 mb-2 font-num text-[11px] font-semibold tracking-[0.18em] text-primary">
            ERROR 404
          </p>
          <h1 className="m-0 font-sans text-2xl font-bold tracking-[-0.035em] text-ink md:text-3xl">
            {text('찾는 페이지가 없어요', 'Page not found')}
          </h1>
          <p className="mx-auto mt-4 max-w-[390px] font-sans text-[13px] leading-7 text-muted">
            {text(
              '주소가 바뀌었거나 링크가 만료됐을 수 있어요. 공연 링크라면 보내 준 사람에게 다시 받아 주세요.',
              'The address may have changed or the link may have expired. Ask the sender for a new performance link.',
            )}
          </p>
        </div>

        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-sans text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {text('홈으로', 'Go home')}
          </Link>
          {/* 방문 기록이 없으면 뒤로 가기가 이 사이트 밖으로 나간다. 그때는 홈으로 보낸다 */}
          <Button
            variant="secondary"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            {text('이전 화면으로', 'Go back')}
          </Button>
        </div>
      </section>
    </main>
  )
}
