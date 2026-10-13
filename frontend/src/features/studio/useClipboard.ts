/**
 * 복사 상태를 키 단위로 들고 있는 훅 — 스튜디오(P) 화면 공용.
 *
 * 정본 — 화면설계 v6 §5.8 링크 복사·공유 · §5.3 tx 링크(주소 축약 + 전체 복사)
 *
 * 한 화면에 복사 버튼이 여럿(P-02 지갑 주소 + 거래 tx, P-08 주소 N개 + 공유 링크)이라
 * "무엇을 복사했는지"를 키로 구분해야 엉뚱한 버튼에 "복사됨"이 뜨지 않는다.
 *
 * `navigator.clipboard`는 보안 컨텍스트(https·localhost)에서만 있다. 없으면 실패를 숨기지 않고
 * 실패했다고 말한다 — 조용히 아무 일도 안 하면 사용자는 복사된 줄 안다.
 *
 * 2026-09-09 P-02 작업에서 `SettlementDashboard`의 지역 훅을 여기로 올렸다. 같은 규칙을
 * 쓰는 화면이 둘 이상이 되면서(P-02 지갑 주소, P-08 분배 주소·공유 링크) 복사본이 갈라질 참이었다.
 * 컴포넌트 파일은 컴포넌트만 export해야 해서(Fast Refresh) 훅을 그 파일에 둘 수 없다.
 */

import { useCallback, useEffect, useState } from 'react'

export interface Clipboard {
  /** 방금 복사한 대상의 키. 2초 뒤 스스로 비운다 */
  copiedKey: string | null
  /** 마지막 시도가 실패했는가(보안 컨텍스트가 아니거나 권한 거부) */
  failed: boolean
  copy: (key: string, value: string) => void
}

export function useClipboard(): Clipboard {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copiedKey) return
    const timer = setTimeout(() => {
      setCopiedKey(null)
      setFailed(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [copiedKey])

  const copy = useCallback((key: string, value: string) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(value)
        setFailed(false)
      } catch {
        setFailed(true)
      }
      setCopiedKey(key)
    })()
  }, [])

  return { copiedKey, failed, copy }
}
