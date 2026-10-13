/**
 * 검표 판정의 소리·진동 피드백.
 *
 * 정본 — 화면설계 v6 §4 S-02 "판정 결과 배지 — 표시와 동시에 소리·진동"(1374행),
 *        "판정 결과는 1초 이내에 색 + 소리 + 진동으로 표시(PERF-03·UX-04)"(1392행)
 *
 * 색 플래시는 화면 컴포넌트가, 소리·진동은 여기가 맡는다. 음원 파일을 두지 않고
 * WebAudio로 짧은 톤을 만든다 — 검표는 오프라인 현장이라 에셋 다운로드에 기대지 않는 편이 낫고,
 * 성공(높은 한 번)·실패(낮은 두 번)를 소리만으로 구분해야 해서 길이·음정을 코드로 정한다.
 *
 * ⚠ 브라우저 자동재생 정책 — `AudioContext`는 **사용자 제스처 이후**에만 소리를 낸다.
 *    스캔은 제스처가 아니므로, 화면 진입 시 스태프가 "스캔 시작"을 한 번 누르는 그 제스처에서
 *    `primeAudio()`를 불러 컨텍스트를 깨워 둔다. 깨우지 못하면 진동·색만 남는다(치명적이지 않다).
 */

export type Verdict = 'ok' | 'fail'

/** 하나만 만들어 재사용한다. 스캔마다 만들면 모바일에서 컨텍스트 상한에 걸린다 */
let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  // Safari는 오래도록 접두사판만 있었다. 없으면 소리를 포기한다(진동·색은 남는다)
  const Ctor = window.AudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/**
 * 사용자 제스처 안에서 불러 오디오 컨텍스트를 깨운다.
 *
 * 자동재생 정책 때문에 이걸 거치지 않으면 첫 판정의 소리가 통째로 묵음이 된다.
 */
export function primeAudio(): void {
  void audioContext()
    ?.resume()
    .catch(() => undefined)
}

/** 짧은 사인파 한 번. `at`은 컨텍스트 기준 시각(초) */
function tone(context: AudioContext, hz: number, at: number, seconds: number): void {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz
  // 딸깍거리는 클릭음이 나지 않게 시작·끝을 램프로 깎는다
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  osc.connect(gain).connect(context.destination)
  osc.start(at)
  osc.stop(at + seconds + 0.02)
}

/**
 * 판정 피드백 — 소리 + 진동.
 *
 * 성공: 880Hz 한 번(120ms) + 진동 60ms
 * 실패: 220Hz 두 번(각 140ms) + 진동 120-80-120ms
 * ⚠ 이 수치는 명세에 없다. "1초 이내"라는 제약과 "성공·실패가 구분돼야 한다"만 명세의 요구이고
 *    구체값은 임의 결정이다. 소리를 못 내는 환경에서도 진동과 색이 남도록 셋을 독립적으로 건다.
 */
export function signalVerdict(verdict: Verdict): void {
  // 진동 — iOS Safari는 지원하지 않는다. 있으면 쓰고 없으면 넘긴다
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(verdict === 'ok' ? 60 : [120, 80, 120])
  }

  const context = audioContext()
  if (!context || context.state !== 'running') return
  const now = context.currentTime
  if (verdict === 'ok') {
    tone(context, 880, now, 0.12)
  } else {
    tone(context, 220, now, 0.14)
    tone(context, 220, now + 0.2, 0.14)
  }
}
