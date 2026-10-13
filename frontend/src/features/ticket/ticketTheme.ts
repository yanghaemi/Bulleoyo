/**
 * 공연별 티켓 테마색.
 *
 * ── 왜 런타임 계산인가 ─────────────────────────────────────────────
 * 디자인 토큰(`14_디자인_토큰_v1.md`)에는 "공연마다 다른 색"이 없다. 있을 수도 없다 —
 * 공연은 데이터고 토큰은 고정값이다. 실물 티켓이 공연마다 다른 색인 이유는 그 공연의
 * 포스터에서 색을 가져오기 때문이고, 우리도 같은 방식으로 만든다. **토큰이 정하지 못하는
 * 값만** 여기서 만들고, 나머지(글자·배지·모서리)는 전부 토큰을 쓴다.
 *
 * 결과는 `--tk-hue` / `--tk-a` / `--tk-b` 세 CSS 변수로 요소에 인라인 주입한다.
 * 시각 결정(그라디언트 각도·광택·전환 시간)은 `styles/fx-ticket.css`가 갖고, 여기는 **색만** 만든다.
 *
 * ── 대비를 코드가 지킨다 ───────────────────────────────────────────
 * 포스터 색을 그대로 쓰면 노란 포스터에서 흰 글자가 사라진다. 그래서 명도를 "원하는 값"이
 * 아니라 **WCAG 상대 휘도로 역산한 상한**으로 자른다(`maxLightness`). hue마다 상한이
 * 다르므로(같은 명도라도 노랑이 파랑보다 3배 밝다) 공식 대신 이분 탐색으로 구한다.
 *
 *   · a(본문이 놓이는 진한 바탕) — 흰 글자 대비 **4.8:1** 이상. 기준 4.5가 아니라 4.8인 이유는
 *     이 위에 광택 띠(흰색 알파 ≤12%)가 지나가면서 휘도를 조금 올리기 때문이다. 여유분이다.
 *   · b(밝은 하이라이트) — **3.0:1** 이상. 큰 글자 기준선이다. b는 그라디언트의 먼 쪽 끝이라
 *     본문이 놓이지 않지만, 스텁의 티켓번호가 걸칠 수 있어 큰 글자 하한은 지킨다.
 *
 * 노랑·청록 계열은 이 상한 때문에 원하는 명도(55~65%)까지 못 올라가 그라디언트가 밋밋해진다.
 * 그건 감수한다 — 읽히지 않는 예쁜 티켓보다 밋밋하고 읽히는 티켓이 낫다.
 *
 * ── 폴백은 결정적이다 ─────────────────────────────────────────────
 * 포스터가 cross-origin(picsum)이면 canvas가 오염돼 `getImageData`가 던진다. 없거나 실패하면
 * `performanceId` 해시로 hue를 정한다 — **같은 공연은 언제나 같은 색**이어야 새로고침·재진입에
 * 색이 바뀌지 않는다(포스터가 seed로 그림을 고르는 것과 같은 규칙, `shared/ui/Poster`).
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

export interface TicketTheme {
  /** 0~359. CSS에서 `hsl(var(--tk-hue) …)`로 파생색을 만들 때 쓴다 */
  hue: number
  /** 진한 바탕 — 흰 글자가 놓이는 쪽 */
  a: string
  /** 밝은 하이라이트 — 그라디언트의 먼 쪽 끝 */
  b: string
}

/* ────────────────────────────── 색공간 ────────────────────────────── */

/** HSL(0~360, 0~100, 0~100) → sRGB 0~1 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = ln - c / 2
  const seg: [number, number, number] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  return [seg[0] + m, seg[1] + m, seg[2] + m]
}

/** sRGB 0~1 → HSL(0~360, 0~100, 0~100) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s * 100, l * 100]
}

/** WCAG 2.1 상대 휘도. sRGB 채널을 선형화해 가중합한다 */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** 흰색(휘도 1)과의 대비비. WCAG 공식 `(L1+.05)/(L2+.05)` */
function contrastWithWhite(luminance: number): number {
  return 1.05 / (luminance + 0.05)
}

