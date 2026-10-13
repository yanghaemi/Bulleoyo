/**
 * P-02 팀 관리 — **생성 모드**.
 *
 * 정본 — 화면설계 v6 §4 P-02(영역 구성·레이아웃·컴포넌트 표·상태·입력 검증·접근성)
 *        · §5.15 provider 배지 · §5.19 액션 버튼 배치 · §5.7 빈 상태
 *        · API 명세 v6 team_01(`POST /api/v1/teams`) · wallet_01(`GET /api/v1/wallets/me`)
 *
 * 본문 순서는 P-02 **영역 구성**의 생성 모드 그대로다 — 팀명·소개 폼 + 지갑 연결 확인.
 * 레이아웃도 그 절이 정한 대로 **PC 최대폭 960px 2열**(좌 폼 / 우 지갑 패널), 모바일 1열이고
 * 팀 만들기 버튼은 모바일에서만 하단 고정이다(§5.19 — PC는 폼 마지막 줄 오른쪽).
 *
 * **v6 변경 요지 ①: 정산 계좌 등록 폼·안내가 통째로 삭제됐다**(은행이 없는 세계).
 * 이 화면에는 계좌·은행·예금주 같은 필드가 하나도 없고, 서버도 팀 생성 시
 * **리더의 지갑 연결 여부만** 검사한다(team_01 설명).
 *
 * **지갑이 없으면 팀을 만들 수 없다.** 미등록이면 팀 만들기 버튼을 비활성으로 두고
 * C-05(`/onboarding/wallet`)로 가는 길을 함께 준다 — 막힌 버튼만 남기면 막다른 길이 된다
 * (P-01 `WalletMissingBanner`와 같은 판단).
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * TODO(API 연결)
 *   지갑 확인: wallet_01 `GET /api/v1/wallets/me` → `WalletMe`
 *             404 `WALLET_NOT_FOUND`는 **에러가 아니라 "미등록"** 이다 → C-05 안내로 그린다
 *   팀 생성:   team_01 `POST /api/v1/teams` `{ teamName, genre, introduction? }` → 201 `TeamCreateResponse`
 *             **[v8]** `genre`는 장르 코드 10종 enum · **필수**다(API v7 team-01)
 *             `{ teamId, teamName, leaderMemberId, walletAddress, walletProvider, explorerUrl, createdAt }`
 *             성공 후 `/studio/teams/{teamId}`(관리 모드)로 전환한다
 *   에러:      400 `COMMON_VALIDATION_FAILED`(이름 길이·형식) → 필드 오류
 *             403 `COMMON_FORBIDDEN`(지갑 SUSPENDED) · 404 `WALLET_NOT_FOUND`(= §8.2 `WALLET_NOT_LINKED`)
 *             409 `COMMON_CONFLICT`(같은 리더가 같은 이름의 팀 중복) · 401 `COMMON_UNAUTHORIZED`
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useState } from 'react'
import { Link } from 'react-router'

import { Button, FixedBottom, Input, ProviderBadge } from '@/shared/ui'
import { FormField } from '@/features/studio/FormField'
import { GenreSelect } from '@/features/studio/GenreSelect'
import { StudioNotice, StudioSkeleton } from '@/features/studio/StudioStates'
import { WalletAddressCopy } from '@/features/studio/WalletAddressCopy'
import type { StudioLeaderWallet } from '@/features/studio/leaderWallet'
import {
  TEAM_INTRO_MAX,
  TEAM_NAME_MAX,
  hasError,
  validateTeamForm,
} from '@/features/studio/teamForm'
import type { TeamFormErrors, TeamFormValues } from '@/features/studio/teamForm'
import { useClipboard } from '@/features/studio/useClipboard'
import { useLocale } from '@/shared/i18n/useLocale'

import './studio-refresh.css'

/* ── 지갑 등록 확인 패널 ───────────────────────────────────────────────── */

/**
 * P-02 컴포넌트 표 "지갑 등록 확인(생성 모드)".
 *   · 등록됨 → 제공자 배지(§5.15) + 축약 주소
 *   · 미등록 → "지갑 등록이 필요합니다"(명세 문구 그대로) + C-05 이동
 *
 * 잔액을 여기 보여주지 않는다 — 표시 데이터에 없고, 생성 시점에 서버가 보는 것도
 * 잔액이 아니라 **연결 여부**뿐이다(team_01 설명).
 */
