import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-02 팀 관리 — **관리 모드**.
 *
 * 정본 — 화면설계 v6 §4 P-02(영역 구성·레이아웃·컴포넌트 표·상태·입력 검증·접근성)
 *        · §5.3 tx 링크 · §5.4 금액 표기 · §5.10 잔액 패널 · §5.13 KST 병기 · §5.15 provider 배지
 *        · §5.16 잔액 부족 안내 · §5.21 표 → 패널 접기
 *        · API 명세 v6 team_03(`GET /api/v1/teams/{teamId}`) · team_04(`PATCH …`)
 *          · wallet_01(`GET /api/v1/wallets/me`) · wallet_02(`GET /api/v1/wallets/me/transactions`)
 *
 * 본문 순서는 P-02 **영역 구성**의 관리 모드 그대로다 —
 * 팀 정보 패널 → 리더 지갑 패널 → 지갑 거래 이력. 레이아웃 항목이 PC에서 이 셋을
 * **최대폭 960px 2열**(좌 팀 정보 / 우 지갑 패널·거래 이력)로 나누라고 정했으므로
 * 순서를 지키면서 두 열에 나눠 담는다. 모바일은 그 순서 그대로 1열이다.
 *
 * **관리 모드에는 하단 고정 액션이 없다**(P-02 영역 구성: "없음(항목별 액션)").
 * 팀 정보 수정은 패널 안에서 열리고 저장 버튼도 그 패널 안에 있다.
 *
 * **v6 변경 요지 ②: 리더 지갑 패널에서 잔액을 늘리는 진입이 삭제됐다.**
 * 충전·확보·요청 버튼을 여기 되살리지 마라(§1.2 원칙 12). 부족하면 §5.16 안내만 뜬다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * TODO(API 연결)
 *   팀 상세:  team_03 `GET /api/v1/teams/{teamId}` → `TeamDetail`
 *            `{ teamId, teamName, genre, introduction, contactEmail, leaderMemberId, wallet }`
 *   팀 수정:  team_04 `PATCH /api/v1/teams/{teamId}` `{ teamName?, genre?, introduction? }` → `TeamUpdateResponse`
 *            **전달한 필드만** 바뀐다. 바뀐 값만 보내면 되고, 전체 폼을 다시 보내도 된다
 *   지갑:     wallet_01 `GET /api/v1/wallets/me` → `WalletMe`(잔액·display·explorerUrl·cachedAt·stale)
 *            리더 지갑이 곧 팀 지갑이라 팀별 조회가 아니다(wallet_01 설명)
 *   거래 이력: wallet_02 `GET /api/v1/wallets/me/transactions?page&size&sort` → `items[]` + `pageInfo`
 *   에러:     404 `TEAM_NOT_FOUND` · 403 `COMMON_FORBIDDEN`(해당 팀 리더가 아님)
 *            404 `WALLET_NOT_FOUND`(= §8.2 `WALLET_NOT_LINKED`) → 지갑 패널만 미등록으로 그린다
 *            401 `COMMON_UNAUTHORIZED` · 502 `COMMON_EXTERNAL_SERVICE_ERROR`(체인 조회 실패, 캐시도 없음)
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useState } from 'react'
import { Link } from 'react-router'

import {
  Button,
  InfoRow,
  Input,
  ProviderBadge,
  formatYoyo,
  formatKst,
  shortenHex,
} from '@/shared/ui'
import { FormField } from '@/features/studio/FormField'
import { GenreSelect } from '@/features/studio/GenreSelect'
import {
  StudioEmpty,
  StudioErrorPanel,
  StudioHeading,
  StudioForbidden,
  StudioNotice,
  StudioSkeleton,
} from '@/features/studio/StudioStates'
import { WalletAddressCopy } from '@/features/studio/WalletAddressCopy'
import {
  WALLET_TX_LABEL,
  WALLET_TX_STATUS_CLASS,
  WALLET_TX_STATUS_LABEL,
  directionSign,
} from '@/features/studio/leaderWallet'
import type { StudioLeaderWallet, StudioWalletTx } from '@/features/studio/leaderWallet'
import {
  TEAM_INTRO_MAX,
  TEAM_NAME_MAX,
  hasError,
  validateTeamForm,
} from '@/features/studio/teamForm'
import type { TeamFormErrors, TeamFormValues } from '@/features/studio/teamForm'
import { genreLabel } from '@/shared/i18n/genres'
import type { Genre } from '@/shared/i18n/genres'
import { useClipboard } from '@/features/studio/useClipboard'
import type { Clipboard } from '@/features/studio/useClipboard'

