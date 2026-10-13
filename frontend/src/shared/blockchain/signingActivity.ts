/**
 * 서명 진행 신호 — "서명하는 느낌" 오버레이(`app/SigningOverlay`)를 켜고 끄는 모듈 스토어.
 *
 * 화면마다 오버레이를 붙이지 않고 **서명 경로의 공용 지점 세 곳**이 신호를 낸다.
 *   1. `Web3AuthWalletAdapter.signTransaction` — 지갑 확인 구간(`beginWalletPrompt`)
 *   2. signed-tx 보고 뮤테이션(결제·보증금·동의) — 보고 구간(`trackSignedTxReport`)
 *   3. `useChainJob` — 보고가 맡긴 job의 확정 대기 구간(`claimSigningJob`·`releaseSigningJob`)
 *
 * ─────────────────────────── 표시 규칙 ───────────────────────────
 * - **처리 구간(processing > 0)** 이면 보인다. 서명을 마친 뒤 서버 보고~확정 대기다.
 * - **지갑 확인 구간만으로는 켜지 않는다.** 지갑 확인 창(Web3Auth z-index 99999)이 뜨는 동안
 *   우리 화면이 먼저 덮이면 사용자는 창이 안 뜬 줄 안다. 단 연속 서명(APPROVE→PURCHASE)에서
 *   이미 보이는 중이면 닫지 않고 **비차단 모드**(`walletPrompt: true`)로 이어 간다 — 깜빡임 방지.
 * - 카운터가 0이 되면 `HIDE_GRACE_MS` 뒤에 닫는다. 확정 콜백 → 다음 서명 시작 사이의 틈(마이크로태스크
 *   ~수백 ms)에서 닫혔다 다시 열리지 않게 하려는 유예다.
 * - 안전장치: 보인 지 `MAX_VISIBLE_MS`가 지나면 전부 비운다(`reset`). 오버레이가 라우트 이동·
 *   언마운트 때도 `reset`을 부른다. 해제 함수는 세대(generation) 번호를 들고 있어 `reset` 뒤에
 *   늦게 불려도 새 카운터를 깎지 않는다.
 *
 * ⚠ 이 스토어는 `senderSignedRlp`·주소·서명값을 받지 않는다. jobId(서버 공개 식별자)만 다룬다.
 *
 * 대안: React Context — 신호를 내는 곳 셋 중 둘(어댑터 클래스·뮤테이션 함수)이 컴포넌트 밖이라
 * 쓸 수 없다. Zustand는 스택 금지 목록이다. 그래서 `toastStore`와 같은 외부 스토어 + `useSyncExternalStore`.
 */

import { useSyncExternalStore } from 'react'

/** 카운터가 0이 된 뒤 닫기까지의 유예. 연속 서명 사이 틈을 메운다. */
export const HIDE_GRACE_MS = 400
/** 최대 표시 시간. 무엇이 해제를 빠뜨려도 이 시간 뒤에는 반드시 닫힌다. */
export const MAX_VISIBLE_MS = 60_000
/** 보고가 맡긴 job을 `useChainJob`이 이 시간 안에 받아 가지 않으면 스스로 놓는다. */
export const UNCLAIMED_JOB_MS = 8_000

export interface SigningActivitySnapshot {
  /** 오버레이를 그린다 */
  visible: boolean
  /** 지갑 확인 창이 떠 있을 수 있는 구간 — 오버레이는 비차단·반투명으로 물러선다 */
  walletPrompt: boolean
}

const HIDDEN: SigningActivitySnapshot = { visible: false, walletPrompt: false }

let snapshot: SigningActivitySnapshot = HIDDEN
let processing = 0
let wallet = 0
let generation = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null
let capTimer: ReturnType<typeof setTimeout> | null = null

interface HeldJob {
  release: () => void
  claimTimer: ReturnType<typeof setTimeout> | null
  pendingRelease: ReturnType<typeof setTimeout> | null
}
const heldJobs = new Map<string, HeldJob>()
const listeners = new Set<() => void>()

function publish(next: SigningActivitySnapshot): void {
  if (next.visible === snapshot.visible && next.walletPrompt === snapshot.walletPrompt) return
  snapshot = next
  for (const listener of listeners) listener()
}

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function clearCapTimer(): void {
  if (capTimer !== null) {
    clearTimeout(capTimer)
    capTimer = null
  }
}

function recompute(): void {
  if (processing > 0) {
    clearHideTimer()
    if (capTimer === null) capTimer = setTimeout(resetSigningActivity, MAX_VISIBLE_MS)
    publish({ visible: true, walletPrompt: false })
    return
  }
  if (!snapshot.visible) return
  if (wallet > 0) {
    // 이미 보이는 중에 다음 서명 창이 열렸다 — 닫지 않고 비차단으로 이어 간다
    clearHideTimer()
    publish({ visible: true, walletPrompt: true })
    return
  }
  if (hideTimer !== null) return
  hideTimer = setTimeout(() => {
    hideTimer = null
    if (processing > 0 || wallet > 0) return
    clearCapTimer()
    publish(HIDDEN)
  }, HIDE_GRACE_MS)
}

