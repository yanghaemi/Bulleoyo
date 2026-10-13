/**
 * M-03 시연용 지급 폼 · 지급 한도 안내.
 *
 * 정본 — 화면설계 v6 §4 M-03 컴포넌트 표 4·5행 · **상태**(202 폴링·멱등·실패 재시도) ·
 *        **입력 검증** · §5.2 202 처리 중 표시 · §5.6 확인 모달 · §5.3 tx 링크
 *        API — `coin_07 PUT /api/v1/admin/coin/grants`(Idempotency-Key 필수) → 202 `ChainJobAccepted`
 *              · `chain_01 GET /api/v1/chain/jobs/{jobId}` → `ChainJob`
 *
 * **이 화면이 이 세계에서 코인이 생기는 유일한 곳이다**(M-03 개편 요지 ①). 그래서 —
 *   ① 확인 없이 실행되지 않는다. 확인 모달이 **대상·금액·메모·지급 후 총 발행량**을 숫자로
 *      먼저 보여준다(§5.6 "모달 문구는 결과를 구체적으로 요약한다")
 *   ② **낙관적 UI가 없다. 202는 성공이 아니다.** 접수만 된 상태이며, 이력·발행량은
 *      `CONFIRMED`가 온 뒤에 갱신된다(무효화는 `useChainJob`이 한다). `FAILED`면 실패로 남긴다
 *   ③ 멱등키는 **요청 내용이 바뀔 때만** 새로 만든다. 같은 대상·금액·메모를 다시 누르면 같은 키가
 *      나가 서버가 1건으로 처리하고(같은 jobId 재생), 화면은 "이미 처리된 지급"으로 안내한다.
 *      ⚠ 재시도에서 **새 키를 만들면 같은 회원에게 두 번 발행된다.** 키를 여기서 보관하는 이유다
 *   ④ 발행량 대사가 깨져 mint가 중단된 동안에는 버튼이 비활성이다(`disabled` prop)
 *
 * ── 폴링은 이 컴포넌트가 하지 않는다 ────────────────────────────────────
 * 접수한 `jobId`를 `onAccepted`로 올리면 페이지가 `useChainJob`으로 지켜본다(§0.3 규칙을 한 곳에
 * 모은 훅이다). 컴포넌트가 `setTimeout`으로 다시 부르면 폴링 규칙이 화면 수만큼 생긴다.
 *
 * ⚠ **회원 검색 패널을 지웠다.** 화면설계 M-03은 `GET /api/v1/admin/members`를 연결 API로
 *   적었지만 API v6·openapi.yaml에 그 엔드포인트가 없다. 응답이 없는 화면을 목으로 유지하면
 *   관리자가 "검색이 되는 화면"으로 오해한다. `coin_07`은 `memberId | address` 택일이라
 *   **주소 직접 입력만으로 지급이 성립한다.**
 *   복구 조건 — 명세에 회원 검색이 생기면 `shared/api/domains/`에 응답 타입을 만들고 대상 필드
 *   위에 검색 패널을 되살린다(그 전에는 만들지 않는다).
 *
 * 장식 효과·애니메이션 없음. 진행 표시는 문구와 배지뿐이다.
 */

import { useEffect, useId, useRef, useState } from 'react'

import {
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminResultLine,
  AdminRow,
  ChainJobStatusBadge,
  TxLink,
} from '@/features/admin/AdminStates'
import {
  GRANT_MAX_AMOUNT,
  GRANT_MEMO_MAX,
  GRANT_MIN_AMOUNT,
  SIGNUP_GRANT_AMOUNT,
  isSameGrant,
  toGrantRequest,
  validateGrant,
} from '@/features/admin/adminForms'
import type { GrantErrors, GrantFormValues } from '@/features/admin/adminForms'
import {
  adminFailureText,
  isGrantAmountCode,
  isGrantTargetCode,
} from '@/features/admin/adminMessages'
import type {
  AdminResult,
  ChainJobAccepted,
  ChainJobState,
  CoinGrantRequest,
} from '@/features/admin/adminTypes'
import { newIdempotencyKey } from '@/shared/api/client'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, ConfirmDialog, Input, formatYoyo, shortenHex } from '@/shared/ui'

