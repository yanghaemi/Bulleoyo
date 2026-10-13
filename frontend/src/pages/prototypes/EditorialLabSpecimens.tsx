import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { AnimatedBrandLogo } from '@/shared/ui'

import { ChevronIcon, SearchIcon } from './EditorialLabIcons'

const specimenCopy = {
  title: '공연 둘러보기',
  display: '가까운 곳에서, 좋아하는 음악을.',
  body: '서로 다른 세 팀이 함께 만드는 무대',
  date: '9월 28일 · 오후 7:00 · 서울',
  price: '15,000 YoYo / 100,000 YoYo / 01 / 10 / 100',
  menu: '마이페이지 / 내 티켓 / 지갑 / 스튜디오 / 설정',
  guide: '공연을 선택하고 예매 정보를 확인해 주세요.',
}

const typeSamples = [
  { name: '현재 폰트', className: 'type-current', note: 'DM Sans · Noto Sans KR · Inter' },
  { name: 'Wanted Sans', className: 'type-wanted', note: '단일 패밀리 · UI와 제목의 균형' },
  { name: 'Paperlogy + Pretendard', className: 'type-paperlogy', note: '큰 공연 제목 + 제품 UI' },
  { name: 'SUIT', className: 'type-suit', note: '단일 패밀리 · 정보 밀도 중심' },
] as const

const specimenFontStylesheets = [
  'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css',
  'https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/subsets/Paperlogy-dynamic-subset.css',
  'https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css',
] as const

export function TypeSpecimen() {
  useEffect(() => {
    const links = specimenFontStylesheets.map((href) => {
      const existing = document.head.querySelector<HTMLLinkElement>(
        `link[data-editorial-specimen-font="${href}"]`,
      )
      if (existing) return existing
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.crossOrigin = 'anonymous'
      link.href = href
      link.dataset.editorialSpecimenFont = href
      document.head.append(link)
      return link
    })

    return () => {
      links.forEach((link) => link.remove())
    }
  }, [])

  return (
    <section className="editorial-specimen editorial-specimen--type" role="region" aria-label="폰트 비교 시안">
      <SpecimenHeading
        eyebrow="TYPE SPECIMEN"
        title="같은 문장, 같은 크기에서 비교합니다"
        description="A/B 화면에는 아직 적용하지 않습니다. 한글·영문·숫자의 균형과 실제 줄바꿈만 비교합니다."
      />
      <div className="editorial-specimen__type-grid">
        {typeSamples.map((sample) => (
          <article key={sample.name} className={`editorial-type-card ${sample.className}`} role="group" aria-label={sample.name}>
            <header>
              <strong>{sample.name}</strong>
              <span>{sample.note}</span>
            </header>
            <div className="editorial-type-card__sample">
              <p className="type-section">{specimenCopy.title}</p>
              <h2>{specimenCopy.display}</h2>
              <p className="type-body">{specimenCopy.body}</p>
              <p className="type-meta">{specimenCopy.date}</p>
              <p className="type-price">{specimenCopy.price}</p>
              <p className="type-menu">{specimenCopy.menu}</p>
              <p className="type-guide">{specimenCopy.guide}</p>
              <p className="type-mixed">Seoul Indie Night · LIVE 2026</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function NavigationSpecimen() {
  return (
    <section className="editorial-specimen editorial-specimen--navigation" role="region" aria-label="내비게이션 비교 시안">
      <SpecimenHeading
        eyebrow="NAVIGATION SPECIMEN"
        title="운영 진입을 어디까지 드러낼지 비교합니다"
        description="두 안 모두 개인 메뉴는 드롭다운에 묶습니다. A/B 전체 화면은 H1로 고정되어 있습니다."
      />
      <div className="editorial-specimen__nav-stack">
        <NavigationExample variant="h1" />
        <NavigationExample variant="h2" />
      </div>
    </section>
  )
}

function NavigationExample({ variant }: { variant: 'h1' | 'h2' }) {
  const [open, setOpen] = useState(variant === 'h1')
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const label = variant === 'h1' ? 'H1 검색 중심' : 'H2 운영 진입 강조'
  return (
    <article className="editorial-nav-sample" role="group" aria-label={label}>
      <div className="editorial-nav-sample__caption">
        <strong>{label}</strong>
        <span>{variant === 'h1' ? '스튜디오를 프로필 안에 배치' : '스튜디오를 주요 탐색과 분리해 상단 노출'}</span>
      </div>
      <div className="editorial-nav-sample__bar">
        <Link to="/" aria-label="불러요 홈"><AnimatedBrandLogo mode="header" height={24} /></Link>
        {variant === 'h2' && <Link to="/performances">공연</Link>}
        {variant === 'h2' && <Link to="/studio">스튜디오</Link>}
        <label>
          <SearchIcon />
          <span className="sr-only">공연 검색</span>
          <input type="search" placeholder="공연을 검색해 보세요" />
        </label>
        {variant === 'h1' && <Link to="/performances" className="editorial-nav-sample__find">공연 찾기</Link>}
        <div className="editorial-nav-sample__profile">
          <button ref={triggerRef} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span aria-hidden>B</span>
            마이페이지
            <ChevronIcon className={open ? 'is-open' : undefined} />
          </button>
          {open && (
            <div className="editorial-nav-sample__menu">
              <Link to="/me">마이페이지</Link>
              <Link to="/tickets">내 티켓</Link>
              <Link to="/wallet">지갑</Link>
              <Link to="/studio">스튜디오</Link>
              <Link to="/me/preferences">설정</Link>
              <button type="button">로그아웃</button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function SpecimenHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="editorial-specimen__heading">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </header>
  )
}
