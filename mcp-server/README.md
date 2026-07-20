# hydrogen-law MCP server

Deployed Vercel API 라우트를 1:1로 감싸는 얇은 프록시 MCP 서버.
검색/비교 **로직은 재구현하지 않는다** — 법망(Beopmang)→Supabase 폴백 체인과
비교표가 웹사이트와 완전히 동일하게 동작한다. 새로 생기는 건 MCP stdio 전송뿐.

## 설치

```bash
cd mcp-server
npm install
```

## 실행 (수동 확인용)

```bash
HYDRO_BASE_URL=https://hydrogen-law.vercel.app node index.mjs
```

`HYDRO_BASE_URL` = 배포된 Vercel 오리진 (뒤 슬래시 없이). 미설정 시 즉시 종료.

## 도구 (3개)

- `hydro_search` → `POST /api/search` `{ query, top_k }` — 통합 검색(폴백 체인 그대로)
- `hydro_compare` → `kind:"kgs"` → `POST /api/kgs/compare` `{ codes }` / `kind:"marine"` → `GET /api/marine-compare?q=` — 비교표
- `hydro_detail` → `kind:"law"` → `POST /api/law-detail` `{ law_name, article_number }` / `kind:"section"` → `GET /api/kgs/section-body?code=&sec_no=&recursive=` — 조문·섹션 상세

## y-company에 등록

프로젝트 루트 `.mcp.json` (또는 전역 `~/.claude.json`의 `mcpServers`)에 추가:

```json
{
  "mcpServers": {
    "hydrogen-law": {
      "command": "node",
      "args": ["/Users/andrew/PRJs/hydrogen-law/mcp-server/index.mjs"],
      "env": { "HYDRO_BASE_URL": "https://hydrogen-law.vercel.app" }
    }
  }
}
```

등록 후 사내 Claude가 `hydro_search` / `hydro_compare` / `hydro_detail` 를
직접 호출해 수소법 검색·비교표·조문조회를 그대로 재현한다.
