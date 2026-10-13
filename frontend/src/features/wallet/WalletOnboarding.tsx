/**
 * C-05 지갑 등록 — 온보딩 필수 단계.
 *
 * 정본 — 화면설계 v6 §4 C-05 · §5.14 서명 단계 · §5.15 provider 배지
 *        · API 명세 v6 wallet-03(챌린지) · wallet-04(등록)
 *
 * **이 화면은 §1.2 원칙 2의 예외다.** 지갑을 정하는 단계 자체이므로 "지갑"이라는 낱말을
 * 그대로 쓴다. 다만 가스·해시·체인은 여전히 쓰지 않고 주소는 축약해서만 보여준다.
 *
 * **이탈 경로를 만들지 않는다.** 등록을 마쳐야 나가는 화면이라 하단 탭바와 헤더 내비를
 * 렌더하지 않는다. 다른 탭 화면과 다른 점이다.
 *
 * 레이아웃 —
 *   · 모든 단계: 중앙 setup frame 안에 단계 요약·현재 작업·동일한 액션 슬롯.
 *   · 모바일: 선택 카드를 세로로 쌓고 액션 슬롯은 화면 하단에 고정.
 *
 * 서명 거부 처리 — 지갑 팝업을 닫으면 **에러 화면을 띄우지 않고 1단계로 조용히 복귀**한다
 * (§1.2 원칙 6). 등록 전이라 되돌려도 부작용이 없다.
 */

import { Button, ProviderBadge, Spinner, Stepper, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import './wallet-refresh.css'

export const WALLET_STEPS = ['Choose', 'Sign', 'Done'] as const

export type WalletChoice = 'WEB3AUTH' | 'EXTERNAL'

export type OnboardingPhase =
  /**
   * 진입 직후 `GET /wallets/me` 응답을 기다리는 중. 등록 여부를 모르므로 선택 단계도,
   * 등록된 지갑도 보여주지 않는다 — 여기서 선택 단계를 먼저 띄우면 이미 등록한 회원이
   * "다시 만들라는 건가"로 읽고 확인을 눌러 409를 받는다(9/24 dev 재현).
   */
  | { kind: 'checking' }
  /** 1단계 — 지갑 만들기 확인(외부 지갑 갈래는 컷) */
  | { kind: 'choose' }
  /** 2단계 — 서명 요약을 먼저 보여주고 팝업을 연다(§5.14) */
  | { kind: 'sign'; shortAddress?: string }
  /** 등록 요청 접수(202) 후 폴링 */
  | { kind: 'linking' }
  /** 3단계 — 환영 카드. balanceKrw가 없으면 기본 지급이 아직 안 끝난 것 */
  | { kind: 'welcome'; provider: WalletChoice; balanceKrw?: number; approxLabel?: string }
  /** 이미 등록된 회원이 들어온 경우 — 읽기 전용 */
  | { kind: 'linked'; provider: WalletChoice; shortAddress: string; linkedAtLabel: string }

/** 되돌릴 수 있는 실패. code로만 분기한다(§1.2 원칙 9) */
export type OnboardingError =
  | 'WALLET_CHALLENGE_EXPIRED'
  | 'WALLET_SIGNATURE_INVALID'
  | 'COMMON_EXTERNAL_SERVICE_ERROR'

const ERROR_TEXT: Record<OnboardingError, string> = {
  WALLET_CHALLENGE_EXPIRED: '시간이 지나 다시 시작해 주세요.',
  WALLET_SIGNATURE_INVALID: '다른 지갑으로 서명했을 수 있어요. 다시 시도해 주세요.',
  COMMON_EXTERNAL_SERVICE_ERROR: '잠시 문제가 있었어요. 다시 시도해 주세요.',
}
const ERROR_TEXT_EN: Record<OnboardingError, string> = {
  WALLET_CHALLENGE_EXPIRED: 'Your request has expired. Please start again.',
  WALLET_SIGNATURE_INVALID: 'The signature did not match this wallet. Please try again.',
  COMMON_EXTERNAL_SERVICE_ERROR: 'Something went wrong. Please try again.',
}

interface Props {
  phase: OnboardingPhase
  error?: OnboardingError
  /**
   * 실패 응답의 `msg`. 있으면 `ERROR_TEXT` 대신 이것을 띄운다 — `LoginScreen` 과 같은 규약이다
   * (규격 §1: 분기는 `code`, 표시는 서버 `msg` 우선). 코드로 좁혀지지 않는 400 이 여기로 온다.
   */
  errorMsg?: string
  selected?: WalletChoice
  onSelect: (c: WalletChoice) => void
  onConfirm: () => void
  onRetry: () => void
  onFinish: () => void
  /**
   * `linked`의 하단 버튼이 마이페이지로 돌아가는가. 버튼 문구를 동작 그대로 쓰려고 받는다 —
   * 이동 자체는 `onFinish`(페이지)가 정한다.
   */
  returnsToMyPage?: boolean
}

function ChoiceCard({
  title,
  titleKo,
  body,
  selected,
  onClick,
}: {
  title: string
  titleKo: string
  body: string
  selected: boolean
  onClick: () => void
}) {
  const { text } = useLocale()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={[
        'wallet-choice flex min-h-36 w-full flex-col rounded-card border border-line px-5 py-5 text-left transition-colors md:flex-1',
        selected ? 'bg-sel-soft' : 'bg-surface',
      ].join(' ')}
    >
      <span className="mb-1 flex items-center gap-1.5">
        <span className="font-sans text-sm font-bold text-ink">{text(titleKo, title)}</span>
      </span>
      <span className="mt-2 block font-sans text-xs leading-relaxed text-muted">{body}</span>
      <span className="wallet-choice-status">
        <span aria-hidden>{selected ? '✓' : '○'}</span>
        {selected ? text('선택됨', 'Selected') : text('선택', 'Select')}
      </span>
    </button>
  )
}