/**
 * 흰 글자가 `minRatio`를 만족하는 **최대 명도(%)**.
 *
 * 휘도는 명도에 대해 단조증가라 이분 탐색이 성립한다. hue·채도별 역함수를 따로 두지 않는
 * 이유 — 공식으로 풀면 hue 구간마다(빨강/노랑/파랑) 식이 갈라지는데, 18회 이분 탐색이면
 * 0.001% 이하로 수렴하고 읽기도 쉽다. 카드 한 장에 한 번 도는 계산이라 비용도 없다.
 */
function maxLightness(hue: number, sat: number, minRatio: number): number {
  let lo = 0
  let hi = 100
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2
    const [r, g, b] = hslToRgb(hue, sat, mid)
    if (contrastWithWhite(relativeLuminance(r, g, b)) >= minRatio) lo = mid
    else hi = mid
  }
  return lo
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 대비 하한 — 위 헤더 주석의 4.8 / 3.0 */
const RATIO_A = 4.8
const RATIO_B = 3.0

/**
 * hue·채도 → 티켓 테마.
 *
 * `jitter`(0~1)는 같은 계열 공연끼리 명도가 똑같아 보이지 않게 하는 흔들림이다.
 * 해시에서 오므로 공연마다 고정된다.
 */
function buildTheme(hue: number, sat: number, jitter: number): TicketTheme {
  const h = Math.round(((hue % 360) + 360) % 360)
  // 채도는 55~65%로 못 박는다 — 포스터가 형광색이면 눈이 아프고, 흑백이면 티켓이 회색이 된다
  const s = clamp(sat, 55, 65)

  const aWanted = 28 + jitter * 8 // 28~36%
  const a = clamp(Math.min(aWanted, maxLightness(h, s, RATIO_A)), 18, 36)

  const bWanted = 55 + jitter * 10 // 55~65%
  // 상한이 먼저다. 하한(a+12)은 상한을 넘지 못한다 — 넘기면 글자가 안 읽힌다
  const bCap = maxLightness(h, s, RATIO_B)
  const b = clamp(Math.min(bWanted, bCap), Math.min(a + 12, bCap), 68)

  const round = (v: number) => Math.round(v * 10) / 10
  return {
    hue: h,
    a: `hsl(${h} ${round(s)}% ${round(a)}%)`,
    b: `hsl(${h} ${round(s)}% ${round(b)}%)`,
  }
}

/* ─────────────────────────── 시드 폴백 ─────────────────────────── */

/**
 * 문자열 → 안정적인 정수.
 *
 * `shared/ui/Poster`의 것과 같은 알고리즘이다. 일부러 복사했다 — 그 쪽은 export하지 않고,
 * 여기서 export를 요구해 공용 유틸로 끌어올리면 "포스터 그림"과 "티켓 색"이 한 함수에
 * 묶여 한쪽을 바꾸면 다른 쪽이 따라 바뀐다. 지금은 **같은 seed로 같은 결과**만 지키면 된다.
 */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** 포스터를 못 읽을 때. 공연 ID만으로 정해지므로 새로고침해도 같은 색이다 */
export function seedTicketTheme(performanceId: string): TicketTheme {
  const n = hash(performanceId)
  // 137.508°(황금각) 간격 — 인접한 ID끼리 색이 비슷해지지 않는다
  const hue = (n * 137.508) % 360
  return buildTheme(hue, 58 + (n % 7), ((n >> 5) % 100) / 100)
}

/* ──────────────────────── 포스터에서 뽑기 ──────────────────────── */

const SAMPLE = 32
const HUE_BINS = 24 // 15°씩

/**
 * 32×32로 줄여 그린 뒤 **가장 무거운 hue 구간**을 고른다.
 *
 * 단순 평균을 쓰지 않는 이유 — 보색이 섞인 포스터에서 평균은 회색으로 수렴한다.
 * 채도를 가중치로 15° 구간에 나눠 담고, 가장 무거운 구간 안에서 원형 평균을 낸다.
 * 회색·검정·흰색 픽셀(채도 <18%, 명도 <12% 또는 >92%)은 애초에 담지 않는다 —
 * 포스터 배경의 검은 여백이 hue를 흔들면 안 된다.
 *
 * canvas가 오염됐으면(cross-origin) `getImageData`가 던진다 → `null`을 돌려주고 시드로 간다.
 */
