import { useEffect } from 'react'

const PRETENDARD_STYLESHEET =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css'

export function useIdentityFont(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let link = document.head.querySelector<HTMLLinkElement>(`link[href="${PRETENDARD_STYLESHEET}"]`)
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = PRETENDARD_STYLESHEET
      document.head.appendChild(link)
    }
    link.dataset.editorialLabFont = 'pretendard'
  }, [enabled])
}