export function WalletOnboarding({
  phase,
  error,
  errorMsg,
  selected,
  onSelect,
  onConfirm,
  onRetry,
  onFinish,
  returnsToMyPage = false,
}: Props) {
  const { text } = useLocale()
  // 등록된 지갑을 보는 화면(또는 그걸 확인하는 중)에는 등록 절차의 머리글·스텝을 붙이지 않는다
  const viewingOwnWallet = phase.kind === 'linked' || phase.kind === 'checking'
  const stepIndex =
    phase.kind === 'choose' ? 0 : phase.kind === 'sign' || phase.kind === 'linking' ? 1 : 2
  const taskTitle = {
    checking: text('지갑 확인 중', 'Checking your wallet'),
    choose: text('내게 맞는 지갑 선택', 'Choose your wallet'),
    sign: text('지갑 소유 확인', 'Confirm wallet ownership'),
    linking: text('지갑 연결 중', 'Connecting your wallet'),
    welcome: text('지갑 준비 완료', 'Ready to get started'),
    linked: text('등록된 지갑', 'Your linked wallet'),
  }[phase.kind]

  return (
    <div className="wallet-setup-page">
      {/* 탭바·헤더 내비를 쓰지 않는다 — 나가는 길을 만들지 않는 화면이다 */}
      <main className="wallet-setup-frame" aria-labelledby="wallet-setup-title">
        {viewingOwnWallet ? (
          <header className="wallet-setup-header">
            <p>{text('지갑', 'Wallet')}</p>
            <h1 id="wallet-setup-title">{text('내 지갑', 'My wallet')}</h1>
          </header>
        ) : (
          <>
            <header className="wallet-setup-header">
              <p>{text('지갑 준비', 'Wallet setup')}</p>
              <h1 id="wallet-setup-title">
                {text('지갑을 준비해 볼까요?', 'Let’s set up your wallet')}
              </h1>
            </header>

            <div className="wallet-setup-progress">
              <Stepper
                steps={[text('선택', 'Choose'), text('확인', 'Sign'), text('완료', 'Done')]}
                active={stepIndex}
              />
            </div>
          </>
        )}
        <section className="wallet-setup-task" aria-labelledby="wallet-task-title">
          <h2 id="wallet-task-title">{taskTitle}</h2>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-card border border-danger/30 bg-danger/5 px-3.5 py-3 font-sans text-xs text-danger"
            >
              {errorMsg || text(ERROR_TEXT[error], ERROR_TEXT_EN[error])}
            </p>
          )}

          {phase.kind === 'checking' && (
            <section
              role="status"
              aria-live="polite"
              className="rounded-card border border-line bg-surface px-4 py-10 text-center md:bg-ground"
            >
              <div className="mb-4 flex justify-center">
                <Spinner size={36} />
              </div>
              <p className="m-0 font-sans text-sm text-muted">
                {text('지갑 정보를 확인하고 있어요', 'Checking your wallet details')}
              </p>
            </section>
          )}

          {phase.kind === 'choose' && (
            <>
              <p className="mb-3 font-sans text-[13px] text-ink">
                {text(
                  '소셜 계정으로 지갑을 만들어 드릴게요.',
                  'We’ll create a wallet with your social account.',
                )}
              </p>

              {/* 외부 지갑(②) 갈래는 컷 라인 ③으로 제외했다(Jira -128). 선택지는 하나다. */}
              <div
                role="radiogroup"
                aria-label={text('지갑 선택', 'Choose a wallet')}
                className="flex flex-col gap-2.5 md:flex-row"
              >
                <ChoiceCard
                  title="Create one for me"
                  titleKo="만들어 주세요"
                  body={text(
                    '소셜 계정으로 바로 만들어 드려요. 시드 문구를 외울 필요가 없어요.',
                    'Create a wallet with your social account. No recovery phrase to remember.',
                  )}
                  selected={selected === 'WEB3AUTH'}
                  onClick={() => onSelect('WEB3AUTH')}
                />
              </div>
            </>
          )}

          {phase.kind === 'sign' && (
            <>
              {/* 서명 요약 — 팝업 전에 항상 먼저 보여준다(§5.14) */}
              <section className="rounded-card border border-line bg-surface px-4 py-4 md:bg-ground md:px-5">
                <p className="mb-1.5 font-sans text-[13px] font-semibold text-ink">
                  {text(
                    '이 지갑이 본인 것임을 확인하는 서명이에요.',
                    'You are proving you own this wallet.',
                  )}
                </p>
                <p className="mb-3 font-sans text-xs text-muted">
                  {text('자금은 이동하지 않아요.', 'No funds move.')}
                </p>
                {phase.shortAddress && (
                  <p className="m-0 font-mono text-xs text-faint">{phase.shortAddress}</p>
                )}
              </section>
            </>
          )}

          {phase.kind === 'linking' && (
            <section className="rounded-card border border-line bg-surface px-4 py-10 text-center md:bg-ground">
              <div className="mb-4 flex justify-center">
                <Spinner size={36} />
              </div>
              <p aria-live="polite" className="mb-1 font-sans text-sm font-bold text-ink">
                {text('지갑을 준비하고 있어요', 'Setting up your wallet')}
              </p>
              <p className="m-0 font-sans text-xs text-muted">
                {text(
                  '연결이 완료될 때까지 잠시 기다려 주세요.',
                  'Please wait while we finish connecting your wallet.',
                )}
              </p>
            </section>
          )}

          {phase.kind === 'welcome' && (
            <section className="rounded-card border border-line bg-surface px-4 py-8 text-center md:bg-ground md:px-6">
              <p className="mb-4 font-sans text-2xl font-bold tracking-tight text-ink">
                {text('지갑이 준비됐어요', 'Your wallet is ready')}
              </p>

              {phase.balanceKrw == null ? (
                /* 기본 지급 실패·지연 — 등록은 성공으로 두고 금액 자리만 비운다.
                   지연 원인(체인 처리)을 노출하지 않는다. */
                <>
                  <p className="mb-1 font-mono text-2xl font-bold text-faint">—</p>
                  <p aria-live="polite" className="mb-5 font-sans text-xs text-muted">
                    {text(
                      '거의 다 됐어요. 잠시 후 다시 확인해 주세요.',
                      'Almost there. Please check again shortly.',
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-1 font-mono text-2xl font-bold text-ink">
                    {formatYoyo(phase.balanceKrw)}
                  </p>
                  <p className="mb-5 font-sans text-xs text-muted">
                    {text('사용 가능 잔액', 'Your balance')}
                    {phase.approxLabel && <span className="ml-1">≈ {phase.approxLabel}</span>}
                  </p>
                </>
              )}

              <div className="mb-5 flex justify-center">
                <ProviderBadge provider={phase.provider} />
              </div>
            </section>
          )}

          {phase.kind === 'linked' && (
            /* 이미 등록된 회원 — 읽기 전용. 교체 화면은 P1이라 안내만 한다 */
            <section className="rounded-card border border-line bg-surface px-4 py-5 md:bg-ground md:px-5">
              <div className="mb-3 flex justify-center">
                <ProviderBadge provider={phase.provider} />
              </div>
              <dl className="m-0">
                <div className="flex justify-between border-b border-line py-2">
                  <dt className="font-sans text-xs text-muted">{text('주소', 'Address')}</dt>
                  <dd className="m-0 font-mono text-xs text-ink">{phase.shortAddress}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="font-sans text-xs text-muted">{text('등록 시각', 'Linked')}</dt>
                  <dd className="m-0 font-mono text-xs text-ink">{phase.linkedAtLabel}</dd>
                </div>
              </dl>
              <p className="mt-3 mb-4 font-sans text-[11px] leading-relaxed text-muted">
                {text(
                  '지갑을 바꾸려면 고객센터로 문의해 주세요.',
                  'To change your wallet, contact support.',
                )}
              </p>
            </section>
          )}
        </section>
        <div
          className="wallet-setup-actions"
          role="group"
          aria-label={text('다음 단계', 'Next step')}
        >
          {phase.kind === 'checking' && (
            <Button full disabled>
              {text('계속', 'Continue')}
            </Button>
          )}
          {phase.kind === 'choose' && (
            <Button full disabled={!selected} onClick={onConfirm}>
              {text('계속', 'Continue')}
            </Button>
          )}
          {phase.kind === 'sign' && (
            <Button full onClick={error ? onRetry : onConfirm}>
              {error
                ? text('다시 시도', 'Try again')
                : text('지갑에서 서명', 'Sign in your wallet')}
            </Button>
          )}
          {phase.kind === 'linking' && (
            <Button full disabled>
              {text('연결 중', 'Connecting')}
            </Button>
          )}
          {phase.kind === 'welcome' && (
            <Button full onClick={onFinish}>
              {text('시작하기', 'Start')}
            </Button>
          )}
          {phase.kind === 'linked' && (
            <Button variant="secondary" full onClick={onFinish}>
              {returnsToMyPage ? text('마이페이지로', 'Back to My page') : text('확인', 'Done')}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
