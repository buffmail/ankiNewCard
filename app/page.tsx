"use client";

import { useState, useEffect, useCallback } from "react";
import { BUILD_TIME } from "./build-time";

interface WordResult {
  word: string;
  meanings: Array<{ meaning: string; example: string }>;
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [extractedWords, setExtractedWords] = useState<string[]>([]);
  const [loadingWords, setLoadingWords] = useState<Set<string>>(new Set());
  const [wordResults, setWordResults] = useState<Map<string, WordResult>>(new Map());

  // 텍스트에서 영어 단어 추출
  const extractWords = (text: string): string[] => {
    // 첫 줄만 처리
    const firstLine = text.split('\n')[0].trim();
    
    if (!firstLine) return [];
    
    // 영어 단어만 추출 (알파벳으로만 구성된 단어)
    const wordRegex = /\b[a-zA-Z]+\b/g;
    const words = firstLine.match(wordRegex) || [];
    
    // "Learn" 접두사 제거 및 소문자로 통일
    const processedWords = words
      .map(word => {
        const lowerWord = word.toLowerCase();
        // "learn" 단어 자체는 제외
        if (lowerWord === 'learn') {
          return null;
        }
        // "learn"으로 시작하면 접두사 제거
        if (lowerWord.startsWith('learn')) {
          const withoutLearn = lowerWord.replace(/^learn/, '');
          return withoutLearn || null; // 제거 후 빈 문자열이면 null 반환
        }
        return lowerWord;
      })
      .filter((word): word is string => word !== null && word.length > 0); // null 및 빈 문자열 제거
    
    // 중복 제거 및 정렬
    const uniqueWords = Array.from(new Set(processedWords))
      .sort();
    
    return uniqueWords;
  };

  // inputText가 변경될 때마다 단어 추출
  useEffect(() => {
    if (inputText.trim()) {
      const words = extractWords(inputText);
      setExtractedWords(words);
    } else {
      setExtractedWords([]);
    }
  }, [inputText]);

