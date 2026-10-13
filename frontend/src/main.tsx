/**
 * 진입점.
 *
 * 여기서는 조립만 한다. 프로바이더 구성은 `app/providers`, 라우트는 `app/router`가 갖는다.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/app/providers'
import { initTheme } from '@/shared/theme'
import '@/styles.css'
import '@/styles/screens-refresh.css'

// 테마 적용의 주인은 앱이다. index.html의 인라인 스크립트가 첫 페인트를 이미 맞춰 놨으므로
// 여기서는 같은 값을 다시 쓰기만 한다(멱등). 스위치는 표시와 사용자 입력만 담당한다.
initTheme()

const container = document.getElementById('root')
if (!container) throw new Error('#root 엘리먼트를 찾지 못했습니다.')

createRoot(container).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
