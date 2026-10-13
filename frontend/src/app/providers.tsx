/**
 * 앱 프로바이더 조합.
 *
 * 의존 방향은 `app → pages → features → shared`다(기술 스택 v3 §3.2).
 * shared는 상위를 import하지 않으므로, 클라이언트가 화면을 이동시켜야 하는 두 지점
 * (강제 로그아웃 · 언어 결정)을 **여기서 주입**한다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { RouterProvider } from 'react-router'

import { ErrorBoundary } from '@/app/ErrorBoundary'
import { loginPathFrom } from '@/app/loginPath'
import { router } from '@/app/router'
import {
  isApiError,
  setLanguageResolver,
  setUnauthenticatedHandler,
  tokenStore,
} from '@/shared/api/client'
import { Web3AuthProvider } from '@/shared/blockchain/Web3AuthContext'
import i18n from '@/shared/i18n'
import { ToastHost } from '@/shared/ui'

/**
 * TanStack Query 기본값.
 *
 * 재시도 정책을 `code`로 판단한다 — 4xx 계열은 다시 보내도 같은 답이 오고,
 * 특히 인증·상태 충돌은 재시도가 해롭다. `chain_job` 폴링은 재시도가 아니라
 * `refetchInterval`로 하며, 각 화면이 `PENDING`·`SUBMITTED`일 때만 켠다(§0.3).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isApiError(error)) return false // 서버가 code로 답했으면 재시도하지 않는다
          return failureCount < 2 // 네트워크 오류만 짧게 재시도
        },
        // 관객 공연 목록처럼 서버도 30초 캐시하는 조회 기준값이다. 다른 사람의 행동을 기다리는
        // 스튜디오·정산·동의·지갑 조회는 쿼리 함수에서 `LIVE_STALE_MS`(5초)로 덮는다.
        staleTime: 30_000,
        // 다른 탭·프로필에서 한 일(상대 리더의 동의 등)을 창으로 돌아올 때 반영한다.
        // staleTime이 지난 쿼리만 다시 받으므로 30초 계열은 여전히 조용하다.
        refetchOnWindowFocus: true,
      },
      mutations: {
        // 멱등키가 필요한 6개 API를 자동 재시도하면 키 관리가 깨진다(§0.8).
        // 재시도는 화면이 사용자 확인을 받아 같은 멱등키로 다시 부른다.
        retry: false,
      },
    },
  })
}

/** i18n 언어가 바뀌면 API 클라이언트의 `Accept-Language`도 따라가게 묶는다(§0.6). */
function LanguageBridge({ children }: { children: ReactNode }) {
  const { i18n: instance } = useTranslation()

  useEffect(() => {
    setLanguageResolver(() => instance.language)
  }, [instance])

  return <>{children}</>
}

export function AppProviders() {
  const [queryClient] = useState(createQueryClient)

  useEffect(() => {
    // 강제 로그아웃 시 캐시를 비우고 로그인 화면으로 보낸다.
    // 복귀 경로 규칙은 진입 가드와 같은 `loginPathFrom`을 쓴다. 위조 토큰은 복귀시키지 않는다.
    setUnauthenticatedHandler((reason) => {
      tokenStore.clear()
      queryClient.clear()
      const target =
        reason === 'TOKEN_INVALID'
          ? '/login'
          : loginPathFrom(window.location.pathname + window.location.search + window.location.hash)
      void router.navigate(target)
    })
  }, [queryClient])

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <LanguageBridge>
          <Web3AuthProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
              <ToastHost />
            </QueryClientProvider>
          </Web3AuthProvider>
        </LanguageBridge>
      </I18nextProvider>
    </ErrorBoundary>
  )
}

export default AppProviders
