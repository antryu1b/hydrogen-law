# 어플리케이션개발2팀 법령 검색 — Design System

> StyleSeed 기반 디자인 규칙. UI 코딩 시 항상 이 파일을 참조할 것.

---

## 1. 색상 철학

### 단일 Accent 원칙
- Accent(브랜드) 색상: **`#1d4ed8` (법률 파란색)** — 선택/활성 상태에만 사용
- KGS CODE 전용: **`#0d9488` (teal)** — KGS 탭/배지에만 사용
- 나머지는 **모두 그레이스케일** — accent가 돋보이게

```
✓ Accent 사용: 활성 탭 underline, 선택된 법령 버튼, 링크
✗ Accent 금지: 배경 전체, 본문 텍스트, 일반 테두리
```

### 그레이스케일 5단계
| 레벨 | Tailwind | 용도 |
|------|----------|------|
| Strong | `text-foreground` | 법령명, 카드 제목 |
| Primary | `text-foreground/80` | 조문 번호, 섹션 제목 |
| Secondary | `text-muted-foreground` | 라벨, 날짜, 설명 |
| Tertiary | `text-muted-foreground/70` | 부제목, 힌트 텍스트 |
| Disabled | `text-muted-foreground/50` | 비활성, placeholder |

### 배경 — 미묘한 차이로 깊이 표현
| 배경 | 용도 |
|------|------|
| `bg-background` | 페이지 전체 |
| `bg-card` | 카드 내부 |
| `bg-muted/30` | 조문 본문 배경 |
| `bg-primary/5` | 선택된 항목 행 배경 |

---

## 2. 타이포그래피 규칙

### 폰트
- 한국어: **Noto Serif KR** (제목) + **Noto Sans KR** (본문) 
- 라틴: **Inter** fallback

### 폰트 사이즈 계층
| 용도 | 클래스 | 크기 |
|------|--------|------|
| 페이지 제목 | `text-3xl font-bold tracking-tight` | 30px |
| 카드 제목(법령명) | `text-lg font-semibold` | 18px |
| 조문 번호 | `text-base font-medium` | 16px |
| 본문 | `text-sm leading-relaxed` | 14px |
| 레이블/배지 | `text-xs` | 12px |
| 마이크로 | `text-[10px]` | 10px |

### 규칙
```
✓ 법령명: font-semibold, 조문번호: font-medium
✓ 본문: leading-relaxed (1.625) — 법률 텍스트는 여유 있게
✗ 같은 레벨 텍스트에 볼드 남용 금지
✗ 순수 검정(#000) 사용 금지 — foreground 변수 사용
```

---

## 3. 카드 & 레이아웃 규칙

### 카드 원칙
- **모든 콘텐츠는 카드 안에** — 페이지 배경에 직접 콘텐츠 금지
- 카드 hover: `hover:border-primary/50 hover:shadow-md transition-all`
- 카드 border: `border` (기본) / `border-2` (강조)

### 간격 시스템
| 상황 | 클래스 |
|------|--------|
| 카드 간 간격 | `space-y-4` |
| 섹션 간 간격 | `my-6` or `mb-8` |
| 카드 내 패딩 | `p-4 sm:p-6` |
| 버튼/배지 간격 | `gap-2` or `gap-2.5` |
| 인라인 요소 | `gap-1.5` |

### 버튼 규칙
```
✓ 필터 버튼: rounded-full, px-4 py-2, text-xs
✓ Primary 버튼: bg-primary text-primary-foreground
✓ Ghost 버튼: hover:bg-accent
✗ 버튼 너무 많이 쓰기 금지 — 핵심 액션만
```

---

## 4. 법률 앱 특화 규칙

### 법령 계층 표시
```
최상위법 (버튼으로 필터) → 하위 조문 목록
예: [수소경제법 (23)] [고압가스안전관리법 (8)]
```

### 조문 카드 구조
```
┌─────────────────────────────────┐
│ [번호] 법령명 제X조 (제목)         │
│ ──────────────────────────────  │
│ 본문 내용 (접기/펼치기)            │
│ [관련 조항 배지들]                 │
└─────────────────────────────────┘
```

### 콘텐츠 접기/펼치기
- 300자 초과 시 `max-h-40` + gradient fade
- "더 보기" 버튼으로 펼침
- 별표(appendix): 기본 접힘, summary만 표시

### KGS CODE 색상
- 코드 번호: `text-[#0d9488] font-mono font-bold`
- 매칭 키워드 배지: `bg-[#0d9488]/10 text-[#0d9488]`
- KGS 탭 활성: `border-[#0d9488] text-[#0d9488]`

---

## 5. 애니메이션 규칙

```css
/* globals.css에 정의됨 */
.animate-fade-in { animation: fadeIn 0.25s ease-out; }
.fadeIn { animation: fadeIn 0.25s ease-out; }
```

```
✓ 탭 전환: fadeIn 클래스
✓ 카드 hover: transition-all duration-200
✓ 검색 결과 등장: animate-fade-in
✗ 과도한 애니메이션 금지 — 법률 앱은 신뢰감이 우선
```

---

## 6. 다크모드 규칙

```
✓ 모든 색상은 CSS 변수 사용: text-foreground, bg-background 등
✗ 하드코딩 금지: #f8fafc, #ffffff, text-gray-900 등
✓ 다크 전용 스타일: dark:bg-... dark:text-... 명시
```

---

## 7. 금지 패턴

```
✗ 보라색 그라디언트 배경 (AI 클리셰)
✗ `bg-white` / `text-black` 하드코딩
✗ Inter, Arial, system-ui 폰트 (독창성 없음)
✗ 버튼마다 다른 크기/모양
✗ 모든 요소에 hover 효과
✗ 순수 #000 또는 #fff 사용
✗ 과도한 그림자 (법률 앱에는 subtle하게)
```
