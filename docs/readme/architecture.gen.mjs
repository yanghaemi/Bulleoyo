// 불러요 시스템 아키텍처 다이어그램 생성기
//
// 이 스크립트가 docs/readme/architecture.svg 의 정본이다.
// 재생성:  node docs/readme/architecture.gen.mjs   (의존성 없음 · Node 18+)
//
// 좌표를 코드로 둔다 — 그림 도구 원본 없이도 오탈자·구성 변경을 고쳐 다시 뽑을 수 있다.
// 구성 근거: docker-compose.yml · exec/nginx/ · exec/monitoring/ · Jenkinsfile · blockchain/deployments/kairos.json

import { writeFileSync } from 'node:fs'

/* ── 팔레트 ─────────────────────────────────────────────────────── */
const C = {
  bg: '#F6F7F3',
  card: '#FFFFFF',
  ink: '#25313A',
  sub: '#5D6E78',
  faint: '#8A9AA4',
  line: '#E3E6E1',
  green: '#3E9B6B',
  greenD: '#2E7A52',
  yellow: '#E9A93B',
  orange: '#E8823C',
  blue: '#3D7BD9',
  purple: '#8B6FD0',
  violet: '#6B4FC8',
  slate: '#5B7185',
}

const F = {
  head: 'Pretendard, NanumSquare, "Malgun Gothic", sans-serif',
  body: 'Pretendard, NanumGothic, "Malgun Gothic", sans-serif',
  mono: 'D2Coding, NanumGothicCoding, Consolas, monospace',
}

const W = 1720
const H = 1335

const out = []
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ── 프리미티브 ──────────────────────────────────────────────────── */
const text = (x, y, s, o = {}) => {
  const { size = 11.5, fill = C.sub, weight = 400, family = F.body, anchor = 'start', ls = 0 } = o
  out.push(
    `<text x="${x}" y="${y}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
      ls ? ` letter-spacing="${ls}"` : ''
    }>${esc(s)}</text>`,
  )
}

const rect = (x, y, w, h, o = {}) => {
  const { rx = 10, fill = C.card, stroke = C.line, sw = 1.2, dash = null } = o
  out.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${
      dash ? ` stroke-dasharray="${dash}"` : ''
    }/>`,
  )
}

/** 그룹 경계 상자 — 제목은 상자 안쪽 상단, 노드는 gy+58 부터. */
const group = ({ x, y, w, h, title, sub, color }) => {
  rect(x, y, w, h, { rx: 16, fill: color + '0A', stroke: color + '55', sw: 1.4, dash: '6 5' })
  text(x + 18, y + 28, title, { size: 12.5, weight: 700, fill: color, family: F.head, ls: 1.4 })
  if (sub) text(x + 18, y + 46, sub, { size: 10.5, fill: C.faint })
}

/** 카드형 노드 — 왼쪽 액센트 바 + 제목 + 설명줄 + 모노 줄 + 칩 */
const node = ({ x, y, w, h, title, subs = [], mono = [], chips = [], color }) => {
  rect(x, y, w, h, { rx: 11 })
  out.push(`<rect x="${x + 2}" y="${y + 12}" width="4" height="${h - 24}" rx="2" fill="${color}"/>`)
  text(x + 20, y + 30, title, { size: 15.5, weight: 700, fill: C.ink, family: F.head })
  subs.forEach((s, i) => text(x + 20, y + 52 + i * 17, s, { size: 11.5 }))
  const monoTop = y + 52 + subs.length * 17 + 8
  mono.forEach((s, i) => text(x + 20, monoTop + i * 16, s, { size: 10.5, family: F.mono, fill: '#4A6070' }))
  chips.forEach((s, i) => {
    const cy = y + h - 16 - (chips.length - 1 - i) * 28
    rect(x + 20, cy - 15, w - 40, 22, { rx: 6, fill: color + '18', stroke: color + '4D', sw: 1 })
    text(x + 30, cy, s, { size: 10.5, fill: C.ink })
  })
}

/* ── 연결선 ─────────────────────────────────────────────────────── */
const edge = (pts, color, { dash = null, both = false } = {}) => {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const id = color.slice(1)
  out.push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"${
      dash ? ` stroke-dasharray="${dash}"` : ''
    } marker-end="url(#ah-${id})"${both ? ` marker-start="url(#as-${id})"` : ''}/>`,
  )
}

/** 번호 배지 — 선 위에 얹어 라벨 겹침 없이 흐름을 표시한다. */
const badge = (x, y, n, color) => {
  out.push(`<circle cx="${x}" cy="${y}" r="10.5" fill="${C.card}" stroke="${color}" stroke-width="1.6"/>`)
  text(x, y + 4, String(n), { size: 11.5, weight: 700, fill: color, family: F.head, anchor: 'middle' })
}

