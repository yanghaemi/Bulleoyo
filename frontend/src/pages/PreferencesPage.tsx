/**
 * C-04 언어·통화 설정 페이지 — 라우트 `/me/preferences`.
 *
 * ── API ────────────────────────────────────────────────────────────────────
 *   현재 값 : `GET /api/v1/members/me` (API-member-05) → `locale`·`displayCurrency`·`timezone`
 *             · **[v8]** `preferredGenres`(선호 장르 0~3개)
 *   저장    : `PATCH /api/v1/members/me` (API-member-06) — 바뀐 값만 보낸다.
 *             응답 `displaySupported === false`는 **오류가 아니다**(등록된 환율이 없다는 뜻)
 *   에러    : 400 `COMMON_VALIDATION_FAILED` · 401 `COMMON_UNAUTHORIZED` → C-01
 *
 * 저장 성공 시 i18n 언어를 즉시 바꾸고 `me` 캐시를 무효화한다 — 재로그인 없이 전 화면의
 * 문구·금액 표기가 따라오게 하는 것이 C-04 요구사항이다. `Accept-Language`도 i18n 언어를
 * 따라가므로(`app/providers`의 LanguageBridge) 이후 응답의 `msg`·`display`가 새 설정을 쓴다.
 *
 * 환율 목록(`GET /api/v1/coin/rates`, coin_02)은 미리보기와 지원 통화 선택에만 사용한다.
 * 조회 실패는 미등록과 구분하고 환율 쿼리만 재시도한다.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { PreferencesScreen } from '@/features/member/PreferencesScreen'
import type { PreferenceValues } from '@/features/member/PreferencesScreen'
import { isSessionExpired } from '@/features/member/memberErrors'
import { isApiError } from '@/shared/api/client'
import type { MemberMeView } from '@/shared/api/domains/member'
import { useMyMember, useUpdateMyMember } from '@/shared/queries/member'
import { useExchangeRates } from '@/shared/queries/coin'
import { setAppLanguage, normalizeLanguage, type SupportedLanguage } from '@/shared/i18n'
import { toast } from '@/shared/ui'

function toValues(me: MemberMeView): PreferenceValues {
  return {
    locale: (me.locale === 'ko' ? 'ko' : 'en') as SupportedLanguage,
    displayCurrency: me.displayCurrency || 'USD',
    timezone: me.timezone || 'UTC',
    preferredGenres: me.preferredGenres,
  }
}

const INITIAL: PreferenceValues = {
  locale: 'en',
  displayCurrency: 'USD',
  timezone: 'UTC',
  preferredGenres: [],
}

export function PreferencesPage() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const me = useMyMember()
  const rates = useExchangeRates()
  const [values, setValues] = useState<PreferenceValues>(INITIAL)
  const [touched, setTouched] = useState(false)
  const [dirty, setDirty] = useState<Partial<PreferenceValues>>({})

  useEffect(() => {
    if (me.data && !touched) setValues(toValues(me.data))
  }, [me.data, touched])

  // 표시 설정이 바뀌면 훅이 **전 도메인 캐시**를 무효화한다 — 남아 있던 금액이 옛 통화로 그려지지
  // 않게 하는 것이 C-04 요구사항이다(§0.5·§0.6). 화면은 언어 전환과 이동만 맡는다
  const save = useUpdateMyMember()

  const submit = () =>
    save.mutate(dirty, {
      onSuccess: (result) => {
        // 언어는 저장된 값을 따른다(서버가 화이트리스트로 정규화한 뒤 돌려준 값)
        if (result.locale && result.locale !== i18n.language)
          setAppLanguage(normalizeLanguage(result.locale))
        toast({
          title:
            normalizeLanguage(result.locale ?? i18n.language) === 'ko'
              ? '설정을 저장했어요'
              : 'Saved',
          tone: 'success',
        })
        // 진입 경로가 C-03이라 그리로 보낸다
        navigate('/me')
      },
      onError: (error) => {
        if (isApiError(error) && isSessionExpired(error.code)) navigate('/login', { replace: true })
      },
    })

  return (
    <PreferencesScreen
      rates={rates.isError ? undefined : rates.data?.rates}
      ratesLoading={rates.isPending}
      ratesFailed={rates.isError}
      usageNotice={rates.data?.usageNotice}
      values={values}
      onChange={(patch) => {
        setTouched(true)
        setValues((v) => ({ ...v, ...patch }))
        setDirty((current) => ({ ...current, ...patch }))
      }}
      saving={save.isPending}
      saveDisabled={me.isPending || me.isError || Object.keys(dirty).length === 0}
      // 실패 응답의 code만 넘긴다. msg로 분기하지 않는다(규격 §1)
      errorCode={isApiError(save.error) ? save.error.code : undefined}
      errorMsg={isApiError(save.error) ? save.error.msg : undefined}
      onSave={submit}
      onRetryRates={() => void rates.refetch()}
    />
  )
}

export default PreferencesPage
