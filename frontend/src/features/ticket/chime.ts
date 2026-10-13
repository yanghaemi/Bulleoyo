/**
 * 티켓 차임 — 목록에서 티켓을 고를 때 나는 두 음.
 *
 * ── 왜 파일이 아니라 합성인가 ───────────────────────────────────────
 * mp3 하나면 될 일이지만 그 mp3는 ① 저작권 출처를 관리해야 하고 ② 번들에 얹히고
 * ③ 첫 재생에 네트워크를 탄다. 두 음짜리 사인파는 코드 서른 줄이면 만들어지고,
 * 음정·길이·게인을 코드에서 바로 조절할 수 있다. 에셋 대신 규칙을 둔다.
 *
 * ── 소리는 정보가 아니다 ────────────────────────────────────────────
 * 이 소리가 안 나도 화면은 전부 동작한다. 그래서 실패는 전부 조용히 삼킨다 —
 * AudioContext가 없거나(SSR·jsdom·구형), 자동재생 정책에 막히거나, 오디오 장치가 없어도
 * 예외를 위로 던지지 않는다. 소리 때문에 화면 전환이 막히면 그게 더 큰 버그다.
 *
 * ── 3초 규칙 ───────────────────────────────────────────────────────
 * 목록↔상세를 빠르게 오가면 같은 차임이 연달아 울려 금방 피로해진다. 마지막 재생 후
 * 3초 안의 요청은 그냥 무음이다. `prefers-reduced-motion`에서도 소리는 그대로 난다 —
 * 줄여 달라고 한 것은 **움직임**이지 소리가 아니다(전정기관과 청각은 다른 감각이다).
 */

/** 모듈에 하나. 탭마다 AudioContext를 새로 만들면 브라우저 상한(보통 6개)에 걸린다 */
let ctx: AudioContext | null = null
let lastPlayedAt = 0

/** 재생 간 최소 간격 */
const QUIET_MS = 3000

/** E5 → B5. 완전5도 상행이라 "열렸다"로 들린다(하행이면 "닫혔다"가 된다) */
const NOTES = [659.25, 987.77] as const
/** 한 음의 길이. 두 음이 이어져 총 180ms + 여운 ≈ 260ms */
const NOTE_MS = 90
/** 최대 게인. 0.08은 조용한 방에서 들리고 이어폰에서 놀라지 않는 선이다 */
const PEAK = 0.08

/**
 * 한 음.
 *
 * sine 하나면 너무 매끈해 "삐" 소리로 들린다. 같은 음의 triangle을 1/5 세기로 겹쳐
 * 배음을 조금 넣으면 실로폰·차임 쪽 음색이 된다.
 * 감쇠는 exponential이다 — linear로 줄이면 끝에서 "툭" 끊기는 클릭이 들린다.
 */
function tone(audio: AudioContext, freq: number, at: number): void {
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(PEAK, at + 0.008) // 8ms 어택 — 딸깍이지 않을 만큼만
  gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_MS / 1000 + 0.07)
  gain.connect(audio.destination)

  const shapes: [OscillatorType, number][] = [
    ['sine', 1],
    ['triangle', 0.2],
  ]
  for (const [type, mix] of shapes) {
    const osc = audio.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    const sub = audio.createGain()
    sub.gain.setValueAtTime(mix, at)
    osc.connect(sub)
    sub.connect(gain)
    osc.start(at)
    osc.stop(at + NOTE_MS / 1000 + 0.09)
  }
}

/**
 * 차임 재생. **사용자 제스처 안에서 불러야 한다** — 첫 호출이 AudioContext를 만들고
 * `resume()`한다. 클릭 핸들러 밖에서 부르면 브라우저가 suspended 상태로 붙잡아 둔다.
 */
export function playTicketChime(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return

  const now = Date.now()
  if (now - lastPlayedAt < QUIET_MS) return

  try {
    ctx ??= new AudioContext()
    // 백그라운드 탭에서 돌아오면 suspended다. resume은 비동기지만 기다리지 않는다 —
    // 스케줄은 currentTime 기준이라 재개 직후 정상 재생된다
    if (ctx.state === 'suspended') void ctx.resume()

    const start = ctx.currentTime + 0.01 // 스케줄 여유. 0으로 두면 첫 음이 잘린다
    NOTES.forEach((freq, i) => tone(ctx as AudioContext, freq, start + (i * NOTE_MS) / 1000))
    lastPlayedAt = now
  } catch {
    // 자동재생 차단·장치 없음 등. 소리는 부가 정보라 조용히 포기한다
  }
}
