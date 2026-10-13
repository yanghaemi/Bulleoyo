/**
 * M-03 표시 환율·코인 지급 — 본문 조립.
 *
 * 정본 — 화면설계 v6 §4 M-03(1576행~): 영역 구성 · 레이아웃 · 컴포넌트 표 10행 · 상태 ·
 *        입력 검증 · 모바일·접근성 / §5.6 확인 모달 · §5.17(중단 배너는 스크롤 고정 예외) ·
 *        §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기
 *
 * 배치는 M-03 **레이아웃** 그대로다 —
 *   · PC: 최대폭 1200px. 발행량 상태 패널과 중단 배너를 폭 100%로 상단에 두고,
 *     탭(지급 / 표시 환율)마다 **좌측 폼 480px + 우측 이력** 2열
 *   · 모바일: 1열(폼 → 이력) · 중단 배너는 상단 고정
 *
 * ⚠ 판단 — **중단 배너를 발행량 패널보다 위에 뒀다.** 영역 구성의 나열 순서는
 *   "발행량 상태 패널, 중단 배너, …"지만, 레이아웃 항목이 배너를 상단 고정으로 못박으면서
 *   그 이유를 "배너가 뜬 동안 **지급 버튼이 비활성이기 때문**"이라고 적었다. 비활성 이유는
 *   폼보다 먼저 읽혀야 하므로 순서를 그렇게 잡았다. 배너는 **지급이 실제로 막혔을 때** 나타난다
 *   (`mintHalted` 또는 `releaseHalted`). `supplyMatched`가 아니다 — `haltState.ts` 머리말 참고.
 *
 * 지급이 막히는 두 가지를 화면이 함께 판단한다 —
 *   ① `mintHalted`(발행량 대사 불일치) — 서버가 `coin_07`을 409로 거절한다
 *   ② 체인 설정 대기(`isChainConfigured === false`) — 컨트랙트 주소가 빈 값이면 tx가 성립하지 않는다.
 *      `shared/config`가 "M-03은 체인 설정 대기 안내를 띄운다"고 명시한 그 자리다
 */

import { useState } from 'react'

import { AdminForbidden, AdminNotice } from '@/features/admin/AdminStates'
import { CoinGrantForm } from '@/features/admin/CoinGrantForm'
import type { CoinGrantFormProps } from '@/features/admin/CoinGrantForm'
import { CoinGrantHistory } from '@/features/admin/CoinGrantHistory'
import type { CoinGrantHistoryProps } from '@/features/admin/CoinGrantHistory'
import { CoinHaltBanner, CoinSupplyPanel } from '@/features/admin/CoinSupplyPanel'
import { ExchangeRateForm, ExchangeRateHistory } from '@/features/admin/ExchangeRatePanel'
import type {
  ExchangeRateFormProps,
  ExchangeRateHistoryProps,
} from '@/features/admin/ExchangeRatePanel'
import { adminFailureText, isAccessDeniedCode } from '@/features/admin/adminMessages'
import type { AdminError, CoinSupply } from '@/features/admin/adminTypes'
import { haltStateOf } from '@/features/admin/haltState'
import { isChainConfigured } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import { ConfirmDialog, Tabs } from '@/shared/ui'

/** 헤더 탭 — M-03 영역 구성 "탭(지급 / 표시 환율)" */
type CoinTab = 'grants' | 'rates'

export interface CoinOperationsProps {
  supply: {
    loading: boolean
    error?: AdminError | null
    data: CoinSupply | null
    refreshing?: boolean
    onRefresh: () => void
  }
  /**
   * 중단 배너 확인 처리.
   *
   * ⚠ 연결 API가 명세에 없다 — 컴포넌트 표는 감사 로그 `STATUS_CHANGE`를 남긴다고 적었지만
   *   v6에 그 엔드포인트가 없다. 지금은 호출부가 로컬 상태로만 받는다(불일치 목록 참고).
   */
  halt: {
    acknowledged: boolean
    onAcknowledge: () => void
  }
  grantForm: Omit<CoinGrantFormProps, 'disabled' | 'disabledReason' | 'totalSupply'>
  grantHistory: CoinGrantHistoryProps
  rateForm: ExchangeRateFormProps
  rateHistory: ExchangeRateHistoryProps
}

