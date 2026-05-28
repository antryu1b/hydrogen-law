#!/bin/bash
# Upload 시행규칙 from legalize-kr to Supabase law_articles

SUPABASE_URL="https://ygohwygdwbckgtotlogm.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnb2h3eWdkd2Jja2d0b3Rsb2dtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxNzc2MiwiZXhwIjoyMDg1MjkzNzYyfQ.QjmbsG_IZr9SWU8gCUuBFhdXo1ISOHrGa4lo2RqHqfk"

upload_article() {
  local id="$1"
  local law_name="$2"
  local article_no="$3"
  local title="$4"
  local content="$5"
  local law_type="$6"

  # Escape JSON
  local json_content
  json_content=$(printf '%s' "$content" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
  local json_title
  json_title=$(printf '%s' "$title" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

  curl -s -X POST "${SUPABASE_URL}/rest/v1/law_articles" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"id\":\"${id}\",\"law_name\":\"${law_name}\",\"article_no\":\"${article_no}\",\"title\":${json_title},\"content\":${json_content},\"law_type\":\"${law_type}\"}" \
    > /dev/null 2>&1

  echo "  Uploaded: ${article_no} (${title})"
}

echo "Parsing and uploading 시행규칙..."
