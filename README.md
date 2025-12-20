This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 환경 변수 설정

1. 프로젝트 루트 디렉토리에 `.env.local` 파일을 생성합니다.
2. 다음 내용을 추가하고 발급받은 Gemini API 키를 입력하세요:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**Gemini API 키 발급 방법:**
- [Google AI Studio](https://aistudio.google.com/)에 접속하여 Google 계정으로 로그인
- "API 키 만들기" 버튼 클릭하여 새로운 API 키 생성
- 생성된 API 키를 `.env.local` 파일에 입력

### 개발 서버 실행

**로컬에서만 접속 (기본):**
```bash
yarn dev
```

**모바일 기기에서도 접속 (같은 WiFi 네트워크 필요):**
```bash
yarn dev:network
```

모바일 접속 시:
1. 컴퓨터의 로컬 IP 주소 확인:
   - macOS: 터미널에서 `ifconfig | grep "inet " | grep -v 127.0.0.1` 또는 `ipconfig getifaddr en0`
   - Windows: `ipconfig` 명령어로 IPv4 주소 확인
   - 예: `192.168.1.10`

2. 모바일 브라우저에서 접속:
   - `http://<컴퓨터의_IP_주소>:3000`
   - 예: `http://192.168.1.10:3000`

**참고**: 컴퓨터와 모바일이 같은 WiFi 네트워크에 연결되어 있어야 합니다.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

### Vercel 환경 변수 설정

**중요**: Vercel에 배포할 때는 환경 변수를 반드시 설정해야 합니다.

1. Vercel 대시보드에서 프로젝트를 선택합니다.
2. **Settings** → **Environment Variables**로 이동합니다.
3. 다음 환경 변수를 추가합니다:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: 발급받은 Gemini API 키
   - **Environment**: Production, Preview, Development 모두 선택
4. **Save** 버튼을 클릭합니다.
5. 새로운 배포를 트리거하거나 기존 배포를 다시 배포합니다.

**주의**: 환경 변수를 설정한 후에는 반드시 재배포해야 환경 변수가 적용됩니다.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
