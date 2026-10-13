#!/usr/bin/env node
/**
 * 로컬 전용 세션 발급 — Web3Auth 없이 로그인 상태를 만든다.
 *
 * 왜 필요한가 — 세션을 만드는 경로는 Web3Auth(API-member-01)와 이메일 로그인(API-member-02)
 * 둘뿐인데, 이메일은 P1 미구현이고 Web3Auth 는 클라이언트 ID 발급 전이다. 그래서 지금
 * **로컬에서 로그인할 방법이 없고**, 인증이 필요한 화면(연동 1~6 거의 전부)을 실물로 확인할 수 없다.
 * 이 스크립트가 백엔드가 하는 일과 똑같이 회원 행 + JWT + Redis 항목을 만들어 그 구멍을 메운다.
 *
 * 로컬 전용이다. 서명 키가 application.yml 에 공개값으로 박힌 local 프로파일 기본값이라
 * 운영에서는 애초에 통하지 않는다(prod 는 JWT_SECRET 이 필수고 이 기본값이 없다).
 *
 *   node scripts/dev-login.mjs                     # dev@b204.local 로 세션 발급
 *   node scripts/dev-login.mjs leader@b204.local   # 다른 회원(공연 리더 시나리오용)
 *   node scripts/dev-login.mjs admin@b204.local --admin
 *
 * 출력된 한 줄을 브라우저 콘솔에 붙여넣고 새로고침하면 로그인된 상태가 된다.
 * (access 는 메모리라 새로고침 시 refresh 로 복구된다 — RequireAuth 가 그 창을 기다린다)
 *
 * 컨테이너 이름이 다르면 MYSQL_CONTAINER·REDIS_CONTAINER 로 덮는다.
 */

import { createHmac, createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

/** application.yml local 프로파일의 b204.jwt.secret 기본값. 운영 값이 아니다. */
const SECRET =
  process.env.JWT_SECRET ?? 'b204-local-development-only-secret-key-do-not-use-in-production'
const ISSUER = 'b204'
const ACCESS_TTL_SEC = 30 * 60 // b204.jwt.access-token-ttl: 30m
const REFRESH_TTL_SEC = 14 * 24 * 60 * 60 // b204.jwt.refresh-token-ttl: 14d

const MYSQL = process.env.MYSQL_CONTAINER ?? 'b204-mysql-local'
const REDIS = process.env.REDIS_CONTAINER ?? 'b204-redis-local'

const args = process.argv.slice(2)
const admin = args.includes('--admin')
const email = args.find((a) => !a.startsWith('--')) ?? 'dev@b204.local'

// 아래 SQL에 직접 들어가는 로컬 개발용 입력이다. 쿼리 실행 전에 이메일 문자만 허용한다.
const EMAIL_PATTERN = /^[\w.+-]+@[\w.-]+$/
if (!EMAIL_PATTERN.test(email)) throw new Error(`Invalid email: ${email}`)

function docker(container, argv) {
  return execFileSync('docker', ['exec', container, ...argv], { encoding: 'utf8' })
}

/** mysql 클라이언트는 결과를 탭 구분 표로 준다. -sN 으로 헤더 없이 값만 받는다. */
function sql(query) {
  return docker(MYSQL, ['mysql', '-ub204', '-pb204', '-D', 'b204', '-sN', '-e', query])
    .trim()
    .replace(/^mysql: \[Warning\].*\n?/gm, '')
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const body = `${header}.${payload}`
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

// ── 1. 회원 행 ──────────────────────────────────────────────────────────
// 백엔드는 최초 로그인에서 이 행을 만든다(API-member-01 "최초 로그인 = 가입").
// 지갑 등록·기본 코인 지급은 여기서 하지 않는다 — v6 에서 POST /wallets 로 옮겨졌다.
sql(
  `INSERT IGNORE INTO member (email, name, auth_provider, country_code, locale, display_currency, timezone, is_admin)
   VALUES ('${email}', 'dev', 'LOCAL', 'KR', 'ko', 'KRW', 'Asia/Seoul', ${admin ? 1 : 0})`,
)
const memberId = sql(`SELECT member_id FROM member WHERE email = '${email}'`)
if (!memberId) throw new Error(`회원 행을 만들지 못했다: ${email}`)

// ── 2. 토큰 ────────────────────────────────────────────────────────────
// 클레임 이름은 JwtTokenProvider 와 같아야 한다 — typ·email·adm·wca.
// wca(walletClaimAddress)는 지갑 등록 전이라 null 이다.
const now = Math.floor(Date.now() / 1000)
const base = { sub: String(memberId), iss: ISSUER, iat: now, email, adm: admin, wca: null }

const refreshJti = randomUUID()
const accessToken = signJwt({ ...base, jti: randomUUID(), exp: now + ACCESS_TTL_SEC, typ: 'access' })
const refreshToken = signJwt({ ...base, jti: refreshJti, exp: now + REFRESH_TTL_SEC, typ: 'refresh' })

// ── 3. Redis ───────────────────────────────────────────────────────────
// RefreshTokenStore 가 원문이 아니라 SHA-256 **해시**를 넣는다. 같은 형식이어야 재발급이 통과한다.
const hash = createHash('sha256').update(refreshToken).digest('hex')
docker(REDIS, ['redis-cli', 'SET', `auth:refresh:${refreshJti}`, hash, 'EX', String(REFRESH_TTL_SEC)])
docker(REDIS, ['redis-cli', 'SADD', `auth:refresh:member:${memberId}`, refreshJti])

console.log(`
회원  #${memberId}  ${email}${admin ? '  (ADMIN)' : ''}

브라우저 콘솔에 붙여넣고 새로고침:

  localStorage.setItem('b204.refreshToken', '${refreshToken}'); location.reload()

curl 로 쓸 access token (30분):

  ${accessToken}
`)
