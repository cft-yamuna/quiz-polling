import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { buildPollUrl } from '../lib/app-url';
import { fetchQuestionResults } from '../lib/question-results';
import { PieChart } from './PieChart';

interface Poll {
  id: string;
  title: string;
  active_question_index: number;
  is_active: boolean;
  is_display_started: boolean;
}

interface Question {
  id: string;
  question_text: string;
  options: string[];
  order_index: number;
}

interface AnswerStats {
  [option: string]: number;
}

function areAnswerStatsEqual(a: AnswerStats, b: AnswerStats) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => a[key] === b[key]);
}

export function MainScreen() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answerStats, setAnswerStats] = useState<AnswerStats>({});
  const [isLoadingPoll, setIsLoadingPoll] = useState(true);
  const answerLoadRequestRef = useRef(0);
  const activeQuestionIdRef = useRef<string | undefined>(undefined);
  const answerQueueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedAnswerIncrementsRef = useRef<AnswerStats>({});

  const userUrl = buildPollUrl('user');
  const showLiveLayout = Boolean(poll?.is_display_started);
  const backgroundImage = showLiveLayout ? '/bg2.png' : '/bg.png';

  useEffect(() => {
    void loadLatestPoll();
  }, []);

  useEffect(() => {
    if (poll) {
      void loadCurrentQuestion();
      return;
    }

    setCurrentQuestion(null);
    setAnswerStats({});
    activeQuestionIdRef.current = undefined;
  }, [poll?.id, poll?.active_question_index]);

  useEffect(() => {
    const cleanup = subscribeToUpdates(poll?.id, currentQuestion?.id);
    return cleanup;
  }, [poll?.id, currentQuestion?.id]);

  useEffect(() => {
    return () => {
      if (answerQueueTimerRef.current) {
        clearTimeout(answerQueueTimerRef.current);
        answerQueueTimerRef.current = null;
      }
    };
  }, []);

  const loadLatestPoll = async () => {
    const { data } = await supabase
      .from('polls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setPoll(data as Poll);
    } else {
      setPoll(null);
      setCurrentQuestion(null);
      setAnswerStats({});
      activeQuestionIdRef.current = undefined;
      queuedAnswerIncrementsRef.current = {};
    }

    setIsLoadingPoll(false);
  };

  const loadAnswerStats = useCallback(async (questionId: string) => {
    const requestId = ++answerLoadRequestRef.current;
    const results = await fetchQuestionResults(questionId);

    if (requestId !== answerLoadRequestRef.current) {
      return;
    }

    if (activeQuestionIdRef.current !== questionId) {
      return;
    }

    setAnswerStats((previous) => (
      areAnswerStatsEqual(previous, results.counts) ? previous : results.counts
    ));
  }, []);

  const flushQueuedAnswerUpdates = useCallback(() => {
    const queued = queuedAnswerIncrementsRef.current;
    queuedAnswerIncrementsRef.current = {};

    if (Object.keys(queued).length === 0) {
      return;
    }

    setAnswerStats((previous) => {
      const next: AnswerStats = { ...previous };

      for (const [option, increment] of Object.entries(queued)) {
        next[option] = (next[option] || 0) + increment;
      }

      return areAnswerStatsEqual(previous, next) ? previous : next;
    });
  }, []);

  const enqueueAnswerUpdate = useCallback((answer: string) => {
    queuedAnswerIncrementsRef.current[answer] = (queuedAnswerIncrementsRef.current[answer] || 0) + 1;

    if (answerQueueTimerRef.current) {
      return;
    }

    answerQueueTimerRef.current = setTimeout(() => {
      answerQueueTimerRef.current = null;
      flushQueuedAnswerUpdates();
    }, 180);
  }, [flushQueuedAnswerUpdates]);

  const loadCurrentQuestion = async () => {
    if (!poll) return;

    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('poll_id', poll.id)
      .order('order_index');

    if (questions && questions[poll.active_question_index]) {
      const question = questions[poll.active_question_index] as Question;
      const hasQuestionChanged = activeQuestionIdRef.current !== question.id;

      if (hasQuestionChanged) {
        if (answerQueueTimerRef.current) {
          clearTimeout(answerQueueTimerRef.current);
          answerQueueTimerRef.current = null;
        }
        queuedAnswerIncrementsRef.current = {};
        setAnswerStats({});
      }

      setCurrentQuestion(question);
      activeQuestionIdRef.current = question.id;
      await loadAnswerStats(question.id);
      return;
    }

    setCurrentQuestion(null);
    activeQuestionIdRef.current = undefined;
    queuedAnswerIncrementsRef.current = {};
    setAnswerStats({});
  };

  const subscribeToUpdates = useCallback((pollId?: string, currentQuestionId?: string) => {
    const latestPollChannel = supabase
      .channel('latest-poll-main')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'polls'
      }, () => {
        void loadLatestPoll();
      })
      .subscribe();

    const pollChannel = pollId
      ? supabase
          .channel(`poll-updates-${pollId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'polls',
            filter: `id=eq.${pollId}`
          }, (payload) => {
            setPoll(payload.new as Poll);
          })
          .subscribe()
      : null;

    const answerChannel = currentQuestionId
      ? supabase
          .channel(`answer-updates-${currentQuestionId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'answers',
            filter: `question_id=eq.${currentQuestionId}`
          }, (payload) => {
            const insertedAnswer = (payload.new as { answer?: unknown } | null)?.answer;

            if (typeof insertedAnswer !== 'string' || insertedAnswer.length === 0) {
              return;
            }

            if (activeQuestionIdRef.current !== currentQuestionId) {
              return;
            }

            enqueueAnswerUpdate(insertedAnswer);
          })
          .subscribe()
      : null;

    return () => {
      if (answerQueueTimerRef.current) {
        clearTimeout(answerQueueTimerRef.current);
        answerQueueTimerRef.current = null;
      }
      queuedAnswerIncrementsRef.current = {};
      void latestPollChannel.unsubscribe();
      if (pollChannel) {
        void pollChannel.unsubscribe();
      }
      if (answerChannel) {
        void answerChannel.unsubscribe();
      }
    };
  }, [enqueueAnswerUpdate]);

  if (isLoadingPoll) {
    return <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-2xl text-gray-600">Loading...</p>
    </div>;
  }

  if (!poll) {
    return <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-2xl text-gray-600">No poll found. Create one at /create.</p>
    </div>;
  }

  const optionBadges = currentQuestion?.options.map((option, index) => ({
    key: option,
    label: String.fromCharCode(97 + index),
    text: option
  })) ?? [];
  const liveQrSize = 'clamp(90px, 6vw, 180px)';
  const livePanelPadding = 'clamp(0.5rem, 1vw, 1.1rem)';
  const liveQuestionFontSize = 'clamp(18px, 1.95vw, 40px)';
  const liveQuestionPanelMaxWidth = 'calc(min(100%, 50vw) - 40px)';
  const liveQuestionTextRightPadding = 'clamp(0.6rem, 1.8vw, 2.1rem)';
  const liveOptionCardWidth = 'clamp(140px, 64%, 340px)';
  const liveOptionCardHeight = 'clamp(52px, 3.8vw, 84px)';
  const liveOptionBadgeSize = 'clamp(52px, 3.8vw, 84px)';
  const liveOptionBadgeOffset = 'clamp(24px, 1.85vw, 44px)';
  const liveOptionBadgeFontSize = 'clamp(22px, 1.6vw, 38px)';
  const liveOptionTextFontSize = 'clamp(14px, 1.05vw, 24px)';
  const liveOptionPaddingLeft = 'clamp(40px, 2.4vw, 64px)';
  const liveOptionGridWidth = 'clamp(640px, 42vw, 1220px)';
  const liveQuestionToOptionsGap = 'clamp(0.8rem, 1.2vw, 1.9rem)';
  const liveOptionGridColumnGap = 'clamp(0.7rem, 1.3vw, 1.8rem)';
  const liveOptionGridRowGap = 'clamp(0.7rem, 1.3vw, 1.8rem)';

  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      <div className="relative w-full overflow-hidden bg-white aspect-[6912/1536]">
        <img
          src={backgroundImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {showLiveLayout && (
          <img
            src="/logo.png"
            alt="Logo"
            className="absolute left-0 top-0 z-20 object-contain"
            style={{ width: '107px', height: '110px', padding: '16px' }}
          />
        )}

        <div className="relative z-10 h-full w-full px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
            {!showLiveLayout ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-10 lg:flex-row lg:items-center lg:justify-start lg:pl-[10%]">
              <div
                className="ui-panel rounded-none p-4 ml-20"
                style={{
                  width: 'min(300px, 18vw)',
                  height: 'min(300px, 18vw)',
                }}
              >
                <QRCodeSVG
                  value={userUrl}
                  size={1003.56}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

            </div>
            ) : (
            <div className="mx-auto grid h-full w-full grid-cols-12 xl:grid-cols-[minmax(220px,0.75fr)_minmax(0,2.2fr)_minmax(280px,1.05fr)] xl:items-center">
              <div
                className="xl:justify-self-start xl:self-start"
                style={{ paddingTop: 'clamp(2.4rem, 6vw, 6.5rem)', paddingLeft: 'clamp(0.4rem, 1vw, 1.4rem)' }}
              >
                <div className="flex flex-col items-center gap-3 xl:items-start">
                  <p
                    className="text-center font-semibold tracking-[-0.03em] xl:text-left"
                    style={{ fontSize: 'clamp(18px, 1.5vw, 36px)', color: '#FFFFFF', lineHeight: 1.1 }}
                  >
                    <span className="block">
                      Scan the <span style={{ color: '#FF5150' }}>QR code</span>.
                    </span>
                    <span className="block">Enter the poll.</span>
                  </p>
                  <div className="ui-panel rounded-none" style={{ padding: 'clamp(0.3rem, 0.6vw, 0.9rem)' }}>
                    <QRCodeSVG
                      value={userUrl}
                      size={1200}
                      style={{ width: liveQrSize, height: liveQrSize }}
                    />
                  </div>
                </div>
              </div>

              <div className="xl:justify-self-start xl:w-full xl:-translate-x-8">
                {currentQuestion && showLiveLayout ? (
                  <div
                    className="mx-auto w-full"
                    style={{ maxWidth: liveQuestionPanelMaxWidth, padding: livePanelPadding }}
                  >
                    <div className="pb-2">
                      <h1
                        className="text-center font-semibold tracking-[-0.04em] leading-[1.14] text-white"
                        style={{
                          fontSize: liveQuestionFontSize,
                          paddingRight: liveQuestionTextRightPadding,
                        }}
                      >
                        {`Q${poll.active_question_index + 1}. ${currentQuestion.question_text}`}
                      </h1>
                    </div>

                    <div
                      className="mx-auto grid w-full grid-cols-2"
                      style={{
                        maxWidth: liveOptionGridWidth,
                        marginTop: liveQuestionToOptionsGap,
                        columnGap: liveOptionGridColumnGap,
                        rowGap: liveOptionGridRowGap,
                      }}
                    >
                      {optionBadges.map((option, index) => {
                        const optionAlignmentClass = optionBadges.length === 3 && index === 2
                          ? 'col-span-2 justify-self-center'
                          : index % 2 === 0
                            ? 'justify-self-end'
                            : 'justify-self-start';

                        return (
                        <div
                          key={`${option.key}-${index}`}
                          className={`ui-card relative flex items-center overflow-visible rounded-none px-3 py-0 ${optionAlignmentClass}`}
                          style={{
                            marginLeft: liveOptionBadgeOffset,
                            width: liveOptionCardWidth,
                            height: liveOptionCardHeight,
                            paddingLeft: liveOptionPaddingLeft,
                          }}
                        >
                          <div
                            className="absolute left-0 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5150] font-black leading-none text-white"
                            style={{
                              width: liveOptionBadgeSize,
                              height: liveOptionBadgeSize,
                              fontSize: liveOptionBadgeFontSize,
                            }}
                          >
                            {option.label}
                          </div>
                          <p
                            className="font-semibold tracking-[-0.03em] text-slate-950 overflow-hidden"
                            style={{
                              fontSize: liveOptionTextFontSize,
                              lineHeight: 1.12,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {option.text}
                          </p>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="ui-panel px-6 py-8">
                    <p className="ui-title text-center text-3xl xl:text-left">
                      {showLiveLayout ? 'Waiting for the first question...' : 'Waiting for host to start the question screen...'}
                    </p>
                  </div>
                )}
              </div>

              <div
                className="justify-self-center xl:justify-self-end"
                style={{
                  padding: 'clamp(0.4rem, 0.9vw, 1.5rem)',
                  paddingTop: 'clamp(1.1rem, 2.1vw, 2.8rem)',
                }}
              >
                <PieChart
                  data={answerStats}
                  options={currentQuestion?.options ?? []}
                />
              </div>
            </div>
            )}
        </div>
      </div>
    </div>
  );
}
