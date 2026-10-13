/**
 * 라벨 + 값 한 줄.
 *
 * 와이어프레임 `InfoRow` 이식. 화면설계 v6 §5.21이 "표는 모바일에서 항목별 패널로 접는다"고
 * 정했으므로, 표 대신 이 행을 쌓아 쓴다. 라벨과 값 영역을 분리해 텍스트가 겹치지 않게 한다.
 *
 * 2026-09-08 정돈 — 라벨(11px)과 값(13px)의 첫 줄 기준선이 `pt-0.5`로 대충 맞춰져 있어
 * PC(12/14px)에서 반 픽셀씩 어긋났다. 두 칸의 줄높이(`leading-5`)를 같게 잡아 첫 줄 위치를 맞추고(임의 `pt` 보정을 없앴다),
 * 값에 `tabular-nums`를 걸었다 — 금액·좌석수·예매번호가 세로로 쌓일 때 자릿수가 정렬된다.
 * hover 배경은 넣지 않았다: 이 행은 누를 수 없어서 반응하면 누를 수 있다고 오인된다.
 */

import type { ReactNode } from 'react'

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-20 shrink-0 font-sans text-[11px] leading-5 text-muted md:text-xs">
        {label}
      </span>
      <span className="min-w-0 break-words font-sans text-[13px] font-medium leading-5 text-ink tabular-nums md:text-sm">
        {children}
      </span>
    </div>
  )
}