/** 한 번만 깎는 해제 함수. `reset` 뒤의 늦은 호출은 무시한다. */
function counterRelease(decrement: () => void): () => void {
  const born = generation
  let done = false
  return () => {
    if (done) return
    done = true
    if (born !== generation) return
    decrement()
    recompute()
  }
}

/**
 * 지갑 확인 구간 시작. **동기 함수다** — 서명 호출 앞에 await를 만들지 않는다(사용자 활성화 보존).
 * 반환 함수를 `finally`에서 부른다.
 */
export function beginWalletPrompt(): () => void {
  wallet += 1
  recompute()
  return counterRelease(() => {
    wallet = Math.max(0, wallet - 1)
  })
}

/** 처리 구간 시작(서명 완료 뒤 보고·확정 대기). 반환 함수를 `finally`에서 부른다. */
export function beginSigningProcessing(): () => void {
  processing += 1
  recompute()
  return counterRelease(() => {
    processing = Math.max(0, processing - 1)
  })
}

/** 202로 받은 job의 확정 대기를 붙잡는다. `useChainJob`이 받아 가서 종단 상태에 놓는다. */
export function holdSigningJob(jobId: string): void {
  if (!jobId || heldJobs.has(jobId)) return
  const held: HeldJob = {
    release: beginSigningProcessing(),
    claimTimer: null,
    pendingRelease: null,
  }
  held.claimTimer = setTimeout(() => releaseSigningJobNow(jobId), UNCLAIMED_JOB_MS)
  heldJobs.set(jobId, held)
}

/** `useChainJob`이 이 job을 지켜보기 시작했다. 붙잡힌 job이 아니면 아무것도 하지 않는다. */
export function claimSigningJob(jobId: string): void {
  const held = heldJobs.get(jobId)
  if (!held) return
  if (held.claimTimer !== null) {
    clearTimeout(held.claimTimer)
    held.claimTimer = null
  }
  if (held.pendingRelease !== null) {
    clearTimeout(held.pendingRelease)
    held.pendingRelease = null
  }
}

/** 종단 상태·폴링 상한 — 곧바로 놓는다. */
export function releaseSigningJobNow(jobId: string): void {
  const held = heldJobs.get(jobId)
  if (!held) return
  heldJobs.delete(jobId)
  if (held.claimTimer !== null) clearTimeout(held.claimTimer)
  if (held.pendingRelease !== null) clearTimeout(held.pendingRelease)
  held.release()
}

/**
 * 감시 중단(언마운트·jobId 교체) — 한 틱 뒤에 놓는다. StrictMode의 effect 이중 실행(정리 → 재실행)
 * 사이에 놓아 버리면 개발 모드에서 오버레이가 켜지자마자 꺼진다. 재실행의 `claim`이 취소한다.
 */
export function releaseSigningJob(jobId: string): void {
  const held = heldJobs.get(jobId)
  if (!held || held.pendingRelease !== null) return
  held.pendingRelease = setTimeout(() => releaseSigningJobNow(jobId), 0)
}

/**
 * signed-tx 보고를 처리 구간으로 감싼다. 성공하면 받은 jobId를 확정까지 붙잡는다.
 * 카운터는 hold가 먼저 올라간 뒤 보고분이 내려가므로 0을 거치지 않는다.
 */
export async function trackSignedTxReport<T extends { jobId?: string | null }>(
  send: () => Promise<T>,
): Promise<T> {
  const release = beginSigningProcessing()
  try {
    const accepted = await send()
    if (accepted?.jobId) holdSigningJob(accepted.jobId)
    return accepted
  } finally {
    release()
  }
}

/** 전부 비우고 닫는다. 라우트 이동·최대 표시 시간·오버레이 언마운트. */
export function resetSigningActivity(): void {
  generation += 1
  processing = 0
  wallet = 0
  clearHideTimer()
  clearCapTimer()
  for (const held of heldJobs.values()) {
    if (held.claimTimer !== null) clearTimeout(held.claimTimer)
    if (held.pendingRelease !== null) clearTimeout(held.pendingRelease)
  }
  heldJobs.clear()
  publish(HIDDEN)
}

export function getSigningActivity(): SigningActivitySnapshot {
  return snapshot
}

export function subscribeSigningActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSigningActivity(): SigningActivitySnapshot {
  return useSyncExternalStore(subscribeSigningActivity, getSigningActivity, getSigningActivity)
}
