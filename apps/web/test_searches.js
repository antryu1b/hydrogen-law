const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function testSearch(query, expectedMin) {
  const { data, error } = await supabase.rpc('search_law_documents', {
    search_query: query,
    max_results: 20
  });

  if (error) {
    console.error('Error:', error);
    return false;
  }

  const passed = data.length >= expectedMin;
  const status = passed ? '✅' : '❌';

  console.log(`\n${status} "${query}"`);
  console.log(`   결과: ${data.length}개 (최소 ${expectedMin}개 기대)`);

  // 법령별 분포
  const byLaw = {};
  data.forEach(r => {
    const law = r.metadata.law_name;
    if (!byLaw[law]) byLaw[law] = 0;
    byLaw[law]++;
  });

  Object.entries(byLaw).forEach(([law, count]) => {
    const shortName = law.includes('시행규칙') ? '시행규칙' :
                      law.includes('시행령') ? '시행령' : '법률';
    console.log(`     ${shortName}: ${count}개`);
  });

  // 상위 3개 결과
  if (data.length > 0) {
    console.log(`   상위 결과:`);
    data.slice(0, 3).forEach((r, i) => {
      const shortName = r.metadata.law_name.includes('시행규칙') ? '시행규칙' :
                        r.metadata.law_name.includes('시행령') ? '시행령' : '법률';
      console.log(`     ${i + 1}. ${shortName} ${r.metadata.article_number} (${r.relevance_score.toFixed(1)})`);
    });
  }

  return passed;
}

async function main() {
  console.log('='.repeat(60));
  console.log('검색 테스트');
  console.log('='.repeat(60));

  // 데이터베이스 통계
  const { data: allDocs } = await supabase
    .from('law_documents')
    .select('metadata');

  const byLaw = {};
  allDocs.forEach(doc => {
    const law = doc.metadata.law_name;
    if (!byLaw[law]) byLaw[law] = 0;
    byLaw[law]++;
  });

  console.log('\n📊 데이터베이스 현황:');
  console.log(`   총 문서: ${allDocs.length}개`);
  Object.entries(byLaw).forEach(([law, count]) => {
    console.log(`   ${law}: ${count}개`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('검색 테스트 실행');
  console.log('='.repeat(60));

  const tests = [
    { query: '유통', expectedMin: 4 },
    { query: '고압가스', expectedMin: 10 },
    { query: '압력', expectedMin: 5 },
    { query: '충전', expectedMin: 5 },
    { query: '안전', expectedMin: 10 },
    { query: '허가', expectedMin: 5 },
    { query: '검사', expectedMin: 5 },
    { query: '제조', expectedMin: 5 },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await testSearch(test.query, test.expectedMin);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('테스트 결과');
  console.log('='.repeat(60));
  console.log(`✅ 통과: ${passed}개`);
  console.log(`❌ 실패: ${failed}개`);
  console.log(`총 ${passed + failed}개 테스트 중 ${(passed / (passed + failed) * 100).toFixed(0)}% 성공`);
}

main();
