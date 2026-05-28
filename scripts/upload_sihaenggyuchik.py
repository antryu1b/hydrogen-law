"""Upload 시행규칙 from legalize-kr to Supabase law_articles table"""

import os
import re
import json
from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

FILES = [
    {
        "path": os.path.expanduser("~/Thairon/legalize-kr/kr/수소경제육성및수소안전관리에관한법률/시행규칙.md"),
        "law_name": "수소경제 육성 및 수소 안전관리에 관한 법률 시행규칙",
        "law_type": "시행규칙",
    },
    {
        "path": os.path.expanduser("~/Thairon/legalize-kr/kr/고압가스안전관리법/시행규칙.md"),
        "law_name": "고압가스 안전관리법 시행규칙",
        "law_type": "시행규칙",
    },
]


def parse_articles(content: str, law_name: str, law_type: str):
    """Parse markdown into individual articles"""
    # Remove YAML frontmatter
    content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)

    # Split by article headers: ##### 제N조 (...)
    pattern = r'(#{4,5}\s+제\d+조(?:의\d+)?\s*(?:\([^)]*\))?)'
    parts = re.split(pattern, content)

    articles = []
    i = 1  # skip content before first article
    while i < len(parts):
        header = parts[i].strip()
        body = parts[i + 1] if i + 1 < len(parts) else ''

        # Extract article number
        num_match = re.search(r'제(\d+)조(?:의(\d+))?', header)
        if num_match:
            article_no = f"제{num_match.group(1)}조"
            if num_match.group(2):
                article_no += f"의{num_match.group(2)}"
        else:
            article_no = header

        # Extract title from parentheses
        title_match = re.search(r'\(([^)]+)\)', header)
        title = title_match.group(1) if title_match else ''

        # Clean up body
        full_content = f"{header}\n\n{body.strip()}"

        # Generate ID
        clean_name = re.sub(r'\s+', '', law_name)
        article_id = f"{clean_name}_{article_no}"

        articles.append({
            "id": article_id,
            "law_name": law_name,
            "law_id": None,
            "article_no": article_no,
            "title": title,
            "content": full_content,
            "law_type": law_type,
        })

        i += 2

    return articles


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_KEY environment variables required")
        print("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    total_uploaded = 0

    for file_info in FILES:
        path = file_info["path"]
        if not os.path.exists(path):
            print(f"File not found: {path}")
            continue

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        articles = parse_articles(content, file_info["law_name"], file_info["law_type"])
        print(f"\n{file_info['law_name']}: {len(articles)} articles parsed")

        # Upload one by one to handle duplicates
        uploaded = 0
        for article in articles:
            try:
                supabase.table("law_articles").upsert(article, on_conflict="id").execute()
                uploaded += 1
            except Exception as e:
                print(f"  Error uploading {article['id']}: {e}")

        print(f"  Uploaded: {uploaded}/{len(articles)}")
        total_uploaded += uploaded

    print(f"\nTotal uploaded: {total_uploaded}")


if __name__ == "__main__":
    main()