/* ── 타입: team_03 `TeamDetail`에서 이 화면이 쓰는 필드만 ────────────────── */

/**
 * 팀 상세.
 *
 * **[v8]** `genre`는 화면설계 v8 P-02가 팀 정보 패널의 표시 항목·수정 폼 필드로 넣어
 * 해소됐다(teamForm.ts 주석 참고). `contactEmail`은 **표시만** 한다 — 입력 필드는 P-02
 * 컴포넌트 표에 여전히 없어 만들지 않는다.
 */
export interface TeamDetailData {
  teamId: number
  teamName: string
  introduction?: string
  /** **[v8]** 장르 코드. 10종 밖(마이그레이션 전 자유 문자열)이면 페이지가 비워서 넘긴다 */
  genre?: Genre
  contactEmail?: string
}

/**
 * §5.16 잔액 부족 안내의 재료 — P-02 컴포넌트 표 "보증금 미납 공연이 있을 때만".
 *
 * ⚠ **연결 API가 명세와 맞지 않는다.** 표는 이 안내의 연결 API를 `GET /wallets/me` 하나로
 * 적었지만, `WalletMe`에는 "보증금 미납 공연이 있는가"를 알 수단이 없다.
 * `GET /api/v1/performances/me`(performance_06)의 `depositStatus === 'UNPAID'` 행을 함께
 * 봐야 성립한다. 그래서 화면은 계산된 결과만 prop으로 받고, 어느 API를 조합할지는
 * 페이지가 정한다(보고 목록 참조).
 */
export interface DepositShortfall {
  /** 보증금 금액 — MVP는 50,000 YoYo 고정 */
  depositAmount: number
  /** 현재 리더 지갑 잔액 */
  balanceAmount: number
  /** 모자란 금액(= depositAmount − balanceAmount, 양수) */
  shortAmount: number
  /** 어느 공연 때문인지. 여러 건이면 페이지가 하나를 고른다 */
  performanceTitle?: string
  performanceId?: number
}

/* ── 팀 정보 패널 ─────────────────────────────────────────────────────── */

/**
 * P-02 컴포넌트 표의 "팀 정보 패널"(읽기) + "팀 정보 수정 폼"(쓰기).
 *
 * 두 행을 한 패널에서 **모드 전환**으로 다룬다 — 명세가 표시 데이터·입력 필드를 똑같이
 * "팀명·소개"로 적었기 때문이다. 별도 화면·모달로 띄우면 같은 값을 두 곳에서 그리게 된다.
 */
