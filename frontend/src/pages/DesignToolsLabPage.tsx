import { useState } from 'react'

import { SettlementLightStage } from '@/features/studio/SettlementLightStage'
import type { BookingCompleteView } from '@/features/ticket/BookingComplete'
import { ConcertCollectorTicket } from '@/features/ticket/ConcertCollectorTicket'
import { IssuedTicketHero } from '@/features/ticket/IssuedTicketHero'
import { TicketRevealStage } from '@/features/ticket/TicketRevealStage'
import { SupplyCompositionChart, TeamPayoutChart } from '@/shared/charts'
import type { SupportedLanguage } from '@/shared/i18n'
import { AnimatedBrandLogo, BrandLoader, ConfirmDialog, MotionDisclosure } from '@/shared/ui'
import { AuthHeader } from '@/shared/ui/AuthHeader'

const TICKET: BookingCompleteView = {
  orderNumber: 'LAB-20260910-00012',
  showTitle: 'Indie Night / 인디의 밤',
  dateLabel: '2026. 9. 20. 19:00 KST',
  venue: '합정 라이브홀',
  ticketTypeName: 'Standing / 스탠딩',
  teamName: '블루노트',
  quantity: 2,
  totalPaidLabel: '40,000 YoYo',
  paidAtLabel: '2026. 9. 10. 15:30 KST',
}
const LIGHT_CASES = [
  { label: '35 / 65', fixedBp: 3500, selectionBp: 6500, valid: true },
  { label: '0 / 100', fixedBp: 0, selectionBp: 10000, valid: true },
  { label: '50 / 50', fixedBp: 5000, selectionBp: 5000, valid: true },
  { label: '100 / 0', fixedBp: 10000, selectionBp: 0, valid: true },
  { label: '빈 값', fixedBp: Number.NaN, selectionBp: 6500, valid: false },
  { label: '범위 초과', fixedBp: 11000, selectionBp: -1000, valid: false },
  { label: '합계 오류', fixedBp: 3500, selectionBp: 5000, valid: false },
  { label: '서버 합계 오류', fixedBp: 3500, selectionBp: 6500, valid: false },
]
const controlClass =
  'min-h-11 w-full min-w-0 rounded-control border border-line bg-ground px-3 text-sm text-ink focus-visible:outline-focus'
const ticketModeClass =
  'min-h-11 rounded-control border border-line px-3 text-xs font-semibold text-ink focus-visible:outline-focus'

type TicketPreviewMode = 'cinematic' | 'fallback' | 'static'

const PAYOUTS = [
  { teamId: 1, teamName: '블루노트', totalAmount: 743_441 },
  { teamId: 2, teamName: '미드나잇 서울', totalAmount: 474_656 },
  { teamId: 3, teamName: '아주 긴 이름의 인디밴드 실험팀', totalAmount: 306_903 },
]

function LabSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 md:p-6">
      <h2 className="m-0 mb-4 font-sans text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** 고정 fixture만 사용하는 개발 전용 화면. 브랜드의 문서 재생 기록 외 별도 저장이나 API 호출은 없다. */
