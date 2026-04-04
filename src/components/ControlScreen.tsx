import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildPollUrl } from '../lib/app-url';
import { fetchQuestionResults } from '../lib/question-results';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

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

export function ControlScreen() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [isLoadingPoll, setIsLoadingPoll] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingDirection, setPendingDirection] = useState<'next' | 'previous' | null>(null);
  const [isQuestionTransitioning, setIsQuestionTransitioning] = useState(false);
  const navigationLockRef = useRef(false);

  useEffect(() => {
    void loadLatestPoll();
  }, []);

  useEffect(() => {
    if (!poll) {
      setQuestions([]);
      setParticipantCount(0);
      setAnswerCount(0);
      return;
    }

    void loadQuestions();
    void loadParticipantCount();
  }, [poll?.id]);

  useEffect(() => {
    if (poll && questions.length > 0) {
      void loadAnswerCount();
      return;
    }

    setAnswerCount(0);
  }, [poll?.id, poll?.active_question_index, questions]);

  useEffect(() => {
    const cleanup = subscribeToUpdates(poll?.id, getCurrentQuestionId());
    return cleanup;
  }, [poll?.id, poll?.active_question_index, questions]);

  useEffect(() => {
    if (!poll) return;

    setIsQuestionTransitioning(true);
    const timer = window.setTimeout(() => {
      setIsQuestionTransitioning(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [poll?.active_question_index, poll?.id]);

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
      setQuestions([]);
      setParticipantCount(0);
      setAnswerCount(0);
    }

    setIsLoadingPoll(false);
  };

  const loadQuestions = async () => {
    if (!poll) return;

    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('poll_id', poll.id)
      .order('order_index');

    if (data) setQuestions(data as Question[]);
  };

  const loadParticipantCount = async () => {
    if (!poll) return;

    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', poll.id);

    setParticipantCount(count || 0);
  };

  const getCurrentQuestionId = () => {
    return questions[poll?.active_question_index || 0]?.id;
  };

  const loadAnswerCount = async (questionId = getCurrentQuestionId()) => {
    if (!questionId) {
      setAnswerCount(0);
      return;
    }

    const results = await fetchQuestionResults(questionId);
    setAnswerCount(results.totalAnswers);
  };

  const subscribeToUpdates = (pollId?: string, currentQuestionId?: string) => {
    const latestPollChannel = supabase
      .channel('latest-poll-control')
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
          .channel(`control-poll-updates-${pollId}`)
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

    const participantChannel = pollId
      ? supabase
          .channel(`participant-count-${pollId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'participants',
            filter: `poll_id=eq.${pollId}`
          }, () => {
            void loadParticipantCount();
          })
          .subscribe()
      : null;

    const answerChannel = currentQuestionId
      ? supabase
          .channel(`answer-count-${currentQuestionId}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'answers',
            filter: `question_id=eq.${currentQuestionId}`
          }, () => {
            void loadAnswerCount(currentQuestionId);
          })
          .subscribe()
      : null;

    return () => {
      void latestPollChannel.unsubscribe();
      if (pollChannel) {
        void pollChannel.unsubscribe();
      }
      if (participantChannel) {
        void participantChannel.unsubscribe();
      }
      if (answerChannel) {
        void answerChannel.unsubscribe();
      }
    };
  };

  const navigateQuestion = async (direction: 'next' | 'previous') => {
    if (!poll || navigationLockRef.current) return;

    const currentIndex = poll.active_question_index;
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex > questions.length - 1) return;

    navigationLockRef.current = true;
    setIsNavigating(true);
    setPendingDirection(direction);
    setPoll(prev => prev ? { ...prev, active_question_index: nextIndex } : null);

    const { data, error } = await supabase
      .from('polls')
      .update({ active_question_index: nextIndex })
      .eq('id', poll.id)
      .eq('active_question_index', currentIndex)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      setPoll(prev => prev ? { ...prev, active_question_index: currentIndex } : null);
      void loadLatestPoll();
    }

    navigationLockRef.current = false;
    setIsNavigating(false);
    setPendingDirection(null);
  };

  const handleNext = async () => {
    await navigateQuestion('next');
  };

  const handleStartDisplay = async () => {
    if (!poll?.is_display_started) {
      await supabase
        .from('polls')
        .update({ is_display_started: true })
        .eq('id', poll.id);

      setPoll((prev) => prev ? { ...prev, is_display_started: true } : null);
    }
  };

  const handlePrevious = async () => {
    await navigateQuestion('previous');
  };

  if (isLoadingPoll) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-2xl text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-2xl text-gray-600">No poll found. Create one at /create.</p>
      </div>
    );
  }

  const currentQuestion = questions[poll.active_question_index];
  const mainUrl = buildPollUrl('main');
  const userUrl = buildPollUrl('user');

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="ui-panel p-4 sm:p-8 lg:p-10">
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="ui-title text-2xl leading-tight sm:text-4xl">{poll.title}</h1>
            <div className="ui-chip self-start px-4 py-2 sm:self-auto">
              <Users className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-purple-800">{participantCount} participants</span>
            </div>
          </div>

          <div className="ui-card mb-6 p-4 sm:mb-8 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="ui-chip px-4 py-2 text-sm font-medium">
                Question {poll.active_question_index + 1} of {questions.length}
              </span>
              <span className="text-sm text-gray-600">
                {answerCount} / {participantCount} answered
              </span>
            </div>

            {currentQuestion ? (
              <div className={`transition-all duration-200 ease-out ${isQuestionTransitioning ? 'translate-y-[2px] opacity-90' : 'translate-y-0 opacity-100'}`}>
                <h2 className="ui-title mb-4 text-xl leading-tight sm:text-2xl">
                  {currentQuestion.question_text}
                </h2>
                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => (
                    <div key={index} className="relative ml-4 flex min-h-[48px] items-center overflow-visible rounded-[8px] border border-slate-200 bg-white pl-9 pr-3 py-2.5 sm:ml-5 sm:min-h-[52px] sm:pl-10 sm:py-3">
                      <div className="absolute left-0 top-1/2 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5150] text-base font-black leading-none text-white sm:h-[52px] sm:w-[52px] sm:text-lg">
                        {String.fromCharCode(97 + index)}
                      </div>
                      <span className="text-base text-gray-700 sm:text-[1.08rem]">{option}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No questions available</p>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <button
              onClick={handlePrevious}
              disabled={poll.active_question_index === 0 || isNavigating}
              className="flex w-full items-center justify-center gap-2 rounded-[5px] border border-slate-300 bg-white px-6 py-3 font-semibold transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <ChevronLeft className="w-5 h-5" />
              {pendingDirection === 'previous' ? 'Updating...' : 'Previous'}
            </button>

            <div className="flex justify-center gap-2">
              {questions.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    index === poll.active_question_index
                      ? 'bg-purple-600'
                      : index < poll.active_question_index
                      ? 'bg-purple-300'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
              {!poll.is_display_started ? (
                <button
                  onClick={handleStartDisplay}
                  className="w-full rounded-[5px] bg-[#1652F0] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#1142c5] sm:w-auto"
                >
                  Start Displaying Questions
                </button>
              ) : (
                <div className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                  Question screen is live
                </div>
              )}

              <button
                onClick={handleNext}
                disabled={poll.active_question_index >= questions.length - 1 || isNavigating}
                className="flex w-full items-center justify-center gap-2 rounded-[5px] bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {pendingDirection === 'next' ? 'Updating...' : 'Next'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-200 pt-6 sm:mt-8 sm:pt-8">
            <h3 className="font-semibold text-gray-700 mb-4">Control Panel URLs:</h3>
            <div className="space-y-2 text-sm">
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="font-medium text-gray-600">Main Screen:</span>
                <code className="block w-full overflow-x-auto rounded-[5px] bg-gray-100 px-2 py-1 text-xs text-gray-800 sm:w-auto sm:text-sm">
                  {mainUrl}
                </code>
              </div>
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="font-medium text-gray-600">User Screen:</span>
                <code className="block w-full overflow-x-auto rounded-[5px] bg-gray-100 px-2 py-1 text-xs text-gray-800 sm:w-auto sm:text-sm">
                  {userUrl}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
