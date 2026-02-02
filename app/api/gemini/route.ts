import { NextRequest, NextResponse } from 'next/server';

// Vercel에서 rate limit 방지를 위해 dynamic 설정
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 테스트용 GET 핸들러
export async function GET() {
  return NextResponse.json({ message: 'API route is working' });
}

export async function POST(request: NextRequest) {
  try {
    const { word, apiKey } = await request.json();

    if (!word || typeof word !== 'string') {
      return NextResponse.json(
        { error: '단어가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'Gemini API 키가 필요합니다.' },
        { status: 400 }
      );
    }

    // Gemini API 호출 - 영어로만 응답, Anki 카드용 간결한 형식
    const prompt = `Provide most important definitions for the English word "${word}" (1 is preferred, but use up to 3 only if the word has multiple distinct meanings), with one concise example sentence for each definition. Also include the pronunciation in IPA format. Keep definitions and examples brief and suitable for Anki flashcards. Everything should be in English only. JSON format:
{"word": "${word}", "pronunciation": "/ɪɡˈzæmpəl/", "meanings": [{"meaning": "brief definition", "example": "concise example"}]}`;

    // Gemini 2.5 Flash-Lite API 엔드포인트 (더 빠른 모델)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }),
      // Vercel에서 rate limit 문제를 방지하기 위한 설정
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', {
        status: response.status,
        statusText: response.statusText,
        url: apiUrl.replace(apiKey, 'HIDDEN_KEY'),
        errorData
      });
      
      // 429 에러인 경우 특별한 메시지 제공
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'API 호출 제한에 도달했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: `Gemini API 호출에 실패했습니다. (${response.status}: ${response.statusText})` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Gemini 응답에서 텍스트 추출
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // JSON 응답을 파싱 시도
    let result;
    try {
      // JSON 코드 블록이 있는 경우 제거
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // JSON 형식이 아니면 기본 구조로 반환
        result = {
          word: word,
          meanings: [{ meaning: responseText.split('\n')[0] || 'Definition not found.', example: '' }]
        };
      }
    } catch (parseError) {
      // 파싱 실패 시 원본 텍스트를 의미로 사용
      result = {
        word: word,
        meanings: [{ meaning: responseText || 'Definition not found.', example: '' }]
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