const EMPTY_FORM: GrantFormValues = { memberId: null, address: '', amount: '', memo: '' }

/** 요청 → 202 → 폴링 → 확정/실패. §5.2의 상태 흐름을 그대로 이름으로 옮겼다 */
type Phase = 'idle' | 'submitting' | 'processing' | 'done' | 'failed'

export interface CoinGrantFormProps {
  /** 지급이 막혔는가 — 발행량 대사 불일치(mintHalted) 또는 체인 설정 대기 */
  disabled: boolean
  /** 막힌 이유. 비활성 버튼 옆에 문구로 붙는다(색으로만 알리지 않는다) */
  disabledReason?: string
  /** 지급 후 총 발행량을 계산해 보여주기 위한 현재 값(`coin_01.totalSupply`) */
  totalSupply?: number
  /** `Idempotency-Key`는 이 폼이 만들어 넘긴다 — 재시도에서 같은 값을 다시 쓰기 위해서다 */
  onGrant: (req: CoinGrantRequest, idempotencyKey: string) => Promise<AdminResult<ChainJobAccepted>>
  /** 접수한 jobId. `null`이면 폴링을 끈다 */
  onAccepted: (jobId: string | null) => void
  /** 페이지가 폴링 중인 작업(`useChainJob`). 접수 전에는 null */
  job: ChainJobState | null
  /** 폴링 상한(120초)에 닿아 멈췄다 — 실패가 아니다 */
  timedOut?: boolean
  /** 이력에서 "같은 내용으로 다시 지급"을 누르면 채워 넣을 값 */
  prefill?: GrantFormValues | null
}

