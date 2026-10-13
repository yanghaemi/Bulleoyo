/**
 * 409 공통 문구층의 규약 고정(S15P21B204-121 항목 3).
 *
 * 여기서 지키는 것 셋 —
 *  ① **백엔드 목록과의 싱크.** 실제 `ErrorCode.java`의 `HttpStatus.CONFLICT` 항목을 읽어
 *     Set으로 비교한다. 백엔드가 409를 추가·삭제하면 이 테스트가 깨지고, 그때
 *     "새 코드의 문구를 쓸 것인가 / 폴백으로 둘 것인가"를 사람이 정한다.
 *  ② **문구가 코드를 새게 두지 않는다.** 표에 담은 코드는 `TICKET_SALE_CLOSED` 같은 원문이
 *     사용자에게 보이면 안 된다(그건 폴백의 역할이다).
 *  ③ **같은 코드 = 같은 문구.** 도메인 맵 다섯(studio·admin·settlement·entry·member)이 이제
 *     이 층을 부른다. 각 맵이 남긴 화면 맥락 override 목록과, 그 목록이 **실제로 다른 문장**인지를
 *     아래 "409는 공통층에 위임한다"가 고정한다 — -121의 완료 기준이 여기서 깨져야 한다.
 *
 * ⚠ 이 파일만 `@/features/*`를 import한다. 구조 규칙은 shared → features 방향을 금지하지만
 * (기술 스택 v3 §3.2) 이것은 **테스트 전용 대조**이고 번들에 들어가지 않는다.
 * `errorMessages.ts` 본체에는 features import가 없다.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_CONFLICT_OVERRIDES, adminMessage } from '@/features/admin/adminMessages'
import { ENTRY_CONFLICT_OVERRIDES, entryMessage } from '@/features/entry/entryErrors'
import {
  LOGIN_ERROR_FALLBACK,
  MEMBER_CONFLICT_OVERRIDES,
  loginErrorText,
} from '@/features/member/memberErrors'
import {
  SETTLEMENT_CONFLICT_OVERRIDES,
  settlementMessage,
} from '@/features/studio/settlementMessages'
import { STUDIO_CONFLICT_OVERRIDES, studioMessage } from '@/features/studio/studioErrors'

import {
  CONFLICT_CODES,
  CONFLICT_MESSAGES,
  conflictFailureText,
  conflictMessage,
  isConflictCode,
} from './errorMessages'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

/**
 * 백엔드 enum을 직접 읽는다. 프론트 목록을 복사한 fixture는 양쪽이 함께 낡아도 통과한다.
 * jsdom의 import.meta.url은 http:이므로 기존 계약 테스트처럼 frontend cwd에서 경로를 찾는다.
 */
const backendErrorCodeSource = readFileSync(
  resolve(process.cwd(), '../backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java'),
  'utf8',
)
const BACKEND_CONFLICT_CODES = Array.from(
  backendErrorCodeSource.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*\(\s*HttpStatus\.CONFLICT\s*,/gm),
  (match) => match[1],
)

/**
 * 프론트가 문구를 만들지 않고 폴백으로 흘리는 9개.
 * ERD v5에서 삭제된 도메인(환급·교환·NFT·양도)이라 화면이 이 코드를 받을 경로가 없다.
 */
const FALLBACK_ONLY_CODES = [
  'REDEEM_NOTHING_TO_REDEEM',
  'REDEEM_ACCOUNT_NOT_REGISTERED',
  'REDEEM_ALREADY_REQUESTED',
  'EXCHANGE_NOT_ALLOWED',
  'EXCHANGE_OPTION_UNAVAILABLE',
  'NFT_MINT_PENDING',
  'NFT_TRANSFER_NOT_ALLOWED',
  'TRANSFER_LINK_ALREADY_USED',
  'TRANSFER_NOT_ALLOWED',
] as const

