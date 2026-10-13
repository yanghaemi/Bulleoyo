/**
 * Kaia Kairos 익스플로러 링크 — 화면설계 v6 §5.3.
 *
 * 주소·tx는 축약(`shortenHex`)해 보여주고 탭하면 **새 창**으로 익스플로러를 연다.
 * 사용 화면은 P·M·V 계열뿐이다(관객 화면 A·C에는 노출하지 않는다, §1.2 원칙 11).
 *
 * ⚠ 경로 규칙(`/tx/{hash}`·`/address/{addr}`)은 명세에 **문장으로 적혀 있지 않다.**
 * verify_01의 `releaseTx.explorerUrl`(`…/tx/0x9c1a…`)과 coin_01의
 * `explorerUrl`(`…/address/0x5f1e…`) 예시에서 읽었다. 응답이 완성된 URL을 주는 자리
 * (`releaseTx.explorerUrl`·`CoinSupply.explorerUrl`)에서는 **그 값을 그대로 쓰고** 여기서
 * 조립하지 않는다 — 서버가 준 링크와 화면이 만든 링크가 갈라지면 안 된다.
 *
 * 컴포넌트가 아니라 순수 함수 모듈이다(Fast Refresh 규칙).
 */

/** 끝의 `/`를 지운다 — `explorerBaseUrl`이 슬래시로 끝나도 `//tx`가 되지 않게 */
function trimEnd(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/** tx 해시 익스플로러 URL. `baseUrl`이 비면 링크를 만들지 않는다(빈 문자열) */
export function txUrl(baseUrl: string, txHash: string): string {
  if (!baseUrl || !txHash) return ''
  return `${trimEnd(baseUrl)}/tx/${txHash}`
}

/** 주소 익스플로러 URL. `baseUrl`이 비면 링크를 만들지 않는다(빈 문자열) */
export function addressUrl(baseUrl: string, address: string): string {
  if (!baseUrl || !address) return ''
  return `${trimEnd(baseUrl)}/address/${address}`
}

/**
 * 완성된 익스플로러 URL에서 base를 되뽑는다.
 *
 * coin_01은 `explorerBaseUrl`을 주지 않고 토큰 주소의 **완성 URL**(`…/address/0x…`)만 준다.
 * V-02 전문 항목이 정산 컨트랙트 링크도 요구하는데, 그 주소는 프론트 환경변수에서 온다(§5.3
 * `[팀 9/2]`). 두 링크가 서로 다른 익스플로러를 가리키면 안 되므로 **서버가 준 URL에서**
 * base를 떼어 쓴다 — 화면이 익스플로러 도메인을 직접 적어 두지 않는다.
 *
 * 형태를 못 알아보면 빈 문자열이다(링크를 만들지 않는다).
 */
export function explorerBaseFrom(fullUrl: string): string {
  if (!fullUrl) return ''
  const match = fullUrl.match(/^(https?:\/\/[^/]+)(?:\/.*)?$/)
  return match ? match[1] : ''
}

/**
 * 프론트 환경변수 주소와 응답 주소의 대조 — V-01 컴포넌트 표 `[팀 9/2]`
 * ("주소는 프론트 환경변수 값과 응답값이 같은지 화면에서 대조해 보여준다").
 *
 * 환경변수가 비어 있으면(컨트랙트 배포 전) 대조 자체를 할 수 없으므로 `'unset'`이다 —
 * 이때 "같다"고도 "다르다"고도 말하지 않는다.
 */
export type AddressCheck = 'same' | 'different' | 'unset'

export function compareAddress(responseValue: string, envValue: string): AddressCheck {
  if (!envValue) return 'unset'
  return responseValue.toLowerCase() === envValue.toLowerCase() ? 'same' : 'different'
}
