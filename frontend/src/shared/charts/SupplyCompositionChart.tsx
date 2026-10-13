import { Bar } from '@/components/charts/bar'
import { BarChart } from '@/components/charts/bar-chart'
import { ChartTooltip } from '@/components/charts/tooltip'
import { toSupplyComposition, type SupplyCompositionInput } from '@/shared/charts/chartData'
import { useLocale } from '@/shared/i18n/useLocale'
import { formatYoyo } from '@/shared/ui/format'

type Props = SupplyCompositionInput

function signedYoyo(value: number) {
  return value > 0 ? formatYoyo(value, '+') : formatYoyo(value)
}

export function SupplyCompositionChart(props: Props) {
  const { text } = useLocale()
  const composition = toSupplyComposition(props)
  if (typeof ResizeObserver === 'undefined') return null

  const data = [
    {
      name: text('발행량 구성', 'Supply composition'),
      escrow: composition.segments[0].amount,
      wallet: composition.segments[1].amount,
    },
  ]

  return (
    <section
      aria-label={text('발행량 구성 차트', 'Supply composition chart')}
      className="mt-3 rounded-card border border-line bg-ground px-3 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 font-sans text-[11px] font-semibold text-muted">
          {text('에스크로와 지갑 보유 구성', 'Escrow and wallet holdings')}
        </p>
        {!composition.matched && (
          <p role="status" className="m-0 font-sans text-[11px] font-semibold text-danger">
            {text('총 발행량과의 차이', 'Difference from total supply')}{' '}
            {signedYoyo(composition.difference)}
          </p>
        )}
      </div>
      <BarChart
        data={data}
        xDataKey="name"
        orientation="horizontal"
        stacked
        aspectRatio="8 / 1"
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        animationDuration={420}
        barGap={0.18}
      >
        <Bar dataKey="escrow" fill="var(--chart-line-primary)" lineCap={5} />
        <Bar dataKey="wallet" fill="var(--chart-line-secondary)" lineCap={5} />
        <ChartTooltip
          showDatePill={false}
          showCrosshair={false}
          rows={(point) => [
            {
              color: 'var(--chart-line-primary)',
              label: text('에스크로', 'Escrow'),
              value: formatYoyo(Number(point.escrow)),
            },
            {
              color: 'var(--chart-line-secondary)',
              label: text('지갑', 'Wallet'),
              value: formatYoyo(Number(point.wallet)),
            },
          ]}
        />
      </BarChart>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[11px] text-muted">
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-primary" />
          {text('에스크로', 'Escrow')} {formatYoyo(composition.segments[0].amount)}
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sel" />
          {text('지갑', 'Wallet')} {formatYoyo(composition.segments[1].amount)}
        </span>
      </div>
    </section>
  )
}
