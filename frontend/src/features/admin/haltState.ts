/**
 * 발행량 대사에 따른 **중단 상태** 판정.
 *
 * 정본 — API 명세 v6 `08_coin.yaml` coin_01 `CoinSupply` · 결정 문서 v2 §3.8 불변식 4개
 *
 * ── 왜 따로 있나 (2026-09-10) ────────────────────────────────────────
 * `supplyMatched`를 "전체 대사 결과"로 읽고 그 값 하나로 지급 UI를 막고 있었다. **틀렸다.**
 * 팀 확인 결과 —
 *
 *   · `supplyMatched`는 **불변식 ①·④(총량 대사)만** 본다
 *   · **불변식 ③(정산 재계산)이 어긋나면 `releaseHalted`만 켜지고 `supplyMatched`는 true로 남는다**
 *
 * 그래서 `supplyMatched`로 판단하면 이런 화면이 나온다 —
 *   정산금 지급이 실제로 막혔는데 중단 배너가 뜨지 않고, 불변식 목록도 접힌 채로 있고,
 *   "대사 결과: 일치"라고 적혀 있다. 관리자는 지급이 왜 안 나가는지 알 방법이 없다.
 *
 * **중단 여부는 `mintHalted`·`releaseHalted`를 각각 본다.** `supplyMatched`는 총량 대사
 * 한 줄을 설명할 때만 쓴다. 응답에 그 필드가 따로 있는 이유가 이것이다.
 *
 * (openapi description은 아직 "supplyMatched가 false면 둘 다 중단된다"고 적혀 있다.
 *  백엔드가 다음 MR에서 고치기로 했다. 그 문장을 믿고 코드를 되돌리지 말 것.)
 */

/** 판정에 필요한 만큼만 받는다 — M-03(`CoinSupply`)과 V-02(`SupplyDisclosure`)가 같이 쓴다 */
export interface HaltInput {
  supplyMatched: boolean
  mintHalted: boolean
  releaseHalted: boolean
  invariants: { no: number; matched: boolean }[]
}

export interface HaltState {
  /** 지급 폼을 막을지 — 코인 지급(mint) */
  mintHalted: boolean
  /** 정산금 지급(release)이 멈춰 있는지 */
  releaseHalted: boolean
  /** 배너를 띄울지. **둘 중 하나라도** 막혀 있으면 띄운다 */
  anyHalted: boolean
  /** 대사가 어긋났는지 — 총량(①·④)이든 다른 불변식이든 하나라도 */
  mismatch: boolean
  /** 어긋난 불변식 번호. 배너·요약 줄이 함께 쓴다 */
  brokenNos: number[]
  /**
   * "대사 결과" 요약 줄 문구.
   *
   * ⚠ 번호가 없을 때 문장이 잘리지 않게 여기서 만든다(MR !75 리뷰 지적).
   *   `supplyMatched: false`인데 `invariants`에 `matched: false`가 하나도 없거나 배열이
   *   비어 오면 — 서버가 총량 대사만 실패로 표시하고 항목을 못 채운 경우다 —
   *   화면에는 "불일치 — 깨진 불변식 "처럼 **뒤가 잘린 문장**이 찍혔다.
   *   모르는 것은 모른다고 쓴다. 없는 번호를 지어내지도, 문장을 자르지도 않는다.
   */
  mismatchText: string
  /** 배너 제목. **실제로 막힌 것만** 이름을 부른다 */
  bannerTitle: string
  /** 확인 처리 모달의 부연 — 배너와 같은 대상을 가리켜야 한다 */
  ackNote: string
}

/**
 * 중단된 작업 이름. 둘 다면 둘 다, 하나면 하나만.
 *
 * 배너용은 명세 문구 그대로 영문 이름을 괄호에 함께 적고(§4 M-03 컴포넌트 표 2행),
 * 모달 부연은 한글만 쓴다 — 괄호가 조사와 붙으면 읽기 나쁘다.
 */
function haltedLabels(mint: boolean, release: boolean): { banner: string; plain: string } {
  if (mint && release) {
    return { banner: '코인 지급(mint)과 정산금 지급(release)', plain: '코인 지급과 정산금 지급' }
  }
  if (mint) return { banner: '코인 지급(mint)', plain: '코인 지급' }
  return { banner: '정산금 지급(release)', plain: '정산금 지급' }
}

export function haltStateOf(supply: HaltInput): HaltState {
  const brokenNos = supply.invariants.filter((i) => !i.matched).map((i) => i.no)
  // 총량 대사가 깨졌거나(=supplyMatched false), 어느 불변식이든 어긋났으면 불일치다.
  // 둘을 OR로 묶는 이유 — ③만 깨진 경우 supplyMatched는 true인데 목록에는 불일치가 보인다.
  // 요약 줄이 "일치"라고 쓰면 바로 아래 목록과 모순된다
  const mismatch = !supply.supplyMatched || brokenNos.length > 0
  const anyHalted = supply.mintHalted || supply.releaseHalted
  const label = haltedLabels(supply.mintHalted, supply.releaseHalted)

  return {
    mintHalted: supply.mintHalted,
    releaseHalted: supply.releaseHalted,
    anyHalted,
    mismatch,
    brokenNos,
    mismatchText: !mismatch
      ? '일치'
      : brokenNos.length > 0
        ? `불일치 — 깨진 불변식 ${brokenNos.join('·')}`
        : '불일치 — 깨진 불변식을 특정하지 못했습니다',
    // 아무것도 안 막혔으면 배너를 띄우지 않으므로 빈 문자열이다 — 호출부가 `anyHalted`로
    // 거르지 않고 제목만 갖다 쓰다 "정산금 지급이 중단되었습니다"를 잘못 띄우는 일이 없게 한다
    bannerTitle: anyHalted
      ? `발행량 대사가 맞지 않아 ${label.banner}이 중단되었습니다. 원인 확인 후 해제하세요.`
      : '',
    ackNote: anyHalted
      ? `확인 처리는 중단을 해제하지 않습니다. ${label.plain}은 대사가 다시 맞을 때까지 계속 막혀 있습니다.`
      : '',
  }
}
