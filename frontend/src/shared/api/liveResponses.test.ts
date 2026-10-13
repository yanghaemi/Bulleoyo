/**
 * **실물 응답 고정.** 다른 모든 프론트 테스트는 우리가 손으로 적은 JSON 을 먹인다 —
 * 즉 "서버가 이렇게 줄 것이다" 라는 우리 믿음을 우리가 검사하는 구조다. 그 믿음이
 * 어긋난 적이 실제로 있다(S15P21B204-92: 명세가 202 를 3필드로 적어 둔 동안 서버는
 * 7~14필드를 주고 있었다).
 *
 * 여기 픽스처는 **진짜 Spring 서버에서 뽑은 응답**이다.
 *   2026-09-16 · `docker compose -f docker-compose.local.yml --profile backend up`
 *   (SPRING_PROFILES_ACTIVE=local · Kairos 조회 붙음 · CHAIN_WORKER_ENABLED=false)
 *
 * ── 이 테스트가 지키는 것 ─────────────────────────────────────────────────
 * ① 매퍼가 실물 응답을 받아 **터지지 않는다.**
 * ② 전역 `non_null` 로 **키가 통째로 빠진 필드**를 매퍼가 거짓값으로 접지 않는다.
 *    실물 `coin_01` 에는 `display` 키가 아예 없다(값이 null 이라 서버가 지웠다).
 *    이 경우를 0·''·false 로 읽으면 화면이 "환산 0원" 같은 거짓말을 한다.
 * ③ 에러 응답의 `code` 가 우리가 분기에 쓰는 문자열과 **실제로 같다.**
 *
 * ⚠ 픽스처를 손으로 고치지 마라. 서버가 바뀌면 다시 뽑아 교체한다 — 손으로 고치면
 *   이 파일이 다른 테스트와 같아져(우리 믿음을 우리가 검사) 존재 이유가 사라진다.
 */

import { describe, expect, it } from 'vitest'

import { toCoinSupply, toExchangeRateList } from '@/shared/api/domains/coin'

import live from './__fixtures__/liveResponses.json'

/* ────────────────────────── ① 매퍼가 실물을 받아낸다 ────────────────────────── */

describe('coin_01 `GET /coin/supply` — 실물 응답', () => {
  const raw = live.coin_01.data as Parameters<typeof toCoinSupply>[0]

  it('매퍼가 실물 응답을 그대로 소화한다', () => {
    expect(live.coin_01.code).toBe('SUCCESS')
    expect(() => toCoinSupply(raw)).not.toThrow()
  })

  it('서버가 지운 `display` 키를 거짓값으로 접지 않는다', () => {
    // 전역 non_null 이라 값이 null 이면 키 자체가 없다. 이게 이 픽스처의 핵심이다 —
    // 손으로 쓴 목은 늘 키를 넣어 주기 때문에 이 경로를 한 번도 지나지 않았다.
    expect(Object.hasOwn(raw, 'display')).toBe(false)

    const supply = toCoinSupply(raw)
    // `display?: CoinDisplay` 라 없으면 undefined 가 맞다. 화면은 그 줄을 안 그린다.
    expect(supply.display).toBeUndefined()

    // 진짜로 막고 싶은 것은 "모른다" 가 **숫자 0 이나 빈 객체로 둔갑하는 것**이다.
    // `approx: 0` 이 오면 공시가 "환산 0원" 이라고 거짓을 말한다.
    expect(supply.display).not.toEqual(expect.objectContaining({ approx: 0 }))
  })

  it('불변식 목록과 발행량이 숫자로 온다', () => {
    const supply = toCoinSupply(raw)
    expect(Number.isFinite(supply.totalSupply)).toBe(true)
    expect(Array.isArray(supply.invariants)).toBe(true)
  })
})

describe('coin_02 `GET /coin/rates` — 실물 응답', () => {
  it('매퍼가 실물 응답을 그대로 소화한다', () => {
    expect(live.coin_02.code).toBe('SUCCESS')
    const raw = live.coin_02.data as Parameters<typeof toExchangeRateList>[0]
    expect(() => toExchangeRateList(raw)).not.toThrow()
  })
})

/* ──────────────────── ③ 에러 code 가 분기에 쓰는 값과 같다 ──────────────────── */

describe('에러 응답의 code — 실물', () => {
  it('없는 공유 토큰은 COMMON_NOT_FOUND 다 (V-03 의 유일한 에러)', () => {
    expect(live.coin_01_404_public_settlement.code).toBe('COMMON_NOT_FOUND')
  })

  it('비로그인 정산 조회는 COMMON_UNAUTHORIZED 다', () => {
    expect(live.common_401.code).toBe('COMMON_UNAUTHORIZED')
  })

  it('coin_04 `/coin/config` 는 실제로 500 을 낸다 — 어느 화면에서도 부르지 않는다', () => {
    // P1 미구현이다. 이 값이 SUCCESS 로 바뀌면 그때 화면에 붙일지 정한다.
    expect(live.coin_04_500.code).toBe('COMMON_INTERNAL_ERROR')
  })
})
