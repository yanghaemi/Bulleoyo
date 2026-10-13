/**
 * M-03 표시 환율 등록 폼 · 환율 용도 안내 · 환율 이력 목록.
 *
 * 정본 — 화면설계 v6 §4 M-03 컴포넌트 표 7·8·9행 · **상태**(빈: "환율을 먼저 등록하세요") ·
 *        **입력 검증**(양수·소수 6자리·정해진 통화쌍·적용 시각) · §5.21 표 → 패널 접기
 *        API — `coin_03 PUT /api/v1/admin/coin/rates` → `ExchangeRateRegisterResult`
 *              · `coin_02 GET /api/v1/coin/rates` → `{ rates, usageNotice, refreshedAt }`
 *
 * **이 환율은 표시 환산에만 쓰인다.** 결제·환불·정산·분배·지급 금액에는 절대 쓰지 않는다(P-17).
 * 그 문구를 폼 옆에 상시 노출한다 — 서버도 응답 `usageNotice`로 같은 말을 하므로, 응답이 있으면
 * 서버 문구를 그대로 쓴다(§5.5).
 *
 * ⚠ **적용 시각 규칙이 두 문서에서 정반대다**(불일치 목록 참고).
 *   화면설계는 "과거·현재만(미래 예약 없음)", `coin_03`은 "미래 허용·과거 거부"다.
 *   과거를 보내면 400이 확정이므로 **현재 이후만** 받고, 기본값은 비워 둔다(= 서버가 now로 채움).
 *
 * ⚠ **등록자 열을 채울 값이 이력 응답에 없다.** M-03 표는 환율 이력에 "등록자"를 요구하지만
 *   `ExchangeRate` 스키마에는 없다(등록 응답 `ExchangeRateRegisterResult.publishedBy`에만 있다).
 *   그래서 열은 명세대로 두되 값이 없으면 `—`로 둔다 — 없는 값을 지어내지 않는다.
 *
 * 등록은 append-only라 되돌릴 수 없다(기존 레코드를 수정하지 않는다). §5.6이 확인 모달 대상으로
 * 열거한 목록에 환율은 없지만, **바뀌는 숫자를 먼저 보여주고 확인을 받는다** — 이 화면의 규칙이다.
 */

import { useId, useState } from 'react'

import {
  AdminEmpty,
  AdminErrorPanel,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminResultLine,
  AdminRow,
  AdminSkeleton,
} from '@/features/admin/AdminStates'
import {
  RATE_PAIRS,
  formatRate,
  isNowMinute,
  toRateRegisterItem,
  validateRate,
} from '@/features/admin/adminForms'
import type { RateErrors, RateFormValues } from '@/features/admin/adminForms'
import { adminFailureText } from '@/features/admin/adminMessages'
import type {
  AdminError,
  AdminResult,
  ExchangeRateList,
  ExchangeRateRegisterItem,
  ExchangeRateRegisterResult,
} from '@/features/admin/adminTypes'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, ConfirmDialog, Input, formatKst } from '@/shared/ui'

/** P-17 — 화면설계 M-03 "환율 용도 안내"의 문구 그대로 */
const USAGE_NOTICE =
  '이 환율은 표시 환산에만 사용됩니다. 결제·환불·정산·분배·지급 금액에는 절대 사용하지 않습니다.'
const USAGE_NOTICE_EN =
  'These rates are used for display conversion only. They never change payment, refund, settlement, distribution, or grant amounts.'

const EMPTY_FORM: RateFormValues = { pair: 'USD_KRW', rate: '', effectiveFrom: '' }

export interface ExchangeRateFormProps {
  /** 현재 등록된 환율. 확인 모달에서 "무엇이 얼마나 바뀌는지"를 보여주려고 쓴다 */
  current: ExchangeRateList | null
  onRegister: (
    rates: ExchangeRateRegisterItem[],
  ) => Promise<AdminResult<ExchangeRateRegisterResult>>
}

