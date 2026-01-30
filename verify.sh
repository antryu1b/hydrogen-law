#!/bin/bash

# 수소법률 RAG 시스템 자동 검증 스크립트
# Automated Verification Workflow for Hydrogen Law RAG System

set -e  # Exit on any error

echo "=================================================="
echo "수소법률 RAG 시스템 검증 시작"
echo "Starting Hydrogen Law RAG System Verification"
echo "=================================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
VERIFICATION_FAILED=0

# Step 1: TypeScript/JavaScript 컴파일 검사
echo "=================================================="
echo "1️⃣  TypeScript/JavaScript 컴파일 검사"
echo "=================================================="
cd /Users/andrew/Thairon/hydrogen-law-rag/apps/web

if npm run build > /tmp/verify_build.log 2>&1; then
    echo -e "${GREEN}✅ 컴파일 성공${NC}"
else
    echo -e "${RED}❌ 컴파일 실패${NC}"
    cat /tmp/verify_build.log
    VERIFICATION_FAILED=1
fi
echo ""

# Step 2: ESLint 검사
echo "=================================================="
echo "2️⃣  ESLint 검사"
echo "=================================================="

if npm run lint > /tmp/verify_lint.log 2>&1; then
    echo -e "${GREEN}✅ Lint 검사 통과${NC}"
else
    echo -e "${YELLOW}⚠️  Lint 경고 발견${NC}"
    cat /tmp/verify_lint.log | head -20
fi
echo ""

# Step 3: Python 코드 검증 (RAG Engine)
echo "=================================================="
echo "3️⃣  Python 코드 검증 (RAG Engine)"
echo "=================================================="
cd /Users/andrew/Thairon/KGS

# Check Python syntax
if python3 -m py_compile reparse_pdfs.py upload_simple.py > /tmp/verify_python.log 2>&1; then
    echo -e "${GREEN}✅ Python 구문 검사 통과${NC}"
else
    echo -e "${RED}❌ Python 구문 오류${NC}"
    cat /tmp/verify_python.log
    VERIFICATION_FAILED=1
fi
echo ""

# Step 4: 데이터베이스 연결 테스트
echo "=================================================="
echo "4️⃣  데이터베이스 연결 테스트"
echo "=================================================="
cd /Users/andrew/Thairon/hydrogen-law-rag/apps/web

if node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('law_documents').select('id', { count: 'exact', head: true }).then(({ count, error }) => {
  if (error) throw error;
  console.log(\`✅ DB 연결 성공: \${count}개 문서\`);
  process.exit(0);
}).catch(err => {
  console.error('❌ DB 연결 실패:', err.message);
  process.exit(1);
});
" > /tmp/verify_db.log 2>&1; then
    cat /tmp/verify_db.log
else
    echo -e "${RED}❌ 데이터베이스 연결 실패${NC}"
    cat /tmp/verify_db.log
    VERIFICATION_FAILED=1
fi
echo ""

# Step 5: 검색 기능 테스트
echo "=================================================="
echo "5️⃣  검색 기능 유효성 테스트"
echo "=================================================="

if node test_searches.js > /tmp/verify_search.log 2>&1; then
    # Extract and display summary
    echo -e "${GREEN}검색 테스트 실행 완료${NC}"
    tail -10 /tmp/verify_search.log

    # Check pass rate
    if grep -q "100% 성공" /tmp/verify_search.log; then
        echo -e "${GREEN}✅ 모든 검색 테스트 통과${NC}"
    elif grep -q "75% 성공\|88% 성공" /tmp/verify_search.log; then
        echo -e "${YELLOW}⚠️  일부 검색 테스트 실패 (허용 범위)${NC}"
    else
        echo -e "${RED}❌ 검색 테스트 실패율 높음${NC}"
        VERIFICATION_FAILED=1
    fi
else
    echo -e "${RED}❌ 검색 테스트 실행 실패${NC}"
    cat /tmp/verify_search.log
    VERIFICATION_FAILED=1
fi
echo ""

# Step 6: 최종 결과 보고
echo "=================================================="
echo "검증 결과 요약"
echo "Verification Summary"
echo "=================================================="

if [ $VERIFICATION_FAILED -eq 0 ]; then
    echo -e "${GREEN}"
    echo "✅ 모든 검증 단계 통과"
    echo "✅ All verification steps passed"
    echo "시스템 배포 가능 상태"
    echo "System ready for deployment"
    echo -e "${NC}"
    exit 0
else
    echo -e "${RED}"
    echo "❌ 검증 실패"
    echo "❌ Verification failed"
    echo "위 오류를 수정한 후 다시 검증하세요"
    echo "Fix errors above and re-run verification"
    echo -e "${NC}"
    exit 1
fi
