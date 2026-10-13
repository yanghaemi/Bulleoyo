// A-01 히어로 배경 · 다크 테마 — 중앙 카드 **뒤에서** 새어 나오는 무대 조명(볼류메트릭 빔).
//
// 이 파일의 주인은 `StageFlare.tsx`다. 롤백·스택 미반영 고지는 그 파일 상단 주석에 있다.
//
// ── 참고한 것 ─────────────────────────────────────────────────────
// Vercel vgpu 예제 `nextjs-flare`(vgpu.sh/examples/nextjs-flare) — 로고 가장자리를 림 라이트로
// 비추고, 그 림 텍스처를 빛 방향으로 48단계 레이 워크해 산란(god ray)을 만들고, 블루 노이즈로
// 지터·그레인을 넣는 구조다. 그 구조를 가져오되 **텍스처 패스를 전부 없앴다**:
//   · 예제의 "로고 래스터"는 우리에게 **중앙 카드의 둥근 직사각형**이다 → SDF 한 줄로 해석적으로 구한다
//   · 예제의 "림 블러 체인(가우시안 2패스)"은 SDF 거리에 exp 감쇠를 주면 같은 모양이 나온다
//   · 블루 노이즈 텍스처 대신 해시 노이즈. 128×128 텍스처 업로드·바인딩이 사라진다
// 결과: 렌더 타깃 0개, 단일 프래그먼트 패스. `effect()` 하나에 `frame.pass(view, fx)` 하나다.
//
// ── 장면 설정: 조명은 카드 뒤에 있다 ──────────────────────────────
// 관객석(어두운 배경)에서 무대(중앙 카드)를 본다. 조명기는 카드 **뒤**에 있고, 카드는 불투명한
// 가림막이다. 그래서 보이는 것은 ① 카드 가장자리를 훑는 림 라이트, ② 가장자리에서 바깥으로
// 뻗는 빔(빛이 가림막을 돌아 나오며 산란), ③ 조명이 카드 밖으로 살짝 벗어났을 때만 드러나는
// 광원 헤일로. 커서를 움직이면 조명이 카드 뒤에서 **반대쪽**으로 밀려 그쪽 가장자리가 터진다.
// 포인터가 없을 때(터치·초기)는 카드 뒤를 천천히 돌며 숨을 쉰다(예제의 autonomous light).
//
// vgpu의 `effect()`는 @vertex가 없으면 풀스크린 삼각형 정점 단계를 끼워 넣고
// `@location(0) uv`를 넘겨준다. uv는 **좌상단 원점**이고 v가 아래로 자란다.

