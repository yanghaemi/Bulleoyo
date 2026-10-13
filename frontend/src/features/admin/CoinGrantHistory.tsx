/**
 * M-03 지급 이력 목록.
 *
 * 정본 — 화면설계 v6 §4 M-03 컴포넌트 표 6행("지급 시각(KST)·대상(회원 표시명·주소 축약)·금액·
 *        메모·요청자·상태(처리 중/처리 완료/처리 실패)·tx 링크 / 필터(대상·기간)") ·
 *        **상태** 항목의 빈 상태·지급 실패(`FAILED`) 처리 · §5.1 `ChainJob.status` 라벨 ·
 *        §5.3 tx 링크 · §5.13 KST 병기 · §5.21 표 → 패널 접기
 *        API — `coin_08 GET /api/v1/admin/coin/grants` → `CoinGrantHistoryListResult`
 *
 * 표의 **열 순서를 두 폭에서 같게** 유지한다(§5.21) — PC 표에서 왼쪽에 있던 값이 모바일 패널에서도
 * 위에 온다. 가로 스크롤은 쓰지 않는다.
 *
 * ⚠ 명세 불일치 두 가지(불일치 목록에 올렸다).
 *   ① **실패 사유가 이력 응답에 없다.** M-03 상태 항목은 "이력 행에 **실패 사유**와 재시도 버튼을
 *      둔다"고 했지만 `CoinGrantHistoryItem`에는 `failureReason`이 없다(`chain_01`에만 있다).
 *      그래서 실패 행은 사유 자리를 만들되 값이 없으면 "작업 상태에서 확인"으로 두고, `jobId`를
 *      함께 노출해 관리자가 조회할 수 있게 했다.
 *   ② **재시도에 쓸 멱등키를 알 수 없다.** 응답의 `grantRef`는 멱등키 UUID의 **해시**라
 *      헤더에 되돌려 쓸 수 없다. 그래서 이 목록은 **지급을 직접 실행하지 않는다** —
 *      같은 내용을 지급 폼에 채워 주고, 관리자가 확인 모달을 다시 지나 새 멱등키로 보낸다.
 *      목록 버튼 하나로 바로 발행하면 앞선 요청이 사실은 확정돼 있었을 때 **두 번 발행된다**.
 */

import {
  AdminEmpty,
  AdminErrorPanel,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminSkeleton,
  ChainJobStatusBadge,
  TxLink,
} from '@/features/admin/AdminStates'
import { approxText, isAddressLike } from '@/features/admin/adminForms'
import { GRANT_SOURCE_LABEL, adminFailureText } from '@/features/admin/adminMessages'
import type {
  AdminError,
  CoinGrantHistory as CoinGrantHistoryData,
  CoinGrantHistoryItem,
  GrantHistoryFilter,
} from '@/features/admin/adminTypes'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Input, Money, formatYoyo, formatKst, shortenHex } from '@/shared/ui'

export interface CoinGrantHistoryProps {
  loading: boolean
  error?: AdminError | null
  history: CoinGrantHistoryData | null
  filter: GrantHistoryFilter
  onFilterChange: (filter: GrantHistoryFilter) => void
  onRetry: () => void
  /** 실패 행의 내용을 지급 폼에 채운다. **여기서 지급하지 않는다**(머리말 ②) */
  onRetryGrant: (item: CoinGrantHistoryItem) => void
}

