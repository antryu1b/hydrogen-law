# KGS CODE Family Map — Phase 1 result
Date: 2026-05-28
Scope: 19 codes (out of original 20; FU671 not on KGS server)

---

## Family summary

**2 families, 2 outliers** (Jaccard threshold: 0.60)

| Family | Label | Size | Members |
|--------|-------|------|---------|
| A | 제조기준 패턴 (제조설비/재료/성능/검사종류) | 11 | AC411, AC421, AH171, AH271, AH371, AH372, AH373, AH374, AH375, AH376, AH377 |
| B | 시설기준 패턴 (배치/기초/저장/가스설비/배관) | 6 | FP211, FP216, FP217, FU111, FU211, FU212 |
| — | Outliers (재검사 전용 패턴) | 2 | AC414, AC116 |

---

## Family A — 제조기준 패턴 (11 codes)
**avg within-Jaccard: 0.789**

These are "제조의 시설·기술·검사 기준" — manufacturing facility/technology/inspection standards.
All follow the KS B ISO manufacturing framework structure.

### Members
| Code | Name |
|------|------|
| AC411 | 고압가스용 알루미늄합금라이너 복합재료용기 제조의 시설·기술·검사 기준 |
| AC421 | 이동수단용 압축수소 복합재료용기 제조의 시설·기술·검사 기준 |
| AH171 | 수소추출설비 제조의 시설·기술·검사 기준 |
| AH271 | 수전해설비 제조의 시설·기술·검사 기준 |
| AH371 | 고정형 연료전지 제조의 시설·기술·검사 기준 |
| AH372 | 이동형 연료전지(지게차용) 제조의 시설·기술·검사 기준 |
| AH373 | 이동형 연료전지(드론용) 제조의 시설·기술·검사 기준 |
| AH374 | 이동형 연료전지(건설기계용) 제조의 시설·기술·검사 기준 |
| AH375 | 이동형 연료전지(노면전차용) 제조의 시설·기술·검사 기준 |
| AH376 | 이동형 연료전지(항공기용) 제조의 시설·기술·검사 기준 |
| AH377 | 이동형 연료전지(선박용) 제조의 시설·기술·검사 기준 |

### Shared L2 sec_nos (17 shared across all 11 members)

| sec_no | Dominant title |
|--------|---------------|
| 1.5 | 기준의 준용 |
| 1.6 | 경과조치 |
| 2 | (제조시설 환경 조건) |
| 2.1 | 제조설비 |
| 2.2 | 검사설비 |
| 3 | (기술기준 공통헤더) |
| 3.1 | 재료 |
| 3.2 | 구조 및 치수 |
| 3.3 | 장치 |
| 3.4 | 성능 |
| 3.5 | 열처리 |
| 3.6 | 표시 |
| 4.1 | 검사종류 |
| 4.2 | 공정검사 대상 심사 |
| 4.3 | 검사항목 |
| 4.4 | 검사방법 |
| 4.5 | 그 밖의 검사기준 |

---

## Family B — 시설기준 패턴 (6 codes)
**avg within-Jaccard: 0.799**

These are "시설·기술·검사·안전성평가 기준" for filling stations, storage, and use facilities.
All follow the KGS facility standard framework with 배치→저장→가스설비→배관→부대 structure.

### Members
| Code | Name |
|------|------|
| FP211 | 고압가스 용기 및 차량에 고정된 탱크 충전의 시설·기술·검사·안전성평가 기준 |
| FP216 | 제조식 수소연료 충전의 시설·기술·검사 기준 |
| FP217 | 저장식 수소연료 충전의 시설·기술·검사 기준 |
| FU111 | 고압가스 저장의 시설·기술·검사·안전성평가 기준 |
| FU211 | 특정고압가스 사용의 시설·기술·검사 기준 |
| FU212 | 특수고압가스 사용의 시설·기술·검사 기준 |

### Shared L2 sec_nos (24 shared across all 6 members)

