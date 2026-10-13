/** 라우트 모듈 로딩·라우더 실패가 React Router 기본 오류 화면으로 새지 않게 막는다. */
export function RouteErrorPage() {
  // 이 경계는 i18n Provider 자체의 로딩 실패도 처리해야 한다. React hook 대신 문서 언어만 읽는다.
  const isKorean =
    typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('ko')

  return (
    <main
      role="alert"
      className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-5 py-12 text-center"
    >
      <section className="border-y border-line py-10">
        <h1 className="m-0 font-display text-2xl font-bold tracking-[-0.035em] text-ink">
          {isKorean ? '문제가 생겼어요' : 'Something went wrong'}
        </h1>
        <p className="mx-auto mt-3 max-w-[340px] text-sm leading-7 text-muted">
          {isKorean
            ? '화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : 'We could not load this screen. Please try again in a moment.'}
        </p>
        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {isKorean ? '새로고침' : 'Reload'}
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-ground-2 px-5 text-sm font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {isKorean ? '홈으로' : 'Go home'}
          </a>
        </div>
      </section>
    </main>
  )
}

export default RouteErrorPage