export function CoinOperations({
  supply,
  halt,
  grantForm,
  grantHistory,
  rateForm,
  rateHistory,
}: CoinOperationsProps) {
  const { language, text } = useLocale()
  const [tab, setTab] = useState<CoinTab>('grants')
  /** 확인 처리도 감사 로그를 남기는 액션이다 — 확인 없이 실행하지 않는다(§5.6) */
  const [confirmingAck, setConfirmingAck] = useState(false)

  if (supply.error && isAccessDeniedCode(supply.error.code)) {
    return (
      <AdminForbidden
        msg={
          language === 'ko'
            ? (adminFailureText(supply.error.code, supply.error.msg) ?? '')
            : `Administrator access is required (${supply.error.code}).`
        }
      />
    )
  }

  // ⚠ 중단 판정은 `mintHalted`·`releaseHalted`를 각각 본다. `supplyMatched`로 하면 안 된다
  //   — 그 값은 불변식 ①·④만 보고, ③이 깨지면 release만 멈추면서 true로 남는다.
  //   자세한 이유는 `haltState.ts` 머리말(2026-09-10 팀 확인)
  const haltState = supply.data ? haltStateOf(supply.data) : null
  const mintHalted = haltState?.mintHalted ?? false
  const grantDisabled = mintHalted || !isChainConfigured
  const grantDisabledReason = mintHalted
    ? text(
        '발행량 대사가 맞지 않아 코인 지급(mint)이 중단되었습니다. 대사가 다시 맞을 때까지 지급할 수 없습니다.',
        'Coin grants (mint) are halted because supply reconciliation does not match. Grants remain unavailable until reconciliation matches again.',
      )
    : !isChainConfigured
      ? text(
          '컨트랙트 주소가 아직 설정되지 않았습니다(체인 설정 대기). 배포 주소가 주입된 뒤에 지급할 수 있습니다.',
          'Contract addresses are not configured yet. Grants become available after deployment addresses are injected.',
        )
      : undefined
  const tabs: readonly { id: CoinTab; label: string }[] = [
    { id: 'grants', label: text('지급', 'Grants') },
    { id: 'rates', label: text('표시 환율', 'Display rates') },
  ]

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-0 md:py-0">
      {/* 중단 배너 — **지급이 실제로 막혔을 때** 띄운다. 스크롤과 무관하게 상단 고정(§5.17 예외).
          예전에는 `!supply.data.supplyMatched`로 걸어서, ③만 깨져 정산금 지급이 멈춘 경우
          배너가 아예 뜨지 않았다 — 관리자는 지급이 왜 안 나가는지 알 길이 없었다 */}
      {supply.data && haltState?.anyHalted && (
        <CoinHaltBanner
          supply={supply.data}
          acknowledged={halt.acknowledged}
          onAcknowledge={() => setConfirmingAck(true)}
        />
      )}

      <header className="hidden md:block">
        <h2 className="m-0 font-sans text-xl font-bold text-ink">
          {text('코인 운영', 'Coin operations')}
        </h2>
      </header>

      <CoinSupplyPanel
        loading={supply.loading}
        error={supply.error}
        supply={supply.data}
        refreshing={supply.refreshing}
        onRefresh={supply.onRefresh}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* PC 좌 480px 폼 + 우 이력 / 모바일 1열(폼 → 이력) */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        {tab === 'grants' ? (
          <>
            <div className="min-w-0 md:basis-[min(100%,30rem)] md:shrink">
              <CoinGrantForm
                {...grantForm}
                disabled={grantDisabled}
                disabledReason={grantDisabledReason}
                totalSupply={supply.data?.totalSupply}
              />
            </div>
            <div className="min-w-0 flex-1">
              <CoinGrantHistory {...grantHistory} />
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 md:basis-[min(100%,30rem)] md:shrink">
              <ExchangeRateForm {...rateForm} />
            </div>
            <div className="min-w-0 flex-1">
              <ExchangeRateHistory {...rateHistory} />
            </div>
          </>
        )}
      </div>

      {!isChainConfigured && (
        <AdminNotice tone="warning" title={text('체인 설정 대기', 'Chain setup pending')}>
          {text(
            '코인 지급에 필요한 설정이 완료되지 않았습니다. 운영 담당자에게 설정 상태를 확인해 주세요.',
            'Coin grants are unavailable until setup is complete. Contact the operator to check the setup status.',
          )}
        </AdminNotice>
      )}

      <ConfirmDialog
        open={confirmingAck}
        title={text('중단 상태를 확인 처리할까요?', 'Acknowledge the halted state?')}
        confirmLabel={text('확인 처리', 'Acknowledge')}
        cancelLabel={text('취소', 'Cancel')}
        onClose={() => setConfirmingAck(false)}
        onConfirm={() => {
          halt.onAcknowledge()
          setConfirmingAck(false)
        }}
        body={
          <div className="flex flex-col gap-1">
            <span>
              {text(
                '확인했다는 사실이 감사 로그에 남습니다.',
                'The acknowledgement is recorded in the audit log.',
              )}
            </span>
            {/* 배너와 **같은 대상**을 가리켜야 한다 — 배너는 release만 멈췄다고 하는데
                여기서 "코인 지급도 막혀 있다"고 하면 어느 쪽을 믿어야 할지 알 수 없다 */}
            <span className="text-muted">
              {language === 'ko'
                ? haltState?.ackNote
                : 'Acknowledgement does not resume processing. Reconciliation must match again.'}
            </span>
          </div>
        }
      />
    </div>
  )
}
