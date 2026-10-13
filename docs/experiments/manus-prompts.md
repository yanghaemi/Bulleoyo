# Manus AI 외부 시안 실험 프롬프트

> 상태: 실행용 프롬프트 준비 완료 · Manus 외부 실행 및 결과 채택은 아직 하지 않음

Manus는 저장소 정본이나 구현 도구가 아니라 **대안 시안 탐색용**으로만 사용한다. 생성 결과를 그대로 병합하지 않고, 채택할 아이디어만 팀 디자인 토큰과 React 컴포넌트 규칙으로 다시 구현한다.

## 공통 입력 규칙

- 실제 API 키, 지갑 주소, 회원 정보, 내부 URL, 미공개 계약을 업로드하지 않는다.
- 아래 고정 fixture 외의 수치나 성과를 만들지 않는다.
- 블록체인·코인을 투자 상품처럼 표현하지 않는다. Kaia Kairos 테스트넷 시연이며 실가상자산·실화폐가 아니다.
- 주요 사용자는 소규모 공동 공연의 관객과 참여 밴드다.
- 기능 정본: 공연 탐색, 티켓 예매, 관객의 응원팀 선택, 사전 합의된 규칙에 따른 공동 정산, 정산 근거 공개.
- 시각 토큰: primary `#3129DD`, selected `#D9288F`, light/dark 모두 지원, 카드형 중립 표면, 금액은 높은 대비와 tabular numerals.
- 모바일 360px과 데스크톱 1440px 두 시안을 함께 만든다.

## 프롬프트 A — 발표용 서비스 소개 랜딩

```text
Design a bilingual Korean/English presentation landing page for “불러요(BULLEOYO)”, a small joint-concert ticketing and transparent revenue-sharing service.

Core story:
1. Indie bands collaborate on one show.
2. The audience buys a ticket and chooses one team to support.
3. Before sales, every participating team agrees to a two-pool rule: a fixed pool and an audience-choice pool.
4. After the show, the service publishes the calculation basis and distributes each team’s share.

Use a dark stage-like discovery hero, but switch to calm high-contrast neutral surfaces for ticketing and settlement information. Use primary #3129DD and selection #D9288F. Avoid crypto hype, trading charts, coins flying, neon Web3 clichés, and fabricated metrics. Clearly say this is a Kaia Kairos testnet demo with no real currency or assets.

Deliver:
- 360px mobile and 1440px desktop layouts
- hero, problem, four-step flow, transparent-settlement example, trust statement, demo CTA
- reduced-motion alternative for every animation idea
- a short rationale for each visual decision
Do not generate production code. Produce a visual concept and annotated component inventory only.
```

## 프롬프트 B — 정산 대시보드 대안

```text
Create three visually distinct but restrained alternatives for a settlement dashboard used by indie-band team leaders.

Use only this fixture:
- distributable total: KRW 1,525,000
- Blue Note: KRW 743,441
- Dawn Three: KRW 474,656
- Noise Cancel: KRW 306,903
- fixed pool 60%, audience-choice pool 40%, dust KRW 4 assigned to host

All exact amounts must remain visible in a semantic table. A horizontal bar chart may be added only as a comparison aid. Show the workflow states Aggregate → Lock → 48-hour dispute period → Release. The server decides which action is available; the UI must not infer it.

Avoid dashboards that resemble stock trading, token speculation, or casino interfaces. Use primary #3129DD, selection #D9288F, neutral panels, and tabular numerals. Include mobile 360px and desktop 1440px. Explain how keyboard users and reduced-motion users receive equivalent information.

Do not write backend behavior or invent APIs. Return annotated visual alternatives and a comparison table, not merge-ready source code.
```

## 프롬프트 C — 로고 모션 대안 검토

```text
Evaluate a 2.4-second logo-motion concept for BULLEOYO. The Korean word “불러” sits beside a microphone mark. The microphone head separates, moves right while rotating, visually becomes the final O, and the Korean lockup crossfades to “BULLEOYO” with Y in magenta.

Propose:
1. one full-screen loading sequence up to 2.4 seconds,
2. one header hover/focus micro-interaction up to 650ms,
3. a completely static reduced-motion frame.

The loading animation must never force the application to wait. The header animation must not loop while the pointer remains over it. Preserve readability at 22px height. Use primary #3129DD and magenta #D9288F. Do not add sound.

Return frame timings, easing recommendations, and accessibility notes. Do not generate raster artwork or production code.
```

## 결과 평가표

각 결과는 0~2점으로 평가한다. 8점 미만은 채택하지 않는다.

| 기준 | 0 | 1 | 2 |
|---|---|---|---|
| 서비스 정확성 | 핵심 흐름 왜곡 | 일부 누락 | 기능·용어 정확 |
| 신뢰성 | 투자·과장 표현 | 중립이나 모호 | 테스트넷·비투자성 명확 |
| 정보 가독성 | 수치가 장식에 묻힘 | 읽을 수 있음 | 표·위계가 명확 |
| 모바일 | 360px 사용 불가 | 일부 압축 | 가로 넘침 없이 완결 |
| 접근성 | 색·모션 의존 | 대체 수단 일부 | 키보드·정적 대안 완결 |

채택한 아이디어는 `docs/frontend/STAGE_LEDGER_DECISIONS.md`에 출처, 채택 범위, 다시 구현한 파일을 기록한다.
