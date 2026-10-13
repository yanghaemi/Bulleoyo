/**
 * C-02 회원가입(보조) 페이지 — 라우트 `/signup`.
 *
 * 소셜 최초 로그인 + 지갑 등록(C-05) 직후 **1회만** 뜬다. 이후 변경은 C-04다.
 *
 * ── API ────────────────────────────────────────────────────────────────────
 *   현재 값 : `GET /api/v1/members/me` (API-member-05) — `countryCode`·`locale`·
 *             `displayCurrency`·`timezone`을 폼 초기값으로. 지갑 요약의 `balance`가
 *             환영 문구의 금액이다
 *   저장    : `PATCH /api/v1/members/me` (API-member-06) — **바뀐 필드만** 보낸다.
 *             **[v8]** `preferredGenres`는 0개(빈 배열)도 유효한 값이라 항상 함께 보낸다 —
 *             "고르지 않음"을 서버에 전하는 방법이 빈 배열뿐이다(전체 교체 의미)
 *   에러    : 400 `COMMON_VALIDATION_FAILED`(화면 문구) · 401 `COMMON_UNAUTHORIZED` → C-01
 *
 * **환영 문구의 잔액은 `members/me`의 지갑 요약에서 읽는다**(화면설계 표는 `GET /wallets/me`).
 * 둘의 차이는 API-member-05가 Redis 캐시만 읽고 노드를 조회하지 않는다는 것인데(§0.12),
 * 지갑 등록 직후에는 지급이 아직 확정 전이라 어느 쪽도 금액을 보장하지 않는다. 값이 없으면
 * 문구를 렌더하지 않는 것이 C-02 규칙("신규 회원에게만")이라 한 번 더 호출할 이유가 없다.
 * 지급 지연·실패 안내는 C-05가 맡는다 — 이 화면은 결과만 읽는다.
 */

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { SignupScreen } from '@/features/member/SignupScreen'
import type { SignupValues } from '@/features/member/SignupScreen'
import { readLoginContinuationState } from '@/features/member/loginNavigation'
import { browserTimezone } from '@/features/member/localeOptions'
import { isSessionExpired } from '@/features/member/memberErrors'
import { isApiError } from '@/shared/api/client'
import type { MemberMeView } from '@/shared/api/domains/member'
import { useMyMember, useUpdateMyMember } from '@/shared/queries/member'
import type { SupportedLanguage } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { toast } from '@/shared/ui'

/**
 * 초기값. **기본 언어 en · 기본 표시 통화 USD 고정**(§5.11 `[팀 9/2]`)이고,
 * 시간대만 브라우저 추정값에서 출발한다. 국가는 비워 둔다 — 필수이고 자기 선언이다.
 */
const INITIAL: SignupValues = {
  countryCode: '',
  locale: 'en',
  displayCurrency: 'USD',
  timezone: browserTimezone(),
  // [v8] 아무것도 고르지 않은 상태가 기본이다. 건너뛰면 이 빈 배열이 그대로 실려 간다
  preferredGenres: [],
}

function toValues(me: MemberMeView): SignupValues {
  return {
    countryCode: me.countryCode ?? '',
    locale: (me.locale === 'ko' ? 'ko' : 'en') as SupportedLanguage,
    displayCurrency: me.displayCurrency || 'USD',
    timezone: me.timezone || browserTimezone(),
    preferredGenres: me.preferredGenres,
  }
}

export function SignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { text } = useLocale()
  const continuation = readLoginContinuationState(location.state)
  const me = useMyMember()
  const [values, setValues] = useState<SignupValues>(INITIAL)
  /** 사용자가 한 글자라도 고쳤으면 서버 값으로 덮어쓰지 않는다 */
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (me.data && !touched) setValues(toValues(me.data))
  }, [me.data, touched])

  // C-01이 라우터 state로 넘긴 값. 새로고침하면 사라지고 그때는 환영 문구가 빠진다 —
  // 축하 문구가 한 번 덜 뜨는 쪽이, 재방문자에게 "가입 축하"가 뜨는 쪽보다 낫다
  const isNewMember = continuation.isNewMember

  // 뮤테이션 훅이 `me` 캐시 무효화까지 한다(표시 설정이 바뀌면 전체). 화면은 이동만 맡는다
  const save = useUpdateMyMember()

  const submit = () =>
    save.mutate(values, {
      onSuccess: () => {
        toast({ title: text('저장했어요', 'Saved'), tone: 'success' })
        // C-01 → C-05를 거쳐 실려 온 복귀 경로. 온보딩의 마지막 화면이라 여기서 복원한다
        navigate(continuation.from, { replace: true })
      },
      onError: (error) => {
        if (isApiError(error) && isSessionExpired(error.code)) navigate('/login', { replace: true })
      },
    })

  const errorCode = isApiError(save.error) ? save.error.code : undefined

  return (
    <SignupScreen
      values={values}
      onChange={(patch) => {
        setTouched(true)
        setValues((v) => ({ ...v, ...patch }))
      }}
      welcomeBalanceKrw={isNewMember ? me.data?.wallet?.balance?.amount : undefined}
      saving={save.isPending}
      errorCode={errorCode}
      errorMsg={isApiError(save.error) ? save.error.msg : undefined}
      onSubmit={submit}
      onBack={() => navigate(-1)}
    />
  )
}

export default SignupPage
