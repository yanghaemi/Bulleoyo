/**
 * **서버가 쓴 JSON 으로 매퍼를 검사한다.**
 *
 * 다른 프론트 테스트는 전부 우리가 손으로 적은 응답을 MSW 로 먹인다 — 즉 "서버가 이렇게
 * 줄 것이다" 라는 우리 믿음을 우리가 검사하는 구조다. 그 믿음이 어긋난 게 S15P21B204-92 이고,
 * 손으로 쓴 목은 **늘 모든 키를 넣어 줘서** 아래 경로들을 한 번도 지나지 않았다.
 *
 * 여기 픽스처는 백엔드 통합 테스트(실제 컨트롤러 · 실제 Jackson · Testcontainers MySQL)가
 * 내보낸 응답 봉투를 **바이트 그대로** 옮긴 것이다. 2026-09-16 · `_workspace/live-json/`.
 *
 * 전역 `non_null` 직렬화라 값이 null 이면 서버는 **키를 지운다.** 그래서 이 파일의 관심사는
 * 하나다 — **키가 없는 것을 매퍼가 거짓값으로 접는가.**
 *
 * ⚠ 픽스처를 손으로 고치지 마라. 고치는 순간 다른 테스트와 같아져 존재 이유가 사라진다.
 *   서버가 바뀌면 백엔드 테스트에서 다시 뽑아 교체한다.
 */

import { describe, expect, it } from 'vitest'

import { saleStartPolling } from '@/shared/api/domains/rule'
import { toSettlementData } from '@/shared/api/domains/settlement'
import { formatKst } from '@/shared/ui/format'

import beforeAggregate from './__fixtures__/settlement_01.before-aggregate.json'
import afterRelease from './__fixtures__/settlement_01.after-release.json'
import ruleStartSale from './__fixtures__/rule_04.json'
import salesStatus from './__fixtures__/performance_11.json'
import verification from './__fixtures__/verify_01.json'

/* ══════════════════ rule_04 — 폴링이 조용히 안 켜지던 그 응답 ══════════════════ */

describe('rule_04 `POST /sale/start` — 선행 job 대기 응답 (실물)', () => {
  const data = ruleStartSale.data as Parameters<typeof saleStartPolling>[0]

  it('서버 응답에 `jobId` 키가 **아예 없다**', () => {
    // createShow 가 확정되기 전이면 서버는 START_SALE job 을 만들지 않는다(두 job 이 동시에
    // PENDING 이면 워커가 startSale 을 먼저 보내 revert 한다). 그때 jobId 는 null 이고
    // non_null 이 키를 지운다. **이게 정상 응답이다.**
    expect(Object.hasOwn(data, 'jobId')).toBe(false)
    expect(Object.hasOwn(data, 'prerequisiteJobId')).toBe(true)
  })

  it('선행 job 을 폴링 대상으로 집어낸다 — 여기서 놓치면 화면이 영원히 안 끝난다', () => {
    // `useChainJob(res.jobId)` 를 그대로 걸면 enabled = Boolean(undefined) = false 가 되어
    // 에러도 로딩도 없이 확정되지 않는 화면이 된다. 그래서 phase 로 갈라 강제한다.
    const polling = saleStartPolling(data)

    expect(polling.phase).toBe('prerequisite')
    expect(polling.jobId).toBe(data.prerequisiteJobId)
    expect(polling.jobId).toBeTruthy()
  })
})

/* ════════════ settlement_01 — 집계 전에는 키 일곱 개가 통째로 없다 ════════════ */

describe('settlement_01 `GET …/settlement` — 집계 전 (실물)', () => {
  const data = beforeAggregate.data as Parameters<typeof toSettlementData>[0]

  it('집계·잠금·release 관련 키가 응답에 없다', () => {
    // 손으로 쓴 목은 이 키들을 늘 넣어 줬다. 실물은 아직 일어나지 않은 일을 키로 남기지 않는다.
    for (const key of [
      'aggregatedAt',
      'lockedAt',
      'disputeClosesAt',
      'releasedAt',
      'releaseTxHash',
      'escrowBalanceAmount',
      'counterMatched',
    ]) {
      expect(Object.hasOwn(data, key), `${key} 키가 있으면 이 픽스처의 전제가 깨진다`).toBe(false)
    }
  })

  it('`counterMatched` 가 없으면 **일치로 본다** — 없는 경고를 만들지 않는다', () => {
    // 정상 상태에서 뜨는 "온체인 불일치" 배너는 운영자를 오판하게 만든다.
    expect(toSettlementData(data).counterMatched).toBe(true)
  })

  it('아직 일어나지 않은 시각을 현재 시각이나 빈 문자열로 채우지 않는다', () => {
    const settlement = toSettlementData(data)

    expect(settlement.aggregatedAt).toBeNull()
    expect(settlement.lockedAt).toBeNull()
    expect(settlement.releasedAt).toBeNull()
    expect(settlement.disputeClosesAt).toBeNull()
    expect(settlement.releaseTxHash).toBeNull()
  })

  it('매퍼가 집계 전 응답을 그대로 소화한다', () => {
    expect(beforeAggregate.code).toBe('SUCCESS')
    expect(() => toSettlementData(data)).not.toThrow()
  })
})

describe('settlement_01 `GET …/settlement` — release 후 (실물)', () => {
  const data = afterRelease.data as Parameters<typeof toSettlementData>[0]

  it('종단 상태에서는 그 일곱 키가 전부 온다', () => {
    const settlement = toSettlementData(data)

    expect(settlement.releasedAt).not.toBeNull()
    expect(settlement.releaseTxHash).not.toBeNull()
    expect(settlement.aggregatedAt).not.toBeNull()
  })

  it('매퍼가 release 후 응답을 그대로 소화한다', () => {
    expect(afterRelease.code).toBe('SUCCESS')
    expect(() => toSettlementData(data)).not.toThrow()
  })
})

/* ═══════════ 시각 표기가 엔드포인트마다 다르다 — 화면은 둘 다 견뎌야 한다 ═══════════ */

describe('`refreshedAt` 표기 (실물)', () => {
  it('서버가 두 가지 표기를 쓴다 — performance_11 은 `Z`, verify_01 은 `+09:00`', () => {
    // API v6 §0.2 는 오프셋 표기를 요구하므로 `Z` 쪽이 명세 위반이다. 다만 스키마가
    // `format: date-time` 이라 문법상 유효해 어떤 검사도 잡지 않는다. **백엔드 수정 대상**이고
    // 여기서는 "지금 실제로 이렇다"를 고정해 둔다 — 고쳐지면 이 단언이 깨져 알게 된다.
    expect(salesStatus.data.refreshedAt).toMatch(/Z$/)
    expect(verification.data.refreshedAt).toMatch(/\+09:00$/)
  })

  it('표기가 달라도 같은 순간으로 읽는다 — 9시간 어긋나지 않는다', () => {
    // `new Date(iso)` 가 두 표기를 모두 올바로 해석한다. 문자열을 잘라 쓰는 구현이었다면
    // P-07 의 "갱신 시각" 이 9시간 틀리게 찍혔을 자리다.
    const asUtc = new Date(salesStatus.data.refreshedAt as string)
    expect(Number.isNaN(asUtc.getTime())).toBe(false)

    // 같은 순간을 두 표기로 쓴 값은 같은 시각으로 포맷돼야 한다.
    const z = '2026-09-16T03:41:56Z'
    const offset = '2026-09-16T12:41:56+09:00'
    expect(formatKst(z, 'Asia/Seoul')).toBe(formatKst(offset, 'Asia/Seoul'))
  })
})
