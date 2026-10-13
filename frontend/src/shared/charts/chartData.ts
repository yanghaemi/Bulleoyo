export interface TeamPayoutInput {
  teamId: number
  teamName: string
  totalAmount: number
}

export interface TeamPayoutPoint {
  [key: string]: string | number
  name: string
  amount: number
  /** 분배 대상액 대비 원 비율. 100을 넘겨도 감추거나 보정하지 않는다. */
  percent: number
}

export function toTeamPayoutSeries(
  shares: readonly TeamPayoutInput[],
  distributableAmount: number,
): TeamPayoutPoint[] {
  return shares.map((share) => ({
    name: share.teamName,
    amount: share.totalAmount,
    percent:
      Number.isFinite(distributableAmount) && distributableAmount > 0
        ? (share.totalAmount / distributableAmount) * 100
        : 0,
  }))
}

export interface SupplyCompositionInput {
  totalSupply: number
  escrowTotal: number
  walletTotal: number
}

export interface SupplyComposition {
  totalSupply: number
  accountedTotal: number
  /** totalSupply - accountedTotal. 양수면 미분류, 음수면 초과 계상이다. */
  difference: number
  matched: boolean
  segments: Array<{ name: '에스크로' | '지갑'; amount: number; percent: number }>
}

export function toSupplyComposition(input: SupplyCompositionInput): SupplyComposition {
  const accountedTotal = input.escrowTotal + input.walletTotal
  const difference = input.totalSupply - accountedTotal
  const percentOfSupply = (amount: number) =>
    Number.isFinite(input.totalSupply) && input.totalSupply > 0
      ? (amount / input.totalSupply) * 100
      : 0

  return {
    totalSupply: input.totalSupply,
    accountedTotal,
    difference,
    matched: difference === 0,
    segments: [
      { name: '에스크로', amount: input.escrowTotal, percent: percentOfSupply(input.escrowTotal) },
      { name: '지갑', amount: input.walletTotal, percent: percentOfSupply(input.walletTotal) },
    ],
  }
}
