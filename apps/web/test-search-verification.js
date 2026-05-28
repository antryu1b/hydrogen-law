/**
 * Search Verification Script
 * Tests: keyword search → law groups → drill-down → full text
 */

const BASE_URL = process.env.BASE_URL || 'https://hydrogen-law.vercel.app';

const TESTS = [
  // 1. Basic keyword searches
  { name: '수소충전소 검색', endpoint: '/api/search', method: 'POST', body: { query: '수소충전소', top_k: 20 } },
  { name: '고압가스 검색', endpoint: '/api/search', method: 'POST', body: { query: '고압가스', top_k: 20 } },
  { name: '안전기준 검색', endpoint: '/api/search', method: 'POST', body: { query: '안전기준', top_k: 20 } },
  { name: '수소안전 검색', endpoint: '/api/search', method: 'POST', body: { query: '수소안전', top_k: 20 } },
  // 2. Full text lookups
  { name: '수소법 제2조 전문', endpoint: '/api/law-detail?law_name=수소경제+육성+및+수소+안전관리에+관한+법률&article_no=제2조&law_id=013670', method: 'GET' },
  { name: '고압가스법 제3조 전문', endpoint: '/api/law-detail?law_name=고압가스+안전관리에+관한+법률&article_no=제3조', method: 'GET' },
  { name: '수소법 시행규칙 전문', endpoint: '/api/law-detail?law_name=수소경제+육성+및+수소+안전관리에+관한+법률+시행규칙&article_no=제2조', method: 'GET' },
  { name: '고압가스법 시행규칙 전문', endpoint: '/api/law-detail?law_name=고압가스+안전관리법+시행규칙&article_no=제5조', method: 'GET' },
];

const REQUIRED_LAWS = ['수소', '고압가스'];

async function runTest(test) {
  const url = `${BASE_URL}${test.endpoint}`;
  const opts = { method: test.method, headers: { 'Content-Type': 'application/json' } };
  if (test.body) opts.body = JSON.stringify(test.body);

  const start = Date.now();
  try {
    const res = await fetch(url, opts);
    const elapsed = Date.now() - start;
    const data = await res.json();

    const result = {
      name: test.name,
      status: res.status,
      ok: res.ok,
      elapsed_ms: elapsed,
    };

    if (test.method === 'POST' && test.endpoint === '/api/search') {
      result.total_found = data.total_found || 0;
      result.law_groups = (data.law_groups || []).map(g => `${g.law_name} (${g.law_type}): ${g.article_count}건`);
      result.relevant_laws = data.relevant_laws || [];

      // Check if 수소법 or 고압가스법 appears
      const allLawNames = (data.law_groups || []).map(g => g.law_name).join(' ');
      result.has_수소법 = allLawNames.includes('수소');
      result.has_고압가스법 = allLawNames.includes('고압가스');
    }

    if (test.endpoint.startsWith('/api/law-detail')) {
      result.source = data.source || 'unknown';
      result.total_articles = data.total || 0;
      if (data.articles && data.articles.length > 0) {
        const a = data.articles[0];
        result.returned_law = a.law_name;
        result.returned_article = a.article_no;
        result.content_length = (a.content || '').length;
        result.content_preview = (a.content || '').slice(0, 100);
      }
      if (data.error) result.error = data.error;
    }

    return result;
  } catch (e) {
    return { name: test.name, error: e.message, elapsed_ms: Date.now() - start };
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Search Verification - ${BASE_URL}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  let pass = 0, fail = 0;

  for (const test of TESTS) {
    const result = await runTest(test);

    const isPass = result.ok !== false && !result.error;
    const icon = isPass ? '✅' : '❌';

    console.log(`${icon} ${result.name} (${result.elapsed_ms}ms)`);

    if (result.total_found !== undefined) {
      console.log(`   결과: ${result.total_found}건`);
      console.log(`   법령 그룹: ${(result.law_groups || []).join(', ') || 'none'}`);
      if (result.has_수소법 !== undefined) {
        console.log(`   수소법 포함: ${result.has_수소법 ? '✅' : '❌'}`);
        console.log(`   고압가스법 포함: ${result.has_고압가스법 ? '✅' : '❌'}`);
      }
    }

    if (result.source) {
      console.log(`   소스: ${result.source}`);
      console.log(`   반환 법령: ${result.returned_law || 'N/A'}`);
      console.log(`   반환 조문: ${result.returned_article || 'N/A'}`);
      console.log(`   전문 길이: ${result.content_length || 0}자`);
      if (result.content_preview) console.log(`   미리보기: ${result.content_preview}...`);
    }

    if (result.error) console.log(`   에러: ${result.error}`);
    console.log('');

    if (isPass) pass++; else fail++;
  }

  // Summary
  console.log(`${'='.repeat(60)}`);
  console.log(`  결과: ${pass} 통과 / ${fail} 실패 / ${TESTS.length} 전체`);

  // Comprehensive validation
  console.log(`\n--- 종합 검증 ---`);

  // Test 1: Search returns law groups
  const searchRes = await runTest(TESTS[0]);
  const hasGroups = (searchRes.law_groups || []).length > 0;
  console.log(`${hasGroups ? '✅' : '❌'} 검색 결과에 법령 그룹 포함`);

  // Test 2: Both major laws appear in searches
  const allSearchResults = [];
  for (const t of TESTS.slice(0, 4)) {
    allSearchResults.push(await runTest(t));
  }
  const allLaws = allSearchResults.flatMap(r => r.relevant_laws || []).join(' ');
  const has수소 = allLaws.includes('수소');
  const has고압 = allLaws.includes('고압가스');
  console.log(`${has수소 ? '✅' : '❌'} 수소법이 검색 결과에 등장`);
  console.log(`${has고압 ? '✅' : '❌'} 고압가스법이 검색 결과에 등장`);

  // Test 3: Full text works for both sources
  const beopmangTest = await runTest(TESTS[4]);
  const supabaseTest = await runTest(TESTS[6]);
  console.log(`${beopmangTest.content_length > 50 ? '✅' : '❌'} 법망 API 전문 조회 (${beopmangTest.content_length}자)`);
  console.log(`${supabaseTest.content_length > 50 ? '✅' : '❌'} Supabase 전문 조회 (${supabaseTest.content_length}자)`);

  console.log(`${'='.repeat(60)}\n`);
}

main();