function TeamInfoPanel({
  data,
  saving,
  failure,
  onSave,
}: {
  data: TeamDetailData
  saving: boolean
  failure?: string
  onSave: (values: TeamFormValues) => void
}) {
  const { language, text } = useLocale()
  const clipboard = useClipboard()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<TeamFormValues>({
    teamName: data.teamName,
    introduction: data.introduction ?? '',
    genre: data.genre ?? '',
  })
  const [touched, setTouched] = useState(false)

  const errors: TeamFormErrors = validateTeamForm(values, { genreRequired: true })
  const shown = touched ? errors : {}

  const open = () => {
    // 열 때마다 서버 값에서 다시 시작한다 — 이전에 취소한 편집이 되살아나면 안 된다
    setValues({
      teamName: data.teamName,
      introduction: data.introduction ?? '',
      genre: data.genre ?? '',
    })
    setTouched(false)
    setEditing(true)
  }

  const submit = () => {
    setTouched(true)
    if (hasError(errors) || saving) return
    onSave({
      teamName: values.teamName.trim(),
      introduction: values.introduction.trim(),
      genre: values.genre,
    })
    setEditing(false)
  }

  return (
    <section
      aria-label={text('팀 정보', 'Team details')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('팀 정보', 'Team details')}
        </h2>
        {!editing && (
          // 수정은 리더만 할 수 있다(team_04). 리더가 아니면 이 화면 자체가 403이라
          // 여기까지 왔다면 리더다 — 별도 권한 분기를 두지 않는다
          <Button sm variant="secondary" onClick={open}>
            {text('수정', 'Edit')}
          </Button>
        )}
      </div>

      {failure && (
        <p className="m-0 mb-3 font-sans text-[11px] font-semibold text-danger md:text-xs">
          {failure}
        </p>
      )}

      <div className="mb-5 rounded-control bg-ground px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl className="m-0 flex items-baseline gap-3">
            <dt className="text-sm text-muted">{text('팀 ID', 'Team ID')}</dt>
            <dd className="m-0 font-num text-xl font-semibold tabular-nums text-ink">
              {data.teamId}
            </dd>
          </dl>
          <Button
            variant="secondary"
            onClick={() => clipboard.copy('team-id', String(data.teamId))}
          >
            {text('팀 ID 복사', 'Copy team ID')}
          </Button>
        </div>
        <p className="mb-0 mt-2 text-sm leading-relaxed text-muted">
          {text(
            '공연 초대를 받을 때 주최자에게 이 번호를 알려 주세요.',
            'Share this number with the organizer to receive a show invitation.',
          )}
        </p>
        {clipboard.copiedKey === 'team-id' && (
          <p role="status" className="mb-0 mt-2 text-sm text-ink">
            {clipboard.failed
              ? text(
                  '복사하지 못했습니다. 위의 팀 ID를 직접 선택해 복사해 주세요.',
                  'Copy failed. Select and copy the team ID above.',
                )
              : text('팀 ID를 복사했습니다.', 'Team ID copied.')}
          </p>
        )}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          noValidate
        >
          <FormField
            id="team-edit-name"
            label={text('팀 이름', 'Team name')}
            required
            error={shown.teamName}
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
                autoComplete="off"
                invalid={Boolean(shown.teamName)}
                onChange={(e) => setValues((v) => ({ ...v, teamName: e.target.value }))}
              />
            )}
          </FormField>

          <FormField
            id="team-edit-intro"
            label={text('소개', 'Introduction')}
            error={shown.introduction}
            hint={text(
              `${values.introduction.length} / ${TEAM_INTRO_MAX}자`,
              `${values.introduction.length} / ${TEAM_INTRO_MAX} characters`,
            )}
          >
            {(a) => (
              <textarea
                {...a}
                value={values.introduction}
                maxLength={TEAM_INTRO_MAX}
                rows={4}
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

          {/* PATCH 필드는 선택이지만 수정 폼에는 유효한 장르 하나가 항상 있어야 한다. */}
          <GenreSelect
            id="team-edit-genre"
            value={values.genre}
            onChange={(genre) => setValues((v) => ({ ...v, genre }))}
            error={shown.genre}
            required
          />

          {/* 항목별 액션이라 이 줄이 곧 패널의 액션 자리다(하단 고정을 쓰지 않는다) */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
              {text('취소', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving || hasError(errors)}>
              {saving ? text('저장 중…', 'Saving…') : text('저장', 'Save')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="m-0 font-sans text-lg font-bold text-ink md:text-xl">{data.teamName}</p>
          <dl className="my-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
            <dt className="text-muted">{text('내 역할', 'Your role')}</dt>
            <dd className="m-0 text-ink">{text('팀 리더', 'Team leader')}</dd>
            {/* [v8] 장르. 값이 없으면 행 자체를 만들지 않고, 코드가 아니라 라벨을 보여 준다 —
                `ROCK`은 사용자에게 보여 줄 문자열이 아니다(코드·라벨 정본은 shared/i18n/genres) */}
            {data.genre && (
              <>
                <dt className="text-muted">{text('장르', 'Genre')}</dt>
                <dd className="m-0 text-ink">{genreLabel(data.genre, language)}</dd>
              </>
            )}
            {data.contactEmail && (
              <>
                <dt className="text-muted">{text('연락처', 'Contact')}</dt>
                <dd className="m-0 break-all text-ink">{data.contactEmail}</dd>
              </>
            )}
          </dl>
          {data.introduction ? (
            <p className="m-0 mt-1 font-sans text-[13px] leading-relaxed whitespace-pre-line text-muted md:text-sm">
              {data.introduction}
            </p>
          ) : (
            <p className="m-0 mt-1 font-sans text-[13px] text-faint">
              {text(
                '소개가 아직 없습니다. 수정에서 한두 문장을 적어 보세요.',
                'No introduction yet. Select Edit to tell us about your team.',
              )}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/* ── 리더 지갑 패널 ───────────────────────────────────────────────────── */

/**
 * P-02 컴포넌트 표 "리더 지갑 패널" —
 * 제공자 배지(§5.15) · 지갑 주소(축약 + 전체 복사) · YoYo 잔액(정수) · 익스플로러 링크 ·
 * "이 지갑이 팀 지갑입니다" 안내.
 *
 * **잔액을 늘리는 버튼이 없다**(v6 변경 요지 ②). 조회 실패(잔액 `undefined`)여도 패널 전체를
 * 에러로 덮지 않고 금액 자리만 `—`로 둔다(§5.10).
 *
 * 환산 병기는 서버가 준 문자열(`balance.display`)을 그대로 쓴다 — 클라이언트가 환율을
 * 재계산하지 않는다(§5.4).
 */
function LeaderWalletPanel({
  wallet,
  clipboard,
}: {
  wallet?: StudioLeaderWallet
  clipboard: Clipboard
}) {
  const { text } = useLocale()
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
            {text('지갑 등록하러 가기', 'Connect wallet')}
          </Link>
        }
      >
        {text(
          '리더 지갑이 곧 팀 지갑입니다. 등록 전에는 잔액·거래 이력을 볼 수 없고 공연도 만들 수 없어요.',
          'Your wallet is your team wallet. Connect it to see your balance and transactions and create shows.',
        )}
      </StudioNotice>
    )
  }

  return (
    <section
      aria-label={text('리더 지갑', 'Leader wallet')}
      className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
    >
      <h2 className="m-0 mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('리더 지갑', 'Leader wallet')}
      </h2>

      <ProviderBadge
        provider={wallet.provider}
        tone="performer"
        suspended={wallet.status === 'SUSPENDED'}
      />

      {/* 원 값이 항상 먼저, 환산은 작은 위계로 뒤에(§5.4) */}
      <p className="m-0 mt-2 font-num text-2xl font-bold tabular-nums text-ink">
        {wallet.balanceAmount == null ? '—' : formatYoyo(wallet.balanceAmount)}
      </p>
      {wallet.approxLabel && (
        <p className="m-0 font-num text-[11px] tabular-nums text-muted">≈ {wallet.approxLabel}</p>
      )}
      {wallet.cachedAt && (
        <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">
          {wallet.stale
            ? text('마지막으로 확인한 잔액', 'Last known balance')
            : text('갱신', 'Updated')}
          <span className="font-mono">{formatKst(wallet.cachedAt)}</span>
        </p>
      )}

      <div className="mt-3">
        <WalletAddressCopy
          address={wallet.address}
          copyKey="leader-wallet"
          clipboard={clipboard}
          label={text('리더 지갑 주소 복사', 'Copy leader wallet address')}
        />
      </div>

      {wallet.explorerUrl && (
        // §5.3 — 탭하면 새 창으로 Kaia Kairos(Kaiascan) 익스플로러
        <a
          href={wallet.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-11 items-center font-sans text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          {text('익스플로러에서 보기 ↗', 'View in explorer ↗')}
        </a>
      )}

      <p className="m-0 mt-2 font-sans text-[11px] text-muted">
        {text(
          '이 지갑이 팀 지갑입니다. 정산금과 보증금 반환이 모두 여기로 들어옵니다.',
          'This is your team wallet. Payouts and returned deposits arrive here.',
        )}
      </p>

      {/*
        ⚠ 여기에 충전·확보·요청 버튼을 두지 않는다(§1.2 원칙 12 · P-02 변경 요지 ②).
        이 세계에는 잔액을 늘리는 화면이 없다.
      */}
    </section>
  )
}

/* ── 잔액 부족 안내(§5.16) ────────────────────────────────────────────── */

/**
 * P-02 컴포넌트 표 "잔액 부족 안내" — "보증금 미납 공연이 있을 때만".
 *
 * ⚠ **명세끼리 어긋나는 자리다.** §5.16은 사용 화면을 "A-05·P-03"으로 못박고
 * "A-13·C-03·P-01·P-02의 잔액 패널에는 이 안내를 띄우지 않는다"고 적었는데,
 * P-02 컴포넌트 표에는 이 행이 있다. 두 문장을 함께 만족시키는 읽기는 하나뿐이다 —
 * **잔액 패널 안이 아니라 패널 밖의 별도 안내**로, 그리고 상시가 아니라
 * **보증금 미납 공연이 있을 때만** 띄운다. 그렇게 만들었다(보고 목록 참조).
 *
 * §5.16이 금지한 것은 여기서도 지킨다 — 잔액을 늘리는 버튼·링크를 두지 않는다.
 * 다음 행동은 보증금을 내는 화면(P-03)으로 가는 길뿐이다.
 */
function ShortfallNotice({ shortfall }: { shortfall: DepositShortfall }) {
  const { text } = useLocale()
  return (
    <StudioNotice
      tone="warning"
      // 문구는 P-02 컴포넌트 표의 예시를 그대로 옮겼다
      title={text(
        `보증금 ${formatYoyo(shortfall.depositAmount)}를 내기에 잔액이 ${formatYoyo(shortfall.shortAmount)} 모자랍니다.`,
        `You need ${formatYoyo(shortfall.shortAmount)} more for the ${formatYoyo(shortfall.depositAmount)} deposit.`,
      )}
      action={
        shortfall.performanceId != null ? (
          <Link
            to={`/studio/performances/${shortfall.performanceId}/edit`}
            className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-sans text-[13px] font-semibold text-ink transition-colors duration-150 ease-out hover:bg-ground-2"
          >
            {text('보증금 화면으로', 'Go to deposit')}
          </Link>
        ) : undefined
      }
    >
      {text('현재 잔액', 'Current balance')}
      {formatYoyo(shortfall.balanceAmount)}
      {shortfall.performanceTitle && (
        <>
          {' '}
          {text('· 공연', '· Show')}
          {shortfall.performanceTitle}
        </>
      )}
      <br />
      {text(
        '잔액이 채워지면 보증금 화면에서 다시 시도할 수 있습니다.',
        'Return to the deposit page once your balance is sufficient.',
      )}
    </StudioNotice>
  )
}

/* ── 거래 이력 ────────────────────────────────────────────────────────── */

/** 표의 열 머리글. 이 배열이 PC 표와 모바일 패널의 **공통 순서**를 갖는다(§5.21) */
const TX_COLUMNS = [
  ['금액', 'Amount'],
  ['시각', 'Time'],
  ['tx', 'Transaction'],
  ['상태', 'Status'],
] as const

function TxStatusBadge({ tx }: { tx: StudioWalletTx }) {
  const { text } = useLocale()
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${WALLET_TX_STATUS_CLASS[tx.status]}`}
    >
      {text(
        WALLET_TX_STATUS_LABEL[tx.status],
        tx.status === 'CONFIRMED' ? 'Confirmed' : tx.status === 'FAILED' ? 'Failed' : 'Processing',
      )}
    </span>
  )
}

/** tx 링크 — §5.3 축약 + 새 창. 아직 해시가 없는 행(PENDING)은 `—`로 둔다 */
function TxLink({ tx }: { tx: StudioWalletTx }) {
  if (!tx.txHash || !tx.explorerUrl)
    return <span className="font-sans text-[13px] text-muted">—</span>
  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-primary underline underline-offset-2"
    >
      {shortenHex(tx.txHash)}
    </a>
  )
}

function TxAmount({ tx }: { tx: StudioWalletTx }) {
  return (
    <span className="font-num text-[13px] tabular-nums text-ink">
      {formatYoyo(tx.amount, directionSign(tx.direction))}
    </span>
  )
}

function TransactionList({ items }: { items: StudioWalletTx[] }) {
  const { text } = useLocale()
  return (
    <section aria-label={text('지갑 거래 이력', 'Wallet transactions')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('지갑 거래 이력', 'Wallet transactions')}
      </h2>

      {items.length === 0 ? (
        // §5.7 — 아이콘 없이 문구만. 이 화면에서 거래를 만들 방법이 없어 버튼도 두지 않는다
        <StudioEmpty>{text('아직 거래가 없습니다', 'No transactions yet')}</StudioEmpty>
      ) : (
        <>
          {/* ── PC: 표 ── */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                  >
                    {text('유형', 'Type')}
                  </th>
                  {TX_COLUMNS.map((c) => (
                    <th
                      key={c[0]}
                      scope="col"
                      className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                    >
                      {text(c[0], c[1])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.walletTxId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <span className="block font-sans text-[13px] font-bold text-ink">
                        {text(WALLET_TX_LABEL[tx.type].ko, WALLET_TX_LABEL[tx.type].en)}
                      </span>
                      {tx.title && (
                        <span className="block font-sans text-[11px] text-muted">{tx.title}</span>
                      )}
                    </th>
                    <td className="px-4 py-3">
                      <TxAmount tx={tx} />
                    </td>
                    <td className="px-4 py-3 font-sans text-[13px] text-ink">
                      {formatKst(tx.occurredAt)}
                    </td>
                    <td className="px-4 py-3">
                      <TxLink tx={tx} />
                    </td>
                    <td className="px-4 py-3">
                      <TxStatusBadge tx={tx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 가로 스크롤을 만들지 않는다 ── */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {items.map((tx) => (
              <li
                key={tx.walletTxId}
                className="rounded-card border border-line bg-surface px-4 py-3"
              >
                {/* 표의 첫 열(유형)이 패널 제목이 된다 */}
                <span className="block font-sans text-[13px] font-bold text-ink">
                  {text(WALLET_TX_LABEL[tx.type].ko, WALLET_TX_LABEL[tx.type].en)}
                </span>
                {tx.title && (
                  <span className="mb-1 block font-sans text-[11px] text-muted">{tx.title}</span>
                )}
                {/* 나머지 열은 `라벨: 값` 한 줄씩. 순서는 PC 표와 같다 */}
                <InfoRow label={text(...TX_COLUMNS[0])}>
                  <TxAmount tx={tx} />
                </InfoRow>
                <InfoRow label={text(...TX_COLUMNS[1])}>{formatKst(tx.occurredAt)}</InfoRow>
                <InfoRow label={text(...TX_COLUMNS[2])}>
                  <TxLink tx={tx} />
                </InfoRow>
                <InfoRow label={text(...TX_COLUMNS[3])}>
                  <TxStatusBadge tx={tx} />
                </InfoRow>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  loading?: boolean
  /** team_03 응답. `error`·`forbidden`이 없는데 이것도 없으면 로딩으로 본다 */
  data?: TeamDetailData
  /** wallet_01 응답. `undefined`면 지갑 미등록 */
  wallet?: StudioLeaderWallet
  /** wallet_02 응답의 `items[]` */
  transactions?: StudioWalletTx[]
  /** 보증금 미납 공연이 있을 때만. 없으면 §5.16 안내를 띄우지 않는다 */
  shortfall?: DepositShortfall
  /** 403 — 해당 팀 리더가 아님(`COMMON_FORBIDDEN`). 본문 전체를 덮는다 */
  forbidden?: string
  /** 조회 실패 문구(`TEAM_NOT_FOUND` 등). 있으면 에러 패널을 그린다 */
  error?: string
  onRetry?: () => void
  /** 팀 수정(team_04). 저장이 끝난 뒤 상위가 `data`를 갱신한다 */
  onSave?: (values: TeamFormValues) => void
  saving?: boolean
  /** 저장 실패 문구 */
  saveFailure?: string
}

export function TeamManage({
  loading = false,
  data,
  wallet,
  transactions = [],
  shortfall,
  forbidden,
  error,
  onRetry,
  onSave,
  saving = false,
  saveFailure,
}: Props) {
  const { text } = useLocale()
  const clipboard = useClipboard()
  // 관리 모드에는 하단 고정 액션이 없다 — 바닥 여백을 비워 두지 않는다(P-02 영역 구성)
  const frame = 'flex flex-col gap-4 px-3 pt-3 pb-8 md:gap-6 md:px-0 md:pt-0 md:pb-0'

  if (loading) {
    return (
      <div className={frame}>
        <StudioSkeleton label={text('팀 정보를 불러오는 중', 'Loading team details')} rows={1} />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className={frame}>
        <StudioForbidden msg={forbidden} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={frame}>
        <StudioErrorPanel
          title={text('팀 정보를 불러오지 못했습니다', 'Could not load team details')}
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
        />
      </div>
    )
  }

  return (
    <div className={frame}>
      {/* PC 본문 제목 = 팀명(P-02 헤더). 모바일은 `StudioShell` 상단 바가 팀명을 이미 갖는다 */}
      <StudioHeading title={data.teamName} section={['팀 관리', 'Your team']} />

      <div className="flex w-full max-w-[1080px] flex-col gap-4 md:gap-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
          <TeamInfoPanel
            data={data}
            saving={saving}
            failure={saveFailure}
            onSave={(values) => onSave?.(values)}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <LeaderWalletPanel wallet={wallet} clipboard={clipboard} />
            {shortfall && <ShortfallNotice shortfall={shortfall} />}
          </div>
        </div>

        {/* 거래 이력은 데스크톱에서도 전체 폭을 사용해 5열 원장을 눌러 담지 않는다. */}
        {wallet && <TransactionList items={transactions} />}
        <section
          aria-label={text('팀 나가기', 'Leave team')}
          className="rounded-card border border-line bg-surface p-5"
        >
          <h2 className="m-0 text-base font-semibold text-ink">
            {text('팀 소속 관리', 'Team membership')}
          </h2>
          <p id="team-leave-unavailable" className="mt-2 text-sm leading-relaxed text-muted">
            {text(
              '팀 탈퇴 기능은 아직 지원되지 않습니다. 현재 팀 리더의 탈퇴·리더 이전을 처리하는 서버 기능이 없어 팀과 지갑 연결을 임의로 해제할 수 없습니다.',
              'Leaving a team is not supported yet. The server does not support leader departure or ownership transfer, so the team and wallet cannot be disconnected here.',
            )}
          </p>
          <Button variant="secondary" disabled aria-describedby="team-leave-unavailable">
            {text('팀 나가기', 'Leave team')}
          </Button>
        </section>
      </div>
    </div>
  )
}
