# job-matcher-agent

원티드·사람인·잡코리아 공고를 모아서 내 경력(Notion 포트폴리오 + 이력서)과 잘 맞는 공고 5개를 골라 분석해 주는 개인 대시보드.

```
[대시보드 (Next.js @ Vercel)] ── "새로 분석하기" ──▶ [GitHub Actions: pipeline.yml]
        ▲                                              수집(Playwright) → 하드 필터·중복 제거
        │ 읽기                                          → Flash 1차 선별 → Pro 심층 분석
        └──────────────── [Neon Postgres] ◀──────────── 추천 5건 덮어쓰기
```

- **프로필**: Notion(기준) + 업로드 자료(보충)를 Pro가 프로필 JSON으로 정제. Notion은 `last_edited_time`으로 바뀐 페이지만 다시 받아옴.
- **근거 사례**: Notion 페이지를 제목 단위로 쪼개 Flash로 태그를 붙임. 분석할 때 공고별로 관련 사례만 Pro에 전달.
- **중복**: 사이트 간 같은 공고는 `회사명+직무명` 정규화 키로 병합, 이미 추천한 공고는 `seen_jobs`로 제외.
- **보안**: 비밀번호(bcrypt) → JWT 쿠키. API 키는 서버(Vercel env / GitHub Secrets)에만 있음.

## 디렉터리

| 경로 | 내용 |
| --- | --- |
| `app/`, `components/`, `proxy.ts` | 대시보드 (Vercel) |
| `pipeline/` | 크롤러 + 분석 (GitHub Actions / 로컬) |
| `lib/` | 공유: DB 스키마, 필터, Gemini, Notion, 인증 |

## 처음 설정

1. **Neon DB**: Vercel 프로젝트 → Storage → Neon 추가 → `DATABASE_URL` 복사
2. **로컬 `.env`**: `.env.example` 복사 후 채우기
   ```bash
   npm install
   npm run hash-password -- '내비밀번호'   # → AUTH_PASSWORD_HASH_B64
   openssl rand -base64 32                # → AUTH_SECRET
   npm run db:push                        # 테이블 생성
   ```
3. **Notion**: https://www.notion.so/profile/integrations 에서 internal integration 생성 → 포트폴리오 최상위 페이지 `···` → 연결 → integration 추가
4. **프로필 만들기**: `npm run profile:refresh` (또는 대시보드 설정 → 프로필 갱신)
5. **GitHub**: Settings → Secrets and variables → Actions
   - Secrets: `DATABASE_URL`, `GEMINI_API_KEY`
   - Variables: `SCREENER_MODEL`, `ANALYZER_MODEL` (선택: `COLLECT_SITES`, `MAX_JOBS_PER_SITE`)
   - Billing에서 지출 한도 $0 확인
6. **Vercel 환경변수**: `DATABASE_URL`, `GEMINI_API_KEY`, `SCREENER_MODEL`, `ANALYZER_MODEL`, `NOTION_TOKEN`, `NOTION_ROOT_PAGE_ID`, `AUTH_PASSWORD_HASH_B64`, `AUTH_SECRET`, `GH_DISPATCH_TOKEN`, `GH_REPO`
   - `GH_DISPATCH_TOKEN`: Fine-grained PAT, 이 레포만, **Actions: Read and write**
7. Google AI Studio에서 월 지출 한도 설정 권장

## 명령어

```bash
npm run dev                  # 대시보드 로컬 실행
npm run pipeline             # 수집+분석 전체 (로컬)
npm run collect -- jobkorea  # 특정 사이트만 로컬 수집 → DB (Actions에서 막힐 때)
npm run profile:refresh      # Notion 동기화 + 프로필 갱신 (--force: 전체 다시 받기)
```

잡코리아가 Actions에서 막히면: GitHub Variables에 `COLLECT_SITES=wanted,saramin`을 넣고, 분석 전에 로컬에서 `npm run collect -- jobkorea`를 실행하면 됩니다. 분석기는 최근 `RAW_JOB_WINDOW_DAYS`(기본 7일) 안에 수집된 공고를 어디서 수집했든 함께 봅니다.
