/**
 * rule 도메인 TanStack Query 훅 — API-rule-01 ~ 05.
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §5 · §0.3 · §0.4
 * 요청 함수는 `@/shared/api/domains/rule`, 키는 `@/shared/queries/keys`에만 있다.
 *
 * ─────────────────────── 이 도메인의 무효화가 특히 중요한 이유 ───────────────────────
 * 동의 현황이 **판매 시작 가능 여부를 결정**한다(`startSaleAvailable`). 규칙을 다시 저장하면
 * `rulesHash`가 바뀌며 기존 동의가 전부 PENDING으로 초기화되고, 동의가 하나라도 남아 있으면
 * `RULE_NOT_AGREED_BY_ALL`로 판매 시작이 막힌다. 그래서 규칙·동의를 건드리는 모든 변경 뒤에
 * `qk.rule`과 `qk.performance.details()`를 함께 무효화한다. 하나라도 빠지면
 * **"동의했는데 판매 시작 버튼이 안 열리는"** 증상이 난다 — 서버는 맞고 화면만 틀린 상태다.
 *
 * 판단은 서버 값(`startSaleAvailable`·`startSaleBlockedReason`)을 그대로 쓴다.
 * 동의 배열을 프론트가 세어 판단하지 않는다 — 보증금·팀 수·잠금까지 보는 판단이라 어긋난다.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchRuleStatus,
  prepareAgreement,
  reportAgreementSignedTx,
  setRules,
  startSale,
  type AgreementPrepareRequest,
  type AgreementSignedTxRequest,
  type PerformanceId,
  type RuleSetRequest,
  type SaleStartRequest,
} from '@/shared/api/domains/rule'
import { trackSignedTxReport } from '@/shared/blockchain/signingActivity'
import { LIVE_STALE_MS } from '@/shared/queries/freshness'
import { invalidatedBy, qk } from '@/shared/queries/keys'

/* ============================== 내부 헬퍼 ============================== */

function isValidId(id: number | undefined): boolean {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
}

type QueryEnableOptions = { enabled?: boolean; teamId?: number }

/**
 * `senderSignedRlp` 슬롯 비우기. 같은 구현이 `@/shared/queries/performance`에도 있다
 * (보증금·규칙 동의 두 벌뿐이라 공용 모듈을 새로 만들지 않았다 — 세 번째가 생기면 올린다).
 * 이유는 그쪽 주석 참고: TanStack이 variables를 참조로 붙들고 있어 그냥 두면 훅 상태에 남는다.
 */
function discardSignedRlp(variables: { senderSignedRlp: string }): void {
  variables.senderSignedRlp = ''
}

/* ============================== 조회 ============================== */

/**
 * API-rule-02 · 규칙·동의 현황 (P-05 · P-06).
 *
 * 규칙이 아직 없으면(DRAFT) 404 `COMMON_NOT_FOUND`가 온다. **오류가 아니라 빈 상태**이므로
 * 화면은 이 코드를 "규칙을 먼저 설정하세요"로 처리한다. 클라이언트가 4xx를 재시도하지 않으므로
 * 여기서 retry를 따로 끌 필요는 없다(app/providers 기본값).
 */
export function useRuleStatus(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.rule.byPerformance(performanceId, options?.teamId),
    queryFn: () => fetchRuleStatus(performanceId, options?.teamId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
    // 다른 팀의 동의·보증금이 바꾸는 값이다. 창 복귀 때 다시 받도록 짧게 둔다(freshness.ts).
    staleTime: LIVE_STALE_MS,
  })
}

/* ============================== 변경 ============================== */

export type SetRulesVariables = {
  performanceId: PerformanceId
  body: RuleSetRequest
}

/**
 * API-rule-01 · 정산 규칙 저장 (P-05).
 *
 * 저장할 때마다 `rulesHash`가 재산출되고 **기존 동의가 전부 PENDING으로 초기화**되며
 * 공연이 DRAFT → PENDING_AGREEMENT로 간다. 규칙·공연 양쪽을 무효화해야
 * 동의 배지와 다음 행동 안내가 같이 맞는다.
 */
export function useSetRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: SetRulesVariables) => setRules(performanceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.rule.all })
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
    },
  })
}

export type PrepareAgreementVariables = {
  performanceId: PerformanceId
  body: AgreementPrepareRequest
}