  // Gemini API 호출 함수
  const fetchWordMeaning = useCallback(async (word: string) => {
    // 이미 로딩 중이거나 결과가 있으면 스킵
    if (loadingWords.has(word) || wordResults.has(word)) {
      return;
    }

    // 로딩 상태 추가
    setLoadingWords(prev => new Set(prev).add(word));

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ word }),
      });

      if (!response.ok) {
        throw new Error('API 호출 실패');
      }

      const result: WordResult = await response.json();
      
      // 결과 저장
      setWordResults(prev => new Map(prev).set(word, result));
    } catch (error) {
      console.error('Error fetching word meaning:', error);
      // 에러 발생 시에도 결과 저장 (에러 메시지 표시용)
      setWordResults(prev => new Map(prev).set(word, {
        word,
        meanings: [{ meaning: 'Failed to fetch definition.', example: '' }]
      }));
    } finally {
      // 로딩 상태 제거
      setLoadingWords(prev => {
        const next = new Set(prev);
        next.delete(word);
        return next;
      });
    }
  }, [loadingWords, wordResults]);

  // AnkiDroid Intent 호출 함수
  const addToAnkiDroid = (word: string, result: WordResult) => {
    // Android 기기 확인
    if (!/Android/i.test(navigator.userAgent)) {
      alert('이 기능은 Android 기기에서만 작동합니다.');
      return;
    }
    
    // Back 필드 포맷팅 (뜻과 예문)
    const backParts: string[] = [];
    
    if (result.meanings && result.meanings.length > 0) {
      result.meanings.forEach((item, idx) => {
        backParts.push(item.meaning);
        if (item.example) {
          backParts.push(item.example);
        }
        // 마지막이 아니면 빈 줄 추가
        if (idx < result.meanings.length - 1) {
          backParts.push('');
        }
      });
    }
    
    const back = backParts.join('\n');
    
    // AnkiDroid Intent URI 생성
    // Gemini가 제안한 형식: intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=앞면:...\n뒷면:...;package=com.ichi2.anki;end
    // 텍스트 형식: "앞면:Front\n뒷면:Back" (AnkiDroid가 인식하는 형식)
    const cardText = `앞면:${word}\n뒷면:${back}`;
    const encodedText = encodeURIComponent(cardText);
    
    // Intent URI 생성
    const intentUri = `intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=${encodedText};package=com.ichi2.anki;end`;
    
    // Intent 호출
    try {
      window.location.href = intentUri;
    } catch (error) {
      console.error('Failed to open AnkiDroid:', error);
      alert('AnkiDroid를 열 수 없습니다.');
    }
  };

  // 단어가 1개일 때 자동으로 뜻 가져오기 (입력이 끝난 후 500ms 후)
  useEffect(() => {
    if (extractedWords.length === 1) {
      const word = extractedWords[0];
      // 이미 로딩 중이거나 결과가 있으면 스킵
      if (!loadingWords.has(word) && !wordResults.has(word)) {
        // 500ms 후에 API 호출 (debounce)
        const timer = setTimeout(() => {
          fetchWordMeaning(word);
        }, 500);

        // cleanup 함수: 컴포넌트 언마운트나 extractedWords 변경 시 타이머 취소
        return () => clearTimeout(timer);
      }
    }
  }, [extractedWords, fetchWordMeaning, loadingWords, wordResults]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center py-8 px-4 sm:px-8 bg-white dark:bg-black">
        <div className="w-full max-w-2xl">
          {/* 헤더 */}
          <h1 className="text-2xl sm:text-3xl font-bold text-center mb-8 text-black dark:text-zinc-50">
            ankiNewCard
          </h1>

          {/* 입력 영역 */}
          <div className="mb-6">
            <label 
              htmlFor="word-input" 
              className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
            >
              텍스트 붙여넣기
            </label>
            <textarea
              id="word-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="텍스트를 붙여넣거나 입력하세요. 영어 단어가 자동으로 추출됩니다."
              className="w-full h-32 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent 
                       bg-white dark:bg-gray-800 text-black dark:text-zinc-50
                       resize-none"
            />
          </div>

          {/* 추출된 단어 표시 영역 */}
          {extractedWords.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                  추출된 단어 ({extractedWords.length}개)
                </h2>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col gap-3">
                  {extractedWords.map((word, index) => {
                    const isLoading = loadingWords.has(word);
                    const result = wordResults.get(word);
                    
                    return (
                      <div key={index} className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block px-3 py-1.5 bg-blue-100 dark:bg-blue-900 
                                       text-blue-800 dark:text-blue-200 rounded-md text-sm font-medium">
                          {word}
                        </span>
                        <button
                          onClick={() => fetchWordMeaning(word)}
                          disabled={isLoading}
                          className="px-4 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 
                                   text-white rounded-md text-sm font-medium transition-colors
                                   disabled:cursor-not-allowed min-h-[32px] min-w-[48px]"
                        >
                          {isLoading ? '...' : 'OK'}
                        </button>
                        {result && (
                          <div className="w-full mt-2 ml-0 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            {result.meanings && result.meanings.length > 0 && (
                              <div className="space-y-3">
                                {result.meanings.map((item, idx) => (
                                  <div key={idx}>
                                    <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                                      {item.meaning}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                                      {item.example}
                                    </p>
                                  </div>
                                ))}
                                <button
                                  onClick={() => addToAnkiDroid(word, result)}
                                  className="w-full mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 
                                           text-white rounded-md text-sm font-medium transition-colors"
                                >
                                  Add to Anki
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 안내 메시지 */}
          {extractedWords.length === 0 && inputText.trim() === "" && (
            <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
              텍스트를 붙여넣으면 영어 단어가 자동으로 추출됩니다.
            </div>
          )}

          {/* 빌드 시간 표시 */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-600">
              Build: {BUILD_TIME} KST
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
