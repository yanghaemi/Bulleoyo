/**
 * C-05 지갑 등록(온보딩) — 라우트 `/onboarding/wallet`.
 *
 * 진입 — 로그인 응답의 `wallet`이 `null`이면 C-01 직후 자동 진입한다. C-03 지갑 패널에서도 온다.
 * 이미 등록된 회원은 **자동 진입하지 않는다** — C-03에서 들어와 확인만 한다.
 *
 * 진입 — `GET /api/v1/wallets/me`를 먼저 본다. 응답 전엔 checking, 등록됨이면 곧바로 linked
 *   ("내 지갑", POST 없음), 404·실패면 선택 단계. 마이페이지(C-03)의 "지갑 준비됨" 행이
 *   등록된 회원도 이리로 보내기 때문이다(9/24 dev에서 선택 단계가 먼저 떠 409 두 번).
 *
 * API 연결
 *   만들어 주세요: Web3Auth 주소 → `POST /api/v1/wallets { provider: 'WEB3AUTH', address }`
 *   **202 + jobId**가 오면 `GET /api/v1/chain/jobs/{jobId}` 폴링(§1.2 원칙 8).
 *   등록 응답의 `signupGrant`로 환영 카드를 채우고, 이미 등록된 409만 `GET /wallets/me`로 복구한다.
 *
 *   에러는 `code`로만 분기한다 —
 *     `WALLET_ALREADY_LINKED`(409) → linked 패널로 전환(에러로 보여주지 않는다)
 *     `WALLET_CHALLENGE_EXPIRED`(409) → 1단계 복귀
 *     `WALLET_SIGNATURE_INVALID`(400) → 재시도
 *     `COMMON_EXTERNAL_SERVICE_ERROR`(502) → 재시도
 *
 * ② Kaia Wallet 외부 지갑 갈래는 **컷 라인 ③으로 제외했다**(Jira -128 취소). 어댑터가 없어
 * 성공하는 척할 수 없고, 확장 팝업은 사람이 눌러야 해 리허설마다 수동 단계가 된다. 전원
 * `WEB3AUTH`로 등록한다. 화면 자체는 컷 불가다(지갑 등록이 온보딩 필수 단계라서).
 */

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { readLoginContinuationState } from '@/features/member/loginNavigation'
import { WalletOnboarding } from '@/features/wallet/WalletOnboarding'
import type {
  OnboardingError,
  OnboardingPhase,
  WalletChoice,
} from '@/features/wallet/WalletOnboarding'
import { isApiError } from '@/shared/api/client'
import type { MoneyView } from '@/shared/api/domains/member'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { isDev } from '@/shared/config'
import { useChainJob } from '@/shared/queries/chain'
import { useLinkWallet, useMyWallet, type WalletView } from '@/shared/queries/wallet'
import { formatKst, shortenHex } from '@/shared/ui'

const SHORT_ADDRESS = '0xDf1C…68Fd'
/** C-03이 `state.from`으로 넘기는 복귀 경로. 이 값이면 linked 버튼을 "마이페이지로"라 쓴다 */
const MY_PAGE_PATH = '/me'

const DEV_PHASES: { label: string; phase: OnboardingPhase; error?: OnboardingError }[] = [
  { label: '선택', phase: { kind: 'choose' } },
  { label: '서명', phase: { kind: 'sign', shortAddress: SHORT_ADDRESS } },
  {
    label: '서명 실패',
    phase: { kind: 'sign', shortAddress: SHORT_ADDRESS },
    error: 'WALLET_SIGNATURE_INVALID',
  },
  { label: '준비 중', phase: { kind: 'linking' } },
  {
    label: '환영',
    phase: { kind: 'welcome', provider: 'WEB3AUTH', balanceKrw: 100_000, approxLabel: '$74.07' },
  },
  { label: '지급 지연', phase: { kind: 'welcome', provider: 'WEB3AUTH' } },
  {
    label: '이미 등록됨',
    phase: {
      kind: 'linked',
      provider: 'EXTERNAL',
      shortAddress: SHORT_ADDRESS,
      linkedAtLabel: '9월 8일 오후 2:20 KST',
    },
  },
]

function linkedPhaseOf(wallet: WalletView | null | undefined): OnboardingPhase | null {
  if (!wallet?.provider || !wallet.address) return null
  return {
    kind: 'linked',
    provider: wallet.provider,
    shortAddress: shortenHex(wallet.address),
    linkedAtLabel: wallet.verifiedAt ? formatKst(wallet.verifiedAt) : '—',
  }
}