export function CoinGrantForm({
  disabled,
  disabledReason,
  totalSupply,
  onGrant,
  onAccepted,
  job,
  timedOut,
  prefill,
}: CoinGrantFormProps) {
  const { language, text } = useLocale()
  const ids = {
    address: useId(),
    amount: useId(),
    memo: useId(),
  }

  const [values, setValues] = useState<GrantFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<GrantErrors>({})

  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 202로 접수한 작업. 확정 여부는 `job`(폴링 결과)이 말한다 */
  const [accepted, setAccepted] = useState<ChainJobAccepted | null>(null)
  const [failure, setFailure] = useState<{ code: string; msg?: string } | null>(null)
  /** 서버가 최초 응답을 재생했는가 — M-03 상태 항목 "이미 처리된 지급" */
  const [duplicate, setDuplicate] = useState(false)

  /** 마지막으로 내보낸 (멱등키, 요청). 내용이 같으면 키를 새로 만들지 않는다 */
  const lastSent = useRef<{ key: string; req: CoinGrantRequest } | null>(null)
  /** 이미 본 jobId. 같은 jobId가 다시 오면 서버가 최초 응답을 재생한 것이다 */
  const seenJobs = useRef<Set<string>>(new Set())

  // 이력에서 넘어온 값 채우기. 실행하지 않는다 — 관리자가 확인 모달을 다시 지난다
  useEffect(() => {
    if (!prefill) return
    setValues(prefill)
    setErrors({})
    setAccepted(null)
    setFailure(null)
    setDuplicate(false)
    lastSent.current = null
  }, [prefill])

  /** 폴링이 말하는 현재 상태. 접수 응답(보통 PENDING)은 첫 폴링 전까지의 값이다 */
  const jobStatus = job?.status ?? accepted?.status ?? null
  const phase: Phase = submitting
    ? 'submitting'
    : failure
      ? 'failed'
      : !accepted
        ? 'idle'
        : jobStatus === 'CONFIRMED'
          ? 'done'
          : jobStatus === 'FAILED'
            ? 'failed'
            : 'processing'

  const busy = phase === 'submitting' || phase === 'processing'
  const amountNumber = /^\d+$/.test(values.amount.trim()) ? Number(values.amount.trim()) : null

  const patch = (next: Partial<GrantFormValues>) => {
    setValues((prev) => ({ ...prev, ...next }))
    // 값을 고치면 직전 실행 결과를 지운다 — 새 입력 옆에 옛 결과가 남으면 오해한다
    if (phase === 'done' || phase === 'failed') {
      setAccepted(null)
      setFailure(null)
      setDuplicate(false)
      onAccepted(null)
    }
  }

  const openConfirm = () => {
    const found = validateGrant(values, language)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setConfirming(true)
  }

  const submit = async () => {
    const req = toGrantRequest(values)
    // 같은 내용이면 같은 멱등키를 다시 쓴다 — 서버가 1건으로 처리하도록(§0.8).
    // 새 키로 재시도하면 같은 회원에게 두 번 발행된다
    const key =
      lastSent.current && isSameGrant(lastSent.current.req, req)
        ? lastSent.current.key
        : newIdempotencyKey()
    lastSent.current = { key, req }

    setConfirming(false)
    setFailure(null)
    setDuplicate(false)
    setSubmitting(true)

    const res = await onGrant(req, key)
    setSubmitting(false)
    if (!res.ok) {
      setFailure({ code: res.code, msg: res.msg })
      // 서버가 필드 원인을 알려주면 해당 필드 아래로 옮겨 붙인다
      setErrors((prev) => ({
        ...prev,
        target: isGrantTargetCode(res.code)
          ? language === 'ko'
            ? adminFailureText(res.code, res.msg)
            : `Recipient is invalid (${res.code}).`
          : prev.target,
        amount: isGrantAmountCode(res.code)
          ? language === 'ko'
            ? adminFailureText(res.code, res.msg)
            : `Grant amount is invalid (${res.code}).`
          : prev.amount,
      }))
      return
    }

    // 같은 jobId가 다시 왔다 = 멱등 재생. 새 지급이 아니다
    if (seenJobs.current.has(res.data.jobId)) setDuplicate(true)
    seenJobs.current.add(res.data.jobId)

    setAccepted(res.data)
    // 확정은 폴링이 판단한다. 202를 성공으로 쓰지 않는다
    onAccepted(res.data.jobId)
  }

  const reset = () => {
    setValues(EMPTY_FORM)
    setErrors({})
    setAccepted(null)
    setFailure(null)
    setDuplicate(false)
    lastSent.current = null
    onAccepted(null)
  }

  const jobId = job?.jobId ?? accepted?.jobId ?? null

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel
        title={text('시연용 코인 지급', 'Demo coin grant')}
        description={text(
          '가입 기본 지급 100,000 YoYo(자동·1회) · 관리자 1회 최대 1,000,000 YoYo · 회원당 누적 상한 없음(시연)',
          'Signup grant 100,000 YoYo (automatic, once) · administrator maximum 1,000,000 YoYo per grant · no per-member cumulative limit in the demo',
        )}
      >
        <div className="flex flex-col gap-4">
          <AdminField
            label={text('대상 지갑 주소', 'Recipient wallet address')}
            htmlFor={ids.address}
            required
            error={errors.target}
            hint={text(
              '등록된 지갑 주소로 지급합니다. 회원 검색은 연결할 API가 없어 제공하지 않습니다.',
              'Grants go to a registered wallet address. Member search is unavailable because there is no connected API.',
            )}
          >
            {values.memberId != null ? (
              // 이력에서 채운 값. 주소가 없던 건은 회원 ID로만 보낸다(둘은 택일이다)
              <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-ground px-3 py-2">
                <span className="font-sans text-[13px] text-ink">
                  {text('회원', 'Member')} #{values.memberId}
                </span>
                <Button
                  sm
                  variant="secondary"
                  disabled={busy}
                  onClick={() => patch({ memberId: null })}
                >
                  {text('해제', 'Clear')}
                </Button>
              </div>
            ) : (
              <Input
                id={ids.address}
                value={values.address}
                disabled={busy}
                placeholder="0x…"
                invalid={Boolean(errors.target)}
                onChange={(e) => patch({ address: e.target.value })}
              />
            )}
          </AdminField>

          <AdminField
            label={text('금액 (YoYo 정수)', 'Amount (whole YoYo)')}
            htmlFor={ids.amount}
            required
            error={errors.amount}
            hint={text(
              `${GRANT_MIN_AMOUNT.toLocaleString('ko-KR')} 이상 ${GRANT_MAX_AMOUNT.toLocaleString('ko-KR')} 이하. 가입 기본 지급은 ${formatYoyo(SIGNUP_GRANT_AMOUNT)}입니다.`,
              `${GRANT_MIN_AMOUNT.toLocaleString('en-US')}–${GRANT_MAX_AMOUNT.toLocaleString('en-US')} YoYo. The signup grant is ${formatYoyo(SIGNUP_GRANT_AMOUNT)}.`,
            )}
          >
            <Input
              id={ids.amount}
              value={values.amount}
              disabled={busy}
              inputMode="numeric"
              placeholder="200000"
              invalid={Boolean(errors.amount)}
              onChange={(e) => patch({ amount: e.target.value })}
            />
          </AdminField>

          <AdminField
            label={text('메모 (지급 사유)', 'Memo (grant reason)')}
            htmlFor={ids.memo}
            required
            error={errors.memo}
            hint={text(
              `감사 로그와 지갑 이력에 그대로 남습니다. ${values.memo.trim().length}/${GRANT_MEMO_MAX}자`,
              `Stored in the audit log and wallet history. ${values.memo.trim().length}/${GRANT_MEMO_MAX} characters`,
            )}
          >
            <Input
              id={ids.memo}
              value={values.memo}
              disabled={busy}
              maxLength={GRANT_MEMO_MAX}
              placeholder={text('리허설 시연용 잔액 보충', 'Demo balance top-up')}
              invalid={Boolean(errors.memo)}
              onChange={(e) => patch({ memo: e.target.value })}
            />
          </AdminField>

          {disabled && disabledReason && (
            <AdminNotice
              tone="danger"
              title={text('지금은 지급할 수 없습니다', 'Grants are unavailable')}
            >
              {disabledReason}
            </AdminNotice>
          )}

          {/* 진행·결과 — §5.2. 관리자 화면이라 jobId·tx를 그대로 노출한다 */}
          {phase === 'processing' && jobId && (
            <div className="flex flex-col gap-1 rounded-card border border-line bg-ground px-3 py-2">
              <div className="flex items-center gap-2">
                <ChainJobStatusBadge status={jobStatus ?? 'PENDING'} />
                <span className="font-sans text-[12px] text-muted">
                  {timedOut
                    ? text(
                        '온체인 확정이 늦어지고 있습니다. 상태를 다시 확인해 주세요.',
                        'On-chain confirmation is taking longer than expected. Check the status again.',
                      )
                    : text(
                        '온체인 확정을 기다리는 중입니다. 이 화면을 떠나도 처리는 계속됩니다.',
                        'Waiting for on-chain confirmation. Processing continues if you leave this screen.',
                      )}
                </span>
              </div>
              <AdminRow label={text('작업', 'Job')}>
                <span className="font-mono text-[12px]">{jobId}</span>
              </AdminRow>
            </div>
          )}

          {phase === 'done' && (
            <AdminResultLine tone="ok">
              {duplicate
                ? text(
                    '이미 처리된 지급입니다. 같은 대상·금액·메모라 새로 발행하지 않았습니다.',
                    'This grant was already processed. No new coins were minted for the same recipient, amount, and memo.',
                  )
                : text('지급이 확정되었습니다.', 'The grant is confirmed.')}
              {job?.txHash && (
                <>
                  {' '}
                  tx{' '}
                  <TxLink
                    value={job.txHash}
                    url={job.explorerUrl}
                    label={text('지급 트랜잭션', 'Grant transaction')}
                  />
                </>
              )}
            </AdminResultLine>
          )}

          {phase === 'failed' && (
            <AdminResultLine tone="danger">
              {/* 요청 실패(4xx·5xx)면 그 코드, 체인 실패면 `failureReason`을 그대로 옮긴다 */}
              {language === 'ko'
                ? (adminFailureText(failure?.code ?? job?.failureReason, failure?.msg) ??
                  '지급에 실패했습니다.')
                : `Grant failed (${failure?.code ?? job?.failureReason ?? 'UNKNOWN'}).`}
              {/* ⚠ 값이 없을 때(체인 응답 전)는 안내를 내지 않는다 — 모르는 것을 단정하지 않는다 */}
              {job?.retryable === true &&
                text(
                  ' 같은 내용으로 다시 시도할 수 있습니다.',
                  ' You can retry with the same details.',
                )}
            </AdminResultLine>
          )}

          {/* PC는 하단 고정을 쓰지 않는다 — 폼 마지막 줄 오른쪽(§5.19) */}
          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            {(phase === 'done' || phase === 'failed') && (
              <Button variant="secondary" onClick={reset}>
                {text('새 지급 입력', 'New grant')}
              </Button>
            )}
            <Button variant="primary" disabled={disabled || busy} onClick={openConfirm}>
              {busy
                ? text('처리 중', 'Processing')
                : phase === 'failed'
                  ? text('같은 내용으로 재시도', 'Retry same grant')
                  : text('지급하기', 'Grant coins')}
            </Button>
          </div>
        </div>
      </AdminPanel>

      {/* §5.6 확인 모달 — 무엇이 얼마나 바뀌는지 숫자로 먼저 보여준다.
          대상의 **현재 잔액은 그리지 않는다** — 임의 주소의 잔액을 읽는 API가 v6에 없다 */}
      <ConfirmDialog
        open={confirming}
        busy={submitting}
        title={text('이 내용으로 코인을 지급할까요?', 'Grant coins with these details?')}
        confirmVariant="danger"
        confirmLabel={text('지급', 'Grant')}
        cancelLabel={text('취소', 'Cancel')}
        onClose={() => setConfirming(false)}
        onConfirm={() => void submit()}
        body={
          <div className="flex flex-col gap-1">
            <span>
              {text('대상', 'Recipient')}{' '}
              <strong className="text-ink">
                {values.memberId != null
                  ? `${text('회원', 'Member')} #${values.memberId}`
                  : shortenHex(values.address.trim())}
              </strong>
            </span>
            <span>
              {text('금액', 'Amount')}{' '}
              <strong className="text-ink tabular-nums">
                {amountNumber != null ? formatYoyo(amountNumber) : '—'}
              </strong>
            </span>
            {totalSupply != null && amountNumber != null && (
              <span>
                {text('총 발행량', 'Total supply')}{' '}
                <strong className="text-ink tabular-nums">{formatYoyo(totalSupply)}</strong> →{' '}
                <strong className="text-ink tabular-nums">
                  {formatYoyo(totalSupply + amountNumber)}
                </strong>
              </span>
            )}
            <span>
              {text('메모', 'Memo')} {values.memo.trim() || '—'}
            </span>
            <span className="text-muted">
              {text(
                '코인 발행은 되돌릴 수 없습니다. 소각 경로가 없어 총 발행량은 줄어들지 않습니다.',
                'Coin issuance cannot be reversed. There is no burn path, so total supply will not decrease.',
              )}
            </span>
          </div>
        }
      />
    </div>
  )
}
