import { useLocale } from '@/shared/i18n/useLocale'
/**
 * 지갑 주소 — 축약 표시 + 전체 복사 버튼.
 *
 * 정본 — 화면설계 v6 §5.3 tx 링크(주소도 같은 축약 규칙) · P-02 **모바일·접근성 고려**
 *        ("지갑 주소는 축약 표기 + 전체 복사 버튼")
 *
 * 주소 노출은 공연자 화면이라 허용된다(§1.2 원칙 11 — 관객 화면 A·C에는 노출하지 않는다).
 *
 * 복사 버튼의 터치 타겟은 모바일 44px, PC 32px다. 44px 정사각형을 PC에서도 유지하면
 * 한 줄 안에서 주소보다 버튼이 커 보인다 — 하한 규칙은 터치 입력을 위한 것이다.
 *
 * ⚠ `SettlementDashboard`에도 같은 역할의 지역 컴포넌트(`WalletAddress`)가 있다.
 * 이번 작업 범위(P-02·P-03·P-05) 밖이라 그 파일은 손대지 않았고, P-08을 다음에 만질 때
 * 여기로 모은다. 복사 훅(`useClipboard`)은 이미 한 벌로 합쳤다.
 */

import { shortenHex } from '@/shared/ui'
import type { Clipboard } from '@/features/studio/useClipboard'

interface Props {
  address: string
  /** 같은 화면의 다른 복사 버튼과 구분하는 키 */
  copyKey: string
  clipboard: Clipboard
  /** 복사 버튼의 접근 가능한 이름. 화면에 복사 대상이 여럿이면 서로 달라야 한다 */
  label?: string
}

export function WalletAddressCopy({ address, copyKey, clipboard, label }: Props) {
  const { text } = useLocale()
  const active = clipboard.copiedKey === copyKey
  return (
    <span className="inline-flex items-center gap-1">
      {/* 전체 주소는 title로 남긴다 — 축약만 보이면 대조할 방법이 없다 */}
      <span className="font-mono text-[13px] text-ink" title={address}>
        {shortenHex(address)}
      </span>
      <button
        type="button"
        aria-label={label ?? text('지갑 주소 복사', 'Copy wallet address')}
        title={address}
        onClick={() => clipboard.copy(copyKey, address)}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted transition-colors duration-150 ease-out hover:bg-ground-2 hover:text-ink md:h-8 md:w-8"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect
            x="4.5"
            y="4.5"
            width="7"
            height="7"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M9.5 2.5H3a1 1 0 0 0-1 1v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>
      {active && (
        // 복사 성공·실패는 클라이언트 자체 문구다(§5.5의 예외). 조용히 실패시키지 않는다
        <span role="status" className="font-sans text-[11px] text-muted">
          {clipboard.failed ? text('복사 실패', 'Copy failed') : text('복사됨', 'Copied')}
        </span>
      )}
    </span>
  )
}