function WalletCheckPanel({ wallet }: { wallet?: StudioLeaderWallet }) {
  const { text } = useLocale()
  const clipboard = useClipboard()

  if (!wallet) {
    return (
      <StudioNotice
        tone="warning"
        title={text('지갑 등록이 필요합니다', 'Connect your wallet')}
        action={
          <Link
            to="/onboarding/wallet"
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
          >
            {text('지갑 등록하기', 'Connect wallet')}
          </Link>
        }
      >
        {text(
          '팀 지갑은 리더 지갑입니다. 지갑을 먼저 등록해야 팀을 만들 수 있어요.',
          'Your wallet is also your team wallet. Connect it before creating your team.',
        )}
      </StudioNotice>
    )
  }

  return (
    <section
      aria-label={text('지갑 등록 확인', 'Wallet connection')}
      className="rounded-card border border-primary/20 bg-primary/5 p-6"
    >
      <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('리더 지갑', 'Leader wallet')}
      </h2>
      <ProviderBadge
        provider={wallet.provider}
        tone="performer"
        suspended={wallet.status === 'SUSPENDED'}
      />
      <div className="mt-2">
        <WalletAddressCopy
          address={wallet.address}
          copyKey="leader-wallet"
          clipboard={clipboard}
          label={text('리더 지갑 주소 복사', 'Copy leader wallet address')}
        />
      </div>
      <p className="m-0 mt-2 font-sans text-[11px] text-muted">
        {text(
          '이 지갑이 팀 지갑이 됩니다. 정산금도 여기로 들어옵니다.',
          'This is your team wallet. Your show payouts arrive here.',
        )}
      </p>
      {wallet.status === 'SUSPENDED' && (
        // §5.15 — SUSPENDED면 결제·보증금·동의 액션을 비활성화한다. 팀 생성도 403이다(team_01)
        <p className="m-0 mt-2 font-sans text-[11px] font-semibold text-danger">
          {text(
            '지갑이 이용 정지 상태라 팀을 만들 수 없습니다. 관리자에게 문의해 주세요.',
            'Your wallet is suspended. Contact an administrator before creating a team.',
          )}
        </p>
      )}
    </section>
  )
}

function teamInitials(name: string): string {
  const normalized = name.trim()
  if (!normalized) return '—'
  const words = normalized.split(/\s+/)
  if (words.length > 1)
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('')
  return normalized.slice(0, 2).toUpperCase()
}

