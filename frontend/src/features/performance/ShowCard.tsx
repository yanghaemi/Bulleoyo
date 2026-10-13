/**
 * 공연 카드 — 화면설계 v6 §5.20 카드 그리드 · §1.6 표시 항목 대조표.
 *
 * 규칙 —
 *   · **카드 형태가 폭에 따라 바뀐다** — 모바일은 가로형(좌측 40% 썸네일 + 우측 텍스트),
 *     PC는 세로형(위 포스터 + 아래 텍스트). 같은 데이터를 담되 세로 공간이 귀한 쪽에서 눕힌다
 *   · 정보 순서는 폭과 무관하게 고정 — **포스터 → 공연명 → 출연팀 수 → 장소 → 일시 → 가격 → 뱃지**.
 *     좁아진다고 항목을 빼지 않고 줄바꿈으로 흡수한다
 *   · **뱃지는 최대 2개.** 셋 이상이면 매진 > 마감 임박 > 공동공연 순으로 자른다
 *   · 카드 전체가 탭 타겟이고 높이 44px 이상
 *
 * 금액은 YoYo 정수를 먼저 쓰고 `≈` 환산을 뒤에 붙인다(§5.10). 환산값은 서버가 준 것을
 * 그대로 쓴다 — 클라이언트가 환율을 재계산하지 않는다(§5.4).
 */

import { Link } from 'react-router'

import { claimPosterName } from '@/shared/fx/useStageLink'

import { Poster, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import './show-card.css'

export interface ShowCardData {
  performanceId: string
  title: string
  /** 출연팀 수 — `3 bands` / "3팀" */
  bandCount: number
  venue: string
  /** 회원 시간대 + KST 병기 문자열 */
  dateLabel: string
  /** 최저가(원). 매진이면 생략 가능 */
  fromPriceKrw?: number
  /** 서버가 준 환산 문자열. 예 `$11.10` */
  fromPriceUsd?: string
  posterImageUrl?: string | null
  soldOut?: boolean
  saleClosed?: boolean
  closingSoon?: boolean
  /** 참여팀 2팀 이상 */
  jointShow?: boolean
}

/** 판매 마감 > 매진 > 마감 임박 > 공동공연 순으로 자른다(§5.20). */
function pickBadges(d: ShowCardData): string[] {
  const all: string[] = []
  if (d.saleClosed) all.push('Sale closed')
  if (d.soldOut) all.push('Sold out')
  if (d.closingSoon) all.push('Closing soon')
  if (d.jointShow) all.push('Joint show')
  return all.slice(0, 2)
}

function Badges({ items }: { items: string[] }) {
  const { text } = useLocale()
  if (items.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {items.map((b) => (
        <span
          key={b}
          className={[
            'inline-flex h-5 items-center rounded-[4px] px-1.5 font-sans text-[10px] font-semibold',
            b === 'Sold out' ? 'bg-ground-2 text-muted' : 'bg-sel-soft text-ink',
          ].join(' ')}
        >
          {b === 'Sale closed'
            ? text('판매 마감', b)
            : b === 'Sold out'
              ? text('매진', b)
              : b === 'Closing soon'
                ? text('마감 임박', b)
                : text('함께하는 공연', b)}
        </span>
      ))}
    </div>
  )
}

function Price({ d }: { d: ShowCardData }) {
  if (d.fromPriceKrw == null) return null
  return (
    <p className="m-0 font-sans text-xs text-ink md:text-[13px]">
      <span className="font-num tabular-nums font-semibold">{formatYoyo(d.fromPriceKrw)}</span>
      {d.fromPriceUsd && <span className="ml-1 text-muted">≈ {d.fromPriceUsd}</span>}
    </p>
  )
}

export function ShowCard({ data }: { data: ShowCardData }) {
  const { text } = useLocale()
  const badges = pickBadges(data)

  return (
    <Link
      to={`/performances/${data.performanceId}`}
      viewTransition
      onClick={(event) => {
        claimPosterName(event.currentTarget.querySelector<HTMLElement>('[data-vt-poster]'))
      }}
      className="show-card"
    >
      <div data-vt-poster className="show-card__poster">
        <Poster
          src={data.posterImageUrl}
          seed={data.performanceId}
          label={data.title}
          alt=""
          ratio="3/4"
        />
      </div>
      <div className="show-card__content">
        <p className="show-card__title">{data.title}</p>
        <p className="show-card__date">{data.dateLabel}</p>
        <p className="show-card__venue">{data.venue}</p>
        <p className="show-card__teams">{text(data.bandCount + '팀', data.bandCount + ' bands')}</p>
        <Price d={data} />
        <Badges items={badges} />
      </div>
    </Link>
  )
}
