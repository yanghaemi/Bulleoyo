/**
 * 지갑이 **서명·조회를 받을 수 있는 상태인지** 마운트에서 미리 확인하는 훅(D-77).
 *
 * 정본 — 화면설계 v7 §5.14 지갑 서명 단계 · 기술 스택 v3 §3.2(지갑 SDK는 어댑터 뒤에만)
 *
 * ## 왜 필요한가
 * 로그인 화면은 `warmUp()`(초기화 + 캐시 세션 복원 대기)이 끝날 때까지 버튼을 잠근다(D-73).
 * 그런데 **서명 화면(P-03 보증금 · P-06 규칙 동의)에는 그 게이트가 없었다.** 화면 진입 직후
 * 누르면 `restored()`는 끝났어도 wallet-services 쪽이 아직 계정을 못 주고 `eth_accounts`가
 * **빈 배열**로 와서, 어댑터가 `null` → 호출부가 `NOT_CONNECTED`("did not provide an account")로
 * 떨어졌다. 사용자에게는 "짧게 실패 문구가 뜨고 버튼이 되살아남"으로 보여 3~4번 눌러야
 * 서명 팝업이 떴다(9/21 dev 재현).
 *
 * 그래서 기다림을 클릭이 아니라 **마운트**에 둔다. 클릭 핸들러에서 기다리면 사용자 활성화가
 * 만료돼 팝업이 아예 안 뜬다(어댑터 `connectSocial`·`restored` 주석).
 *
 * ## 계약을 어댑터에 넣지 않은 이유
 * 재시도는 **화면 사정**이다. `getAddress()`의 계약은 "세션이 없으면 null, 물어보다 실패하면
 * 던진다"이고(리허설 2 D-64) 거기에 재시도를 넣으면 "연결 없음"을 확인하려는 모든 호출이
 * 수 초 느려진다. 그래서 짧은 재시도는 이 훅이 한다.
 *
 * ## 준비가 끝나지 않아도 버튼은 연다
 * 상한까지 주소를 못 받으면 `ready`를 그냥 켠다. 영구 비활성 버튼은 원인을 숨긴다 — 눌러서
 * 기존 실패 문구(`WALLET_NOT_READY`)를 보는 쪽이 낫다. 그 판정을 `addressUnavailable`로 알린다.
 */

import { useEffect, useState } from 'react'

/**
 * 이 훅이 쓰는 어댑터 표면만. 두 메서드를 **선택**으로 둔 이유 —
 * 테스트 더블·미구현 어댑터(`KaiaWalletAdapter` 예정)가 들어와도 화면을 잠그지 않아야 한다.
 */
export interface WalletReadyAdapter {
  warmUp?: () => Promise<void>
  getAddress?: () => Promise<string | null>
}

export interface UseWalletReadyOptions {
  /**
   * 주소가 나올 때까지 기다리는가.
   *
   * 서명 화면은 `true`. **로그인 화면(C-01)은 `false`여야 한다** — 로그인 전에는 세션이 없어
   * 주소가 영영 안 나오고, 기다리면 상한(기본 3.2초)만큼 소셜 버튼이 잠긴다.
   */
  requireAddress?: boolean
  /** 주소 조회 시도 횟수 상한 */
  attempts?: number
  /** 시도 사이 간격(ms) */
  retryDelayMs?: number
}

export interface WalletReadyState {
  /** 버튼을 열어도 되는가. `false`면 화면이 "지갑을 준비하고 있어요…"를 보인다 */
  ready: boolean
  /** 상한까지 주소를 못 받았다 — 버튼은 열려 있고, 클릭 경로가 원인을 말한다 */
  addressUnavailable: boolean
}

/** 기본 상한 8회 × 400ms = 3.2초. 리허설 2에서 관찰된 준비 지연(1~2초)보다 넉넉하게 둔다 */
const DEFAULT_ATTEMPTS = 8
const DEFAULT_RETRY_DELAY_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function useWalletReady(
  adapter: WalletReadyAdapter | null | undefined,
  options: UseWalletReadyOptions = {},
): WalletReadyState {
  const {
    requireAddress = false,
    attempts = DEFAULT_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options
  // 예열을 지원하지 않는 어댑터(테스트 더블 등)는 기다릴 것이 없다 — 처음부터 준비됨
  const [ready, setReady] = useState(() => !adapter || typeof adapter.warmUp !== 'function')
  const [addressUnavailable, setAddressUnavailable] = useState(false)

  useEffect(() => {
    if (!adapter || typeof adapter.warmUp !== 'function') {
      setReady(true)
      setAddressUnavailable(false)
      return
    }
    let active = true
    setReady(false)
    setAddressUnavailable(false)

    const warmUp = adapter.warmUp.bind(adapter)
    const getAddress = adapter.getAddress?.bind(adapter)

    void (async () => {
      // 계약상 `warmUp`은 던지지 않지만 여기서도 삼킨다 — 예열 실패가 화면을 잠그면 안 된다
      await warmUp().catch(() => undefined)
      if (!active) return
      if (!requireAddress || !getAddress) {
        setReady(true)
        return
      }
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        let address: string | null = null
        try {
          address = await getAddress()
        } catch {
          /*
           * 조회 자체가 실패했다(RPC 오류·레이트 리밋). 재시도해도 같은 실패일 가능성이 크고,
           * 원인을 아는 것은 클릭 경로다 — 여기서 더 붙잡지 않고 버튼을 연다.
           * 메시지·주소는 남기지 않는다(스택 v3 §3.2) — 어댑터가 이미 한 줄 남겼다.
           */
          if (active) setReady(true)
          return
        }
        if (!active) return
        if (address) {
          setReady(true)
          return
        }
        // 빈 배열이었다 — 아직 준비 중이다. 마지막 시도 뒤에는 기다리지 않는다
        if (attempt < attempts - 1) await delay(retryDelayMs)
        if (!active) return
      }
      setReady(true)
      setAddressUnavailable(true)
    })()

    return () => {
      active = false
    }
  }, [adapter, attempts, requireAddress, retryDelayMs])

  return { ready, addressUnavailable }
}