function TeamPreview({ values }: { values: TeamFormValues }) {
  const { text } = useLocale()
  const name = values.teamName.trim()
  const introduction = values.introduction.trim()

  return (
    <section
      aria-label={text('팀 미리보기', 'Team preview')}
      className="studio-team-preview rounded-card border border-line bg-surface p-6"
    >
      <p className="studio-section-label m-0 text-xs font-semibold text-muted">
        {text('팀 미리보기', 'Team preview')}
      </p>
      <div className="mt-5 flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-sans text-lg font-semibold text-primary-bright">
          {teamInitials(name)}
        </span>
        <div className="min-w-0">
          <h2 className="m-0 break-words font-sans text-xl font-semibold tracking-tight text-ink">
            {name || text('팀 이름', 'Team name')}
          </h2>
          <p className="m-0 mt-1 break-words font-sans text-xs leading-relaxed text-muted">
            {introduction ||
              text('팀 소개', 'Team description')}
          </p>
        </div>
      </div>
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  loading?: boolean
  /** wallet_01 응답. `undefined`면 **지갑 미등록**(404 `WALLET_NOT_FOUND`)이다 */
  wallet?: StudioLeaderWallet
  /** 제출 진행 중 — 버튼을 잠그고 문구를 바꾼다 */
  submitting?: boolean
  /** 제출 실패 문구(`studioFailureText`가 만든 것). 필드 오류가 아니라 폼 전체 안내다 */
  failure?: string
  onSubmit: (values: TeamFormValues) => void
}

export function TeamCreate({
  loading = false,
  wallet,
  submitting = false,
  failure,
  onSubmit,
}: Props) {
  const { text } = useLocale()
  const [values, setValues] = useState<TeamFormValues>({
    teamName: '',
    introduction: '',
    // [v8] 장르는 생성 시 필수다. 기본값을 임의로 채우면 아무도 고르지 않은 장르가 저장된다
    genre: '',
  })
  /** 제출을 한 번 눌렀는가 — 그 전에는 빈 필드에 빨간 글씨를 띄우지 않는다 */
  const [touched, setTouched] = useState(false)

  // 생성은 장르 필수(team-01)
  const errors: TeamFormErrors = validateTeamForm(values, { genreRequired: true })
  const shown = touched ? errors : {}
  const walletReady = wallet != null && wallet.status === 'LINKED'
  const canSubmit = walletReady && !hasError(errors) && !submitting

  const submit = () => {
    setTouched(true)
    if (!walletReady || hasError(errors) || submitting) return
    onSubmit({
      teamName: values.teamName.trim(),
      introduction: values.introduction.trim(),
      genre: values.genre,
    })
  }

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioSkeleton
          label={text('팀 만들기 화면을 불러오는 중', 'Loading team setup')}
          rows={0}
        />
      </div>
    )
  }

  return (
    // 모바일 하단 고정 버튼 뒤로 마지막 줄이 숨지 않게 여백을 둔다. PC에는 하단 고정이 없다(§5.19)
    <div className="studio-form-page flex flex-col gap-4 px-3 pt-3 pb-24 md:gap-6 md:px-0 md:pt-0 md:pb-0">
      {/* PC 본문 제목. 모바일은 `StudioShell` 상단 바가 "팀 만들기"를 이미 달고 있다 */}
      <header className="studio-page-heading studio-page-heading--stacked border-b border-line pb-7">
        <h2 className="m-0 font-sans text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {text('팀 만들기', 'Create team')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {text(
            '공연 운영에 사용할 팀 정보를 입력해 주세요.',
            'Enter the team information used to manage shows.',
          )}
        </p>
      </header>

      {failure && (
        <StudioNotice
          tone="danger"
          title={text('팀을 만들지 못했습니다', 'Could not create the team')}
        >
          {failure}
        </StudioNotice>
      )}

      {/* PC 최대폭 960px 2열 — 좌 생성 폼 / 우 지갑 패널(P-02 레이아웃) */}
      <div className="studio-form-layout flex w-full max-w-[960px] flex-col gap-4 md:flex-row md:gap-6">
        <form
          className="studio-form-card flex min-w-0 flex-1 flex-col gap-7 rounded-card border border-line bg-surface p-5 md:p-8"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          noValidate
        >
          <FormField
            id="team-name"
            label={text('팀 이름', 'Team name')}
            required
            error={shown.teamName}
            // ⚠ 화면설계는 1~50자, API는 1~30자다. 좁은 쪽을 도움말에 적는다(teamForm.ts 참조)
            hint={text(
              `${values.teamName.length} / ${TEAM_NAME_MAX}자`,
              `${values.teamName.length} / ${TEAM_NAME_MAX} characters`,
            )}
          >
            {(a) => (
              <Input
                {...a}
                value={values.teamName}
                maxLength={TEAM_NAME_MAX}
                placeholder={text('예: 블루노트', 'e.g. Blue Note')}
                autoComplete="off"
                invalid={Boolean(shown.teamName)}
                onChange={(e) => setValues((v) => ({ ...v, teamName: e.target.value }))}
              />
            )}
          </FormField>

          <FormField
            id="team-intro"
            label={text('팀 소개', 'About your team')}
            error={shown.introduction}
            hint={text(
              `${values.introduction.length} / ${TEAM_INTRO_MAX}자`,
              `${values.introduction.length} / ${TEAM_INTRO_MAX} characters`,
            )}
          >
            {(a) => (
              // 소개는 여러 줄이라 `Input`(단일 행)을 쓰지 않는다. 규격(반경·테두리·포커스)은
              // `Input`과 같은 토큰을 그대로 쓴다 — 같은 폼 안에서 두 입력이 달라 보이면 안 된다
              <textarea
                {...a}
                value={values.introduction}
                maxLength={TEAM_INTRO_MAX}
                rows={4}
                placeholder={text(
                  '어떤 팀인지 한두 문장으로 적어 주세요.',
                  'Tell us a little about your team.',
                )}
                className={[
                  'w-full resize-y rounded-control border bg-ground px-3.5 py-2.5 font-sans text-sm text-ink',
                  'transition-colors duration-150 ease-out placeholder:text-faint',
                  shown.introduction
                    ? 'border-danger'
                    : 'border-line hover:border-muted focus:border-primary',
                ].join(' ')}
                onChange={(e) => setValues((v) => ({ ...v, introduction: e.target.value }))}
              />
            )}
          </FormField>

          {/* [v8] 장르(셀렉트, 필수) — C-02 좋아하는 장르 칩과 같은 10종이다 */}
          <GenreSelect
            id="team-genre"
            value={values.genre}
            onChange={(genre) => setValues((v) => ({ ...v, genre }))}
            error={shown.genre}
            required
          />

          {/*
            ⚠ 이 폼에 **정산 계좌 필드가 없다**는 것이 v6의 변경 요지다.
            은행 계좌·예금주·계좌번호 입력을 여기 되살리지 마라(P-02 변경 요지).
          */}

          {/* PC 액션 — 폼 마지막 줄 오른쪽(§5.19). 모바일에서는 하단 고정으로 내려간다 */}
          <div className="hidden justify-end md:flex">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? text('만드는 중…', 'Creating…') : text('팀 만들기', 'Create team')}
            </Button>
          </div>
        </form>

        <div className="studio-form-aside flex w-full shrink-0 flex-col gap-4 md:w-80">
          <TeamPreview values={values} />
          <WalletCheckPanel wallet={wallet} />
        </div>
      </div>

      {/* 모바일 하단 고정은 주 액션 **하나만**(§5.19) */}
      <FixedBottom>
        {wallet == null ? (
          // 막힌 버튼만 남기면 모바일에서는 화면의 유일한 액션이 막다른 길이 된다.
          // 대신 막힌 이유를 푸는 곳(C-05)으로 보낸다
          <Link
            to="/onboarding/wallet"
            className="flex min-h-11 w-full items-center justify-center rounded-control border border-line bg-surface font-sans text-sm font-semibold text-ink"
          >
            {text('지갑 등록하고 팀 만들기', 'Connect wallet to create a team')}
          </Link>
        ) : (
          <Button full disabled={!canSubmit} onClick={submit}>
            {submitting ? text('만드는 중…', 'Creating…') : text('팀 만들기', 'Create team')}
          </Button>
        )}
      </FixedBottom>
    </div>
  )
}
