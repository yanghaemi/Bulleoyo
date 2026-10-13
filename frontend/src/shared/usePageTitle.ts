/**
 * 라우트별 문서 제목·링크 미리보기.
 *
 * ── 왜 생겼나 (2026-09-10 화면 감사) ────────────────────────────────
 * 33개 화면이 **전부** 탭 제목 `B204`를 달고 있었다. 내부 프로젝트 코드가 서비스 이름
 * 자리에 들어가 있었고, 라우트가 바뀌어도 그대로였다 — 저장소 어디에도 `document.title`을
 * 세팅하는 코드가 없었다. 파비콘까지 없어서 탭을 여러 개 열면 **어느 탭이 어느 화면인지
 * 구별할 단서가 하나도 없었다.**
 *
 * ── 왜 라이브러리를 안 쓰나 ─────────────────────────────────────────
 * `react-helmet` 계열은 이 용도에 과하다. 우리가 바꾸는 건 제목과 og 두어 개뿐이고,
 * SSR도 없다. 훅 하나면 끝난다.
 *
 * ⚠ **크롤러는 이 값을 못 본다.** SPA라 og 태그를 JS가 바꾸는데, 카카오톡·슬랙 봇은
 *   대부분 JS를 실행하지 않고 `index.html`의 정적 값을 읽는다. 즉 이 훅은 **사람이 보는
 *   탭 제목**을 고치는 것이고, 링크 미리보기를 제대로 하려면 서버·프리렌더가 필요하다.
 *   V-03 공유 링크가 그 대상이라 불일치 목록에 올려 두었다. 정적 폴백은 `index.html`에 있다.
 */

import { useEffect } from 'react'

/** `index.html`의 기본값과 같아야 한다 — 라우트가 제목을 안 주면 여기로 돌아온다 */
const BRAND = '불러요'
const DEFAULT_DESCRIPTION =
  '소규모 공연 티켓팅과 공동 정산. 티켓을 사고, 응원할 팀을 고르고, 정산 결과를 누구나 확인합니다.'

function setMeta(selector: string, value: string): void {
  const el = document.head.querySelector<HTMLMetaElement>(selector)
  if (el) el.content = value
}

/**
 * @param title 화면 제목. 비우면 브랜드명만 남는다
 * @param description 링크 미리보기 설명. 비우면 `index.html`과 같은 기본 설명으로 복구한다
 *
 * 제목 형식은 `화면 · 불러요`다. 가운뎃점을 쓰는 이유 — 공연명에 하이픈이 흔하고
 * (`aespa — Synk: Parallel Line`) 구분자가 제목 안 문자와 섞이면 어디서 끊기는지 알 수 없다.
 */
export function usePageTitle(title?: string, description?: string): void {
  useEffect(() => {
    const full = title ? `${title} · ${BRAND}` : BRAND
    const resolvedDescription = description ?? DEFAULT_DESCRIPTION
    document.title = full
    setMeta('meta[property="og:title"]', full)
    setMeta('meta[name="description"]', resolvedDescription)
    setMeta('meta[property="og:description"]', resolvedDescription)
  }, [title, description])
}
