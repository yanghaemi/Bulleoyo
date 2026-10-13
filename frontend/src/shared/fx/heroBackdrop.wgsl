// A-01 히어로 배경 — 캐러셀 중앙 카드 뒤의 "무대 조명 풀(pool)".
//
// 이 파일의 주인은 `HeroBackdrop.tsx`다. 롤백 방법·스택 미반영 고지는 그 파일 상단 주석에 있다.
//
// ── 2026-09-08 정제: 역할을 하나로 좁혔다 ────────────────────────────────
// 옛 버전은 커서를 통째로 따라다니는 큰 빛무리 둘(반경 0.46·0.33)과 화면을 배회하는
// 전체 조명 하나(반경 0.80)였다. 문제는 배경 레이어(fx-backdrop.css)도 같은 색으로
// 같은 자리를 덮고 있었다는 것 — 두 겹이 겹쳐 "조명"이 아니라 "얼룩"으로 보였다.
//
// 그래서 나눴다:
//   · 배경(CSS)  = 객석 전체. 위에서 내려오는 조명 콘 + 커서를 따라오는 팔로우 스팟
//   · 여기(WGSL) = **무대 위 풀 하나.** 중앙 카드 뒤에 고정하고 커서는 살짝만 흔든다
// 반경을 카드 크기에 맞춰 조였고(0.46 → 0.30×0.42), 원이 아니라 카드 비율의 **타원**이다.
// 커서 추종은 12%만 남겼다 — 조명은 무대를 벗어나지 않지만 완전히 죽어 있지도 않다.
//
// vgpu의 `effect()`는 @vertex가 없으면 풀스크린 삼각형 정점 단계를 끼워 넣고
// `@location(0) uv`를 넘겨준다. uv는 **좌상단 원점**이고 v가 아래로 자란다.