| sec_no | Dominant title |
|--------|---------------|
| 1 | (general provisions header) |
| 1.1 | 적용 범위 |
| 1.2 | 기준의 효력 |
| 1.3 | 용어 정의 |
| 1.4 | 기준의 준용 |
| 1.5 | 경과조치 |
| 1.6 | 용품사용제한 |
| 2 | (시설기준 헤더) |
| 2.1 | 배치기준 |
| 2.2 | 기초기준 |
| 2.3 | 저장설비기준 |
| 2.4 | 가스설비기준 |
| 2.5 | 배관설비기준 |
| 2.6 | 사고예방설비기준 |
| 2.7 | 피해저감설비기준 |
| 2.8 | 부대설비기준 |
| 2.9 | 표시기준 |
| 3 | (기술기준 헤더) |
| 3.1 | 안전유지기준 |
| 3.2 | 제조 및 충전기준 |
| 3.3 | 점검기준 |
| 4 | (검사기준 헤더) |
| 4.1 | 검사항목 |
| 4.2 | 검사방법 |

---

## Outliers

Both outliers are **재검사(re-inspection) codes** — they have fundamentally different TOC structure from both manufacturing and facility codes.

### AC414 — 고압가스용 복합재료용기 재검사 기준
- 84 sections, 44 pages
- Structure dominated by ISO terminology definitions at L2 (3.1~3.10: 파열압력, 복합재료 감기, 외부코팅, 섬유, ...)
- starts at 5.4 before 1.x — unusual sequencing from ISO alignment
- Jaccard max vs any family member: 0.27 (Family A), 0.21 (Family B) — well below threshold

### AC116 — 고압가스용 저장탱크 및 압력용기 재검사 기준
- 34 sections, 137 pages (highest page count per section — dense tables/figures)
- Structure: 재검사기준(5.x) primary; 제조시설기준 / 제조기술기준 / 검사기준 all marked "(해당 없음)"
- Only 17 L1+L2 sec_nos — thin structure despite large page count
- Jaccard max vs any other code: 0.35 (vs AC414) — outlier pair but both singletons

**Phase 2 recommendation:** Handle AC414 and AC116 with manual TOC mapping templates.

---

## Pairwise Jaccard matrix — top 15 most similar pairs

| Code1 | Code2 | Jaccard |
|-------|-------|---------|
| FU212 | FU211 | 1.0000 |
| AH271 | AH377 | 1.0000 |
| AH271 | AH374 | 1.0000 |
| AH271 | AH376 | 1.0000 |
| AH377 | AH374 | 1.0000 |
| AH377 | AH376 | 1.0000 |
| AH374 | AH376 | 1.0000 |
| AH271 | AH373 | 0.9474 |
| AH377 | AH373 | 0.9474 |
| AH373 | AH374 | 0.9474 |
| AH372 | AH375 | 0.9444 |
| AH373 | AH375 | 0.9444 |
| AH374 | AH375 | 0.9444 |
| AH373 | AH376 | 0.9444 |
| AH375 | AH376 | 0.9444 |

Note: FU212 ↔ FU211 = 1.0 (identical TOC structure, differ only in scope: 특수 vs 특정 고압가스). AH271/AH374/AH376/AH377 form a perfect-Jaccard cluster (수전해 + 이동형연료전지 share identical L1+L2 structure).

---

## Cross-family shared sec_nos

Sec_nos that appear in **both** Family A AND Family B (universal canonical TOC candidates):

`1.5, 1.6, 2, 2.1, 2.2, 3, 3.1, 3.2, 3.3, 4.1, 4.2`

However, the **titles differ** between families for the same sec_no:
- `2.1`: Family A = 제조설비 / Family B = 배치기준
- `3.1`: Family A = 재료 / Family B = 안전유지기준
- `4.1`: Both = 검사항목 (true universal)
- `4.2`: Both = 검사방법 (true universal)
- `1.5`, `1.6`: Both = 경과조치 / 용품사용제한 or 기준의 준용 (near-universal)