/* ── 배경 · 마커 ────────────────────────────────────────────────── */
const markerColors = [C.blue, C.greenD, C.purple, C.violet, C.slate]
out.push(`<defs>
${markerColors
  .map((c) => {
    const id = c.slice(1)
    return `<marker id="ah-${id}" viewBox="0 0 10 8" markerWidth="8.5" markerHeight="6.5" refX="9.2" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 z" fill="${c}"/></marker>
<marker id="as-${id}" viewBox="0 0 10 8" markerWidth="8.5" markerHeight="6.5" refX="0.8" refY="4" orient="auto"><path d="M10 0 L0 4 L10 8 z" fill="${c}"/></marker>`
  })
  .join('\n')}
</defs>`)
rect(0, 0, W, H, { rx: 0, fill: C.bg, stroke: 'none', sw: 0 })

/* ── 헤더 ───────────────────────────────────────────────────────── */
text(48, 62, 'System Architecture', { size: 34, weight: 700, fill: C.ink, family: F.head })
text(48, 92, '불러요(BULLEOYO) · S15P21B204 — 소규모 공연 티켓팅 · 공동 정산 플랫폼', { size: 13, fill: C.sub })
text(48, 112, 'AWS EC2 단일 노드 · Docker Compose 블루-그린 무중단 배포 · Kaia Kairos 테스트넷', {
  size: 11.5,
  fill: C.faint,
  family: F.mono,
})

/* ── BLOCKCHAIN (상단) ──────────────────────────────────────────── */
group({
  x: 612, y: 130, w: 1040, h: 176,
  title: 'BLOCKCHAIN · KAIA KAIROS',
  sub: 'chainId 1001 · 퍼블릭 테스트넷 · 누구나 같은 값을 다시 읽을 수 있다',
  color: C.violet,
})
node({
  x: 632, y: 190, w: 320, h: 98, color: C.violet,
  title: 'YoYo (ERC-20)',
  subs: ['서비스 결제 코인 · decimals 0', 'mint 전용 · grantRef 중복 발행 거부'],
})
node({
  x: 972, y: 190, w: 320, h: 98, color: C.violet,
  title: 'RevenueSplitter',
  subs: ['규칙 잠금 · 에스크로 · 보증금', '컨트랙트 안 정산 계산 · push release'],
})
node({
  x: 1312, y: 190, w: 320, h: 98, color: C.violet,
  title: 'KaiaScan · Sourcify',
  subs: ['소스 검증(exact match)', '참여팀 독립 검증 경로'],
})

/* ── EC2 외곽 ───────────────────────────────────────────────────── */
rect(290, 342, 1382, 610, { rx: 20, fill: '#FFFFFF66', stroke: '#C8D2CD', sw: 1.6 })
text(308, 372, 'AWS EC2 · Ubuntu', { size: 13.5, weight: 700, fill: C.ink, family: F.head })
text(308 + 128, 372, '· Docker Compose · 단일 노드 블루-그린', { size: 11.5, fill: C.faint })

/* ── CLIENT ─────────────────────────────────────────────────────── */
group({ x: 48, y: 396, w: 230, h: 290, title: 'CLIENT', sub: '관객 · 팀 리더 · 검표', color: C.blue })
node({
  x: 68, y: 454, w: 190, h: 88, color: C.blue,
  title: 'Web Browser',
  subs: ['React 19 SPA', '예매 · 스튜디오 · 검표'],
})
node({
  x: 68, y: 566, w: 190, h: 100, color: C.blue,
  title: 'Wallet',
  subs: ['Web3Auth 소셜 로그인', '(비수탁 · SSS)', 'Kaia Wallet 확장'],
})

/* ── PUBLIC EDGE ────────────────────────────────────────────────── */
group({ x: 310, y: 396, w: 270, h: 290, title: 'PUBLIC EDGE', sub: '유일한 공개 진입점', color: C.greenD })
node({
  x: 330, y: 454, w: 230, h: 212, color: C.greenD,
  title: 'Host Nginx',
  subs: ["HTTPS 443 · Let's Encrypt"],
  mono: ['/           → frontend', '/api/       → router', '/uploads/   → volume', '/jenkins/ · /grafana/', '/actuator/  → 404'],
})