describe('CONFLICT_CODES', () => {
  it('실제 백엔드 409에서 폴백 코드를 뺀 집합과 정확히 같다 — 백엔드 변경 누락을 잡는다', () => {
    const expected = new Set<string>(
      BACKEND_CONFLICT_CODES.filter(
        (code) => !(FALLBACK_ONLY_CODES as readonly string[]).includes(code),
      ),
    )

    expect(new Set<string>(CONFLICT_CODES)).toEqual(expected)
    expect(BACKEND_CONFLICT_CODES.length).toBeGreaterThan(0)
    for (const code of FALLBACK_ONLY_CODES) expect(BACKEND_CONFLICT_CODES).toContain(code)
  })

  it('백엔드 목록에 없는 코드를 표에 만들어 두지 않았다', () => {
    const backend = new Set<string>(BACKEND_CONFLICT_CODES)
    for (const code of CONFLICT_CODES) {
      expect(backend.has(code), `${code}가 ErrorCode.java의 CONFLICT 목록에 없다`).toBe(true)
    }
  })

  it('목록과 문구 표의 키가 같다 — 배열만 늘리고 문구를 빠뜨린 상태를 막는다', () => {
    expect(new Set(Object.keys(CONFLICT_MESSAGES))).toEqual(new Set<string>(CONFLICT_CODES))
  })

  it('-121이 이름 붙인 6개가 isConflictCode를 통과한다', () => {
    const named = [
      'COMMON_CONFLICT',
      'PERFORMANCE_INVALID_STATUS',
      'SETTLEMENT_ALREADY_RELEASED',
      'COIN_RESERVE_MISMATCH',
      'REFUND_AFTER_SETTLEMENT_LOCK',
      'RULE_SYNC_IN_PROGRESS',
    ]
    for (const code of named) {
      expect(isConflictCode(code), code).toBe(true)
    }
  })

  it('폴백 9개와 빈 값은 isConflictCode를 통과하지 못한다', () => {
    for (const code of FALLBACK_ONLY_CODES) {
      expect(isConflictCode(code), code).toBe(false)
    }
    expect(isConflictCode(null)).toBe(false)
    expect(isConflictCode(undefined)).toBe(false)
    expect(isConflictCode('')).toBe(false)
  })
})

describe('CONFLICT_MESSAGES', () => {
  it.each([...CONFLICT_CODES])('%s — en·ko가 비어 있지 않다', (code) => {
    const text = CONFLICT_MESSAGES[code]
    expect(text.en.trim().length).toBeGreaterThan(0)
    expect(text.ko.trim().length).toBeGreaterThan(0)
  })

  it.each([...CONFLICT_CODES])('%s — 문구에 코드 원문이 새지 않는다', (code) => {
    const text = CONFLICT_MESSAGES[code]
    expect(text.en).not.toContain(code)
    expect(text.ko).not.toContain(code)
    // 코드 이름의 일부(도메인 접두)만 새는 경우도 막는다
    const prefix = code.split('_')[0]
    expect(text.en).not.toContain(prefix)
    expect(text.ko).not.toContain(prefix)
  })
})

describe('conflictMessage', () => {
  it('가입 정보가 필요한 409에는 일반 오류 대신 가입 안내를 제공한다', () => {
    expect(conflictMessage('AUTH_SIGNUP_REQUIRED', 'ko')).toBe('가입 정보를 입력해 주세요.')
    expect(conflictMessage('AUTH_SIGNUP_REQUIRED', 'en')).toBe(
      'Enter your details to finish signing up.',
    )
    expect(loginErrorText('AUTH_SIGNUP_REQUIRED')).toEqual({
      en: 'Enter your details to finish signing up.',
      ko: '가입 정보를 입력해 주세요.',
    })
  })

  it('코드가 없으면 undefined — 실패가 아닌 상태에 문구를 만들지 않는다', () => {
    expect(conflictMessage(null, 'ko')).toBeUndefined()
    expect(conflictMessage(undefined, 'en')).toBeUndefined()
    expect(conflictMessage('', 'ko')).toBeUndefined()
  })

  it('표에 있는 코드는 언어별 문구를 그대로 낸다', () => {
    expect(conflictMessage('TICKET_SALE_CLOSED', 'ko')).toBe(
      CONFLICT_MESSAGES.TICKET_SALE_CLOSED.ko,
    )
    expect(conflictMessage('TICKET_SALE_CLOSED', 'en')).toBe(
      CONFLICT_MESSAGES.TICKET_SALE_CLOSED.en,
    )
  })

  it.each(['REDEEM_NOTHING_TO_REDEEM', 'NOT_A_REAL_CODE'])(
    '%s — 표에 없으면 문구를 지어내지 않고 코드를 괄호에 담는다',
    (code) => {
      expect(conflictMessage(code, 'ko')).toBe(`요청을 처리할 수 없습니다. (코드 ${code})`)
      expect(conflictMessage(code, 'en')).toBe(`We couldn't process this request. (code ${code})`)
      // 운영자가 그 코드로 신고할 수 있어야 한다
      expect(conflictMessage(code, 'ko')).toContain(code)
      expect(conflictMessage(code, 'en')).toContain(code)
    },
  )

  it('ko 폴백은 studioMessage의 폴백과 같은 문장이다 — 화면마다 다른 말을 하지 않는다', () => {
    expect(conflictMessage('NOT_A_REAL_CODE', 'ko')).toBe(studioMessage('NOT_A_REAL_CODE'))
  })
})