**True universals (same sec_no AND same title):** `4.1 검사항목`, `4.2 검사방법`, `1.5 경과조치/기준의 준용`

---

## Per-code download/parse summary (all 19 codes)

| Code | Pages | Sections | PDF filename | Status |
|------|-------|----------|-------------|--------|
| FP217 | (prev) | 324 | FP217-260508.pdf | ok |
| FP216 | (prev) | ~300 | FP216-260508.pdf | ok |
| FU212 | (prev) | ~200 | FU212_260203.pdf | ok |
| AC421 | (prev) | ~200 | AC421-260508.pdf | ok |
| AC411 | (prev) | ~180 | AC411-260508.pdf | ok |
| FP211 | 151 | 429 | FP211-260508.pdf | ok |
| AH271 | 65 | 154 | AH271_251209.pdf | ok |
| AH371 | 79 | 196 | AH371_251209.pdf | ok |
| AH377 | 56 | 134 | AH377_251209.pdf | ok |
| AH373 | 61 | 134 | AH373_251209.pdf | ok |
| AH374 | 56 | 136 | AH374_251209.pdf | ok |
| AH375 | 58 | 136 | AH375_251209.pdf | ok |
| AH376 | 53 | 130 | AH376_251209.pdf | ok |
| AH171 | 87 | 212 | AH171_251209.pdf | ok |
| AH372 | 58 | 141 | AH372_251209.pdf | ok |
| AC414 | 44 | 84 | AC414_260211.pdf | ok (outlier) |
| FU111 | 131 | 378 | FU111-260508.pdf | ok |
| FU211 | 81 | 210 | FU211_260203.pdf | ok |
| AC116 | 137 | 34 | AC116_260211.pdf | ok (outlier) |

All 14 new codes: zero download errors, zero parse failures, all section counts >= 30.

---

## Phase 2 input

### Recommended canonical TOC per family

**Family A canonical TOC** (제조기준 — 17 shared L2 sec_nos):
```
1.x  General (scope, effective date, terminology, cross-reference, transitional, product restriction)
2    Manufacturing Facility
  2.1  제조설비 (manufacturing equipment)
  2.2  검사설비 (inspection equipment)
3    Technology (materials, structure, device, performance, heat treatment, marking)
  3.1  재료
  3.2  구조 및 치수
  3.3  장치
  3.4  성능
  3.5  열처리
  3.6  표시
4    Inspection
  4.1  검사종류
  4.2  공정검사 대상 심사
  4.3  검사항목
  4.4  검사방법
  4.5  그 밖의 검사기준
```

**Family B canonical TOC** (시설기준 — 24 shared L2 sec_nos):
```
1    General (scope, validity, terminology, cross-reference, transitional, product restriction)
2    Facility Standards
  2.1  배치기준
  2.2  기초기준
  2.3  저장설비기준
  2.4  가스설비기준
  2.5  배관설비기준
  2.6  사고예방설비기준
  2.7  피해저감설비기준
  2.8  부대설비기준
  2.9  표시기준
3    Technology Standards
  3.1  안전유지기준
  3.2  제조 및 충전기준
  3.3  점검기준
4    Inspection
  4.1  검사항목
  4.2  검사방법
```

### Codes flagged for manual TOC mapping
- **AC414** — ISO-style terminology sec_nos (3.1~3.10 = definitions, not structure). Map to custom template.
- **AC116** — Re-inspection only code; 제조/기술/검사 all marked "해당 없음". Map to 재검사 template.

### Subgroup notes for Phase 2
- **AH271/AH374/AH376/AH377** (Jaccard=1.0): identical TOC — single template covers all 4
- **FU212/FU211** (Jaccard=1.0): identical TOC — single template covers both
- **AH372/AH373/AH375** (Jaccard≈0.94): near-identical — one template with minor variation flags

### Missing from Phase 1
- **FU671** (수소연료사용시설의 시설·기술·검사 기준): confirmed not on KGS server. Must obtain via alternative channel (direct KGS request or registry download). Likely Family B.
