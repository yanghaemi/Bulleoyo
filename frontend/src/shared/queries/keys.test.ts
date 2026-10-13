import { QueryClient } from '@tanstack/react-query'
import type { ChainTxType } from '@/shared/api/types'
import { invalidatedBy, qk } from './keys'

it.each([
  'DEPOSIT',
  'DEPOSIT_RETURN',
  'DEPOSIT_FORFEIT',
  'AGREE',
  'AGGREGATE',
  'LOCK',
  'RELEASE',
] as const)(
  '%s 확정 후 대시보드와 편집 화면이 읽는 모든 내 공연 페이지를 갱신한다',
  async (type) => {
    const client = new QueryClient()
    const first = qk.performance.mine({ size: 100 })
    const later = qk.performance.mine({ page: 2, size: 20 })
    client.setQueryData(first, { items: [{ depositStatus: 'UNPAID' }] })
    client.setQueryData(later, { items: [{ settlementStatus: 'NONE' }] })
    for (const key of invalidatedBy(type)) await client.invalidateQueries({ queryKey: key })
    expect(client.getQueryState(first)?.isInvalidated).toBe(true)
    expect(client.getQueryState(later)?.isInvalidated).toBe(true)
    client.clear()
  },
)

it('판매 시작 확정 후 동의 화면의 판매 시작 가능 상태도 다시 읽는다', async () => {
  const client = new QueryClient()
  client.setQueryData(qk.rule.all, { canStartSale: true })
  for (const key of invalidatedBy('START_SALE')) await client.invalidateQueries({ queryKey: key })
  expect(client.getQueryState(qk.rule.all)?.isInvalidated).toBe(true)
  client.clear()
})

it.each(['DEPOSIT', 'DEPOSIT_RETURN', 'DEPOSIT_FORFEIT'] as const)(
  '%s 확정 후 동의 화면의 보증금 상태·판매 시작 가능 여부도 다시 읽는다',
  async (type) => {
    const client = new QueryClient()
    const rule = qk.rule.byPerformance(52)
    client.setQueryData(rule, { depositStatus: 'UNPAID', startSaleAvailable: false })
    for (const key of invalidatedBy(type)) await client.invalidateQueries({ queryKey: key })
    expect(client.getQueryState(rule)?.isInvalidated).toBe(true)
    client.clear()
  },
)

/**
 * 9/23 무효화 전수 감사(`fix/fe/live-refresh`)에서 채운 항목. 행 하나 = "이 tx가 확정되면
 * 이 화면의 캐시가 낡는다". 대표 키를 심어 두고 `invalidatedBy`의 접두가 그 키를 잡는지 본다.
 */
const teamList = qk.team.list({ page: 0, size: 20 })
const publicList = qk.performance.list({ page: 0, size: 20 })
const auditCases: ReadonlyArray<[ChainTxType, string, readonly unknown[]]> = [
  // 잔액 사본 — member_05 wallet.balance · team_02 balanceAmount
  ['MINT', 'member_05 잔액', qk.member.me()],
  ['MINT', 'team_02 팀 잔액', teamList],
  ['PURCHASE', 'member_05 잔액', qk.member.me()],
  ['PURCHASE', 'team_02 팀 잔액', teamList],
  ['REFUND', 'member_05 잔액', qk.member.me()],
  ['REFUND', 'team_02 팀 잔액', teamList],
  ['DEPOSIT', 'team_02 팀 잔액', teamList],
  ['DEPOSIT_RETURN', 'team_02 팀 잔액', teamList],
  ['DEPOSIT_FORFEIT', 'member_05 잔액', qk.member.me()],
  ['RELEASE', 'member_05 잔액', qk.member.me()],
  ['RELEASE', 'team_02 팀 잔액', teamList],
  // 공개 목록 soldOut
  ['PURCHASE', 'performance_02 soldOut', publicList],
  ['REFUND', 'performance_02 soldOut', publicList],
  // 공시 escrowTotal·walletTotal
  ['PURCHASE', 'coin_01 공시', qk.coin.supply()],
  ['REFUND', 'coin_01 공시', qk.coin.supply()],
  ['DEPOSIT', 'coin_01 공시', qk.coin.supply()],
  ['DEPOSIT_RETURN', 'coin_01 공시', qk.coin.supply()],
  ['DEPOSIT_FORFEIT', 'coin_01 공시', qk.coin.supply()],
  ['RELEASE', 'coin_01 공시', qk.coin.supply()],
  // 검증 화면
  ['DEPOSIT', 'verify_01 depositReconciliation', qk.verify.byPerformance(52)],
  ['DEPOSIT_RETURN', 'verify_01 depositReconciliation', qk.verify.byPerformance(52)],
  ['DEPOSIT_FORFEIT', 'verify_01 depositReconciliation', qk.verify.byPerformance(52)],
  ['AGREE', 'verify_01 agreements', qk.verify.byPerformance(52)],
  ['START_SALE', 'verify_01 lockedRule', qk.verify.byPerformance(52)],
  // 선행 job 해소
  ['CREATE_SHOW', 'rule_02 startSaleBlockedReason', qk.rule.byPerformance(52)],
  // 종단 중단
  ['HALT', 'settlement_01 HALTED', qk.settlement.byPerformance(52)],
  ['HALT', 'verify_01 settlementStatus', qk.verify.byPerformance(52)],
  ['HALT', 'performance_06 대시보드', qk.performance.mine({ page: 0, size: 20 })],
  ['HALT', 'performance_03 상세 CANCELLED', qk.performance.detail(52)],
  ['HALT', 'performance_02 목록 CANCELLED', publicList],
]

it.each(auditCases)('%s 확정 후 %s 캐시를 다시 읽는다', async (type, _label, key) => {
  const client = new QueryClient()
  client.setQueryData(key, { stale: true })
  for (const prefix of invalidatedBy(type)) await client.invalidateQueries({ queryKey: prefix })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.clear()
})

/** 과잉 무효화 방지 — 코인을 움직이지 않는 tx는 잔액 사본·공시를 건드리지 않는다. */
const untouched: ReadonlyArray<[ChainTxType, string, readonly unknown[]]> = [
  ['APPROVE', 'member_05', qk.member.me()],
  ['AGREE', 'team_02', teamList],
  ['LOCK', 'coin_01 공시', qk.coin.supply()],
  ['AGGREGATE', 'coin_01 공시', qk.coin.supply()],
  ['UPDATE_RULES', '지갑', qk.wallet.me()],
  ['START_SALE', 'member_05', qk.member.me()],
]

it.each(untouched)('%s 확정은 %s 캐시를 건드리지 않는다', async (type, _label, key) => {
  const client = new QueryClient()
  client.setQueryData(key, { fresh: true })
  for (const prefix of invalidatedBy(type)) await client.invalidateQueries({ queryKey: prefix })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  client.clear()
})