struct Params {
  // 캔버스 물리 픽셀 크기. 종횡비 보정과 해시 노이즈에 쓴다
  res: vec2f,
  // 조명 위치(uv). JS가 매 프레임 지수 추종으로 부드럽게 만든 값을 넘긴다
  light: vec2f,
  // 중앙 카드의 중심(uv)과 절반 크기(**높이 단위** — 아래 stage() 좌표계). JS가 DOM 실측으로 넣는다
  cardCenter: vec2f,
  cardHalf: vec2f,
  time: f32,
  // 프레임 번호. 레이 워크 지터·그레인의 시간 축
  frame: f32,
  // 최대 밝기 배율. 어두운 바닥이라 1.0이 기준이고 밝은 배경의 0.55와 다르다
  strength: f32,
  // 0 = 자율(숨쉬기 맥동), 1 = 포인터가 잡고 있음(맥동 없이 꽉 켜짐). JS가 0.35s로 lerp
  hold: f32,
  // 브랜드색 두 개 — CSS 변수에서 읽어 넘긴다. A = primary-bright(보라), B = sel(자홍)
  colorA: vec3f,
  // 카드 모서리 반경(높이 단위)
  cornerR: f32,
  colorB: vec3f,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

// ⚠ 이 struct의 **필드 이름과 순서는 `StageFlare.tsx`의 `set:{ params: {...} }`와 같아야 한다.**

/// 레이 워크 단계 수. 예제와 같은 48. 줄이면 빔에 줄무늬가 생기고, 늘려도 그레인이 가려서 티가 안 난다
const STEPS: i32 = 48;
/// 빔 감쇠 — 예제 `mix(0.85, 0.975, extension=0.6)` ≈ 0.925. 카드에서 멀어질수록 빔이 옅어지는 속도
const DECAY: f32 = 0.925;
/// 림의 두께(높이 단위). 0.010 ≈ 카드 480px 기준 7px — 얇은 선이 아니라 "빛나는 테두리"로 보이는 폭
const RIM_W: f32 = 0.010;
/// 레이 워크가 보는 부드러운 림. 예제의 블러 체인(σ≈6px×2)을 이 폭 하나로 대신한다
const RIM_SOFT_W: f32 = 0.045;
/// 광원 헤일로 반경(높이 단위). 예제 `mix(0.05, 0.6, spotFocus=0.08)` ≈ 0.094
const HALO_R: f32 = 0.10;
/// 그레인 세기. 예제 0.03. 빔의 어두운·중간 밝기 영역에만 얹어 레이 워크 계단을 가린다
const GRAIN: f32 = 0.035;

/// 종횡비 보정 — 보정 후 좌표계의 1.0은 **캔버스 높이**다. 모든 반경·크기는 이 단위다
fn stage(p: vec2f, aspect: f32) -> vec2f {
  return vec2f((p.x - 0.5) * aspect, p.y - 0.5);
}

/// 둥근 직사각형 SDF. 음수 = 카드 안, 양수 = 밖(가장 가까운 가장자리까지의 거리)
fn sdCard(p: vec2f) -> f32 {
  let q = abs(p) - params.cardHalf + vec2f(params.cornerR);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - params.cornerR;
}

/// 해시 노이즈 [0,1). 블루 노이즈 텍스처 대신 쓴다 — 시간 축은 황금비로 돌려 프레임마다 상관을 끊는다
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

/// 예제 `resolveDarkColor` — 어두운 바닥용 톤맵. 가산 합이 클램프로 평평해지지 않고 지수 포화한다
fn tonemap(radiance: vec3f) -> vec3f {
  return max(vec3f(0.0), vec3f(1.0) - exp(-radiance * 1.3));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = max(params.res.x, 1.0) / max(params.res.y, 1.0);
  let p = stage(uv, aspect);
  let center = stage(params.cardCenter, aspect);
  let light = stage(params.light, aspect);

  // 카드 기준 로컬 좌표
  let lp = p - center;
  let d = sdCard(lp);

  // ── 밝기 맥동 (자율 모드에서만) ──────────────────────────────────
  // 포인터가 없으면 3.2s 주기로 0.55~1.0 사이를 숨 쉰다. 포인터가 잡으면 hold→1로 맥동이 사라진다
  let breath = 0.775 + 0.225 * sin(params.time * 1.96);
  let intensity = mix(breath, 1.0, params.hold);

  // ── ① 림 라이트 ─────────────────────────────────────────────────
  // 가장자리에서 exp로 사라지는 얇은 빛. 광원까지의 거리로 감쇠해 "조명이 가까운 쪽 가장자리"만 밝다.
  // 카드 안쪽(d<0)도 조금 칠한다 — 카드 DOM이 불투명해서 안 보이지만, 카드 그림자 모서리(반경 8px)
  // 사이로 새는 픽셀이 매끈해진다
  let toLight = length(light - p);
  let lightFall = 1.0 / (1.0 + toLight * toLight * 4.0);
  let rim = exp(-abs(d) / RIM_W) * lightFall;

  // ── ② 볼류메트릭 빔 — 픽셀에서 광원 쪽으로 48단계 걸으며 부드러운 림을 누적 ──
  // 예제 composite.wgsl의 레이 워크와 같은 구조. 다른 점: 텍스처 대신 SDF를 걷고,
  // 걷는 도중 카드 **안**을 지나면 그 뒤는 가려진 것으로 본다(occluded) — 카드가 조명을 막는다.
  // 그래서 광원이 카드 뒤 깊숙이 있으면 빔은 가장자리에서만 새고, 광원이 가장자리로 밀리면 그쪽이 터진다.
  let dir = light - p;
  let delta = dir / f32(STEPS);
  let jitter = fract(hash(floor(uv * params.res)) + params.frame * 0.61803398875);
  var coord = p + delta * jitter;
  var w = 1.0;
  var wsum = 0.0;
  var beams = 0.0;
  var blocked = 0.0;
  for (var i = 0; i < STEPS; i++) {
    coord += delta;
    let s = sdCard(coord - center);
    // 카드 내부를 한 번 지나면 그 뒤로는 광원이 보이지 않는다
    blocked = max(blocked, step(s, -0.004));
    beams += exp(-abs(s) / RIM_SOFT_W) * w;
    wsum += w;
    w *= DECAY;
  }
  beams = beams / max(wsum, 0.001);
  // 카드 안쪽 픽셀은 빔을 그리지 않는다(카드가 덮고 있다). 바깥에서만 보이게 마스크
  let outside = smoothstep(-0.002, 0.006, d);
  beams *= outside;

  // ── ③ 광원 헤일로 — 카드에 가려지지 않은 시선에만 보인다 ─────────────
  let halo = exp(-(toLight * toLight) / (HALO_R * HALO_R)) * (1.0 - blocked) * outside;

  // ── ④ 바닥 스필 — 카드 아래 무대 바닥에 얕게 깔리는 자홍. 움직이지 않는다 ────
  let floorP = (lp - vec2f(0.0, params.cardHalf.y + 0.10)) / vec2f(0.62, 0.16);
  let spill = exp(-dot(floorP, floorP) * 2.3) * outside;

  // ── 합성 ─────────────────────────────────────────────────────────
  // 예제의 배분을 따른다: 림은 흰색과 브랜드색 반반(뜨거운 가장자리), 빔은 브랜드색, 헤일로는 A색
  let hot = mix(vec3f(1.0), params.colorA, 0.5);
  var radiance = hot * rim * 1.6 * intensity;
  radiance += params.colorA * rim * 0.5 * intensity;
  radiance += mix(params.colorA, params.colorB, 0.35) * beams * 1.15 * intensity;
  radiance += params.colorA * halo * 0.9 * intensity;
  radiance += params.colorB * spill * 0.30;

  // 카드 중심에서 멀어질수록 전체가 사라진다 — 빔이 화면 끝까지 가서 "상자"의 변을 드러내지 않게
  let radial = smoothstep(1.45, 0.30, length(lp));
  var color = tonemap(radiance * radial);

  // 캔버스 경계 페이드
  let fade =
    smoothstep(0.0, 0.14, uv.y) * smoothstep(0.0, 0.18, 1.0 - uv.y) *
    smoothstep(0.0, 0.08, uv.x) * smoothstep(0.0, 0.08, 1.0 - uv.x);
  color *= fade;

  // 그레인 — 빔의 어둡고 중간인 영역에만. 림·헤일로 같은 밝은 곳과 완전한 어둠은 그대로 둔다
  let beamSignal = beams * radial * intensity;
  let gate = smoothstep(0.003, 0.05, beamSignal) * (1.0 - smoothstep(0.4, 1.0, beamSignal));
  let g = (fract(hash(floor(uv * params.res) * vec2f(3.0, 5.0) + vec2f(53.0, 17.0)) + params.frame * 0.61803398875 + 0.38196601125) - 0.5) * 2.0;
  color = clamp(color + vec3f(g * GRAIN * gate * fade), vec3f(0.0), vec3f(1.0));

  // 배경 위에 **가산**으로 얹힌다. premultiplied라 색이 곧 기여량이고, 알파는 가장 밝은 채널로 —
  // 검은 바닥에서는 알파가 얼마든 색 기여만 남지만, ground가 완전 검정이 아니므로(#0b0b12)
  // 알파를 색에 맞춰 두면 바닥 색이 빛 뒤에서 그만큼 물러나 더 "빛"처럼 보인다
  let a = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
  return vec4f(color * params.strength, a * params.strength);
}