/* ── APPLICATION STACK ──────────────────────────────────────────── */
group({ x: 612, y: 396, w: 690, h: 290, title: 'APPLICATION STACK', sub: 'Docker Compose · Blue-Green', color: C.green })
node({
  x: 632, y: 454, w: 190, h: 88, color: C.green,
  title: 'router',
  subs: ['nginx :8080', 'active_color 전환'],
})
node({
  x: 632, y: 566, w: 190, h: 88, color: C.green,
  title: 'frontend',
  subs: ['nginx :3000', 'Vite 정적 빌드'],
})
node({
  x: 852, y: 454, w: 430, h: 212, color: C.green,
  title: 'Spring Boot API',
  subs: ['backend-blue / green :8080 · Java 17 · web3j-ext', '회원 · 공연 · 예매 · 입장 · 코인 · 정산 · 검증'],
  chips: [
    'chain_job 큐 — OPERATOR · MINTER 지갑별 단일 nonce 워커',
    '수수료 대납 — 사용자 서명 RLP에 fee payer 서명만 덧붙임',
    '발행량 불변식 4개 30초 대사 — 깨지면 발행 · 분배 halt',
  ],
})

/* ── MONITORING ─────────────────────────────────────────────────── */
group({ x: 1336, y: 396, w: 316, h: 290, title: 'MONITORING', sub: '별도 Compose 스택', color: C.slate })
node({ x: 1356, y: 454, w: 276, h: 70, color: C.slate, title: 'Prometheus', subs: ['/actuator/prometheus 스크랩'] })
node({ x: 1356, y: 536, w: 276, h: 62, color: C.slate, title: 'Grafana', subs: ['b204_chain_job_* 대시보드'] })
node({ x: 1356, y: 610, w: 276, h: 56, color: C.slate, title: 'Alertmanager → Mattermost' })

/* ── DATA LAYER ─────────────────────────────────────────────────── */
group({
  x: 310, y: 718, w: 1342, h: 210,
  title: 'DATA LAYER',
  sub: 'Compose 네트워크 내부 전용 · Spring Boot 만 접근',
  color: C.purple,
})
const dataW = 431
const dataX = [330, 330 + dataW + 10, 330 + (dataW + 10) * 2]
node({
  x: dataX[0], y: 778, w: dataW, h: 120, color: C.purple,
  title: 'MySQL 8.0',
  subs: ['관계형 정본 · 테이블 24', 'Flyway V1~V14 · 지급·거래 이력은 chain_job 하나'],
  mono: ['mysql:3306'],
})
node({
  x: dataX[1], y: 778, w: dataW, h: 120, color: C.purple,
  title: 'Redis 7',
  subs: ['리프레시 토큰 · 멱등키 · 재고 · 입장 SETNX', 'chain:owner 워커 소유권 · AOF everysec'],
  mono: ['redis:6379'],
})
node({
  x: dataX[2], y: 778, w: dataW, h: 120, color: C.purple,
  title: 'Uploads',
  subs: ['포스터 · 티켓 아트워크 원본', '호스트 Nginx alias 서빙 · 스크립트 확장자 404'],
  mono: ['~/app/uploads'],
})

/* ── 흐름 카드 (좌측 하단) ──────────────────────────────────────── */
rect(48, 718, 230, 210, { rx: 16, fill: C.card, stroke: C.line, sw: 1.2 })
text(68, 748, '요청 흐름', { size: 13, weight: 700, fill: C.ink, family: F.head })
const flows = [
  [C.blue, ['브라우저 → HTTPS 443', 'Nginx 단일 진입점']],
  [C.blue, ['/api/ → router → 활성 색', '/ → frontend 정적 빌드']],
  [C.greenD, ['지갑 서명 → Spring', '서명된 RLP만 전달(키 없음)']],
  [C.violet, ['Spring → Kairos', '대납 전송 · receipt 확인']],
  [C.purple, ['Spring → 데이터 계층', '읽기 · 쓰기']],
]
flows.forEach(([color, lines], i) => {
  const y = 772 + i * 35
  out.push(`<circle cx="79" cy="${y - 4}" r="9" fill="${C.card}" stroke="${color}" stroke-width="1.5"/>`)
  text(79, y, String(i + 1), { size: 10.5, weight: 700, fill: color, family: F.head, anchor: 'middle' })
  text(96, y - 7, lines[0], { size: 11, fill: C.ink })
  text(96, y + 8, lines[1], { size: 10, fill: C.faint })
})

/* ── 가드레일 밴드 ──────────────────────────────────────────────── */
rect(48, 976, 1604, 72, { rx: 14, fill: '#FFFFFF', stroke: C.line, sw: 1.2 })
out.push(`<rect x="48" y="976" width="5" height="72" rx="2.5" fill="${C.violet}"/>`)
text(72, 1004, '자금 경로 가드레일', { size: 13, weight: 700, fill: C.ink, family: F.head })
const guards = [
  ['서버는 사용자 키를 받지 않는다', '서명은 지갑에서 · 서버는 수수료만 대납'],
  ['정산은 컨트랙트가 계산한다', '잠긴 규칙 × 온체인 선택 수 — 서버는 결과를 올리지 않는다'],
  ['발행 키와 운영 키를 나눈다', 'admin(콜드) · OPERATOR · MINTER 세 주소 상이 — 배포 어서션'],
]
guards.forEach(([a, b], i) => {
  const x = 280 + i * 460
  text(x, 1000, '· ' + a, { size: 11.5, weight: 700, fill: C.ink })
  text(x + 10, 1020, b, { size: 10.5, fill: C.faint })
})

