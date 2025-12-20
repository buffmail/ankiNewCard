// 빌드 타임을 KST로 생성 (빌드 시점에 생성됨)
// 환경 변수가 있으면 사용하고, 없으면 현재 시간 사용 (dev 모드)
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

export const BUILD_TIME = buildTime;

