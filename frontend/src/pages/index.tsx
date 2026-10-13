/**
 * 즉시 필요한 작은 라우트 유틸리티만 내보낸다.
 *
 * 화면 컴포넌트는 이 배럴을 통하지 않고 app/router.tsx에서 각 파일을 직접 동적 import한다.
 * 그래야 홈 진입 시 관리자·스튜디오 화면 코드까지 초기 청크에 합쳐지지 않는다.
 */

import { Navigate, useParams } from 'react-router'

/**
 * v6에서 삭제된 양도 링크(A-09)로 들어온 사용자를 그 티켓 상세로 돌려보낸다(§8.3).
 * 이미 공유된 옛 링크가 404로 죽지 않게 하는 장치다.
 */
export function RedirectTransferToTicket() {
  const { ticketId } = useParams()
  return <Navigate to={ticketId ? `/tickets/${ticketId}` : '/'} replace />
}
