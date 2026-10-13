/**
 * A-01 섹션 ④ 맞춤 추천의 **데이터 계약**.
 *
 * 정본 — API v7 §14 `API-recommendation-01` `GET /api/v1/recommendations/performances`
 *        (`openapi.yaml` operationId `recommendation_01`) · 화면설계 v8 §4 A-01 섹션 ④
 *
 * 항목은 **`PerformanceListItem`(performance_02)에 두 필드를 더한 것**이다(명세의
 * `RecommendationItem`이 그 스키마를 `allOf`로 확장한다). 그래서 카드 변환은 `toShowCard`를
 * 그대로 재사용하고 새 카드 타입을 만들지 않는다.
 *
 * ⚠ `reason`은 **키 자체가 없을 수 있다.** 2차 LLM 태깅 전에는 항상 null이고 전역
 * `non_null` 직렬화라 서버가 키를 지운다(§0.1). `undefined`·`null` 둘 다 "사유 없음"이며
 * 그때는 줄을 그리지 않는다 — 빈 문자열로 접으면 카드에 빈 줄이 생긴다.
 */

import type { PerformanceListItem, RateBrief } from '@/features/performance/performanceListModel'
import type { Schemas } from '@/shared/api/schema'

/**
 * 생성 타입의 항목. **`basis`·`sessionId`·`matchedGenres`·`reason`은 여기서 꺼낸다** —
 * 손으로 다시 적으면 명세가 바뀌어도 이 파일이 조용히 낡는다.
 *
 * 다만 **`items`의 나머지 필드와 `rate`는 아래에서 좁힌다.** 생성 타입의
 * `PerformanceListItem`·`RateBrief`는 `openapi.yaml`이 `required`를 적지 않아 `title`·
 * `startAt`까지 전부 optional이다(실제 응답은 항상 채워 준다). 그 모양을 그대로 쓰면
 * 카드가 "제목이 없을 수도 있다"는 가정을 짊어진다 — `performanceListModel`이 같은 이유로
 * 손으로 적혀 있고, 추천 항목은 그 항목의 확장이라 같은 판단을 따른다.
 */
type SpecItem = Schemas['RecommendationItem']
type SpecData = Schemas['RecommendationListResponse']

/** 어떤 근거로 고른 목록인가. 1차는 `GENRE`·`FALLBACK`만 내려온다 */
export type RecommendationBasis = SpecData['basis']

export interface RecommendationItem extends PerformanceListItem {
  /** 선호 장르와 겹친 코드. **폴백으로 채운 항목은 빈 배열**이다 */
  matchedGenres: SpecItem['matchedGenres']
  /** 추천 사유 한 줄(최대 40자, 2차부터). 없으면 키가 없거나 null이다 */
  reason?: SpecItem['reason']
}

/**
 * `data` 전체. 최대 6건이며 페이지네이션·필터가 없다.
 *
 * `basis`·`sessionId`(요청 1건 = 세션 1개인 UUID, 노출 로그 조인 키이고 화면은 쓰지 않는다)는
 * 생성 타입 그대로다. 좁히는 것은 둘뿐이다 —
 *   · `rate` — §0.5 축약형 표시 환율. **이 응답의 값을 쓰고 같은 화면의 목록 응답에서
 *     빌려 오지 않는다**: 목록이 실패하면 추천 카드만 환산액이 빠져야지, 추천이 목록의
 *     성패에 매이면 안 된다. 회원 표시 통화가 KRW면 내려오지 않는다
 *   · `items` — 위 `SpecItem` 주석의 이유로 필수 필드를 가진 항목으로 좁힌다
 */
export interface RecommendationListData extends Omit<SpecData, 'rate' | 'items'> {
  rate?: RateBrief
  items: RecommendationItem[]
}

/** 섹션이 펴는 카드 수 상한(A-01 섹션 ④ — 최대 6장, 모바일도 6장) */
export const RECOMMENDATION_MAX = 6
