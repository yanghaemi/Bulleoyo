/**
 * 슬로건 포스터 — 실제 아트워크가 없는(가상) 공연의 "디자인된 포스터".
 *
 * 강병구 결정(2026-09-08): 가상 공연 4개의 포스터는 사진(무섭다)도 일러스트(아니다)도 아닌
 * **슬로건 타이포그래피**로 간다 — "예쁘게 글씨 디자인해서 화려하게". 이미지 파일이 아니라
 * 컴포넌트로 그리는 이유: `<img>`로 넣은 SVG는 웹폰트를 못 쓰지만, 컴포넌트는 이미 로드된
 * Montserrat·DM Sans·DM Mono·Inter와 CSS 그라디언트 글자·글로우·회전을 전부 쓸 수 있다.
 *
 * `Poster`가 `src` 없이 `seed`만 받았고 그 seed가 아래 `SLOGANS`에 있으면 이걸 그린다.
 * 실제 아티스트 공연(12 aespa · 8 BTS · 5 IU)은 여기 없다 — 사진 포스터 폴백 체인이 그대로다.
 *
 * ── 크기 규약 ─────────────────────────────────────────────────────
 * 포스터는 2:3(카드) · 3:2(PC 그리드) · 16:9(상세 히어로)로 다 쓰이므로 글자 크기를 `cqmin`
 * (컨테이너의 짧은 변 비율)으로 잡는다. 어느 비율에서도 세로·가로 모두 넘치지 않는 단위다.
 * 부모 `Poster`가 `@container`를 선언한다.
 *
 * ── 색은 토큰이 아니다 ─────────────────────────────────────────────
 * 포스터는 UI가 아니라 **아트워크**다. 공연마다 고유한 팔레트를 갖는 것이 맞고, 테마를
 * 바꿔도 포스터 색이 따라 바뀌면 이상하다(포스터가 다크 모드를 따르진 않는다). 그래서 여기만
 * hex를 직접 쓴다 — 하드코딩 금지 규칙의 의도된 예외다.
 */

import type { CSSProperties } from 'react'

import type { SloganId } from './sloganIds'

interface Slogan {
  render: () => React.ReactNode
}

/** 그라디언트로 채운 글자. 배경을 글자 모양으로 자른다 */
const gradientText = (gradient: string): CSSProperties => ({
  backgroundImage: gradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
})

/** 속을 비우고 테두리만 남긴 글자 */
const outlineText = (color: string, width: string): CSSProperties => ({
  color: 'transparent',
  WebkitTextStroke: `${width} ${color}`,
})