export function CoinGrantHistory({
  loading,
  error,
  history,
  filter,
  onFilterChange,
  onRetry,
  onRetryGrant,
}: CoinGrantHistoryProps) {
  const { language, text } = useLocale()
  // 서버가 못 거르는 대상 입력(표시명 등)을 조용히 무시하지 않고 알린다
  const target = filter.target.trim()
  const targetIgnored = target !== '' && !isAddressLike(target) && !/^\d+$/.test(target)

  return (
    <AdminPanel
      title={text('지급 이력', 'Grant history')}
      description={
        history
          ? text(
              `총 ${history.summary.grantCount.toLocaleString('ko-KR')}건 · ${formatYoyo(history.summary.grantedTotal)} — 가입 기본 ${history.summary.signupCount}건(${formatYoyo(history.summary.signupTotal)}) · 관리자 ${history.summary.adminCount}건(${formatYoyo(history.summary.adminTotal)})`,
              `${history.summary.grantCount.toLocaleString('en-US')} grants · ${formatYoyo(history.summary.grantedTotal)} — signup ${history.summary.signupCount} (${formatYoyo(history.summary.signupTotal)}) · administrator ${history.summary.adminCount} (${formatYoyo(history.summary.adminTotal)})`,
            )
          : undefined
      }
    >
      {/* 필터(대상·기간) — 서버 쿼리 `memberId`·`address`·`from`·`to`에 대응한다.
          ⚠ coin_08에 **표시명 검색 파라미터가 없다.** 회원 ID(숫자)나 0x 주소만 서버가 거른다 */}
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input
          value={filter.target}
          placeholder={text('대상 — 회원 ID 또는 0x 주소', 'Target — member ID or 0x address')}
          aria-label={text('대상 필터', 'Target filter')}
          onChange={(e) => onFilterChange({ ...filter, target: e.target.value })}
        />
        <Input
          type="date"
          value={filter.from}
          aria-label={text('시작일', 'Start date')}
          onChange={(e) => onFilterChange({ ...filter, from: e.target.value })}
        />
        <Input
          type="date"
          value={filter.to}
          aria-label={text('종료일', 'End date')}
          onChange={(e) => onFilterChange({ ...filter, to: e.target.value })}
        />
      </div>

      {targetIgnored && (
        <div className="mb-3">
          <AdminNotice
            tone="info"
            title={text('대상 필터가 적용되지 않았습니다', 'Target filter was not applied')}
          >
            {text(
              '지급 이력은 회원 ID 또는 지갑 주소로만 찾을 수 있습니다(표시명 검색 파라미터가 없습니다). 아래 목록은 필터 없이 불러온 결과입니다.',
              'Grant history can only be filtered by member ID or wallet address. Display-name search is not available, so the list below is unfiltered.',
            )}
          </AdminNotice>
        </div>
      )}

      {loading ? (
        <AdminSkeleton label={text('지급 이력을 불러오는 중', 'Loading grant history')} rows={3} />
      ) : error ? (
        <AdminErrorPanel
          title={text('지급 이력을 불러오지 못했습니다', 'Could not load grant history')}
          msg={
            language === 'ko'
              ? (adminFailureText(error.code, error.msg) ?? '')
              : (error.msg ?? 'Could not load grant history.')
          }
          onRetry={onRetry}
        />
      ) : !history || history.items.length === 0 ? (
        <AdminEmpty>{text('아직 지급 내역이 없습니다', 'No grants yet')}</AdminEmpty>
      ) : (
        <>
          {/* ── PC 표 ── 열 순서: 시각 → 대상 → 금액 → 메모 → 요청자 → 상태 → tx */}
          <table className="hidden w-full border-collapse md:table">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                  {text('지급 시각', 'Granted at')}
                </th>
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                  {text('대상', 'Target')}
                </th>
                <th className="py-2 text-right font-sans text-[11px] font-semibold text-muted">
                  {text('금액', 'Amount')}
                </th>
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                  {text('메모', 'Memo')}
                </th>
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                  {text('요청자', 'Requester')}
                </th>
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">
                  {text('상태', 'Status')}
                </th>
                <th className="py-2 font-sans text-[11px] font-semibold text-muted">tx</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((item) => (
                <tr key={item.jobId} className="border-b border-line align-top last:border-b-0">
                  <td className="py-2 font-sans text-[12px] text-ink">
                    {formatKst(item.requestedAt, undefined, language)}
                  </td>
                  <td className="py-2">
                    <span className="block font-sans text-[13px] text-ink">{item.memberName}</span>
                    <span className="block font-mono text-[11px] text-muted" title={item.address}>
                      {shortenHex(item.address)}
                    </span>
                  </td>
                  <td className="py-2 text-right font-sans text-[13px] text-ink tabular-nums">
                    <Money
                      amount={item.amount}
                      approx={approxText(item.amount, history.rate?.rate, history.rate?.currency)}
                    />
                  </td>
                  <td className="max-w-[220px] py-2 font-sans text-[12px] text-muted">
                    {item.memo}
                  </td>
                  <td className="py-2 font-sans text-[12px] text-muted">
                    {/* 가입 자동 지급은 요청자가 없다(`requesterId: null`) */}
                    {item.requesterName ??
                      text(
                        GRANT_SOURCE_LABEL[item.source] ?? item.source,
                        item.source === 'SIGNUP' ? 'Signup' : 'Administrator',
                      )}
                  </td>
                  <td className="py-2">
                    <ChainJobStatusBadge status={item.status} />
                    {item.status === 'FAILED' && (
                      <div className="mt-1">
                        <Button sm variant="secondary" onClick={() => onRetryGrant(item)}>
                          {text('지급 폼에 채우기', 'Fill grant form')}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    {item.txHash ? (
                      <TxLink
                        value={item.txHash}
                        url={item.explorerUrl}
                        label={text('지급 트랜잭션', 'Grant transaction')}
                      />
                    ) : (
                      <span className="font-mono text-[11px] text-muted">{item.jobId}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── 모바일 패널(§5.21) ── 접었을 때도 열 순서를 바꾸지 않는다 */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {history.items.map((item) => (
              <li
                key={item.jobId}
                className="rounded-card border border-line bg-ground px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="m-0 font-sans text-[13px] font-semibold text-ink">
                    {formatKst(item.requestedAt, undefined, language)}
                  </p>
                  <ChainJobStatusBadge status={item.status} />
                </div>
                <AdminRow label={text('대상', 'Target')}>
                  {item.memberName}{' '}
                  <span className="font-mono text-[11px] text-muted">
                    {shortenHex(item.address)}
                  </span>
                </AdminRow>
                <AdminRow label={text('금액', 'Amount')}>{formatYoyo(item.amount)}</AdminRow>
                <AdminRow label={text('메모', 'Memo')}>{item.memo}</AdminRow>
                <AdminRow label={text('요청자', 'Requester')}>
                  {item.requesterName ??
                    text(
                      GRANT_SOURCE_LABEL[item.source] ?? item.source,
                      item.source === 'SIGNUP' ? 'Signup' : 'Administrator',
                    )}
                </AdminRow>
                <AdminRow label="tx">
                  {item.txHash ? (
                    <TxLink
                      value={item.txHash}
                      url={item.explorerUrl}
                      label={text('지급 트랜잭션', 'Grant transaction')}
                    />
                  ) : (
                    <span className="font-mono text-[11px] text-muted">{item.jobId}</span>
                  )}
                </AdminRow>
                {item.status === 'FAILED' && (
                  <div className="mt-2 flex flex-col gap-1">
                    {/* ⚠ 실패 사유가 이력 응답에 없다 — jobId로 작업 상태를 조회해야 한다 */}
                    <p className="m-0 font-sans text-[11px] text-muted">
                      {text(
                        `실패 사유는 작업 상태에서 확인하세요 (작업 ${item.jobId})`,
                        `Check the job status for the failure reason (job ${item.jobId})`,
                      )}
                    </p>
                    <Button sm variant="secondary" onClick={() => onRetryGrant(item)}>
                      {text('지급 폼에 채우기', 'Fill grant form')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminPanel>
  )
}
