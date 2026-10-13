import type { ComponentType } from 'react'

/**
 * named export로 공개된 화면을 React Router의 lazy route 모듈 형태로 바꾼다.
 *
 * 각 화면 파일을 직접 import해야 Vite가 화면 단위 청크를 만들 수 있다. 배럴 파일 전체를
 * 동적 import하면 서로 관계없는 관리자·스튜디오 화면까지 같은 청크로 다시 합쳐질 수 있다.
 */
export function lazyPage<
  TKey extends PropertyKey,
  TModule extends Record<TKey, ComponentType>,
>(
  loader: () => Promise<TModule>,
  key: TKey,
) {
  return async (): Promise<{ Component: ComponentType }> => {
    const module = await loader()
    return { Component: module[key] }
  }
}
