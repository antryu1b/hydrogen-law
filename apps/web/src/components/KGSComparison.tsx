'use client';

import { useState, useEffect } from 'react';

interface KGSCode {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  updated: string;
  pages: number;
  pdfUrl: string;
}

interface ComparisonRow {
  criterion: string;
  [key: string]: string;
}

interface KGSComparisonProps {
  searchQuery: string;
}

export default function KGSComparison({ searchQuery }: KGSComparisonProps) {
  const [recommendations, setRecommendations] = useState<Array<{
    code: string;
    name: string;
    category: string;
    subcategory: string;
    score: number;
    matchedKeywords: string[];
  }>>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{
    codes: KGSCode[];
    comparison: ComparisonRow[];
    criteria: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // 추천 CODE 가져오기
  useEffect(() => {
    if (!searchQuery) return;

    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/kgs/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });

        if (res.ok) {
          const data = await res.json();
          setRecommendations(data.recommended || []);
          
          // 상위 3개 자동 선택
          const topCodes = data.recommended.slice(0, 3).map((r: { code: string }) => r.code);
          setSelectedCodes(topCodes);
        }
      } catch (error) {
        console.error('Recommendation fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [searchQuery]);

  // 비교표 가져오기
  useEffect(() => {
    if (selectedCodes.length === 0) {
      setComparison(null);
      return;
    }

    const fetchComparison = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/kgs/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: selectedCodes }),
        });

        if (res.ok) {
          const data = await res.json();
          setComparison(data);
        }
      } catch (error) {
        console.error('Comparison fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [selectedCodes]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-xl font-bold mb-4">🔧 관련 KGS CODE</h2>

      {/* 추천 목록 */}
      <div className="mb-6">
        <p className="text-sm text-gray-600 mb-3">
          검색어와 관련된 기술기준을 선택하세요 (최대 5개)
        </p>
        <div className="space-y-2">
          {recommendations.map((rec) => (
            <label
              key={rec.code}
              className="flex items-start gap-3 p-3 border rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCodes.includes(rec.code)}
                onChange={() => toggleCode(rec.code)}
                disabled={
                  !selectedCodes.includes(rec.code) && selectedCodes.length >= 5
                }
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-blue-600">
                    {rec.code}
                  </span>
                  <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                    {rec.category} › {rec.subcategory}
                  </span>
                  <span className="text-xs text-gray-500">
                    매칭도: {(rec.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1">{rec.name}</p>
                {rec.matchedKeywords.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {rec.matchedKeywords.map((kw: string) => (
                      <span
                        key={kw}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 비교표 */}
      {comparison && comparison.codes.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-blue-50 p-4 border-b">
            <h3 className="font-bold text-lg">비교표</h3>
            <p className="text-sm text-gray-600 mt-1">
              선택한 {comparison.codes.length}개 CODE의 주요 기준 비교
            </p>
          </div>

          {/* CODE 헤더 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-3 text-left font-semibold border-r sticky left-0 bg-gray-100 min-w-[120px]">
                    항목
                  </th>
                  {comparison.codes.map((code) => (
                    <th key={code.code} className="p-3 text-left min-w-[200px]">
                      <div className="font-mono font-bold text-blue-600">
                        {code.code}
                      </div>
                      <div className="text-xs font-normal text-gray-600 mt-1">
                        {code.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {code.category} › {code.subcategory}
                      </div>
                      <a
                        href={code.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline mt-2 inline-block"
                      >
                        📄 PDF 원문
                      </a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.comparison.map((row, idx) => (
                  <tr
                    key={row.criterion}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="p-3 font-semibold border-r sticky left-0 bg-inherit">
                      {row.criterion}
                    </td>
                    {comparison.codes.map((code) => (
                      <td key={code.code} className="p-3">
                        {row[code.code] || '해당없음'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-gray-500">
          로딩 중...
        </div>
      )}
    </div>
  );
}
