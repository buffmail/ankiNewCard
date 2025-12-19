# 영어 단어 학습 앱 스펙 문서

## 1. 프로젝트 개요

### 1.1 목적
모바일 웹 환경에서 영어 단어를 학습하기 위한 애플리케이션. 사용자가 영어 단어를 입력하면 ChatGPT API를 통해 단어의 뜻과 예문을 자동으로 생성하고, Anki 앱에 카드로 자동 등록하는 기능을 제공합니다.

### 1.2 타겟 사용자
- 영어 학습을 원하는 사용자
- Anki를 사용하여 단어를 암기하는 사용자
- 모바일 기기에서 빠르게 단어 카드를 만들고 싶은 사용자

## 2. 주요 기능 명세

### 2.1 단어 입력 및 조회 기능
- **입력**: 사용자가 영어 단어를 텍스트 입력 필드에 입력
- **검증**: 영어 단어인지 확인 (알파벳만 허용, 공백 제거)
- **제출**: 검색/생성 버튼 클릭 시 ChatGPT API 호출

### 2.2 ChatGPT API 연동
- **API**: OpenAI ChatGPT API (또는 다른 호환 API)
- **요청 내용**:
  ```
  "다음 영어 단어의 간단한 뜻과 예문 3개를 한국어로 제공해주세요: [단어]"
  ```
- **응답 형식**: JSON 또는 구조화된 텍스트
  - 단어 (word)
  - 뜻 (meaning): 간단한 한국어 설명
  - 예문 (examples): 최소 3개의 예문 (영어 + 한국어 번역)

### 2.3 결과 표시
- 입력한 단어 표시
- 생성된 뜻 표시
- 생성된 예문 목록 표시 (3개 이상)
- 로딩 상태 표시 (API 호출 중)

### 2.4 Anki 연동
- **방법**: AnkiConnect API 사용
  - AnkiConnect는 Anki와 웹 애플리케이션 간의 브리지 역할을 하는 플러그인
  - HTTP API를 통해 Anki에 카드 추가 가능
- **요청 형식**:
  ```json
  {
    "action": "addNote",
    "version": 6,
    "params": {
      "note": {
        "deckName": "영어 단어",
        "modelName": "Basic",
        "fields": {
          "Front": "[단어]",
          "Back": "[뜻]\n\n[예문1]\n[예문2]\n[예문3]"
        },
        "tags": ["english", "vocabulary"]
      }
    }
  }
  ```
- **전제 조건**: 
  - Anki 데스크톱 앱이 실행 중이어야 함
  - AnkiConnect 플러그인이 설치되어 있어야 함
  - 브라우저와 Anki가 같은 로컬 환경에 있어야 함 (localhost:8765)

### 2.5 Add 버튼
- ChatGPT로 생성된 결과를 확인한 후 "Add to Anki" 버튼 클릭
- AnkiConnect API 호출하여 카드 생성
- 성공/실패 피드백 표시

## 3. 기술 스택

### 3.1 프론트엔드
- **Framework**: Next.js 16.1.0 (App Router)
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript

### 3.2 API 연동
- **ChatGPT API**: OpenAI API (또는 Azure OpenAI, Anthropic 등)
- **Anki 연동**: AnkiConnect HTTP API (localhost:8765)

### 3.3 추가 필요 패키지
- `openai` 또는 `@anthropic-ai/sdk`: ChatGPT API 클라이언트
- `axios` 또는 `fetch`: HTTP 요청 처리
- 환경 변수 관리: `.env.local` 파일 사용

## 4. UI/UX 요구사항

### 4.1 모바일 최적화
- 반응형 디자인 (모바일 우선)
- 터치 친화적인 버튼 크기 (최소 44px x 44px)
- 입력 필드 및 버튼이 손가락으로 쉽게 조작 가능하도록 배치

### 4.2 레이아웃 구조
```
┌─────────────────────────┐
│   [영어 단어 입력]        │
│   [검색 버튼]            │
├─────────────────────────┤
│   로딩 표시              │
├─────────────────────────┤
│   단어: [단어]           │
│   뜻: [뜻]               │
│   예문:                  │
│   1. [예문1]             │
│   2. [예문2]             │
│   3. [예문3]             │
│   [Add to Anki 버튼]    │
└─────────────────────────┘
```

### 4.3 상태 관리
- 입력 단어 상태
- 로딩 상태
- ChatGPT 응답 상태
- Anki 추가 성공/실패 상태

### 4.4 에러 처리
- 네트워크 오류 처리
- ChatGPT API 오류 처리 (쿼터 초과, API 키 오류 등)
- AnkiConnect 연결 오류 처리 (Anki가 실행되지 않음 등)
- 사용자 친화적인 에러 메시지 표시

## 5. 데이터 흐름