const SLOGANS: Record<SloganId, Slogan> = {
  // ── 7 · Seoul Indie Night vol.12 — 밤, 네온, 크고 거친 대문자 ──────────
  '7': {
    render: () => (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 110%, rgba(255,123,176,.35), transparent 60%), linear-gradient(160deg, #150f33 0%, #2b1f5c 55%, #3d2a78 100%)',
        }}
      >
        {/* 네온 링 — 글자 뒤에서 빛난다 */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: '78cqmin',
            height: '78cqmin',
            border: '0.7cqmin solid rgba(143,134,255,.55)',
            boxShadow: '0 0 6cqmin rgba(143,134,255,.55), inset 0 0 6cqmin rgba(143,134,255,.35)',
          }}
        />
        <span
          className="relative font-sans font-bold uppercase leading-none"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '24cqmin',
            letterSpacing: '-0.02em',
            ...outlineText('#f6efe6', '0.45cqmin'),
          }}
        >
          Loud
        </span>
        <span
          className="relative leading-none italic"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '8cqmin',
            color: '#ff7bb0',
            margin: '1cqmin 0',
            textShadow: '0 0 3cqmin rgba(255,123,176,.8)',
          }}
        >
          &amp;
        </span>
        <span
          className="relative font-sans font-bold uppercase leading-none"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '24cqmin',
            letterSpacing: '-0.02em',
            ...gradientText('linear-gradient(90deg, #ff7bb0 0%, #ffe9a8 100%)'),
            filter: 'drop-shadow(0 0 2cqmin rgba(255,233,168,.45))',
          }}
        >
          Proud
        </span>
        <span
          className="relative mt-[4cqmin] font-mono uppercase"
          style={{ fontSize: '3.2cqmin', letterSpacing: '0.45em', color: 'rgba(246,239,230,.75)' }}
        >
          Seoul Indie Night · vol.12
        </span>
      </div>
    ),
  },

  // ── 11 · Hongdae Garage Sessions — 뜨거운 오렌지, 검정 굵은 글자, 테이프 띠 ─────
  '11': {
    render: () => (
      <div
        className="absolute inset-0 flex flex-col items-start justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #ffb84d 0%, #ff8a5c 55%, #ff6f9c 100%)',
          padding: '0 9cqmin',
        }}
      >
        {/* 테이프 띠 — 대각선으로 지나가는 반복 문구 */}
        <span
          aria-hidden
          className="absolute whitespace-nowrap font-mono uppercase"
          style={{
            left: '-20%',
            top: '18%',
            width: '160%',
            transform: 'rotate(-14deg)',
            background: '#1d1a24',
            color: '#ffe9a8',
            fontSize: '3.4cqmin',
            letterSpacing: '0.3em',
            padding: '1.1cqmin 0',
            textAlign: 'center',
          }}
        >
          garage sessions • live • garage sessions • live • garage sessions • live •
        </span>
        <span
          className="relative leading-[0.92] font-bold"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '17cqmin',
            letterSpacing: '-0.035em',
            color: '#1d1a24',
            marginTop: '6cqmin',
          }}
        >
          Plug in.
        </span>
        <span
          className="relative leading-[0.92] font-bold italic"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '17cqmin',
            letterSpacing: '-0.035em',
            color: '#fff6e6',
            textShadow: '0.6cqmin 0.6cqmin 0 #1d1a24',
          }}
        >
          Turn up.
        </span>
        <span
          className="relative mt-[3cqmin] font-mono"
          style={{ fontSize: '3cqmin', letterSpacing: '0.35em', color: '#1d1a24' }}
        >
          HONGDAE · CLUB FF
        </span>
      </div>
    ),
  },

  // ── 4 · Busan Wave Festival — 노을, 파랑 그라디언트 WAVE, 물결 밑줄 ─────────
  '4': {
    render: () => (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #ffd1dc 0%, #ffe9a8 48%, #6cc4f5 100%)',
        }}
      >
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: '34cqmin',
            height: '34cqmin',
            top: '12%',
            right: '14%',
            background: '#ffb84d',
            boxShadow: '0 0 8cqmin rgba(255,184,77,.65)',
          }}
        />
        <span
          className="relative font-sans font-medium uppercase"
          style={{ fontSize: '4.2cqmin', letterSpacing: '0.5em', color: '#1d4f7a' }}
        >
          Ride the
        </span>
        <span
          className="relative font-bold uppercase leading-none"
          style={{
            fontFamily: 'Montserrat, "DM Sans", sans-serif',
            fontSize: '30cqmin',
            letterSpacing: '-0.04em',
            transform: 'skewY(-6deg)',
            ...gradientText('linear-gradient(180deg, #2d8fd6 0%, #0b4f8f 100%)'),
            filter: 'drop-shadow(0 1cqmin 0 rgba(255,255,255,.7))',
          }}
        >
          Wave
        </span>
        {/* 물결 밑줄 */}
        <svg
          aria-hidden
          viewBox="0 0 200 20"
          style={{ width: '62cqmin', height: '6cqmin', marginTop: '1cqmin' }}
        >
          <path
            d="M0 10 q12.5 -9 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="relative mt-[2cqmin] font-mono uppercase"
          style={{ fontSize: '3cqmin', letterSpacing: '0.4em', color: '#1d4f7a' }}
        >
          Busan · Haeundae
        </span>
      </div>
    ),
  },

  // ── 21 · Winter Acoustic Round — 밤하늘, 가늘고 조용한 소문자, 눈 ────────────
  '21': {
    render: () => (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(255,255,255,.9) 0 0.6cqmin, transparent 0.7cqmin), radial-gradient(circle at 70% 30%, rgba(255,255,255,.8) 0 0.45cqmin, transparent 0.55cqmin), radial-gradient(circle at 85% 70%, rgba(255,255,255,.7) 0 0.5cqmin, transparent 0.6cqmin), radial-gradient(circle at 35% 80%, rgba(255,255,255,.7) 0 0.4cqmin, transparent 0.5cqmin), radial-gradient(circle at 55% 8%, rgba(255,255,255,.6) 0 0.35cqmin, transparent 0.45cqmin), linear-gradient(180deg, #16204a 0%, #2c3a75 60%, #3e4f8f 100%)',
        }}
      >
        <span
          className="relative leading-none lowercase"
          style={{
            fontFamily: 'Inter, "DM Sans", sans-serif',
            fontWeight: 300,
            fontSize: '13cqmin',
            letterSpacing: '-0.02em',
            color: '#f6efe6',
            textShadow: '0 0 4cqmin rgba(246,239,230,.35)',
          }}
        >
          quiet,
        </span>
        <span
          className="relative leading-none lowercase"
          style={{
            fontFamily: 'Inter, "DM Sans", sans-serif',
            fontWeight: 300,
            fontSize: '13cqmin',
            letterSpacing: '-0.02em',
            color: 'rgba(246,239,230,.6)',
            margin: '1.5cqmin 0',
          }}
        >
          but
        </span>
        <span
          className="relative leading-none lowercase"
          style={{
            fontFamily: 'Inter, "DM Sans", sans-serif',
            fontWeight: 600,
            fontSize: '15cqmin',
            letterSpacing: '-0.03em',
            ...gradientText('linear-gradient(90deg, #ffb84d 0%, #ff9db8 100%)'),
            filter: 'drop-shadow(0 0 3cqmin rgba(255,184,77,.45))',
          }}
        >
          warm.
        </span>
        <span
          className="relative mt-[5cqmin] font-mono uppercase"
          style={{ fontSize: '3cqmin', letterSpacing: '0.45em', color: 'rgba(246,239,230,.7)' }}
        >
          Winter Acoustic Round
        </span>
      </div>
    ),
  },
}

interface Props {
  seed: SloganId
  /** `Poster`의 종횡비 클래스 */
  aspect: string
  className?: string
  label?: string
}

export function SloganPoster({ seed, aspect, className = '', label }: Props) {
  const spec = SLOGANS[seed]
  return (
    <div
      role="img"
      aria-label={label}
      className={`@container ${aspect} relative w-full overflow-hidden ${className}`}
    >
      {spec.render()}
    </div>
  )
}
