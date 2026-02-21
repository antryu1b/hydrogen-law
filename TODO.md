# TODO - hydrogen-law-rag

## Phase 1: Foundation (완료)
- [x] Next.js 웹앱 기본 구조
- [x] FastAPI RAG 엔진 기본 구조
- [x] Supabase 연동 (검색 함수)
- [x] ChromaDB 벡터 스토어
- [x] 하이브리드 검색 (벡터 + BM25)
- [x] 보안 수정 (XSS, ReDoS, SQL injection, CORS)
- [x] 테스트 프레임워크 셋업 (vitest + pytest)
- [x] Pre-commit hooks (husky + lint-staged)

## Phase 2: Core Features (완료)
- [x] page.tsx 미사용 import 정리 (Card, CardContent 등)
- [x] 검색 API 에러 응답 표준화 (error code + message)
- [x] 검색 결과 페이지네이션 구현
- [x] 법령 상세 페이지 (/laws/[id]) 구현
- [x] 검색 히스토리 (로컬 스토리지)
- [x] 검색어 자동완성 (자주 검색되는 법률 용어)
- [x] 모바일 반응형 개선

## Phase 3: Quality
- [ ] API route 테스트 추가 (Supabase mock)
- [ ] SearchResults 컴포넌트 테스트 추가
- [ ] hybrid_retriever 테스트 추가
- [ ] GitHub Actions CI/CD 파이프라인
- [ ] 에러 바운더리 컴포넌트 추가
- [ ] 로딩 스켈레톤 UI

## Phase 4: Advanced
- [ ] Claude API 통합 (AI 요약 기능)
- [ ] 컴플라이언스 체크 엔진 구현
- [ ] 법령 간 참조 그래프 구축
- [ ] 데스크톱 앱 (Tauri) 실제 구현
- [ ] 검색 분석 대시보드