describe('conflictFailureText', () => {
  it('서버 msg를 뒤에 덧붙인다 — 대체하지 않는다(§5.5)', () => {
    expect(conflictFailureText('TICKET_SOLD_OUT', '남은 좌석 0석', 'ko')).toBe(
      `${CONFLICT_MESSAGES.TICKET_SOLD_OUT.ko} 남은 좌석 0석`,
    )
  })

  it('msg가 없으면 문구만 낸다', () => {
    expect(conflictFailureText('TICKET_SOLD_OUT', null, 'en')).toBe(
      CONFLICT_MESSAGES.TICKET_SOLD_OUT.en,
    )
  })

  it('코드도 msg도 없으면 undefined — 빈 문자열을 화면에 내려보내지 않는다', () => {
    expect(conflictFailureText(null, null, 'ko')).toBeUndefined()
    expect(conflictFailureText(undefined, '', 'en')).toBeUndefined()
  })

  it('코드가 없어도 msg만 있으면 msg를 낸다', () => {
    expect(conflictFailureText(null, '서버 문구', 'ko')).toBe('서버 문구')
  })
})

/**
 * -121 완료 기준 "같은 코드는 어느 화면에서나 같은 문구"를 **역방향**으로 고정한다.
 *
 * 위임 전에는 이 describe가 "공통층이 도메인 맵을 옮겨 적었는가"를 봤다. 이제 도메인 맵이
 * 공통층을 부르므로 그 대조는 자기참조다. 대신 두 가지를 본다 —
 *   ① override 목록에 **없는** 409 코드는 도메인 맵이 공통층과 **같은 문장**을 낸다.
 *   ② override 목록에 **있는** 코드는 **다른 문장**을 낸다. 같아졌다면 화면 맥락이 사라진
 *      것이므로 override를 지우라는 신호다(테스트가 깨져서 사람이 판단한다).
 * 목록 길이도 함께 박는다 — 누가 조용히 409 한 줄을 도메인 맵에 되살리면 ②가 깨지고,
 * override를 늘리면 길이가 깨진다.
 */
const DOMAIN_MAPS = [
  {
    name: 'studio',
    text: (code: string) => studioMessage(code),
    overrides: STUDIO_CONFLICT_OVERRIDES,
    size: 0,
  },
  {
    name: 'admin',
    text: (code: string) => adminMessage(code),
    overrides: ADMIN_CONFLICT_OVERRIDES,
    size: 1,
  },
  {
    name: 'settlement',
    text: (code: string) => settlementMessage(code),
    overrides: SETTLEMENT_CONFLICT_OVERRIDES,
    size: 9,
  },
  {
    name: 'entry',
    text: (code: string) => entryMessage(code),
    overrides: ENTRY_CONFLICT_OVERRIDES,
    size: 1,
  },
  {
    name: 'member',
    text: (code: string) => loginErrorText(code).ko,
    overrides: MEMBER_CONFLICT_OVERRIDES,
    size: 1,
  },
] as const

describe.each(DOMAIN_MAPS)('$name — 409는 공통층에 위임한다', ({ overrides, size, text }) => {
  it(`override는 ${size}개다 — 늘리거나 줄이면 여기서 먼저 깨진다`, () => {
    expect(overrides).toHaveLength(size)
    // 목록에 409가 아닌 코드를 넣어 두면 아래 대조가 통째로 조용해진다
    for (const code of overrides) expect(isConflictCode(code), code).toBe(true)
  })

  it.each([...CONFLICT_CODES])('%s', (code) => {
    const common = conflictMessage(code, 'ko')
    if ((overrides as readonly string[]).includes(code)) {
      expect(text(code), `${code}는 override인데 공통층과 같은 문장이다`).not.toBe(common)
    } else {
      expect(text(code), `${code}가 공통층과 다른 문장을 낸다`).toBe(common)
    }
  })
})

