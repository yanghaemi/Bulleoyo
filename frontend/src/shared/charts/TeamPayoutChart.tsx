import { Bar } from '@/components/charts/bar'
import { BarChart } from '@/components/charts/bar-chart'
import { BarYAxis } from '@/components/charts/bar-y-axis'
import { Grid } from '@/components/charts/grid'
import { ChartTooltip } from '@/components/charts/tooltip'
import { toTeamPayoutSeries, type TeamPayoutInput } from '@/shared/charts/chartData'
import { formatYoyo } from '@/shared/ui/format'

interface Props {
  shares: readonly TeamPayoutInput[]
  distributableAmount: number
}

export function TeamPayoutChart({ shares, distributableAmount }: Props) {
  const data = toTeamPayoutSeries(shares, distributableAmount)
  if (data.length === 0 || typeof ResizeObserver === 'undefined') return null

  return (
    <section
      aria-label="팀별 분배액 비교 차트"
      className="hidden rounded-card border border-line bg-surface px-3 py-3 xl:block"
    >
      <p className="m-0 mb-1 font-sans text-[11px] text-muted">
        막대 길이는 분배액을 비교하기 위한 보조 표현입니다. 정확한 금액은 아래 표가 기준입니다.
      </p>
      <BarChart
        data={data}
        xDataKey="name"
        orientation="horizontal"
        aspectRatio={`3 / ${Math.max(1.25, data.length * 0.54)}`}
        margin={{ top: 12, right: 24, bottom: 12, left: 96 }}
        animationDuration={480}
        barGap={0.32}
      >
        <Grid horizontal={false} vertical numTicksColumns={5} fadeVertical />
        <Bar dataKey="amount" fill="var(--chart-line-primary)" lineCap={6} />
        <BarYAxis />
        <ChartTooltip
          showDatePill={false}
          rows={(point) => [
            { color: 'var(--chart-line-primary)', label: '분배액', value: formatYoyo(Number(point.amount)) },
            { color: 'var(--chart-line-secondary)', label: '전체 대비', value: `${Number(point.percent).toFixed(1)}%` },
          ]}
        />
      </BarChart>
      <p className="sr-only">
        {data.map((point) => `${point.name} ${formatYoyo(point.amount)}, 전체 대비 ${point.percent.toFixed(1)}%`).join('. ')}
      </p>
    </section>
  )
}
