/**
 * WebGPU 전역 타입(`GPUCanvasContext`·`GPUTextureFormat` …)을 끌어온다.
 *
 * 왜 필요한가 — `tsconfig.app.json`이 `types: ["vite/client", "vitest/globals"]`로
 * 전역 타입 패키지를 **화이트리스트**로 막아 두었고, `vgpu/dist/*.d.ts`는 WebGPU 전역을
 * 그냥 참조만 한다. 그래서 이 줄이 없으면 `tsc -b`가 vgpu 안에서 TS2304로 30개쯤 깨진다.
 *
 * 왜 `@webgpu/types`를 직접 devDependency로 넣지 않았나 — pnpm 엄격 모드에서
 * `@webgpu/types`는 vgpu의 전이 의존이라 최상위 `node_modules`에 올라오지 않는다.
 * `vgpu/client`(= vgpu가 스스로 `@webgpu/types`를 참조하는 진입점)를 가리키면
 * vgpu 자신의 의존 트리에서 풀리므로 의존성을 하나도 더 늘리지 않는다.
 *
 * 롤백 — `HeroBackdrop.tsx`와 함께 지운다.
 */
/// <reference types="vgpu/client" />