### 5.1 단어 조회 플로우
```
사용자 입력 → 단어 검증 → ChatGPT API 호출 → 응답 파싱 → 화면 표시
```

### 5.2 Anki 추가 플로우
```
[Add to Anki] 클릭 → AnkiConnect API 호출 → 성공/실패 피드백
```

## 6. 구현 단계

### 6.1 Phase 1: 기본 UI 구성
- [ ] 입력 필드 및 검색 버튼 UI 구현
- [ ] 결과 표시 영역 UI 구현
- [ ] 로딩 상태 UI 구현
- [ ] Add 버튼 UI 구현

### 6.2 Phase 2: ChatGPT API 연동
- [ ] OpenAI API 클라이언트 설정
- [ ] API 라우트 생성 (`/api/word` 또는 `/api/chatgpt`)
- [ ] 프롬프트 구성 (단어, 뜻, 예문 요청)
- [ ] 응답 파싱 및 상태 관리
- [ ] 에러 처리

### 6.3 Phase 3: Anki 연동
- [ ] AnkiConnect API 클라이언트 구현
- [ ] 카드 생성 로직 구현
- [ ] 에러 처리 (Anki 미실행, 연결 실패 등)
- [ ] 성공/실패 피드백 UI

### 6.4 Phase 4: 최적화 및 개선
- [ ] 모바일 반응형 최적화
- [ ] 로딩 상태 개선
- [ ] 입력 검증 강화
- [ ] 사용자 경험 개선

## 7. API 엔드포인트 설계

### 7.1 ChatGPT API 호출 (서버 사이드)
**경로**: `/api/word` 또는 `/api/chatgpt`
**메서드**: POST
**요청 본문**:
```json
{
  "word": "example"
}
```

**응답**:
```json
{
  "word": "example",
  "meaning": "예시, 사례",
  "examples": [
    {
      "english": "This is a good example.",
      "korean": "이것은 좋은 예시입니다."
    },
    {
      "english": "Can you give me an example?",
      "korean": "예시를 들어줄 수 있나요?"
    },
    {
      "english": "She set a good example for others.",
      "korean": "그녀는 다른 사람들에게 좋은 본보기를 보였습니다."
    }
  ]
}
```

### 7.2 AnkiConnect API 호출 (클라이언트 사이드)
**URL**: `http://localhost:8765`
**메서드**: POST
**요청 본문**:
```json
{
  "action": "addNote",
  "version": 6,
  "params": {
    "note": {
      "deckName": "영어 단어",
      "modelName": "Basic",
      "fields": {
        "Front": "example",
        "Back": "예시, 사례\n\n1. This is a good example.\n이것은 좋은 예시입니다.\n\n2. Can you give me an example?\n예시를 들어줄 수 있나요?\n\n3. She set a good example for others.\n그녀는 다른 사람들에게 좋은 본보기를 보였습니다."
      },
      "tags": ["english", "vocabulary"]
    }
  }
}
```

## 8. 환경 변수 설정

### 8.1 필요 환경 변수
```env
# .env.local
OPENAI_API_KEY=sk-...
# 또는
ANTHROPIC_API_KEY=sk-ant-...
```

## 9. 주의사항 및 제약사항

### 9.1 AnkiConnect 사용 시
- **로컬 환경 제한**: AnkiConnect는 localhost에서만 동작
- **CORS 이슈**: 브라우저에서 직접 호출 시 CORS 문제 발생 가능
  - 해결: Next.js API Route를 프록시로 사용하거나, CORS 설정 필요
  - 또는 서버 사이드에서 AnkiConnect 호출

### 9.2 ChatGPT API
- **비용**: API 사용량에 따라 비용 발생
- **속도**: 네트워크 상태에 따라 응답 시간 변동
- **제한**: API 키별 요청 제한 존재

### 9.3 보안
- API 키는 절대 클라이언트에 노출되지 않도록 서버 사이드에서만 사용
- Next.js API Routes를 통해 보안 유지

## 10. 참고 자료

### 10.1 AnkiConnect
- GitHub: https://github.com/FooSoft/anki-connect
- API 문서: https://github.com/FooSoft/anki-connect#api-documentation

### 10.2 OpenAI API
- 문서: https://platform.openai.com/docs/api-reference
- 가격: https://openai.com/api/pricing/

### 10.3 Next.js API Routes
- 문서: https://nextjs.org/docs/app/building-your-application/routing/route-handlers

## 11. 확장 가능성

### 11.1 향후 개선 사항
- 단어 히스토리 저장 (로컬 스토리지)
- 즐겨찾기 기능
- 데크 선택 기능
- 커스텀 프롬프트 설정
- 여러 단어 일괄 추가
- 오프라인 모드 지원 (IndexedDB 사용)

