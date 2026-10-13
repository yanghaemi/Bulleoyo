/**
 * A-01 홈의 "판매중 / AI 추천" 전환 탭(화면설계 v8.14).
 *
 * 공용 `shared/ui/Tabs`를 쓰지 않는 이유 — 그 컴포넌트는 `aria-controls`·방향키·roving
 * `tabIndex`가 없고 라벨이 문자열뿐이라 아이콘을 넣을 수 없다. 공용 쪽을 고치면 A-07(내 티켓)·
 * M-03(코인 운영)의 탭 동작까지 바뀌므로 발표 직전에는 이 화면 안에서만 WAI-ARIA tabs 패턴을
 * 갖춘다.
 *
 * 키보드 — 좌우 방향키(끝에서 반대편으로 돈다)·Home·End로 탭을 옮기면 **바로 선택된다**
 * (자동 활성화). 패널이 즉시 그려지는 화면이라 APG가 권하는 방식이다. 선택된 탭만 Tab 순서에
 * 들어가고(`tabIndex=0`), 나머지는 `-1`이다.
 */

import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import { HOME_TABS, homePanelId, homeTabId } from './homeTabModel'
import type { HomeTab } from './homeTabModel'
import { SparkleIcon } from '@/shared/ui/EditorialIcons'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  active: HomeTab
  onChange: (tab: HomeTab) => void
}

export function HomeTabs({ active, onChange }: Props) {
  const { text } = useLocale()
  const refs = useRef<Partial<Record<HomeTab, HTMLButtonElement | null>>>({})

  const labels: Record<HomeTab, ReactNode> = {
    onsale: text('판매중', 'On sale'),
    ai: (
      <>
        <SparkleIcon size={14} className="home-tabs__mark" />
        {text('AI 추천', 'AI picks')}
      </>
    ),
  }

  function move(event: KeyboardEvent<HTMLButtonElement>, current: HomeTab) {
    const index = HOME_TABS.indexOf(current)
    const last = HOME_TABS.length - 1
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
        nextIndex = index === 0 ? last : index - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = last
        break
      default:
        return
    }
    event.preventDefault()
    const next = HOME_TABS[nextIndex]
    refs.current[next]?.focus()
    if (next !== active) onChange(next)
  }

  return (
    <div role="tablist" aria-label={text('공연 보기', 'Browse shows')} className="home-tabs">
      {HOME_TABS.map((tab) => {
        const selected = tab === active
        return (
          <button
            key={tab}
            ref={(node) => {
              refs.current[tab] = node
            }}
            type="button"
            role="tab"
            id={homeTabId(tab)}
            aria-selected={selected}
            aria-controls={homePanelId(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onChange(tab)
            }}
            onKeyDown={(event) => move(event, tab)}
          >
            {labels[tab]}
          </button>
        )
      })}
    </div>
  )
}
