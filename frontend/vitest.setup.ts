import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// `waitFor`·`findBy*` 의 기본 한도는 1초이고 **`testTimeout` 이 덮지 않는다.** 부하가 걸린 CI 에서
// 테스트가 10배 느려지면(MR !176 근거) 평소 150ms 짜리 대기가 1.5초가 되어, 15초짜리 테스트
// 예산이 남아 있는데도 이쪽이 먼저 터진다. 45개 파일이 이 유틸을 쓰는데 개별 `timeout` 을 박아
// 피해 가는 것은 다섯 곳뿐이라, 한도를 여기 한 곳에 둔다(개별 인자는 그대로 우선한다).
configure({ asyncUtilTimeout: 5_000 })

// 이 가드는 남긴다 — 아래 저장소 정리와 정책이 다른 이유가 있다. scrollTo 스터빙은 **편의**라
// window 가 없는 환경(`// @vitest-environment node`)에서는 건너뛰어도 그 파일의 테스트가 옳다.
// 반면 저장소 정리는 **격리**라 조용히 건너뛰면 테스트가 서로 오염된다(MR !120 의 CI flake) —
// 그래서 그쪽만 가드를 두지 않는다. 가드가 없으면 node 환경 파일에서 ReferenceError 로
// 그 파일 전체가 죽는다(MR !138 컨설턴트님 지적).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: () => undefined,
  })
}

// 저장소 격리는 teardown 이 아니라 setup 에서 한다. 로고가 안정 상태가 되며 남기는
// sessionStorage 쓰기는 effect 라서, cleanup() 의 unmount 가 밀린 effect 를 flush 할 때
// 파일별 afterEach 의 clear 보다 늦게 도착할 수 있다 — 부하가 걸린 CI 에서만 다음 테스트로
// 새어 들어가 흔들렸다. 다음 테스트 시작 시점의 clear 는 그 순서와 무관하게 결정적이다.
// 파일별 afterEach 에 clear 를 두지 않는다 — after 훅은 역순(stack)이라 그 clear 가 cleanup() 보다
// 먼저 돌아 이 누수를 구조적으로 못 막는다. localStorage 도 테마·refresh 토큰이 같은 식으로 남을 수 있어 같이 비운다.
// 가드(?.)는 두지 않는다 — 환경이 jsdom 고정이라, 저장소가 없으면 격리를 조용히 끄지 말고 여기서 실패해야 한다.
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