export function DesignToolsLabPage() {
  const [open, setOpen] = useState(true)
  const [language, setLanguage] = useState<SupportedLanguage>('ko')
  const [lightIndex, setLightIndex] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [logoReplayKey, setLogoReplayKey] = useState(0)
  const [ticketPreviewMode, setTicketPreviewMode] = useState<TicketPreviewMode>('cinematic')
  const [ticketReplayKey, setTicketReplayKey] = useState(0)

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8 md:px-8">
      <header>
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.2em] text-sel">
          Development only
        </p>
        <h1 className="m-0 mt-1 font-sans text-2xl font-black text-ink">Design Tools Lab</h1>
        <p className="m-0 mt-2 max-w-2xl font-sans text-sm leading-relaxed text-muted">
          Motion, Anime.js, Bklit UI를 제품 컴포넌트와 같은 토큰으로 비교합니다. 이 경로는
          프로덕션에 등록되지 않습니다.
        </p>
      </header>

      <LabSection title="Normalized header logo · CSS">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          문서 최초 1회 한글→영문 자동 재생 · 이후 클릭마다 영문→한글 전용 복귀와 한글→영문 정방향을
          번갈아 실행. 모션 감소 설정에서는 path 기반 영문 완성형을 표시합니다.
        </p>
        <button
          type="button"
          aria-label="헤더 로고 전환해 보기"
          onClick={() => setLogoReplayKey((value) => value + 1)}
          className="fx-brand-link min-h-11 max-w-full rounded-control p-2 focus-visible:outline-focus"
        >
          <AnimatedBrandLogo mode="header" height={26} replayKey={logoReplayKey} />
        </button>
      </LabSection>

      <LabSection title="AuthHeader · 로그인 브랜드">
        <AuthHeader
          language={language}
          onLanguageChange={setLanguage}
          homeTo="/__lab/design-tools"
        />
        <p role="status" className="mt-3 text-xs text-muted">
          선택 언어: {language}
        </p>
      </LabSection>

      <LabSection title="IssuedTicketHero · 발행된 티켓">
        <div className="mb-4 flex flex-wrap gap-2" aria-label="티켓 연출 상태">
          <button
            type="button"
            aria-pressed={ticketPreviewMode === 'cinematic'}
            className={ticketModeClass}
            onClick={() => {
              setTicketPreviewMode('cinematic')
              setTicketReplayKey((value) => value + 1)
            }}
          >
            실제 티켓 연출
          </button>
          <button
            type="button"
            aria-pressed={ticketPreviewMode === 'fallback'}
            className={ticketModeClass}
            onClick={() => setTicketPreviewMode('fallback')}
          >
            강제 폴백
          </button>
          <button
            type="button"
            aria-pressed={ticketPreviewMode === 'static'}
            className={ticketModeClass}
            onClick={() => setTicketPreviewMode('static')}
          >
            정적 티켓
          </button>
        </div>

        {ticketPreviewMode === 'cinematic' && (
          <IssuedTicketHero key={ticketReplayKey} data={TICKET} />
        )}
        {ticketPreviewMode === 'fallback' && (
          <TicketRevealStage forceFallback>
            <ConcertCollectorTicket data={TICKET} />
          </TicketRevealStage>
        )}
        {ticketPreviewMode === 'static' && <ConcertCollectorTicket data={TICKET} />}
      </LabSection>

      <LabSection title="SettlementLightStage · 정산 조명">
        <label className="mb-3 block text-xs text-muted">
          정산 비율 상태
          <select
            className={`${controlClass} mt-2`}
            value={lightIndex}
            onChange={(event) => setLightIndex(Number(event.target.value))}
          >
            {LIGHT_CASES.map((item, index) => (
              <option key={item.label} value={index}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <SettlementLightStage {...LIGHT_CASES[lightIndex]} />
        <p className="mb-3 text-xs text-muted">
          오류 상태에서는 직전에 선택한 유효 비율이 유지됩니다.
        </p>
        <h3 className="mb-3 text-sm font-semibold text-ink">최초 응답이 유효하지 않은 경우</h3>
        <SettlementLightStage fixedBp={3500} selectionBp={5000} valid={false} />
      </LabSection>

      <LabSection title="Brand loader · CSS">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-card bg-ground p-4">
            <p className="m-0 mb-3 font-sans text-xs text-muted">
              전체 로딩 시퀀스 — 강제 대기 없음
            </p>
            <BrandLoader fullScreen={false} label="공연 데이터를 불러오는 중" />
          </div>
        </div>
      </LabSection>

      <LabSection title="ConfirmDialog · 이중 언어 작업">
        <button type="button" className={controlClass} onClick={() => setDialogOpen(true)}>
          확인 모달 열기
        </button>
        <ConfirmDialog
          open={dialogOpen}
          title="환불 예정액을 지갑으로 돌려받고 취소할까요?"
          body="실험용 고정 데이터입니다. 실제 예매나 잔액은 바뀌지 않습니다."
          confirmLabel="Cancel ticket / 취소 확정"
          cancelLabel="Keep ticket / 유지하기"
          confirmVariant="danger"
          onConfirm={() => setDialogOpen(false)}
          onClose={() => setDialogOpen(false)}
        />
      </LabSection>

      <LabSection title="Disclosure · Motion">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="lab-disclosure"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 w-full items-center justify-between rounded-control border border-line bg-ground px-3 font-sans text-sm font-semibold text-ink"
        >
          기술 상세 비교
          <span aria-hidden>{open ? '−' : '+'}</span>
        </button>
        <MotionDisclosure open={open} id="lab-disclosure" className="mt-2">
          <div className="rounded-card border border-line bg-ground px-4 py-3 font-sans text-sm leading-relaxed text-muted">
            콘텐츠 높이가 달라도 열림과 닫힘이 끊기지 않는지, 닫힌 뒤 포커스 가능한 요소가 DOM에서
            사라지는지 확인합니다.
          </div>
        </MotionDisclosure>
      </LabSection>

      <LabSection title="Payout comparison · Bklit UI">
        <TeamPayoutChart shares={PAYOUTS} distributableAmount={1_525_000} />
      </LabSection>

      <LabSection title="Supply composition · Bklit UI">
        <SupplyCompositionChart
          totalSupply={5_290_000}
          escrowTotal={1_275_000}
          walletTotal={4_015_000}
        />
        <SupplyCompositionChart
          totalSupply={5_290_000}
          escrowTotal={1_275_000}
          walletTotal={4_012_000}
        />
      </LabSection>
    </main>
  )
}

export default DesignToolsLabPage
