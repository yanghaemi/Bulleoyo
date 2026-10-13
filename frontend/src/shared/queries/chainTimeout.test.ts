/**
 * 폴링 상한이 서버 워커 설정과 같은 값인지 지킨다.
 *
 * `CHAIN_JOB_POLL_TIMEOUT_MS`는 백엔드의 `b204.chain.worker.receipt-timeout-seconds`와 **쌍**이다.
 * 한쪽만 바꾸면 조용히 어긋난다 — 프론트가 먼저 포기하면 서버가 곧 닫을 job 을 실패로 보이게 하고,
 * 반대면 워커가 닫은 뒤에도 화면이 계속 돈다. 코드 리뷰로는 두 파일이 멀어 잘 안 잡히니 여기서 잡는다.
 *
 * 이 검사가 깨지면 둘 중 하나를 고쳐 값을 맞춘다. 프론트만 고쳐서 통과시키지 말 것 —
 * 서버가 정본이다.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHAIN_JOB_POLL_TIMEOUT_MS } from '@/shared/queries/chain'

// jsdom 환경에서는 `import.meta.url` 이 file: 가 아니라 http: 라 fileURLToPath 가 던진다.
// vitest 의 cwd 는 frontend/ 다.
const APPLICATION_YML = resolve(process.cwd(), '../backend/src/main/resources/application.yml')

describe('체인 job 폴링 상한', () => {
  it('백엔드 receipt-timeout-seconds 와 같은 값이다', () => {
    const yml = readFileSync(APPLICATION_YML, 'utf8')
    const matched = /receipt-timeout-seconds:\s*(\d+)/.exec(yml)

    expect(matched, 'application.yml 에서 receipt-timeout-seconds 를 찾지 못했다').not.toBeNull()
    expect(CHAIN_JOB_POLL_TIMEOUT_MS).toBe(Number(matched![1]) * 1000)
  })
})