/** 위 ②를 사람이 읽을 수 있게 남긴 설명. 위임 전 "studio≠admin" 테스트가 여기로 왔다 */
describe('override로 남긴 이유', () => {
  it('admin COMMON_CONFLICT — 관리자에게 "같은 이름의 팀"이라고 말하지 않는다', () => {
    expect(ADMIN_CONFLICT_OVERRIDES).toContain('COMMON_CONFLICT')
    expect(adminMessage('COMMON_CONFLICT')).toBe(
      '이미 처리된 이의입니다. 목록을 다시 불러왔습니다.',
    )
    // 공통층은 studio 문장을 택했다(팀 이름 중복까지 덮는다) — admin_06의 409는 그 뜻이 아니다
    expect(conflictMessage('COMMON_CONFLICT', 'ko')).not.toBe(adminMessage('COMMON_CONFLICT'))
    // studio는 이제 공통층을 부르므로 그 문장이 곧 공통층 문장이다
    expect(studioMessage('COMMON_CONFLICT')).toBe(conflictMessage('COMMON_CONFLICT', 'ko'))
  })

  it('entry ENTRY_ALREADY_ENTERED — 현장에서 소리 내 읽는 문장이라 짧은 쪽을 유지한다', () => {
    expect(entryMessage('ENTRY_ALREADY_ENTERED')).toBe('이미 입장한 티켓입니다.')
    expect(conflictMessage('ENTRY_ALREADY_ENTERED', 'ko')).toBe('이미 입장 처리된 티켓입니다.')
  })

  it('member COMMON_CONFLICT — 로그인 화면은 지갑 연결 충돌 하나만 뜻한다', () => {
    expect(loginErrorText('COMMON_CONFLICT').ko).toBe('이 계정은 다른 지갑에 연결돼 있어요.')
  })

  it('settlement 9개 — blockedReason("왜 안 눌리나")까지 겸하는 운영자 문장이다', () => {
    expect(settlementMessage('SETTLEMENT_NOT_LOCKED')).toContain('집계 확정')
    expect(settlementMessage('SETTLEMENT_NOT_LOCKED')).not.toBe(
      conflictMessage('SETTLEMENT_NOT_LOCKED', 'ko'),
    )
  })
})

/**
 * 위임이 폴백까지 갈아엎지 않았는지 본다.
 *
 * studio·admin·settlement는 폴백 문장이 공통층과 같아 그대로 넘겼지만,
 * **entry만 다른 문장**("입장을 처리하지 못했습니다")이라 409일 때만 공통층을 부른다.
 * 여기가 깨지면 검표 스태프가 보던 실패 문구가 바뀐 것이다.
 */
describe('도메인 폴백', () => {
  it('entry는 409가 아닌 모르는 코드에 자기 폴백을 유지한다', () => {
    expect(entryMessage('NOT_A_REAL_CODE')).toBe(
      '입장을 처리하지 못했습니다. (코드 NOT_A_REAL_CODE)',
    )
    expect(entryMessage('NOT_A_REAL_CODE')).not.toBe(conflictMessage('NOT_A_REAL_CODE', 'ko'))
  })

  it('member는 409가 아닌 모르는 코드에 마지막 안내 한 줄을 유지한다', () => {
    expect(loginErrorText('NOT_A_REAL_CODE')).toBe(LOGIN_ERROR_FALLBACK)
  })

  it.each(['studio', 'admin', 'settlement'] as const)(
    '%s는 모르는 코드에 공통층 폴백을 그대로 쓴다 — 원래 같은 문장이었다',
    (name) => {
      const text = { studio: studioMessage, admin: adminMessage, settlement: settlementMessage }[
        name
      ]
      expect(text('NOT_A_REAL_CODE')).toBe('요청을 처리할 수 없습니다. (코드 NOT_A_REAL_CODE)')
    },
  )
})