function analyze(img: HTMLImageElement): { hue: number; sat: number } | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)

    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)
    const weight = new Array<number>(HUE_BINS).fill(0)
    const sumSin = new Array<number>(HUE_BINS).fill(0)
    const sumCos = new Array<number>(HUE_BINS).fill(0)
    const sumSat = new Array<number>(HUE_BINS).fill(0)
    let total = 0

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue // 투명 픽셀
      const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
      if (s < 18 || l < 12 || l > 92) continue
      const bin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS
      const w = s / 100
      const rad = (h * Math.PI) / 180
      weight[bin] += w
      sumSin[bin] += Math.sin(rad) * w
      sumCos[bin] += Math.cos(rad) * w
      sumSat[bin] += s * w
      total += w
    }

    /*
     * 무채색 포스터 판정 (2026-09-09 수정).
     *
     * 처음엔 "유채색 가중치가 전체 픽셀의 8% 미만이면 포기"였다. 그런데 이 문턱이
     * **너무 높아서 색이 있는 포스터를 버리고 있었다.** 실측(32×32 샘플, 유채색 가중 합 / 픽셀 수):
     *   IU   The Golden Hour      0.269  → 통과, hue 6 (붉은 금색). 맞다
     *   BTS  Yet To Come          0.461  → 통과, hue 237 (푸른 보라). 맞다
     *   aespa SYNK Parallel Line  0.038  → **탈락**, 시드 해시로 떨어져 초록이 나왔다
     * aespa 포스터는 흑백 사진에 푸른 조명이 얹힌 구성이라 유채색 면적이 원래 작다. 그런데
     * 그 작은 부분의 hue는 215(파랑)로 뚜렷하고 포스터 인상과도 맞았다. 면적이 작다는 것이
     * "색이 없다"는 뜻은 아니다 — 버려야 할 것은 **우세한 색조가 없는** 포스터다.
     *
     * 그래서 판정을 둘로 나눈다:
     *   ① 유채색이 사실상 0인가 (2% 미만) — 완전한 흑백 포스터
     *   ② 유채색은 있는데 방향이 흩어져 있는가 (최다 bin이 유채색의 30% 미만)
     * 위 셋의 ②는 0.44 / 0.46 / 0.53으로 전부 여유 있게 통과한다.
     */
    if (total < SAMPLE * SAMPLE * 0.02) return null

    let best = 0
    for (let i = 1; i < HUE_BINS; i += 1) if (weight[i] > weight[best]) best = i
    if (weight[best] < total * 0.3) return null

    const hue = (Math.atan2(sumSin[best], sumCos[best]) * 180) / Math.PI
    return { hue: (hue + 360) % 360, sat: sumSat[best] / weight[best] }
  } catch {
    // SecurityError(tainted canvas) 포함. 색은 부가 정보라 실패해도 조용히 시드로 간다
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 같은 출처인가. 다른 출처는 어차피 canvas가 오염되므로 **내려받지도 않는다** */
function sameOrigin(src: string): boolean {
  try {
    return new URL(src, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * 분석 대상 후보. `Poster`의 폴백 체인 중 **같은 출처인 것만** 골라 순서를 맞춘다
 * (① API 이미지 → ② `/posters/{id}.webp` → `.jpg`). picsum(③)은 cross-origin이라 제외한다.
 * ⚠ `Poster`의 후보 순서와 **같아야 한다** — 다르면 화면에 뜬 그림과 색을 뽑은 그림이 달라진다.
 * 2026-09-09에 실제로 그랬다: 포스터를 webp로 갈았는데 여기는 jpg만 봐서 전부 404 → 시드 색(초록)으로
 * 떨어졌고, aespa·BTS 티켓이 포스터와 무관한 초록으로 나왔다.
 */
function candidates(performanceId: string, posterSrc?: string | null): string[] {
  const list: string[] = []
  if (posterSrc && sameOrigin(posterSrc)) list.push(posterSrc)
  list.push(`/posters/${encodeURIComponent(performanceId)}.webp`)
  list.push(`/posters/${encodeURIComponent(performanceId)}.jpg`)
  return list
}

/** 공연당 한 번만 계산한다. 목록↔상세를 오갈 때 다시 그리지 않는다 */
const cache = new Map<string, TicketTheme>()
/** 같은 공연 카드가 두 장이면 이미지도 한 번만 읽는다 */
const inflight = new Map<string, Promise<TicketTheme>>()

async function resolveTheme(
  performanceId: string,
  posterSrc?: string | null,
): Promise<TicketTheme> {
  const cached = cache.get(performanceId)
  if (cached) return cached
  const running = inflight.get(performanceId)
  if (running) return running

  const job = (async () => {
    for (const src of candidates(performanceId, posterSrc)) {
      const img = await loadImage(src)
      if (!img) continue
      const found = analyze(img)
      if (found) return buildTheme(found.hue, found.sat, ((hash(performanceId) >> 5) % 100) / 100)
    }
    return seedTicketTheme(performanceId)
  })()

  inflight.set(performanceId, job)
  const theme = await job
  cache.set(performanceId, theme)
  inflight.delete(performanceId)
  return theme
}

/**
 * 티켓 테마 훅.
 *
 * **처음 렌더에 이미 색이 있다** — 시드 폴백을 즉시 돌려주고, 포스터 분석이 끝나면 갱신한다.
 * 그래서 회색이 잠깐 보였다가 색이 들어오는 깜빡임이 없다. 갱신 순간의 색 전환(400ms)은
 * `styles/fx-ticket.css`가 `@property`로 등록한 `--tk-a`/`--tk-b`를 보간해서 처리한다 —
 * JS는 변수 값만 바꾼다.
 */
export function useTicketTheme(performanceId: string, posterSrc?: string | null): TicketTheme {
  const [theme, setTheme] = useState<TicketTheme>(
    () => cache.get(performanceId) ?? seedTicketTheme(performanceId),
  )

  // ⚠ **id가 바뀐 그 렌더에서 색을 갈아 끼운다**(MR !61 자동 리뷰 지적).
  // 아래 이펙트에서만 갱신하면, id가 A→B로 바뀐 렌더에서 이 훅이 **아직 A의 색**을 돌려준다.
  // 그 값을 보고 배경을 칠하는 `useShowBackdrop`은 "포스터에서 뽑은 색"으로 판정해
  // **A의 색을 넣고 B의 것이라고 기록**해 버린다 — 그러면 B 화면에 A 색이 그대로 남는다.
  // 렌더 중 setState는 같은 컴포넌트의 상태를 props 변화에 맞추는 정식 패턴이다.
  // React가 커밋 전에 이 함수를 다시 돌리므로 첫 패스의 반환값(옛 색)은 버려진다.
  const [seenId, setSeenId] = useState(performanceId)
  if (seenId !== performanceId) {
    setSeenId(performanceId)
    setTheme(cache.get(performanceId) ?? seedTicketTheme(performanceId))
  }

  useEffect(() => {
    const cached = cache.get(performanceId)
    if (cached) {
      setTheme(cached)
      return
    }
    setTheme(seedTicketTheme(performanceId))
    // SSR·jsdom에는 canvas가 없다. 시드 색으로 끝낸다
    if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return

    let alive = true
    void resolveTheme(performanceId, posterSrc).then((next) => {
      if (alive) setTheme(next)
    })
    return () => {
      alive = false
    }
  }, [performanceId, posterSrc])

  return theme
}

/**
 * 테마를 CSS 변수로 옮긴다.
 *
 * 2026-09-08 재디자인 전에는 여기서 카드 전체에 a→b 그라디언트를 깔았다. 지금 티켓은
 * 종이(`surface`) 위에 포스터가 색을 내는 구조라 바탕색을 칠하지 않는다 — 대표색은
 * 컴포넌트가 세 자리(세로 띠·날짜 점·스텁 틴트)에만 `var(--tk-accent, var(--tk-a))`로 쓴다.
 * 밝은 바탕에서는 a(진함), 어두운 바탕에서는 b(밝음)가 강조색이고 그 선택은 `fx-ticket.css`가 한다.
 */
export function ticketThemeStyle(theme: TicketTheme): CSSProperties {
  return {
    '--tk-hue': String(theme.hue),
    '--tk-a': theme.a,
    '--tk-b': theme.b,
  } as CSSProperties
}
