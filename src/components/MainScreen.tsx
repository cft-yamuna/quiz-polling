import { useEffect, useState } from 'react';
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

export function MainScreen() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answerStats, setAnswerStats] = useState<AnswerStats>({});
  const [isLoadingPoll, setIsLoadingPoll] = useState(true);

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
  }, [poll?.id, poll?.active_question_index]);

  useEffect(() => {
    const cleanup = subscribeToUpdates(poll?.id, currentQuestion?.id);
    return cleanup;
  }, [poll?.id, currentQuestion?.id]);

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
    }

    setIsLoadingPoll(false);
  };

  const loadCurrentQuestion = async () => {
    if (!poll) return;

    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('poll_id', poll.id)
      .order('order_index');

    if (questions && questions[poll.active_question_index]) {
      const question = questions[poll.active_question_index] as Question;
      setCurrentQuestion(question);
      await loadAnswerStats(question.id);
      return;
    }

    setCurrentQuestion(null);
    setAnswerStats({});
  };

  const loadAnswerStats = async (questionId: string) => {
    const results = await fetchQuestionResults(questionId);
    setAnswerStats(results.counts);
  };

  const subscribeToUpdates = (pollId?: string, currentQuestionId?: string) => {
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
            event: '*',
            schema: 'public',
            table: 'answers',
            filter: `question_id=eq.${currentQuestionId}`
          }, () => {
            void loadAnswerStats(currentQuestionId);
          })
          .subscribe()
      : null;

    return () => {
      void latestPollChannel.unsubscribe();
      if (pollChannel) {
        void pollChannel.unsubscribe();
      }
      if (answerChannel) {
        void answerChannel.unsubscribe();
      }
    };
  };

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
  const liveQrSize = 'clamp(170px, 6.5vw, 420px)';
  const livePanelPadding = 'clamp(2rem, 2.2vw, 4rem)';
  const liveQuestionFontSize = '128px';
  const liveOptionCardWidth = '899px';
  const liveOptionCardHeight = '183.12px';
  const liveOptionBadgeSize = '183.12px';
  const liveOptionBadgeOffset = '91.56px';
  const liveOptionBadgeFontSize = '80px';
  const liveOptionTextFontSize = '80px';
  const liveOptionPaddingLeft = '145px';
  const liveOptionGridWidth = '2000px';

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        className="fixed inset-0 h-screen w-screen object-cover"
      />

      <div className="relative z-10 flex min-h-screen items-center px-8 py-10 sm:px-12 lg:px-16">
        {!showLiveLayout ? (
          <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-start lg:pl-[18%]">
            <div
              className="ui-panel p-4"
              style={{
                width: 'min(1103.56px, 42vw)',
                height: 'min(1103.56px, 42vw)',
              }}
            >
              <QRCodeSVG
                value={userUrl}
                size={1203.56}
                style={{ width: '100%', height: '100%' }}
              />
            </div>

          </div>
        ) : (
          <div className="mx-auto grid w-full grid-cols-12 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,2.15fr)_minmax(720px,1.38fr)] xl:items-center">
            <div
              className="xl:justify-self-start xl:self-start xl:-translate-x-6"
              style={{ paddingTop: 'clamp(19.5rem, 31.5vh, 31.5rem)', paddingLeft: 'clamp(1.2rem, 2.8vw, 5rem)' }}
            >
              <div className="flex flex-col items-center gap-8 xl:items-start">
                <p
                  className="text-center font-semibold tracking-[-0.03em] xl:text-left"
                  style={{ fontSize: 'clamp(2.5rem, 2.8vw, 4.1rem)', color: '#FFFFFF', lineHeight: 1.08 }}
                >
                  <span className="block">
                    Scan the <span style={{ color: '#FF5150' }}>QR code</span>.
                  </span>
                  <span className="block">Enter the poll.</span>
                </p>
                <div className="ui-panel" style={{ padding: 'clamp(1rem, 1vw, 1.6rem)' }}>
                  <QRCodeSVG
                    value={userUrl}
                    size={1200}
                    style={{ width: liveQrSize, height: liveQrSize }}
                  />
                </div>
              </div>
            </div>

            <div className="xl:justify-self-start xl:w-full xl:-translate-x-16">
              {currentQuestion && showLiveLayout ? (
                <div
                  className="mx-auto w-full"
                  style={{ maxWidth: 'min(100%, 50vw)', padding: livePanelPadding }}
                >
                  <div className="pb-6">
                    <h1
                      className="text-center font-semibold tracking-[-0.04em] leading-[1.92] text-white"
                      style={{ fontSize: liveQuestionFontSize }}
                    >
                      {`Q${poll.active_question_index + 1}. ${currentQuestion.question_text}`}
                    </h1>
                  </div>

                  <div
                    className="mx-auto mt-20 grid grid-cols-1 gap-y-[60px] sm:grid-cols-2"
                    style={{ maxWidth: liveOptionGridWidth, columnGap: 'clamp(8rem, 6vw, 12rem)' }}
                  >
                    {optionBadges.map((option, index) => (
                      <div
                        key={`${option.key}-${index}`}
                        className={`ui-card relative flex items-center overflow-visible pr-6 py-5 ${
                          optionBadges.length === 3 && index === 2 ? 'sm:col-span-2 sm:justify-self-center' : ''
                        }`}
                        style={{
                          marginLeft: liveOptionBadgeOffset,
                          width: liveOptionCardWidth,
                          minHeight: liveOptionCardHeight,
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
                          className="font-semibold tracking-[-0.03em] text-slate-950"
                          style={{ fontSize: liveOptionTextFontSize }}
                        >
                          {option.text}
                        </p>
                      </div>
                    ))}
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
              style={{ padding: 'clamp(2rem, 2vw, 3.5rem)' }}
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
  );
}
