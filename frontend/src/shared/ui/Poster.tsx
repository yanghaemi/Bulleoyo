/**
 * 포스터.
 *
 * 운영 화면은 API의 src만 시도하고, 없거나 실패하면 실제 제목의 이니셜을 표시한다.
 * ID 기반 fixture·사진·슬로건은 demo 모드 또는 명시적 lab opt-in에서만 사용한다.
 *
 *   ① `src` — API v6 `performance.posterImageUrl`. 업로드 기능(1층)이 붙으면 이게 온다
 *   ② `/posters/{seed}.webp` → `.jpg` — demo/lab에만 사용하는 로컬 fixture
 *   ③ 라이선스 공연 사진 — loremflickr(Flickr CC)에서 `concert,stage` 태그 사진을
 *      seed로 고정해 가져온다. **피그마가 Unsplash로 하는 것과 같은 방식**이다 — 공식
 *      포스터가 아니라 공연 분위기의 실사진에 공연명을 얹는다
 *   ④ 더미 그라데이션 + 이니셜 — 네트워크가 없거나(시연장 와이파이) 위가 전부 실패할 때
 *
 * ⚠ **저작권 경계**(화면설계 v6 §1.5 ④) — "목업의 포스터·배너는 자체 더미 이미지를 쓴다."
 * 그래서 ③은 CC 라이선스 소스만 쓰고, 실제 아티스트 홍보 포스터는 **코드로 가져오지 않는다.**
 * 팀이 권리 확인한 실물을 쓰려면 ②에 파일로 넣는다 — 그건 팀 판단이고 코드는 그 자리를 비워 둔다.
 *
 * 2026-09-08 로드 페이드 — 후보를 순서대로 시도하다 보니 ①·②가 실패하는 공연은
 * 잠깐 빈 자리였다가 ③이 도착하는 순간 그림이 툭 나타났다. 목록에서 여러 장이 제각각
 * 튀어 화면이 깜빡이는 것처럼 보인다. `onLoad`에서 클래스를 토글해 300ms 페이드로 받는다.
 * 캐시된 이미지는 `onLoad`를 놓칠 수 있어 ref에서 `complete`도 함께 본다.
 * 감싸는 <div>를 새로 두지 않았다 — 호출부가 이 <img>에 직접 비율·모서리 클래스를 넘긴다.
 *
 * 왜 seed 기반인가 — 같은 공연은 어느 화면에서든 같은 그림이어야 하고(목록↔상세↔티켓),
 * 새로고침해도 바뀌지 않아야 한다. seed(공연 ID)로 ③의 `lock`과 ④의 색을 둘 다 결정한다.
 */

import { useCallback, useState } from 'react'
import { isDemo } from '@/shared/config'

import { SloganPoster } from './SloganPoster'
import { hasSloganPoster } from './sloganIds'
import './poster.css'

interface Props {
  /** 이미지 URL. API가 준 값 */
  src?: string | null
  alt?: string
  /**
   * 종횡비. 모바일 히어로·배너는 16:9, 목록 카드는 2:3(모바일 가로형 썸네일)과
   * 3:4(PC 세로형 카드), PC 배너는 21:9다(화면설계 v6 A-01 레이아웃).
   */
  ratio?: '16/9' | '2/3' | '3/2' | '3/4' | '21/9'
  /** 공연마다 그림을 다르게 만드는 씨앗. 보통 공연 ID */
  seed?: string
  /** 공연명 — 더미의 이니셜과 실사진의 alt에 쓴다 */
  label?: string
  className?: string
  /** Explicit opt-in for isolated lab fixtures; real API screens use only src. */
  allowDemoArtwork?: boolean
}

const ASPECT: Record<NonNullable<Props['ratio']>, string> = {
  '16/9': 'aspect-video',
  '2/3': 'aspect-[2/3]',
  '3/2': 'aspect-[3/2]',
  '3/4': 'aspect-[3/4]',
  '21/9': 'aspect-[21/9]',
}

/** 비율별 요청 크기 — 캐러셀 중앙(320×480)의 2배 해상도 기준 */
const SIZE: Record<NonNullable<Props['ratio']>, [number, number]> = {
  '16/9': [960, 540],
  '2/3': [640, 960],
  '3/2': [960, 640],
  '3/4': [720, 960],
  '21/9': [1260, 540],
}

/** 문자열 → 안정적인 정수. 같은 입력이면 항상 같은 값 */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** API 이미지 우선. demo/lab만 로컬 fixture와 샘플 사진을 이어서 시도한다. */
function candidates(
  src: string | null | undefined,
  seed: string | undefined,
  ratio: NonNullable<Props['ratio']>,
  allowDemoArtwork: boolean,
): string[] {
  const list: string[] = []
  if (src) list.push(src)
  if (seed && allowDemoArtwork) {
    // webp를 먼저 본다 — 나무위키 등에서 받은 원본이 webp라 재인코딩 없이 그대로 둔다(2026-09-08)
    list.push(`/posters/${encodeURIComponent(seed)}.webp`)
    list.push(`/posters/${encodeURIComponent(seed)}.jpg`)
    const [w, h] = SIZE[ratio]
    // Lorem Picsum — Unsplash 사진을 seed로 고정해 준다. 같은 공연은 항상 같은 사진.
    // 처음엔 loremflickr(concert 태그)를 썼는데 2026-09-08 확인 시점에 HTTP 500을
    // 뱉어 전부 더미로 떨어졌다. picsum은 주제를 못 고르지만(공연 사진이 아닐 수 있다)
    // 안정적이고 빨라서 이쪽으로 바꿨다. 공연 분위기의 실사진이 꼭 필요하면 ②에 파일을 넣는다.
    list.push(`https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`)
  }
  return list
}

