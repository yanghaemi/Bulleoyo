/**
 * 최상위 에러 경계.
 *
 * 렌더 중 던져진 예외만 잡는다. API 실패는 여기 오지 않는다 —
 * `ApiError`는 각 화면이 `code`로 분기해 처리하고, 여기까지 올라오면 버그다.
 *
 * 화면에 스택트레이스·응답 원문을 노출하지 않는다(SEC-09). 개발 모드에서만 콘솔에 남긴다.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

import { isDev } from '@/shared/config'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isDev) {
      // 운영에서는 남기지 않는다. 에러 리포터를 붙일 때도 개인키·senderSignedRlp가
      // 절대 실리지 않도록 페이로드를 화이트리스트로 거른다.
      console.error('[render error]', error, info.componentStack)
    }
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const isKorean =
      typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('ko')

    return (
      <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-5 py-12 text-center">
        <section className="border-y border-line py-10">
          <h1 className="m-0 font-display text-2xl font-bold tracking-[-0.035em] text-ink">
            {isKorean ? '문제가 생겼어요' : 'Something went wrong'}
          </h1>
          <p className="mx-auto mt-3 max-w-[340px] text-sm leading-7 text-muted">
            {isKorean
              ? '화면을 표시하지 못했습니다. 새로고침 후 진행 상태를 확인해 주세요.'
              : 'We could not display this screen. Please check your progress after reloading.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-8 min-h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {isKorean ? '새로고침' : 'Reload'}
          </button>
        </section>
      </main>
    )
  }
}

export default ErrorBoundary
