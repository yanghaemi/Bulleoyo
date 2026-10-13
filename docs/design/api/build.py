#!/usr/bin/env python3
"""parts/*.yaml (paths + components.schemas) 를 openapi.base.yaml에 병합해 openapi.yaml 생성.
사용: python3 build.py   (docs/design/api 에서)  — 충돌(같은 path/method, 같은 schema 이름)은 실패로 처리."""
import glob, re, sys, os
try:
    import yaml
except ImportError:
    sys.exit("PyYAML 필요: pip install pyyaml")
# PyYAML 은 YAML 1.1 이라 따옴표 없는 no·yes·on·off·y·n 을 불리언으로 읽는다. 속성 이름 `no:` 가
# `false` 키가 되어 생성 타입이 `false?:` 로 나왔다(2026-09-14). OpenAPI 3.1 은 YAML 1.2 를 전제하므로
# 불리언은 true/false 계열만 인정한다. 출력(safe_dump)은 1.1 규칙으로 따옴표를 쳐서 'no' 로 쓰니
# 1.1 파서가 생성 파일을 읽어도 안전하다.
BOOL = "tag:yaml.org,2002:bool"
class Yaml12Loader(yaml.SafeLoader): pass
Yaml12Loader.yaml_implicit_resolvers = {ch: [(t, r) for t, r in rs if t != BOOL] for ch, rs in yaml.SafeLoader.yaml_implicit_resolvers.items()}
Yaml12Loader.add_implicit_resolver(BOOL, re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF"))
def load(path): return yaml.load(open(path, encoding="utf-8"), Loader=Yaml12Loader)
here = os.path.dirname(os.path.abspath(__file__))
base = load(os.path.join(here, "openapi.base.yaml"))
base.setdefault("paths", {}); base["components"].setdefault("schemas", {})
errors = []
for f in sorted(glob.glob(os.path.join(here, "parts", "*.yaml"))):
    part = load(f) or {}
    name = os.path.basename(f)
    for path, item in (part.get("paths") or {}).items():
        dst = base["paths"].setdefault(path, {})
        for method, op in item.items():
            if method in dst: errors.append(f"{name}: 중복 {method.upper()} {path}")
            dst[method] = op
    for sname, schema in ((part.get("components") or {}).get("schemas") or {}).items():
        if sname in base["components"]["schemas"]: errors.append(f"{name}: 스키마 중복 {sname}")
        base["components"]["schemas"][sname] = schema
    extra = set((part.get("components") or {}).keys()) - {"schemas"}
    if extra: errors.append(f"{name}: components에 schemas 외 키 {sorted(extra)} — 루트에서만 정의")
# 가드: 매핑 키가 불리언이면 실패. 로더를 되돌리거나 다른 경로로 불리언 키가 들어와도 여기서 멈춘다.
def bool_keys(node, path):
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(k, bool): errors.append(f"불리언 키 {k!r} at {path}/ — 속성 이름이면 따옴표로 감쌀 것")
            bool_keys(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node): bool_keys(v, f"{path}[{i}]")
bool_keys(base, "")
if errors: sys.exit("\n".join(errors))
# OAS 3.0식 nullable: true → 3.1 (type에 "null" 추가 / $ref는 oneOf)
def normalize(node):
    if isinstance(node, dict):
        if node.pop("nullable", None) is True:
            if "$ref" in node:
                ref = node.pop("$ref"); node.update({"oneOf": [{"$ref": ref}, {"type": "null"}]})
            elif "allOf" in node or "oneOf" in node or "anyOf" in node:
                key = next(k for k in ("allOf", "oneOf", "anyOf") if k in node)
                inner = {key: node.pop(key)}
                for k in [k for k in node if k in ("properties", "required", "additionalProperties")]: inner[k] = node.pop(k)
                node["oneOf"] = [inner, {"type": "null"}]
            elif "type" in node:
                t = node["type"]; node["type"] = (t if isinstance(t, list) else [t]) + (["null"] if "null" not in (t if isinstance(t, list) else [t]) else [])
            else:
                node["type"] = ["null"]
        for v in node.values(): normalize(v)
    elif isinstance(node, list):
        for v in node: normalize(v)
normalize(base)
# $ref 응답 옆의 키 정리(spec-ref-siblings).
#
# description 은 남긴다. OAS 3.1 의 Reference Object 는 summary·description 을 명시적으로
# 허용한다(3.0 에서만 금지였다). 종전에는 전부 지웠는데, parts/*.yaml 의 409 에러 코드
# 목록이 거기 붙어 있어서 **기계 정본과 Swagger UI 에서 통째로 사라졌다** — 프론트가 보는
# 산출물에 "이 API 가 무슨 코드를 내려주나" 가 없었다(2026-09-11).
KEEP_BESIDE_REF = {'$ref', 'description', 'summary'}
dropped = {}
for path, item in base['paths'].items():
    for op in item.values():
        if not isinstance(op, dict): continue
        for code, r in (op.get('responses') or {}).items():
            if isinstance(r, dict) and '$ref' in r:
                for k in [k for k in r if k not in KEEP_BESIDE_REF]:
                    r.pop(k); dropped.setdefault(k, []).append(f"{path} {code}")
# 말없이 지우지 않는다. description 이 6주 동안 사라져 있던 것을 아무도 몰랐다.
for k, where in sorted(dropped.items()):
    print(f"  주의: $ref 옆 '{k}' {len(where)}건을 뺐다 (예: {where[0]})")
# 정렬: paths는 파일 순서 유지, schemas는 이름순
base["components"]["schemas"] = dict(sorted(base["components"]["schemas"].items()))
out = os.path.join(here, "openapi.yaml")
with open(out, "w", encoding="utf-8") as fp:
    fp.write("# 생성 파일 — 손으로 편집하지 말 것. 원본: openapi.base.yaml + parts/*.yaml, 생성: python3 build.py\n")
    yaml.safe_dump(base, fp, allow_unicode=True, sort_keys=False, width=120)
ops = sum(len([m for m in v if m in ("get","post","put","patch","delete")]) for v in base["paths"].values())
print(f"ok: paths {len(base['paths'])} · operations {ops} · schemas {len(base['components']['schemas'])} → {out}")