/**
 * API-rule-03 · 규칙 동의 서명 파라미터 (P-06) — §0.4 ①.
 *
 * `body.rulesHash`는 rule_02에서 받은 현재 값을 그대로 넣는다. 다르면 409 `RULE_HASH_MISMATCH`이고,
 * 그때는 rule_02를 다시 불러 새 해시로 재시도한다.
 *
 * 응답 `signRequests`가 **빈 배열**로 올 수 있다 — 이미 온체인 동의가 있어 서버가 DB만 AGREED로
 * 맞춘 경우다. 오류가 아니라 "서명 없이 완료"이고, 이때 동의 현황이 바뀌므로 무효화한다.
 * 캐시에 담지 않는 이유는 `expiresAt`이 있는 일회용 값이기 때문이다.
 */
export function usePrepareAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: PrepareAgreementVariables) =>
      prepareAgreement(performanceId, body),
    onSuccess: (_data, { performanceId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.rule.byPerformance(performanceId) })
      // 서명 없이 완료(빈 signRequests)면 대시보드 행의 myTeamAgreementStatus·pendingSignature도 바뀐다.
      void queryClient.invalidateQueries({ queryKey: qk.performance.mines() })
    },
  })
}

export type ReportAgreementSignedTxVariables = {
  performanceId: PerformanceId
  /** [2026-09-24] 본인 확인 토큰(범위 RULE_AGREE·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string
} & AgreementSignedTxRequest

/**
 * API-rule-05 · 동의 발신자 서명 RLP 보고 (P-06) — §0.4 ③, **202 + jobId**.
 *
 * 보고 즉시 동의가 PENDING → SIGNING이 되므로 여기서 한 번 무효화하고,
 * AGREED 확정은 job이 CONFIRMED된 뒤다 — 반환된 `jobId`를 `useChainJob`으로 폴링하고
 * 확정 시 `invalidatedBy('AGREE')`로 다시 무효화한다. 그 매핑을 여기서도 그대로 쓴다
 * (`wallet` · `qk.rule.all` · `qk.performance.details()`).
 */
export function useReportAgreementSignedTx() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      performanceId,
      teamId,
      kind,
      senderSignedRlp,
      stepUpToken,
    }: ReportAgreementSignedTxVariables) =>
      // 서명을 마친 뒤 보고~확정 대기 동안 "처리 중" 오버레이(signingActivity)
      trackSignedTxReport(() =>
        reportAgreementSignedTx(performanceId, { teamId, kind, senderSignedRlp }, stepUpToken),
      ),
    onSuccess: () => {
      for (const queryKey of invalidatedBy('AGREE')) {
        void queryClient.invalidateQueries({ queryKey })
      }
      // `invalidatedBy('AGREE')`는 `qk.performance.details()`까지만 잡는다.
      // 대시보드(`qk.performance.mine`)의 myTeamAgreementStatus·pendingSignature도 바뀐다.
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
    },
    onSettled: (_data, _error, variables) => {
      discardSignedRlp(variables)
    },
  })
}

export type StartSaleVariables = {
  performanceId: PerformanceId
  body: SaleStartRequest
}

/**
 * API-rule-04 · 판매 시작 (P-06) — 운영자 tx, **202 + jobId**.
 *
 * tx가 확정돼야 PENDING_AGREEMENT → ON_SALE이다. 202만 보고 "판매 중"으로 바꾸면
 * 아직 열리지 않은 공연을 관객에게 노출하게 된다. `jobId`를 폴링해 CONFIRMED를 확인하라.
 *
 * 무효화는 `invalidatedBy('START_SALE')`에 맡긴다 — `ChainTxType`이 14종으로 정정되면서
 * 이 값이 들어왔다. 예전엔 12종이라 키를 직접 지정했는데, 그렇게 두면 무효화 대상이
 * 두 군데서 갈린다.
 *
 * ⚠ **`data.jobId`를 그대로 `useChainJob`에 넘기지 마라.** `createShow`가 아직이면 서버는
 *   `START_SALE` job을 만들지 않고 선행 job의 `prerequisiteJobId`만 준다. 그 경우
 *   `jobId`가 없어 폴링이 조용히 꺼진다. `saleStartPolling(data)`으로 갈라 쓰고,
 *   `phase === 'prerequisite'`면 그 job 확정 후 **이 뮤테이션을 다시 호출**해야 한다.
 */
export function useStartSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: StartSaleVariables) => startSale(performanceId, body),
    onSuccess: () => {
      // 202는 접수일 뿐이라 여기서 ON_SALE로 바꾸지 않는다. 확정 시점의 무효화는
      // useChainJob이 invalidatedBy로 처리한다. 여기서는 접수 직후 바뀌는 것만 건드린다.
      void queryClient.invalidateQueries({ queryKey: qk.rule.all })
      // 공개 목록에도 새로 등장하므로 detail만으로는 모자라다.
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
    },
  })
}
