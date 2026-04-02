import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { buildPollUrl } from '../lib/app-url';
import { PieChart } from './PieChart';

interface Poll {
  id: string;
  title: string;
  active_question_index: number;
  is_active: boolean;
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

const INTRO_DELAY_MS = 5000;

export function MainScreen({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answerStats, setAnswerStats] = useState<AnswerStats>({});
  const [participantCount, setParticipantCount] = useState(0);
  const [showLiveLayout, setShowLiveLayout] = useState(false);

  const userUrl = buildPollUrl('user', pollId);
  const backgroundImage = showLiveLayout ? '/bg2.png' : '/bg.png';

  useEffect(() => {
    void loadPollData();
    void loadParticipantCount();
  }, [pollId]);

  useEffect(() => {
    if (poll) {
      void loadCurrentQuestion();
    }
  }, [pollId, poll?.active_question_index]);

  useEffect(() => {
    const cleanup = subscribeToUpdates(currentQuestion?.id);
    return cleanup;
  }, [pollId, currentQuestion?.id]);

  useEffect(() => {
    if (participantCount === 0 || showLiveLayout) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowLiveLayout(true);
    }, INTRO_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [participantCount, showLiveLayout]);

  const loadPollData = async () => {
    const { data } = await supabase
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .maybeSingle();

    if (data) setPoll(data as Poll);
  };

  const loadParticipantCount = async () => {
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', pollId);

    setParticipantCount(count || 0);
  };

  const loadCurrentQuestion = async () => {
    if (!poll) return;

    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('poll_id', pollId)
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
    const { data: answers } = await supabase
      .from('answers')
      .select('answer')
      .eq('question_id', questionId);

    const stats: AnswerStats = {};
    (answers as Array<{ answer: string }> | null)?.forEach((answer) => {
      stats[answer.answer] = (stats[answer.answer] || 0) + 1;
    });

    setAnswerStats(stats);
  };

  const subscribeToUpdates = (currentQuestionId?: string) => {
    const pollChannel = supabase
      .channel(`poll-updates-${pollId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'polls',
        filter: `id=eq.${pollId}`
      }, (payload) => {
        setPoll(payload.new as Poll);
      })
      .subscribe();

    const participantChannel = supabase
      .channel(`participant-updates-${pollId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'participants',
        filter: `poll_id=eq.${pollId}`
      }, () => {
        void loadParticipantCount();
      })
      .subscribe();

    const answerChannel = currentQuestionId
      ? supabase
          .channel(`answer-updates-${pollId}-${currentQuestionId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'answers',
            filter: `question_id=eq.${currentQuestionId}`
          }, () => {
            void loadAnswerStats(currentQuestionId);
          })
          .subscribe()
      : null;

    return () => {
      void pollChannel.unsubscribe();
      void participantChannel.unsubscribe();
      if (answerChannel) {
        void answerChannel.unsubscribe();
      }
    };
  };

  if (!poll) {
    return <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-2xl text-gray-600">Loading...</p>
    </div>;
  }

  const optionBadges = currentQuestion?.options.map((option, index) => ({
    key: option,
    label: String.fromCharCode(65 + index),
    text: option
  })) ?? [];
  const liveQrSize = 'clamp(150px, 5.8vw, 380px)';
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
        className="absolute inset-0 h-full w-full object-cover"
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
              className="xl:justify-self-start xl:self-start"
              style={{ paddingTop: 'clamp(19.5rem, 31.5vh, 31.5rem)', paddingLeft: 'clamp(1.2rem, 2.8vw, 5rem)' }}
            >
              <div className="flex flex-col items-center gap-8 xl:items-start">
                <p
                  className="text-center font-semibold tracking-[-0.03em] xl:text-left"
                  style={{ fontSize: 'clamp(2rem, 2.2vw, 3.3rem)', color: '#FFFFFF', lineHeight: 1.08 }}
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

            <div className="xl:justify-self-center xl:w-full">
              {currentQuestion ? (
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
                    className="mx-auto mt-20 grid grid-cols-1 gap-y-[100px] sm:grid-cols-2"
                    style={{ maxWidth: liveOptionGridWidth, columnGap: 'clamp(8rem, 6vw, 12rem)' }}
                  >
                    {optionBadges.map((option, index) => (
                      <div
                        key={`${option.key}-${index}`}
                        className="ui-card relative flex items-center overflow-visible pr-6 py-5"
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
                    Waiting for the first question...
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