/* ── CI / CD ────────────────────────────────────────────────────── */
group({
  x: 48, y: 1076, w: 1604, h: 170,
  title: 'CI / CD',
  sub: 'Jenkins Multibranch — develop 은 dev 배포, master 는 승인 후 prod · 컨트랙트 배포는 DEPLOY_CONTRACT 수동',
  color: C.yellow,
})
const ciX = [68, 386, 704, 1022, 1340]
const ci = [
  ['GitLab', ['MR · 푸시 웹훅']],
  ['Jenkins Test', ['backend · frontend · contract 병렬']],
  ['Image Build', ['태그 = 커밋 SHA 8자리']],
  ['Blue-Green Deploy', ['유휴 색 기동 → 헬스체크']],
  ['router 스위치', ['active_color reload · 1초 롤백']],
]
ci.forEach(([t, s], i) => {
  node({ x: ciX[i], y: 1136, w: 290, h: 76, color: C.yellow, title: t, subs: s })
  if (i < 4) edge([[ciX[i] + 290, 1174], [ciX[i + 1] - 4, 1174]], C.slate, { dash: '5 5' })
})

/* ── 연결선 ─────────────────────────────────────────────────────── */
// ① 브라우저 → 엣지
edge([[258, 498], [326, 498]], C.blue)
badge(292, 498, 1, C.blue)

// ② 엣지 → router / frontend, router → Spring
edge([[560, 498], [628, 498]], C.blue)
edge([[560, 610], [628, 610]], C.blue)
badge(594, 498, 2, C.blue)
edge([[822, 498], [848, 498]], C.blue)

// ③ 지갑 서명 (브라우저 ↔ 지갑) · 서명된 RLP 는 ①② 경로로 Spring 에 도착
edge([[163, 542], [163, 562]], C.greenD, { both: true })
badge(196, 553, 3, C.greenD)

// ④ Spring → Kairos (대납 전송 · 조회)
edge([[1000, 450], [1000, 324], [1132, 324], [1132, 292]], C.violet)
edge([[1000, 324], [792, 324], [792, 292]], C.violet)
badge(1000, 386, 4, C.violet)

// 독립 검증 — 브라우저 → KaiaScan (점선)
edge([[236, 450], [236, 318], [1472, 318], [1472, 292]], C.violet, { dash: '6 5' })

// ⑤ Spring → 데이터 계층
edge([[1067, 670], [1067, 774]], C.purple)
badge(1067, 700, 5, C.purple)

// 모니터링 스크레이프 (점선)
edge([[1282, 560], [1320, 560], [1320, 489], [1352, 489]], C.slate, { dash: '5 5' })

/* ── 범례 ───────────────────────────────────────────────────────── */
const legend = [
  [C.blue, '사용자 요청 (HTTPS)', false],
  [C.greenD, '지갑 서명', false],
  [C.violet, '체인 전송 · 조회', false],
  [C.violet, '독립 검증', true],
  [C.purple, '데이터 읽기 · 쓰기', false],
  [C.slate, '지표 수집 · 배포', true],
]
let lx = 48
legend.forEach(([color, label, dash]) => {
  out.push(
    `<line x1="${lx}" y1="1290" x2="${lx + 34}" y2="1290" stroke="${color}" stroke-width="2.4"${
      dash ? ' stroke-dasharray="5 4"' : ''
    } stroke-linecap="round"/>`,
  )
  text(lx + 44, 1294, label, { size: 11.5, fill: C.sub })
  lx += 44 + label.length * 12 + 40
})

writeFileSync(
  new URL('./architecture.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">\n<title id="t">불러요 시스템 아키텍처</title>\n<desc id="d">AWS EC2 단일 노드 위 Docker Compose 블루-그린 구성 — 호스트 Nginx, router, Spring Boot API, React 정적 프론트, MySQL·Redis·업로드 볼륨, Prometheus·Grafana 모니터링, Kaia Kairos의 YoYo·RevenueSplitter 컨트랙트, GitLab·Jenkins CI/CD.</desc>\n${out.join('\n')}\n</svg>\n`,
)
console.log('architecture.svg 생성 완료')
