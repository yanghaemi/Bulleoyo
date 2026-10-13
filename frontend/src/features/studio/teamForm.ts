import { studioText } from './studioLocale'
import type { Genre } from '@/shared/i18n/genres'
/**
 * P-02 팀 폼의 값·검증 — 생성 모드와 관리 모드가 같은 규칙을 쓴다.
 *
 * 정본 — 화면설계 v6 §4 P-02 **입력 검증**("팀명 1~50자")
 *        · API 명세 v6 team_01 `TeamCreateRequest` · team_04 `TeamUpdateRequest`
 *
 * ⚠ **명세 충돌 — 팀명 상한이 두 문서에서 다르다.**
 *   · 화면설계 v6 P-02 입력 검증: "팀명 1~50자"
 *   · API `TeamCreateRequest.teamName`: `minLength 1, maxLength 30`
 * 클라이언트 검증이 서버보다 느슨하면 사용자가 31자를 적고 나서야 400(`COMMON_VALIDATION_FAILED`)을
 * 맞는다. 그래서 **좁은 쪽(30자)** 으로 막고 도움말에도 30자로 적었다. 문서를 맞추는 것은
 * 명세 개정 대상이다(보고 목록 참조).
 *
 * **[v8 해소] `genre`는 이제 화면에 있다.** 화면설계 v8 P-02가 팀 생성·수정 폼에 장르
 * 셀렉트를 넣고 팀 정보 패널에 장르를 표시하도록 고쳤고, API v7 team-01은 `genre`를
 * **장르 코드 10종 enum · 필수**로, team-04는 **같은 enum · 선택**으로 바꿨다. 코드·라벨의
 * 정본은 `shared/i18n/genres.ts` 한 곳이다(C-02 선호 장르 칩과 같은 10종).
 *   · 생성(team-01): 필수 — `validateTeamForm(values, { genreRequired: true })`
 *   · 수정(team-04): 선택 — 미전달 시 기존 값 유지. 폼은 조회값으로 시작하므로 실제로는
 *     항상 값이 있고, 마이그레이션 전 자유 문자열(10종 밖)이면 빈 값으로 열린다
 *
 * ⚠ **남은 미구현 필드는 `contactEmail` 하나다.** 팀 정보 패널이 값을 **표시**하기는 하지만
 * 입력 필드는 P-02 컴포넌트 표에 여전히 없어 폼에 만들지 않는다.
 */

/** API `TeamCreateRequest.teamName`의 상한. 화면설계(50)보다 좁은 쪽을 쓴다 */
export const TEAM_NAME_MAX = 30
/** API `TeamCreateRequest.introduction`의 상한 */
export const TEAM_INTRO_MAX = 500

/** 화면이 들고 있는 팀 폼 값. API 요청 본문의 부분집합이다 */
export interface TeamFormValues {
  teamName: string
  introduction: string
  /** **[v8]** 장르 코드 단일. `''`는 "아직 고르지 않음"이고 요청에 실리지 않는다 */
  genre: Genre | ''
}

export interface TeamFormErrors {
  teamName?: string
  introduction?: string
  genre?: string
}

/**
 * 제출 전 검증. 통과하면 빈 객체다.
 *
 * 서버 검증을 대신하지 않는다 — 같은 규칙을 미리 한 번 더 볼 뿐이고, 최종 판단은
 * 서버 400(`COMMON_VALIDATION_FAILED`)이다.
 */
export function validateTeamForm(
  values: TeamFormValues,
  options: { genreRequired?: boolean } = {},
): TeamFormErrors {
  const errors: TeamFormErrors = {}
  const name = values.teamName.trim()

  if (name.length === 0)
    errors.teamName = studioText('팀 이름을 입력해 주세요.', 'Enter a team name.')
  else if (name.length > TEAM_NAME_MAX)
    errors.teamName = studioText(
      `팀 이름은 ${TEAM_NAME_MAX}자까지 쓸 수 있습니다. (지금 ${name.length}자)`,
      `Team names can have up to ${TEAM_NAME_MAX} characters (currently ${name.length}).`,
    )

  if (values.introduction.length > TEAM_INTRO_MAX)
    errors.introduction = studioText(
      `소개는 ${TEAM_INTRO_MAX}자까지 쓸 수 있습니다. (지금 ${values.introduction.length}자)`,
      `Introductions can have up to ${TEAM_INTRO_MAX} characters (currently ${values.introduction.length}).`,
    )

  // API PATCH 필드는 선택이지만 P-02 생성·수정 폼에서는 유효한 장르 하나가 필수다.
  if (options.genreRequired && values.genre === '')
    errors.genre = studioText('장르를 선택해 주세요.', 'Select a genre.')

  return errors
}

export function hasError(errors: TeamFormErrors): boolean {
  return Object.values(errors).some(Boolean)
}
