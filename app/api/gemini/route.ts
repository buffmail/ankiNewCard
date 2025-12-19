import { NextRequest, NextResponse } from 'next/server';

// 테스트용 GET 핸들러
export async function GET() {
  return NextResponse.json({ message: 'API route is working' });
}

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json();

    if (!word || typeof word !== 'string') {
      return NextResponse.json(
        { error: '단어가 필요합니다.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API 키가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // Gemini API 호출 - 영어로만 응답
    const prompt = `Provide up to 3 most important definitions for the English word "${word}", with one example sentence for each definition. Everything should be in English only. JSON format:
{"word": "${word}", "meanings": [{"meaning": "definition 1", "example": "example sentence 1"}, {"meaning": "definition 2", "example": "example sentence 2"}]}`;

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
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', {
        status: response.status,
        statusText: response.statusText,
        url: apiUrl.replace(apiKey, 'HIDDEN_KEY'),
        errorData
      });
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

