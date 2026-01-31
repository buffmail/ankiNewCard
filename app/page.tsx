"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BUILD_TIME } from "./build-time";

interface WordResult {
  word: string;
  meanings: Array<{ meaning: string; example: string }>;
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [extractedWord, setExtractedWord] = useState<string | null>(null);
  const [displayedWord, setDisplayedWord] = useState<string | null>(null);
  const [loadingWords, setLoadingWords] = useState<Set<string>>(new Set());
  const [wordResults, setWordResults] = useState<Map<string, WordResult>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [clickedAnkiWord, setClickedAnkiWord] = useState<string | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const ankiButtonRef = useRef<HTMLAnchorElement | null>(null);
  const autoTriggeredWords = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setApiKey(savedKey);
    
    // Detect mobile on client side only
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    setIsMobileDevice(/mobile/i.test(userAgent) || /android/i.test(userAgent) || /iphone|ipad|ipod/i.test(userAgent));
  }, []);
  
  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setShowSettings(false);
    alert('API 키가 저장되었습니다.');
  };

  const extractWord = (text: string): string | null => {
    const firstLine = text.split('\n')[0].trim();
    if (!firstLine) return null;
    
    const wordRegex = /\b[a-zA-Z]+\b/g;
    const words = firstLine.match(wordRegex) || [];
    if (words.length === 0 || !words[0]) return null;
    
    const firstWord = words[0].toLowerCase();
    if (firstWord === 'learn') return null;
    if (firstWord.startsWith('learn')) {
      const withoutLearn = firstWord.replace(/^learn/, '');
      return withoutLearn || null;
    }
    return firstWord;
  };

  useEffect(() => {
    if (inputText.trim()) {
      const word = extractWord(inputText);
      setExtractedWord(word);
    } else {
      setExtractedWord(null);
      setDisplayedWord(null);
      setClickedAnkiWord(null);
    }
  }, [inputText]);

  // Update displayedWord when a result becomes available for extractedWord
  useEffect(() => {
    if (extractedWord && wordResults.has(extractedWord)) {
      setDisplayedWord(extractedWord);
    }
  }, [extractedWord, wordResults]);

  // Reset Anki button state when extracted word changes
  useEffect(() => {
    setClickedAnkiWord(null);
    autoTriggeredWords.current.clear();
  }, [extractedWord]);

  const fetchWordMeaning = useCallback(async (word: string) => {
    if (loadingWords.has(word) || wordResults.has(word)) {
      return;
    }

    setLoadingWords(prev => new Set(prev).add(word));

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

      setWordResults(prev => new Map(prev).set(word, finalResult));
    } catch (error) {
      console.error('Error fetching word meaning:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch definition.';
      // Store error message in results for display
      setWordResults(prev => new Map(prev).set(word, {
        word,
        meanings: [{ meaning: errorMessage, example: '' }]
      }));
    } finally {
      setLoadingWords(prev => {
        const next = new Set(prev);
        next.delete(word);
        return next;
      });
    }
  }, [loadingWords, wordResults, apiKey]);

  const formatBackContent = (result: WordResult): string => {
    const backParts: string[] = [];
    
    if (result.meanings && result.meanings.length > 0) {
      result.meanings.forEach((item, idx) => {
        backParts.push(item.meaning);
        if (item.example) {
          backParts.push(`<span style="font-size: small;"><i>${item.example}</i></span>`);
        }
        if (idx < result.meanings.length - 1) {
          backParts.push('');
        }
      });
    }
    
    return backParts.join('<br>');
  };

  const copyBackToClipboard = async (result: WordResult) => {
    try {
      const backText = formatBackContent(result);
      await navigator.clipboard.writeText(backText);
    } catch (error) {
      console.error('Clipboard copy failed:', error);
    }
  };

  const createLongPressHandler = (result: WordResult) => {
    let pressTimer: NodeJS.Timeout | null = null;
    
    const handleTouchStart = (e: React.TouchEvent) => {
      pressTimer = setTimeout(() => {
        copyBackToClipboard(result);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        pressTimer = null;
      }, 500);
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

  const isAndroidMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android/i.test(userAgent) && /mobile/i.test(userAgent);
  };

  const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /mobile/i.test(userAgent) || /android/i.test(userAgent) || /iphone|ipad|ipod/i.test(userAgent);
  };

  const getIntentUrl = (word: string, result: WordResult): string => {
    const back = formatBackContent(result);
    const encodedSubject = encodeURIComponent(word);
    const encodedText = encodeURIComponent(back);
    
    const intent = `intent:#Intent;` +
                    `action=android.intent.action.SEND;` +
                    `type=text/plain;` +
                    `package=com.ichi2.anki;` +
                    `component=com.ichi2.anki/.IntentHandler2;` + 
                    `S.android.intent.extra.SUBJECT=${encodedSubject};` +
                    `S.android.intent.extra.TEXT=${encodedText};` +
                    `end;`;
    
    return intent;
  };

  const triggerAnkiIntent = (word: string, result: WordResult) => {
    const intentUrl = getIntentUrl(word, result);
    window.location.href = intentUrl;
    setClickedAnkiWord(word);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const firstLine = text.split('\n')[0].trim();
      const processedText = firstLine.replace(/^Learn/i, '').trim();
      setInputText(processedText);
    } catch (error) {
      console.error('Clipboard read failed:', error);
      alert('클립보드 읽기 권한이 필요합니다.');
    }
  };


  useEffect(() => {
    if (extractedWord) {
      if (!loadingWords.has(extractedWord) && !wordResults.has(extractedWord)) {
        const timer = setTimeout(() => {
          fetchWordMeaning(extractedWord);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [extractedWord, fetchWordMeaning, loadingWords, wordResults, apiKey]);

  // Auto-trigger Anki intent on Android mobile when result is available
  useEffect(() => {
    if (extractedWord && isAndroidMobile()) {
      const result = wordResults.get(extractedWord);
      if (result && result.meanings && result.meanings.length > 0 && !autoTriggeredWords.current.has(extractedWord)) {
        // Mark as triggered to prevent duplicate calls
        autoTriggeredWords.current.add(extractedWord);
        // Small delay to ensure UI is updated
        const timer = setTimeout(() => {
          triggerAnkiIntent(extractedWord, result);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [extractedWord, wordResults]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center py-8 px-4 sm:px-8 bg-white dark:bg-black">
        <div className="w-full max-w-2xl">
          {!isMobileDevice && (
            <div className="flex items-center justify-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-center text-black dark:text-zinc-50">
                ankiNewCard
              </h1>
            </div>
          )}
          
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

          <div className="mb-6">
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="word-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="텍스트를 붙여넣거나 입력하세요"
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent 
                         bg-white dark:bg-gray-800 text-black dark:text-zinc-50"
              />
              {!isMobileDevice && (
                <button
                  onClick={pasteFromClipboard}
                  className="w-10 h-10 flex items-center justify-center 
                           bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                           rounded-lg border border-gray-300 dark:border-gray-600
                           transition-colors active:scale-95"
                  title="클립보드에서 붙여넣기"
                  aria-label="클립보드에서 붙여넣기"
                >
                  <span className="text-base">📋</span>
                </button>
              )}
            </div>
          </div>
          
          {isMobileDevice && (
            <button
              onClick={pasteFromClipboard}
              className="fixed top-2 right-2 w-10 h-10 flex items-center justify-center 
                       bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                       rounded-lg border border-gray-300 dark:border-gray-600
                       transition-colors active:scale-95 z-50 shadow-lg"
              title="클립보드에서 붙여넣기"
              aria-label="클립보드에서 붙여넣기"
            >
              <span className="text-base">📋</span>
            </button>
          )}

          {(displayedWord || (extractedWord && loadingWords.has(extractedWord))) && (() => {
            const wordToDisplay = displayedWord || extractedWord;
            const result = wordToDisplay ? wordResults.get(wordToDisplay) : null;
            const isLoading = extractedWord && loadingWords.has(extractedWord) && extractedWord !== displayedWord;
            
            return (
              <div className="mb-6">
                {isLoading && (
                  <div className="text-center text-gray-500 dark:text-gray-400 text-sm mb-2">
                    로딩 중...
                  </div>
                )}
                {result && (
                  <div className="w-full p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 relative">
                    {result.meanings && result.meanings.length > 0 && (
                      <>
                        <button
                          onClick={() => copyBackToClipboard(result)}
                          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center 
                                   bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                                   rounded border border-gray-300 dark:border-gray-600 
                                   transition-colors active:scale-95"
                          title="클립보드에 복사"
                          aria-label="클립보드에 복사"
                        >
                          <span className="text-base">📋</span>
                        </button>
                        {isMobileDevice && (
                          <a
                            ref={ankiButtonRef}
                            href={getIntentUrl(wordToDisplay!, result)}
                            onClick={() => setClickedAnkiWord(wordToDisplay!)}
                            className={`absolute top-12 right-2 w-8 h-8 flex items-center justify-center 
                                      rounded border border-gray-300 dark:border-gray-600
                                      transition-colors active:scale-95 ${
                                        clickedAnkiWord === wordToDisplay
                                          ? 'bg-gray-300 dark:bg-gray-600 opacity-50 cursor-not-allowed'
                                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                            title="Send to Anki"
                            aria-label="Send to Anki"
                          >
                            <img 
                              src="/anki-icon.png" 
                              alt="Anki" 
                              className={`w-5 h-5 ${clickedAnkiWord === wordToDisplay ? 'opacity-50' : ''}`}
                            />
                          </a>
                        )}
                        <div 
                          className="space-y-3 pr-10"
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
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {!extractedWord && inputText.trim() === "" && (
            <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
              텍스트를 붙여넣으면 영어 단어가 자동으로 추출됩니다.
            </div>
          )}

          <div className="mt-8 flex items-center justify-center gap-2">
            <p className="text-xs text-gray-400 dark:text-gray-600">
              Build: {BUILD_TIME} KST
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="설정"
            >
              ⚙️
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
