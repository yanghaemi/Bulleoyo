/**
 * DTO → 뷰모델 매퍼 공용 헬퍼.
 *
 * ─────────────────── 왜 이런 것이 필요한가 ───────────────────
 * `openapi.yaml`의 응답 스키마에 `required:`가 붙지 않은 필드는 생성 타입에서 optional이 된다.
 * 그러면 화면이 `value ?? 0`을 여기저기 흩뿌리게 되고, 그 기본값이 **파일마다 달라진다.**
 * 같은 필드를 한 화면은 `0`으로, 다른 화면은 `null`로 읽으면 숫자가 어긋난다.
 *
 * 그래서 "없을 때 무엇으로 읽을지"를 함수 이름으로 고정한다.
 *
 * ─────────────────── `int`와 `nullableInt`의 차이 ───────────────────
 * **둘은 바꿔 쓸 수 없다.** 고르는 기준은 하나다 —
 * *"값이 0인 것"과 "못 읽은 것"이 화면에서 다른 의미인가?*
 *
 *   환불 금액     → `int`         0원 환불과 환불 정보 없음은 화면에서 같게 보여도 된다
 *   대사 기댓값   → `nullableInt` **다르다.** 0으로 읽으면 "기댓값 0인데 실제도 0이니 일치"가
 *                                되어 **대사가 통과해 버린다.** 공시의 의미가 사라진다
 *
 * 판단이 서지 않으면 `nullableInt`를 쓴다. null은 화면에서 "—"로 비워 두면 되지만,
 * 잘못된 0은 사용자가 숫자로 믿는다.
 *
 * ─────────────────── boolean에 이 헬퍼가 없는 이유 ───────────────────
 * `matched`·`available` 같은 판정 필드는 방향이 사안마다 다르다.
 * 대사 결과는 모르면 `false`(일치라고 말하지 않는다), 경고 플래그는 모르면 `false`
 * (없는 경고를 만들지 않는다) — 같은 `=== true`처럼 보여도 이유가 반대다.
 * 한 함수로 묶으면 그 이유가 호출부에서 사라지므로, boolean은 각 매퍼에서
 * `raw.x === true`로 쓰고 **왜 그 방향인지 주석을 단다.**
 */

/** 없으면 `0`. "0이었다"와 "못 읽었다"가 화면에서 같은 의미일 때만 쓴다. */
export const int = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0)

/** 없으면 `''`. */
export const text = (v: string | null | undefined): string => v ?? ''

/** 없으면 `null`. 0과 미수신을 구분해야 하는 값에 쓴다(대사·검증 계열). */
export const nullableInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' ? v : null

/** 없으면 `null`. 빈 문자열과 미수신을 구분해야 할 때. */
export const nullableText = (v: string | null | undefined): string | null => v ?? null

/**
 * 없으면 빈 배열.
 *
 * 목록은 `null` 대신 `[]`가 맞다 — 화면이 `.map()`을 바로 걸 수 있고, "0건"과 "못 받음"을
 * 목록 자체로 구분할 일이 거의 없기 때문이다. 구분이 필요하면 서버가 별도 플래그를 준다.
 */
export const list = <T>(v: T[] | null | undefined): T[] => v ?? []
