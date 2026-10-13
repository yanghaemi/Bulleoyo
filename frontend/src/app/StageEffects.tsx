/**
 * 공연 탐색 화면 전용 무대 효과.
 *
 * 거래·지갑·정산·관리자 화면에서는 시각 집중과 GPU 비용을 위해 마운트하지 않는다. Hero의
 * StageFlare/HeroBackdrop은 각 화면 안에서 별도로 관리하고, 이 컴포넌트는 body 뒤의 공통 무대와
 * 커서 블룸만 담당한다.
 */

import { useLocation } from 'react-router'

import { isStageRoute } from '@/app/stageRoutes'
import { AmbientBackdrop } from '@/shared/fx/AmbientBackdrop'
import { StageBloom } from '@/shared/fx/StageBloom'

export function StageEffects() {
  const { pathname } = useLocation()

  if (!isStageRoute(pathname)) return null

  return (
    <>
      <AmbientBackdrop />
      <StageBloom />
    </>
  )
}