/** seed에서 두 색과 각도를 뽑아 그라데이션을 만든다 */
function dummyStyle(seed: string): React.CSSProperties {
  const h = hash(seed)
  const hue = h % 360
  const hue2 = (hue + 40 + (h % 60)) % 360
  const angle = 120 + (h % 120)
  return {
    backgroundImage: `linear-gradient(${angle}deg, hsl(${hue} 46% 58%), hsl(${hue2} 52% 38%))`,
  }
}

/** 제목에서 표시용 이니셜 2글자 */
function initials(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function Poster({
  src,
  alt,
  ratio = '16/9',
  seed,
  label,
  className = '',
  allowDemoArtwork = isDemo,
}: Props) {
  const aspect = ASPECT[ratio]
  const list = candidates(src, seed, ratio, allowDemoArtwork)
  /** 지금 시도 중인 후보 인덱스. onError마다 다음으로 넘어가고, 끝나면 더미 */
  const [attempt, setAttempt] = useState(0)
  /** 현재 후보가 실제로 그려졌는가. 페이드인 클래스를 이 값으로 토글한다 */
  const [loaded, setLoaded] = useState(false)

  // 캐시 히트로 onLoad를 놓치는 경우의 보강. 콜백 정체성을 고정해 렌더마다 ref가 붙었다 떨어지지 않게 한다
  const catchCached = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setLoaded(true)
  }, [])

  /*
   * 후보 목록이 바뀌면(다른 공연, 다른 비율, 소스 변경) 처음부터 다시 시도한다.
   * src·seed만 보면 후보 URL이 바뀌어도 소진된 attempt가 남아 더미로 떨어진다.
   *
   * ⚠ 이 초기화를 `useEffect`로 하면 **캐시된 이미지가 영영 투명해진다**(2026-09-09에 실제로 그랬다).
   * 순서가 이렇다 — 캐시 히트면 렌더 직후 ref 콜백에서 `complete`가 이미 true라 loaded=true가 되는데,
   * effect는 그보다 **나중에** 돌아 그것을 false로 덮는다. onLoad는 React가 핸들러를 붙이기 전에
   * 이미 지나갔으므로 다시 오지 않는다 → opacity 0에 멈춘다. 첫 방문에는 멀쩡하고 두 번째부터 깨져서
   * 눈에 늦게 띄었다.
   * 그래서 effect가 아니라 **렌더 중 파생 상태 초기화**(React 공식 패턴)로 바꾼다. 렌더 단계에서
   * 끝나므로 뒤따르는 ref 콜백·onLoad가 언제나 마지막 말을 한다.
   */
  const listKey = list.join('|')
  const [prevKey, setPrevKey] = useState(listKey)
  if (prevKey !== listKey) {
    setPrevKey(listKey)
    setAttempt(0)
    setLoaded(false)
  }

  const url = list[attempt]

  // 아트워크가 없는 가상 공연은 사진 폴백 체인을 타지 않고 슬로건 포스터를 그린다(SloganPoster 참고).
  // `src`가 있으면(API가 실제 포스터를 줬으면) 언제나 그쪽이 우선이다
  if (allowDemoArtwork && !src && hasSloganPoster(seed)) {
    return <SloganPoster seed={seed} aspect={aspect} className={className} label={label} />
  }

  if (url) {
    return (
      <img
        src={url}
        alt={alt ?? label ?? ''}
        // lazy를 걸지 않는다 — 포스터는 대부분 첫 화면(캐러셀·카드)에 있어 LCP 후보이고,
        // 문서가 hidden 상태(백그라운드 탭)면 lazy 이미지는 요청조차 시작하지 않아
        // 탭을 다시 열었을 때 빈 자리가 보인다. 목록이 길어져 진짜 필요해지면 그때 건다.
        decoding="async"
        ref={catchCached}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          setAttempt((n) => n + 1)
        }}
        className={`${aspect} w-full object-cover transition-opacity duration-300 ease-out ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      />
    )
  }

  // seed가 없으면 중립 회색 자리만 둔다
  if (!seed) {
    return (
      <div
        aria-hidden
        className={`${aspect} flex w-full items-center justify-center bg-ground-2 ${className}`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-muted"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 16 5-5 7 7 3-3 3 3" /><circle cx="16" cy="8" r="1.5" /></svg>
      </div>
    )
  }

  return (
    <div
      aria-hidden
      style={allowDemoArtwork ? dummyStyle(seed) : undefined}
      // `@container` — 아래 이니셜 글자 크기가 `cqw`(컨테이너 폭 비율)다. 컨테이너를
      // 선언하지 않으면 `cqw`가 **뷰포트** 기준으로 풀려서, PC에서는 48px짜리 요약 썸네일에도
      // 56px 글자가 들어가 잘린다. 포스터 자신을 기준으로 잡아야 크기가 따라 줄어든다.
      className={`@container ${aspect} relative flex w-full items-center justify-center overflow-hidden ${allowDemoArtwork ? 'bg-ground-2' : 'ui-poster-placeholder'} ${className}`}
    >
      {/* 더미임을 드러내는 옅은 사선 — 실제 포스터로 오인되지 않게 */}
      {allowDemoArtwork && <span
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, #fff 0 10px, transparent 10px 20px)',
        }}
      />}
      {!allowDemoArtwork && (
        <>
          <span className="ui-poster-placeholder__eyebrow">BULLEOYO · LIVE</span>
          <span className="ui-poster-placeholder__rule" />
        </>
      )}
      {label && <span className={`relative font-sans text-[clamp(1.5rem,14cqw,3.5rem)] font-semibold tracking-tight ${allowDemoArtwork ? 'text-white/85' : 'ui-poster-placeholder__initials'}`}>
        {initials(label)}
      </span>}
    </div>
  )
}
