# 수소법률 RAG 시스템 검증 워크플로우

## 개요

이 문서는 수소법률 RAG 시스템의 자동 검증 프로세스를 설명합니다. 모든 코드 변경 후 배포 전에 실행해야 합니다.

## 검증 단계

### 1. TypeScript/JavaScript 컴파일 검사
- **목적**: 코드 구문 오류 및 타입 오류 확인
- **도구**: Next.js build (`npm run build`)
- **위치**: `apps/web/`
- **실패 조건**: 컴파일 에러 발생 시

### 2. ESLint 검사
- **목적**: 코드 스타일 및 잠재적 버그 확인
- **도구**: ESLint (`npm run lint`)
- **위치**: `apps/web/`
- **실패 조건**: Critical 에러 발생 시 (경고는 허용)

### 3. Python 코드 검증
- **목적**: Python 스크립트 구문 오류 확인
- **도구**: `python3 -m py_compile`
- **위치**: `KGS/`
- **검사 파일**:
  - `reparse_pdfs.py`
  - `upload_simple.py`
  - `upload_to_supabase.py`

### 4. 데이터베이스 연결 테스트
- **목적**: Supabase 연결 및 데이터 존재 확인
- **도구**: Node.js Supabase 클라이언트
- **검증 항목**:
  - Supabase URL 유효성
  - API 키 유효성
  - `law_documents` 테이블 접근 가능
  - 문서 개수 확인 (>100개)

### 5. 검색 기능 유효성 테스트
- **목적**: 실제 검색 기능 작동 확인
- **도구**: `test_searches.js`
- **테스트 케이스**: 8개 검색어
  - 유통 (4+ 결과)
  - 고압가스 (10+ 결과)
  - 압력 (3+ 결과)
  - 충전 (5+ 결과)
  - 안전 (10+ 결과)
  - 허가 (5+ 결과)
  - 검사 (5+ 결과)
  - 제조 (5+ 결과)
- **통과 기준**: 75% 이상 성공 (6/8 이상)

## 사용 방법

### 수동 실행
```bash
cd /Users/andrew/Thairon/hydrogen-law-rag
./verify.sh
```

### Git Hook 설정 (자동 실행)
배포 전 자동 검증을 위해 pre-push hook 설정:

```bash
# .git/hooks/pre-push 파일 생성
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
echo "배포 전 검증 실행 중..."
./verify.sh
if [ $? -ne 0 ]; then
    echo "검증 실패! Push를 중단합니다."
    exit 1
fi
echo "검증 통과! Push를 진행합니다."
EOF

chmod +x .git/hooks/pre-push
```

### CI/CD 통합 (Vercel)
Vercel 배포 시 자동 검증:

```json
// package.json에 추가
{
  "scripts": {
    "vercel-build": "./verify.sh && next build"
  }
}
```

## 출력 형식

### 성공 예시
```
==================================================
수소법률 RAG 시스템 검증 시작
==================================================

1️⃣  TypeScript/JavaScript 컴파일 검사
✅ 컴파일 성공

2️⃣  ESLint 검사
✅ Lint 검사 통과

3️⃣  Python 코드 검증
✅ Python 구문 검사 통과

4️⃣  데이터베이스 연결 테스트
✅ DB 연결 성공: 117개 문서

5️⃣  검색 기능 유효성 테스트
✅ 모든 검색 테스트 통과

==================================================
검증 결과 요약
==================================================
✅ 모든 검증 단계 통과
시스템 배포 가능 상태
```

### 실패 예시
```
==================================================
1️⃣  TypeScript/JavaScript 컴파일 검사
❌ 컴파일 실패
Error: Cannot find module 'xxx'
...

==================================================
검증 결과 요약
==================================================
❌ 검증 실패
위 오류를 수정한 후 다시 검증하세요
```

## 트러블슈팅

### 컴파일 에러
- `node_modules` 재설치: `rm -rf node_modules && npm install`
- TypeScript 버전 확인: `npx tsc --version`

### Lint 에러
- 자동 수정: `npm run lint -- --fix`
- Prettier 포맷팅: `npx prettier --write .`

### 데이터베이스 연결 실패
- `.env.local` 파일 존재 확인
- Supabase 프로젝트 상태 확인
- API 키 만료 여부 확인

### 검색 테스트 실패
- 데이터베이스 문서 개수 확인
- `search_law_documents` 함수 존재 확인
- 개별 검색 테스트: `node check_pressure.js`

## 검증 로그

모든 검증 로그는 `/tmp/` 디렉토리에 저장:
- `/tmp/verify_build.log` - 빌드 로그
- `/tmp/verify_lint.log` - Lint 로그
- `/tmp/verify_python.log` - Python 검증 로그
- `/tmp/verify_db.log` - DB 연결 로그
- `/tmp/verify_search.log` - 검색 테스트 로그

## 유지보수

### 새로운 검증 단계 추가
1. `verify.sh`에 새 섹션 추가
2. 적절한 exit code 설정
3. `VERIFICATION_FAILED` 플래그 업데이트
4. 이 문서 업데이트

### 테스트 케이스 수정
- `test_searches.js` 파일 수정
- `expectedMin` 값 조정
- 새로운 검색어 추가

## 배포 체크리스트

- [ ] `./verify.sh` 실행 및 통과
- [ ] 환경 변수 설정 확인
- [ ] Vercel 프로젝트 설정 확인
- [ ] 도메인 설정 확인 (필요시)
- [ ] 배포 후 프로덕션 테스트