struct Params {
  // 캔버스 물리 픽셀 크기. 종횡비 보정과 디더 해시에 쓴다
  res: vec2f,
  // 마지막 포인터 이벤트 **시점의 위치**. 빠른 글로우용
  anchorA: vec2f,
  // 같은 것, 느린 글로우용. 감쇠율이 달라 앵커를 따로 둔다 —
  // 하나로 합치면 이벤트마다 느린 글로우가 빠른 글로우 자리로 튄다
  anchorB: vec2f,
  // 포인터의 목표 위치(uv). 화면 밖으로 나가도 살짝은 따라가게 [-0.6, 1.6]으로만 자른다
  cursor: vec2f,
  time: f32,
  // 마지막 포인터 이벤트가 있었던 clock 시각
  eventAt: f32,
  // 첫 포인터 이벤트 시각. 그 전(터치·초기)에는 아주 큰 값이라 act가 0이다
  activeAt: f32,
  // 최대 알파. 흰 캔버스 위라 0.55를 넘기지 않는다
  strength: f32,
  // 브랜드색 두 개. CSS 변수에서 읽어 넘기므로 테마를 바꾸면 배경도 따라간다
  glowA: vec3f,
  glowB: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;

// ⚠ 이 struct의 **필드 이름과 순서는 `HeroBackdrop.tsx`의 `set:{ params: {...} }`와 같아야 한다.**
// 이번 정제에서는 필드를 하나도 건드리지 않았다 — 바뀐 것은 아래 fs_main의 배치뿐이다.

// 커서를 따라가는 속도(1/초). 값이 클수록 빨리 붙는다
const FOLLOW_FAST: f32 = 2.6;
const FOLLOW_SLOW: f32 = 1.1;

/// 무대(캐러셀 중앙 카드)의 중심. uv 기준이다.
/// y=0.39는 실측이다 — 히어로 영역은 [상단 패딩 40~56 + 카드 480 + 점 44 + Book now 84]라
/// 카드의 세로 중심이 전체 높이의 38~39%에 온다. 카드 크기가 바뀌면 이 값도 같이 바꾼다.
const POOL: vec2f = vec2f(0.5, 0.39);

/// 커서가 조명을 끌고 가는 비율. 1.0이면 옛날처럼 커서를 통째로 따라간다.
/// 0.12 = "조명기가 커서 쪽으로 살짝 고개를 돌린다" 정도. 무대를 벗어나지 않는 값이다.
const CURSOR_PULL: f32 = 0.12;

/// 지수 감쇠 lerp 계수.
/// JS는 포인터 **이벤트에서만** anchor·cursor·eventAt을 갱신하고, 매 프레임 부드럽게
/// 따라가는 일은 여기서 한다. 프레임률이 달라도 궤적이 같은 게 이 방식의 장점이다.
fn ease(rate: f32) -> f32 {
  return 1.0 - exp(-max(params.time - params.eventAt, 0.0) * rate);
}

/// 종횡비 보정 — 그대로 두면 가로로 넓은 캔버스에서 빛무리가 세로로 눌린 타원이 된다.
/// 보정 후 좌표계의 1.0은 **캔버스 높이**다. 아래 반경들이 전부 이 단위다.
fn stage(p: vec2f, aspect: f32) -> vec2f {
  return vec2f((p.x - 0.5) * aspect, p.y - 0.5);
}

/// 가우시안 감쇠, 축마다 다른 반경(=타원). 원뿔형(1 - d/r)과 달리 경계에 미분 불연속이
/// 없어서 밝은 배경에서도 테두리 선이 보이지 않는다.
/// 옛 `glow(원형)`을 대신한다 — 무대 위 조명은 카드(2:3 세로)를 비추지 원을 비추지 않는다.
fn pool(p: vec2f, center: vec2f, radius: vec2f) -> f32 {
  let d = (p - center) / radius;
  return exp(-dot(d, d) * 2.3);
}

/// 값 잡음 ±0.5/255. 아주 완만한 그라데이션은 8비트 정밀도에서 띠(banding)로 보인다
fn dither(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = max(params.res.x, 1.0) / max(params.res.y, 1.0);
  let p = stage(uv, aspect);

  // 커서가 한 번도 움직인 적 없으면(터치·초기) 아주 느리게 숨을 쉰다.
  // 첫 이벤트 뒤에는 act가 0→1로 올라가며 이 흔들림이 잦아든다 — 끊지 않고 줄인다.
  // 폭은 0.075 → 0.03. 조명이 카드를 벗어나 떠다니면 "무대 위"가 아니게 된다.
  let act = 1.0 - exp(-max(params.time - params.activeAt, 0.0) * 0.6);
  let wander = vec2f(sin(params.time * 0.23), cos(params.time * 0.17)) * 0.03;

  let lead = mix(params.anchorA, params.cursor, ease(FOLLOW_FAST));
  let trail = mix(params.anchorB, params.cursor, ease(FOLLOW_SLOW));

  // 조명의 겨냥점 = 무대 중심 + 커서 쪽으로 12% + 미세한 숨. 바닥 스필은 더 느리고 더 둔하다
  let aim = POOL + (lead - POOL) * CURSOR_PULL + wander * (1.0 - act * 0.6);
  let aimSlow = POOL + (trail - POOL) * (CURSOR_PULL * 0.5);

  // 아주 느린 밝기 맥동 ±5%. 조명이 켜져 있다는 신호만 준다
  let breath = 1.0 + sin(params.time * 0.35) * 0.05;

  // ① 코어 — 중앙 카드(폭 320 · 높이 480 ≈ 0.44×0.66 캔버스 높이) 뒤에 딱 맞는 타원.
  //    카드가 불투명해서 실제로 눈에 보이는 건 카드 가장자리로 새어 나오는 후광이다
  let wA = pool(p, stage(aim, aspect), vec2f(0.30, 0.42) * breath);
  // ② 바닥 스필 — 무대 바닥에 넓고 얕게 깔린다. 카드 아래쪽(+0.30)에 두고 색은 sel(자홍)이라
  //    브랜드 보라 하나로만 칠해진 화면에 온도차가 생긴다
  let wB = pool(p, stage(aimSlow, aspect) + vec2f(0.0, 0.30), vec2f(0.55, 0.16)) * 0.55;
  // ③ 아주 옅은 헤일로 — 코어의 경계가 "덩어리"로 보이지 않게 받쳐 주는 층. 움직이지 않는다
  let wC = pool(p, stage(POOL, aspect), vec2f(0.62, 0.70)) * 0.18;

  let total = wA + wB + wC;
  // 겹치는 자리에서 색이 사라지지 않게 가중 평균으로 섞는다
  let tint = (params.glowA * (wA + wC * 0.6) + params.glowB * (wB + wC * 0.4)) / max(total, 1e-4);

  // 캔버스 경계에서 부드럽게 사라진다. 직선이 보이면 배경이 아니라 "상자"로 읽힌다
  let fade =
    smoothstep(0.0, 0.20, uv.y) * smoothstep(0.0, 0.26, 1.0 - uv.y) *
    smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.x);

  // 합을 그냥 clamp하면 겹친 자리가 최대 알파로 넓게 평평해진다. 지수 포화로 눌러 굴곡을 남긴다
  var a = (1.0 - exp(-total)) * params.strength * fade;
  a = clamp(a + dither(uv * params.res) * (1.0 / 255.0), 0.0, 1.0);

  // surface alphaMode 기본값이 "premultiplied"라 색에 알파를 미리 곱해 내보낸다
  return vec4f(tint * a, a);
}
