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
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  
  // 로컬 스토리지에서 API 키 불러오기
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setApiKey(savedKey);
  }, []);
  
  // API 키 저장
  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setShowSettings(false);
    alert('API 키가 저장되었습니다.');
  };

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

    // API 키 확인
    if (!apiKey) {
      setWordResults(prev => new Map(prev).set(word, {
        word,
        meanings: [{ meaning: 'API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.', example: '' }]
      }));
      return;
    }

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ word, apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'API 호출 실패' }));
        throw new Error(errorData.error || 'API 호출 실패');
      }
      const result: WordResult = await response.json();

      const finalResult: WordResult = {
        word,
        meanings: result.meanings.map(meaning => ({
          meaning: meaning.meaning,
          example: ` - ${meaning.example}`
        }))
      }

      // 결과 저장
      setWordResults(prev => new Map(prev).set(word, finalResult));
    } catch (error) {
      console.error('Error fetching word meaning:', error);
      // 에러 메시지 추출
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch definition.';
      // 에러 발생 시에도 결과 저장 (에러 메시지 표시용)
      setWordResults(prev => new Map(prev).set(word, {
        word,
        meanings: [{ meaning: errorMessage, example: '' }]
      }));
    } finally {
      // 로딩 상태 제거
      setLoadingWords(prev => {
        const next = new Set(prev);
        next.delete(word);
        return next;
      });
    }
  }, [loadingWords, wordResults, apiKey]);

  // Back 필드 포맷팅 함수 (뜻과 예문)
  const formatBackContent = (result: WordResult): string => {
    const backParts: string[] = [];
    
    if (result.meanings && result.meanings.length > 0) {
      result.meanings.forEach((item, idx) => {
        backParts.push(item.meaning);
        if (item.example) {
          backParts.push(`<span style="font-size: small;"><i>${item.example}</i></span>`);
        }
        // 마지막이 아니면 빈 줄 추가
        if (idx < result.meanings.length - 1) {
          backParts.push('');
        }
      });
    }
    
    return backParts.join('<br>');
  };

  // Back 내용을 클립보드에 복사
  const copyBackToClipboard = async (result: WordResult) => {
    try {
      const backText = formatBackContent(result);
      await navigator.clipboard.writeText(backText);
      // 성공 피드백 (선택사항)
    } catch (error) {
      console.error('Clipboard copy failed:', error);
    }
  };

  // Long press 핸들러 생성
  const createLongPressHandler = (result: WordResult) => {
    let pressTimer: NodeJS.Timeout | null = null;
    
    const handleTouchStart = (e: React.TouchEvent) => {
      pressTimer = setTimeout(() => {
        copyBackToClipboard(result);
        // 햅틱 피드백 (선택사항)
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        pressTimer = null;
      }, 500); // 500ms 이상 누르면 long press로 간주
    };
    
    const handleTouchEnd = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    
    const handleTouchMove = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    
    return {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchMove: handleTouchMove,
    };
  };

  // Share 기능 - AnkiDroid로 공유
  const shareToAnkiDroid = async (word: string, result: WordResult) => {
    const back = formatBackContent(result);
    
    
    // Web Share API 사용
    if (navigator.share) {
      try {
        await navigator.share({
          text: back,
          title: word,
        });
      } catch (error) {
        // 사용자가 공유를 취소한 경우는 에러로 처리하지 않음
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
          // 공유 실패시 클립보드로 폴백
          try {
            await navigator.clipboard.writeText(`${word}\t${back}`);
            alert('공유 실패. 클립보드에 복사되었습니다.\nAnkiDroid 앱에서 붙여넣으세요.');
          } catch (clipError) {
            console.error('Clipboard fallback failed:', clipError);
          }
        }
      }
    } else {
      // Web Share API를 지원하지 않는 경우 클립보드에 복사
      try {
        await navigator.clipboard.writeText(`${word}\t${back}`);
      } catch (error) {
        console.error('Clipboard copy failed:', error);
      }
    }
  };

  // Intent URL 생성 - AnkiDroid로 Intent 전송
  const getIntentUrl = (word: string, result: WordResult): string => {
    const back = formatBackContent(result);
    
    // URL encoding
    const encodedSubject = encodeURIComponent(word);
    const encodedText = encodeURIComponent(back);
    
    // Intent scheme 구성
    const intent = `intent://#Intent;` +
                   `action=android.intent.action.SEND;` +
                   `type=text/plain;` +
                   `package=com.ichi2.anki;` +
                   `S.android.intent.extra.SUBJECT=${encodedSubject};` +
                   `S.android.intent.extra.TEXT=${encodedText};` +
                   `end`;
    
    return intent;
  };

  // 클립보드에서 텍스트 가져오기
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
    } catch (error) {
      console.error('Clipboard read failed:', error);
      alert('클립보드 읽기 권한이 필요합니다.');
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
  }, [extractedWords, fetchWordMeaning, loadingWords, wordResults, apiKey]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center py-8 px-4 sm:px-8 bg-white dark:bg-black">
        <div className="w-full max-w-2xl">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-center flex-1 text-black dark:text-zinc-50">
              ankiNewCard
          </h1>
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="설정"
            >
              ⚙️
            </button>
          </div>
          
          {/* 설정 모달 */}
          {showSettings && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4 text-black dark:text-zinc-50">설정</h2>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API 키를 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent 
                             bg-white dark:bg-gray-700 text-black dark:text-zinc-50"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <a 
                      href="https://aistudio.google.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      Google AI Studio
                    </a>
                    에서 API 키를 발급받을 수 있습니다.
          </p>
        </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md 
                             text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveApiKey}
                    className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 입력 영역 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label 
                htmlFor="word-input" 
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                텍스트 붙여넣기
              </label>
              <button
                onClick={pasteFromClipboard}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                         text-gray-700 dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-600
                         transition-colors"
                title="클립보드에서 붙여넣기"
              >
                📋 클립보드
              </button>
            </div>
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
                          <div className="w-full mt-2 ml-0 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 relative">
                            {result.meanings && result.meanings.length > 0 && (
                              <>
                                {/* 클립보드 복사 버튼 (우상단 바깥쪽) */}
                                <button
                                  onClick={() => copyBackToClipboard(result)}
                                  className="absolute -top-10 -right-2 w-8 h-8 flex items-center justify-center 
                                           bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                                           rounded border border-gray-300 dark:border-gray-600 
                                           transition-colors active:scale-95 shadow-sm"
                                  title="클립보드에 복사"
                                  aria-label="클립보드에 복사"
                                >
                                  <span className="text-base">📋</span>
                                </button>
                                <div 
                                  className="space-y-3"
                                  {...createLongPressHandler(result)}
                                >
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
                                  onClick={() => shareToAnkiDroid(word, result)}
                                  className="w-full mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 
                                           text-white rounded-md text-sm font-medium transition-colors"
                                >
                                  Share
                                </button>
                                <a
                                  href={getIntentUrl(word, result)}
                                  className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 
                                           text-white rounded-md text-sm font-medium 
                                           transition-colors mt-2 inline-block text-center"
                                >
                                  Send to Anki
                                </a>
                                </div>
                              </>
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
