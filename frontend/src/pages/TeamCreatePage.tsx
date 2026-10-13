/**
 * P-02 팀 관리(생성 모드) 페이지 — 라우트 `/studio/teams/new`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`TeamCreate`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   지갑 확인 : `GET /api/v1/wallets/me` (API-wallet-01) — `useMyWallet`
 *               **404 `WALLET_NOT_FOUND`는 오류가 아니라 미등록이다**(`isWalletNotFound`).
 *               그때 `wallet`을 비워 넘기면 본문이 "지갑 먼저" 안내를 그린다.
 *   팀 생성   : `POST /api/v1/teams` (API-team-01) — `useCreateTeam`.
 *               **[v8]** `genre`(장르 코드 10종)가 **필수**다
 *               성공하면 응답 `teamId`로 관리 모드(`/studio/teams/{id}`)로 바꾼다
 *   에러      : 400 `COMMON_VALIDATION_FAILED` · 403 `COMMON_FORBIDDEN`(지갑 SUSPENDED)
 *               · 404 `WALLET_NOT_FOUND` · 409 `COMMON_CONFLICT`(이름 중복)
 *               분기는 `code`로만 한다(응답 규격 §1). 문구는 `studioFailureText`가 만든다.
 *
 * **낙관적 UI가 아니다.** 201이 온 뒤에만 화면을 옮긴다 — 실패하면 폼에 그대로 머물러야
 * 사용자가 방금 쓴 값을 잃지 않는다.
 *
 * 지갑 잔액이 없을 수 있다(노드 장애 → `balance: null`). 그때 금액 자리는 `—`가 되고
 * 화면 전체를 에러로 덮지 않는다(§5.10).
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { StudioShell } from '@/features/studio/StudioShell'
import { TeamCreate } from '@/features/studio/TeamCreate'
import { toLeaderWallet } from '@/features/studio/leaderWallet'
import { studioFailureText } from '@/features/studio/studioErrors'
import type { TeamFormValues } from '@/features/studio/teamForm'
import { isApiError } from '@/shared/api/client'
import { isWalletNotFound } from '@/shared/api/domains/wallet'
import { useLocale } from '@/shared/i18n/useLocale'
import { useCreateTeam } from '@/shared/queries/team'
import { useMyWallet } from '@/shared/queries/wallet'

export function TeamCreatePage() {
  const navigate = useNavigate()
  const { text } = useLocale()
  const wallet = useMyWallet()
  const create = useCreateTeam()

  // 404는 "아직 지갑이 없다"이지 오류가 아니다. 그 밖의 실패도 화면을 덮지 않고
  // 지갑 패널만 비운다 — 팀 이름을 쓰던 사람이 폼을 잃지 않게.
  const walletView = wallet.data && !isWalletNotFound(wallet.error) ? wallet.data : undefined

  const onSubmit = useCallback(
    (values: TeamFormValues) => {
      // [v8] `genre`는 team-01 필수다. 폼 검증이 빈 값을 막지만 타입으로도 닫는다 —
      // 빈 값이 실리면 서버가 400을 주고 사용자는 방금 쓴 값을 잃는다
      if (values.genre === '') return
      create.mutate(
        {
          teamName: values.teamName,
          genre: values.genre,
          introduction: values.introduction || undefined,
        },
        {
          onSuccess: (created) => {
            // 201 응답의 teamId 로 간다. 없으면(계약 위반) 목록으로 보내 길을 잃지 않게 한다.
            navigate(created.teamId ? `/studio/teams/${created.teamId}` : '/studio', {
              replace: true,
            })
          },
        },
      )
    },
    [create, navigate],
  )

  const failure = isApiError(create.error)
    ? studioFailureText(create.error.code, create.error.msg)
    : undefined

  return (
    /* 팀이 없는 회원이 오는 화면이라 `teams`를 넘기지 않는다 — 사이드 메뉴의 "팀"은 이 화면으로 온다 */
    <StudioShell title={text('팀 만들기', 'Create team')}>
      <TeamCreate
        loading={wallet.isPending}
        wallet={toLeaderWallet(walletView, formatApprox)}
        submitting={create.isPending}
        failure={failure}
        onSubmit={onSubmit}
      />
    </StudioShell>
  )
}

export default TeamCreatePage
