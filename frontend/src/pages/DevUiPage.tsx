/** Jira S15P21B204-52 완료 기준: Storybook 없이 공통 UI 6종을 확인하는 개발 페이지. */

import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button, Modal, Money, SignatureProgress, StatusBadge, Toast } from '@/shared/ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 md:p-6">
      <h2 className="mb-4 font-sans text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

export function DevUiPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [toastVisible, setToastVisible] = useState(true)

  return (
    <main className="min-h-screen bg-ground px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-[960px]">
        <header className="mb-8">
          <p className="font-mono text-xs font-semibold text-primary">/dev/ui</p>
          <h1 className="mt-2 font-sans text-2xl font-bold text-ink md:text-3xl">공통 UI 확인</h1>
          <p className="mt-2 font-sans text-sm text-muted">
            S15P21B204-52의 공통 컴포넌트 6종과 반응형 동작을 확인합니다.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="1. Button">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Section>

          <Section title="2. Modal">
            <Button onClick={() => setModalOpen(true)}>모달 열기</Button>
          </Section>

          <Section title="3. Toast">
            {toastVisible ? (
              <Toast
                tone="success"
                title="저장했어요"
                message="변경 사항이 안전하게 반영되었습니다."
                onDismiss={() => setToastVisible(false)}
              />
            ) : (
              <Button variant="secondary" onClick={() => setToastVisible(true)}>
                토스트 다시 보기
              </Button>
            )}
          </Section>

          <Section title="4. Money">
            <div className="flex flex-col gap-2">
              <Money amount={15000} />
              <Money amount={50000} approx="$35.60" strong className="text-xl text-ink" />
            </div>
          </Section>

          <Section title="5. StatusBadge">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="on-sale" />
              <StatusBadge status="upcoming" />
              <StatusBadge status="sale-closed" />
              <StatusBadge status="cancelled" />
            </div>
          </Section>

          <Section title="6. SignatureProgress">
            <SignatureProgress current={1} total={2} phase="signing" label="결제 서명" />
          </Section>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="공연 정보를 확인해 주세요"
        description="모바일에서는 하단 시트, PC에서는 중앙 다이얼로그로 표시됩니다."
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={() => setModalOpen(false)}>확인</Button>
          </>
        }
      >
        <p className="font-sans text-sm leading-relaxed text-ink">
          공통 토큰만 사용하며 768px에서 레이아웃이 전환됩니다.
        </p>
      </Modal>
    </main>
  )
}