export function ExchangeRateForm({ current, onRegister }: ExchangeRateFormProps) {
  const { language, text } = useLocale()
  const ids = { pair: useId(), rate: useId(), effectiveFrom: useId() }

  const [values, setValues] = useState<RateFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<RateErrors>({})
  const [confirming, setConfirming] = useState(false)
  /**
   * 고른 적용 시각이 "지금 이 분"이라 `effectiveFrom` 없이 보낼 것인가.
   * **확인 모달을 열 때 한 번 정하고 고정한다** — 모달이 떠 있는 동안 분이 넘어가면
   * 미리보기는 "지금부터"인데 요청은 이미 지나간 분을 담는 일이 생긴다.
   */
  const [asNow, setAsNow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<
    | { ok: true; data: ExchangeRateRegisterResult }
    | { ok: false; code: string; msg?: string }
    | null
  >(null)

  const previous = current?.rates.find((r) => r.pair === values.pair) ?? null
  const nextRate = /^\d+(\.\d+)?$/.test(values.rate.trim()) ? Number(values.rate.trim()) : null

  const patch = (next: Partial<RateFormValues>) => {
    setValues((prev) => ({ ...prev, ...next }))
    if (result) setResult(null)
  }

  const openConfirm = () => {
    const found = validateRate(values, Date.now(), language)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setAsNow(isNowMinute(values.effectiveFrom))
    setConfirming(true)
  }

  const submit = async () => {
    setBusy(true)
    // 낙관적 UI 금지 — 응답이 온 뒤에만 결과를 표시하고, 목록 갱신은 호출부가 한다
    const res = await onRegister([toRateRegisterItem(values, asNow)])
    setBusy(false)
    setConfirming(false)
    setResult(res)
    if (res.ok) setValues((prev) => ({ ...prev, rate: '', effectiveFrom: '' }))
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminNotice tone="info" title={text('환율 용도', 'Rate usage')}>
        {language === 'ko' ? (current?.usageNotice ?? USAGE_NOTICE) : USAGE_NOTICE_EN}
      </AdminNotice>

      <AdminPanel
        title={text('표시 환율 등록', 'Register display rate')}
        description={text(
          '등록은 append-only입니다. 기존 값을 고치지 않고 새 레코드를 만듭니다.',
          'Rates are append-only. Registration creates a new record instead of editing an existing one.',
        )}
      >
        <div className="flex flex-col gap-4">
          <AdminField
            label={text('통화쌍', 'Currency pair')}
            htmlFor={ids.pair}
            required
            error={errors.pair}
          >
            <select
              id={ids.pair}
              value={values.pair}
              onChange={(e) => patch({ pair: e.target.value as RateFormValues['pair'] })}
              className="h-11 w-full rounded-control border border-line bg-ground px-3 font-sans text-sm text-ink transition-colors duration-150 ease-out hover:border-muted focus:border-primary"
            >
              {RATE_PAIRS.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
          </AdminField>

          <AdminField
            label={text(
              `환율 (1 ${values.pair.slice(0, 3)} = n YoYo)`,
              `Rate (1 ${values.pair.slice(0, 3)} = n YoYo)`,
            )}
            htmlFor={ids.rate}
            required
            error={errors.rate}
            hint={
              previous
                ? text(
                    `현재 ${formatRate(previous.rate)} · ${formatKst(previous.effectiveFrom, undefined, 'ko')}부터 적용 중`,
                    `Current ${formatRate(previous.rate)} · effective ${formatKst(previous.effectiveFrom, undefined, 'en')}`,
                  )
                : text(
                    '이 통화쌍은 아직 등록된 값이 없습니다.',
                    'No rate is registered for this pair yet.',
                  )
            }
          >
            <Input
              id={ids.rate}
              value={values.rate}
              inputMode="decimal"
              placeholder="1350"
              invalid={Boolean(errors.rate)}
              onChange={(e) => patch({ rate: e.target.value })}
            />
          </AdminField>

          <AdminField
            label={text('적용 시각', 'Effective time')}
            htmlFor={ids.effectiveFrom}
            error={errors.effectiveFrom}
            hint={text(
              '비워 두면 지금부터 적용됩니다. 과거 시각은 등록할 수 없습니다.',
              'Leave this blank to apply immediately. Past times are not allowed.',
            )}
          >
            <Input
              id={ids.effectiveFrom}
              type="datetime-local"
              value={values.effectiveFrom}
              invalid={Boolean(errors.effectiveFrom)}
              onChange={(e) => patch({ effectiveFrom: e.target.value })}
            />
          </AdminField>

          {result && (
            <AdminResultLine tone={result.ok ? 'ok' : 'danger'}>
              {result.ok
                ? text(
                    `등록했습니다 — ${result.data.registered.map((r) => `${r.pair} ${formatRate(r.rate)}`).join(' · ')}`,
                    `Registered — ${result.data.registered.map((r) => `${r.pair} ${formatRate(r.rate)}`).join(' · ')}`,
                  )
                : language === 'ko'
                  ? adminFailureText(result.code, result.msg)
                  : `Rate registration failed (${result.code}).`}
            </AdminResultLine>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            <Button variant="primary" disabled={busy} onClick={openConfirm}>
              {busy ? text('저장 중', 'Saving') : text('저장', 'Save')}
            </Button>
          </div>
        </div>
      </AdminPanel>

      <ConfirmDialog
        open={confirming}
        busy={busy}
        title={text('이 환율을 등록할까요?', 'Register this rate?')}
        confirmLabel={text('등록', 'Register')}
        cancelLabel={text('취소', 'Cancel')}
        onClose={() => setConfirming(false)}
        onConfirm={() => void submit()}
        body={
          <div className="flex flex-col gap-1">
            <span>
              {text('통화쌍', 'Currency pair')} <strong className="text-ink">{values.pair}</strong>
            </span>
            <span>
              {text('환율', 'Rate')}{' '}
              <strong className="text-ink tabular-nums">
                {previous ? formatRate(previous.rate) : text('없음', 'None')}
              </strong>{' '}
              →{' '}
              <strong className="text-ink tabular-nums">
                {nextRate != null ? formatRate(nextRate) : '—'}
              </strong>
            </span>
            <span>
              {/* `asNow`면 요청에서 effectiveFrom을 빼 서버가 now로 채운다 — 보내는 값과 같게 적는다 */}
              {text('적용 시각', 'Effective time')}{' '}
              {values.effectiveFrom && !asNow
                ? formatKst(new Date(values.effectiveFrom).toISOString(), undefined, language)
                : text('지금부터', 'Immediately')}
            </span>
            <span className="text-muted">
              {text(
                '표시 환산에만 쓰입니다. 결제·환불·정산·분배·지급 금액은 바뀌지 않습니다. 등록한 값은 지울 수 없고 새 값을 덧붙이는 방식으로만 바꿉니다.',
                'This rate is for display conversion only. It does not change payment, refund, settlement, distribution, or grant amounts. Registered values cannot be deleted; changes are appended as new records.',
              )}
            </span>
          </div>
        }
      />
    </div>
  )
}

export interface ExchangeRateHistoryProps {
  loading: boolean
  error?: AdminError | null
  data: ExchangeRateList | null
  onRetry: () => void
}

/**
 * 환율 이력 목록 — 통화쌍·환율·적용 시각·등록자·출처.
 *
 * ⚠ `coin_02`는 "**현재 유효한** 환율"을 pair별로 준다. 지난 값까지 담긴 **이력** 엔드포인트가
 *   v6에 없어서, 이 목록은 실제로는 "현재 적용 중인 값 목록"이다(불일치 목록 참고).
 */
export function ExchangeRateHistory({ loading, error, data, onRetry }: ExchangeRateHistoryProps) {
  const { language, text } = useLocale()
  if (loading) {
    return (
      <AdminPanel title={text('환율 이력', 'Rate history')}>
        <AdminSkeleton label={text('환율을 불러오는 중', 'Loading rates')} rows={2} />
      </AdminPanel>
    )
  }

  if (error) {
    return (
      <AdminPanel title={text('환율 이력', 'Rate history')}>
        <AdminErrorPanel
          title={text('환율을 불러오지 못했습니다', 'Could not load rates')}
          msg={
            language === 'ko'
              ? (adminFailureText(error.code, error.msg) ?? '')
              : (error.msg ?? 'Could not load rates.')
          }
          onRetry={onRetry}
        />
      </AdminPanel>
    )
  }

  if (!data || data.rates.length === 0) {
    return (
      <AdminPanel title={text('환율 이력', 'Rate history')}>
        <AdminEmpty>
          {text(
            '환율을 먼저 등록하세요. 등록 전까지 관객 화면에는 환산 병기가 표시되지 않고 YoYo 금액만 나옵니다.',
            'Register a rate first. Until then, audience screens show the YoYo amount without a converted value.',
          )}
        </AdminEmpty>
      </AdminPanel>
    )
  }

  return (
    <AdminPanel
      title={text('환율 이력', 'Rate history')}
      description={`${text('갱신', 'Updated')} ${formatKst(data.refreshedAt, undefined, language)}`}
    >
      {/* PC 표 — 열 순서: 통화쌍 → 환율 → 적용 시각 → 등록자 → 출처 */}
      <table className="hidden w-full border-collapse md:table">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 font-sans text-[11px] font-semibold text-muted">
              {text('통화쌍', 'Currency pair')}
            </th>
            <th className="py-2 text-right font-sans text-[11px] font-semibold text-muted">
              {text('환율', 'Rate')}
            </th>
            <th className="py-2 font-sans text-[11px] font-semibold text-muted">
              {text('적용 시각', 'Effective time')}
            </th>
            <th className="py-2 font-sans text-[11px] font-semibold text-muted">
              {text('등록자', 'Registered by')}
            </th>
            <th className="py-2 font-sans text-[11px] font-semibold text-muted">
              {text('출처', 'Source')}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rates.map((r) => (
            <tr
              key={`${r.pair}-${r.effectiveFrom}`}
              className="border-b border-line last:border-b-0"
            >
              <td className="py-2 font-sans text-[13px] text-ink">{r.pair}</td>
              <td className="py-2 text-right font-sans text-[13px] text-ink tabular-nums">
                {formatRate(r.rate)}
              </td>
              <td className="py-2 font-sans text-[12px] text-ink">
                {formatKst(r.effectiveFrom, undefined, language)}
              </td>
              {/* ⚠ 응답에 등록자가 없다 — 값을 지어내지 않고 `—`로 둔다 */}
              <td className="py-2 font-sans text-[12px] text-muted">—</td>
              <td className="py-2 font-sans text-[12px] text-muted">{r.source}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 모바일 패널(§5.21) — 열 순서 유지 */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {data.rates.map((r) => (
          <li
            key={`${r.pair}-${r.effectiveFrom}`}
            className="rounded-card border border-line bg-ground px-3 py-2.5"
          >
            <p className="m-0 font-sans text-[13px] font-semibold text-ink">{r.pair}</p>
            <AdminRow label={text('환율', 'Rate')}>{formatRate(r.rate)}</AdminRow>
            <AdminRow label={text('적용 시각', 'Effective time')}>
              {formatKst(r.effectiveFrom, undefined, language)}
            </AdminRow>
            <AdminRow label={text('등록자', 'Registered by')}>—</AdminRow>
            <AdminRow label={text('출처', 'Source')}>{r.source}</AdminRow>
          </li>
        ))}
      </ul>
    </AdminPanel>
  )
}