export function WalletOnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { adapter } = useWeb3Auth()
  const linkWallet = useLinkWallet()
  // 진입 즉시 조회한다 — 이미 등록한 회원에게 등록 절차를 보여주지 않으려고(9/24 dev 재현).
  // 404(`WALLET_NOT_FOUND`)는 전역 retry 정책상 재시도 없이 바로 error로 떨어진다.
  const walletQuery = useMyWallet()
  const continuation = readLoginContinuationState(location.state)
  const [phase, setPhase] = useState<OnboardingPhase>({ kind: 'choose' })
  /**
   * 사용자가 화면을 움직였는가(확인·DEV 단계 전환). 그 뒤로는 진입 조회 결과가 화면을
   * 덮지 않는다 — 등록 성공 직후 `useLinkWallet`이 `qk.wallet.all`을 무효화해 조회가 지갑을
   * 돌려주는데, 그걸로 linked를 만들면 linking → welcome 흐름이 linked로 튄다.
   */
  const [started, setStarted] = useState(false)
  // 확인 연타 잠금. setState는 다음 렌더에야 반영돼 같은 틱의 두 번째 클릭을 못 막는다.
  const linkingRef = useRef(false)
  const [error, setError] = useState<OnboardingError | undefined>()
  // 선택지가 하나뿐이라 미리 골라 둔다 — 외부 지갑 갈래는 컷했다.
  const [selected, setSelected] = useState<WalletChoice | undefined>('WEB3AUTH')
  const [grantJobId, setGrantJobId] = useState<string | null>(null)
  const [signupGrant, setSignupGrant] = useState<MoneyView | null>(null)

  const showWelcome = (grant: MoneyView | null) => {
    setGrantJobId(null)
    setPhase({
      kind: 'welcome',
      provider: 'WEB3AUTH',
      ...(grant && {
        balanceKrw: grant.amount,
        ...(grant.display && {
          approxLabel: formatApprox(grant.display.currency, grant.display.approx),
        }),
      }),
    })
  }

  const chainJob = useChainJob(grantJobId, {
    onConfirmed: () => showWelcome(signupGrant),
    // 지급 실패는 지갑 등록 성공을 되돌리지 않는다(wallet-04).
    onFailed: () => showWelcome(null),
  })

  useEffect(() => {
    if (phase.kind === 'linking' && grantJobId && (chainJob.isError || chainJob.timedOut)) {
      // 폴링 장애/지연도 등록 자체의 실패가 아니므로 잔액 없는 완료 화면으로 진행한다.
      setGrantJobId(null)
      setPhase({ kind: 'welcome', provider: 'WEB3AUTH' })
    }
  }, [chainJob.isError, chainJob.timedOut, grantJobId, phase.kind])

  /**
   * 진입 조회로 정한 화면. `null`이면 `phase`(사용자 흐름)를 그대로 쓴다.
   *   · 등록됨 → linked(POST 없음)
   *   · 조회 중(아직 값 없음) → checking(확인 버튼 비활성)
   *   · 404·네트워크 실패 → null → 선택 단계. 실패 시의 409는 아래 복구 경로가 받는다
   * 상태로 복사하지 않고 매 렌더 계산한다 — effect에서 setPhase하면 한 프레임 선택 단계가 먼저 보인다.
   */
  const entryPhase: OnboardingPhase | null = started
    ? null
    : (linkedPhaseOf(walletQuery.data) ??
      (walletQuery.isFetching && !walletQuery.data ? { kind: 'checking' } : null))
  const shownPhase = entryPhase ?? phase

  // 방어용 — 진입 조회가 실패해 선택 단계가 떴는데 실제로는 등록된 회원이면 POST가 409로 온다.
  const recoverAlreadyLinkedWallet = async () => {
    try {
      const result = await walletQuery.refetch()
      const linked = linkedPhaseOf(result.data)
      if (!linked) return false

      setPhase(linked)
      return true
    } catch {
      return false
    }
  }

  const confirm = async () => {
    if (shownPhase.kind !== 'choose' || linkingRef.current) return
    setError(undefined)
    if (selected !== 'WEB3AUTH') return

    linkingRef.current = true
    setStarted(true)
    setGrantJobId(null)
    setSignupGrant(null)
    setPhase({ kind: 'linking' })

    try {
      const address = await adapter?.getAddress()
      if (!address) throw new Error('Web3Auth wallet is not connected.')

      const result = await linkWallet.mutateAsync({ provider: 'WEB3AUTH', address })
      setSignupGrant(result.signupGrant)
      if (result.grantJobId) {
        setGrantJobId(result.grantJobId)
      } else {
        showWelcome(null)
      }
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_CONFLICT') {
        const recovered = await recoverAlreadyLinkedWallet()
        if (recovered) return
      }
      setPhase({ kind: 'choose' })
      setError('COMMON_EXTERNAL_SERVICE_ERROR')
    } finally {
      // 실패해 선택 단계로 돌아가면 다시 누를 수 있어야 한다. 성공 뒤에는 phase가 choose가 아니라 막힌다
      linkingRef.current = false
    }
  }

  return (
    <>
      {isDev && (
        <div className="flex flex-wrap gap-1 border-b border-line bg-ground-2 px-3 py-2">
          {DEV_PHASES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setStarted(true)
                setPhase(p.phase)
                setError(p.error)
              }}
              className={[
                'rounded-chip px-2 py-1 font-mono text-[10px]',
                shownPhase.kind === p.phase.kind && error === p.error
                  ? 'bg-sel text-white'
                  : 'bg-surface text-muted',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <WalletOnboarding
        phase={shownPhase}
        error={error}
        returnsToMyPage={!continuation.isNewMember && continuation.from === MY_PAGE_PATH}
        selected={selected}
        onSelect={setSelected}
        onConfirm={() => void confirm()}
        onRetry={() => {
          // 서명 거부·실패는 1단계로 조용히 복귀한다(§1.2 원칙 6)
          setError(undefined)
          setPhase({ kind: 'choose' })
        }}
        onFinish={() => {
          if (continuation.isNewMember) {
            navigate('/signup', { replace: true, state: continuation })
          } else {
            navigate(continuation.from, { replace: true })
          }
        }}
      />
    </>
  )
}

export default WalletOnboardingPage
