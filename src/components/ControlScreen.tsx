import { useEffect, useState } from 'react';
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

export function ControlScreen({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);

  useEffect(() => {
    void loadPollData();
    void loadQuestions();
    void loadParticipantCount();
  }, [pollId]);

  useEffect(() => {
    if (poll && questions.length > 0) {
      void loadAnswerCount();
    }
  }, [poll?.active_question_index, questions]);

  useEffect(() => {
    const cleanup = subscribeToUpdates(getCurrentQuestionId());
    return cleanup;
  }, [pollId, poll?.active_question_index, questions]);

  const loadPollData = async () => {
    const { data } = await supabase
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .maybeSingle();

    if (data) setPoll(data as Poll);
  };

  const loadQuestions = async () => {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('poll_id', pollId)
      .order('order_index');

    if (data) setQuestions(data as Question[]);
  };

  const loadParticipantCount = async () => {
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', pollId);

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

  const subscribeToUpdates = (currentQuestionId?: string) => {
    const pollChannel = supabase
      .channel(`control-poll-updates-${pollId}`)
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
      .channel(`participant-count-${pollId}`)
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
          .channel(`answer-count-${pollId}-${currentQuestionId}`)
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
      void pollChannel.unsubscribe();
      void participantChannel.unsubscribe();
      if (answerChannel) {
        void answerChannel.unsubscribe();
      }
    };
  };

  const handleNext = async () => {
    if (!poll || poll.active_question_index >= questions.length - 1) return;

    await supabase
      .from('polls')
      .update({ active_question_index: poll.active_question_index + 1 })
      .eq('id', pollId);

    setPoll(prev => prev ? { ...prev, active_question_index: prev.active_question_index + 1 } : null);
  };

  const handleStartDisplay = async () => {
    if (!poll?.is_display_started) {
      await supabase
        .from('polls')
        .update({ is_display_started: true })
        .eq('id', pollId);

      setPoll((prev) => prev ? { ...prev, is_display_started: true } : null);
    }
  };

  const handlePrevious = async () => {
    if (!poll || poll.active_question_index <= 0) return;

    await supabase
      .from('polls')
      .update({ active_question_index: poll.active_question_index - 1 })
      .eq('id', pollId);

    setPoll(prev => prev ? { ...prev, active_question_index: prev.active_question_index - 1 } : null);
  };

  if (!poll) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
        <p className="text-2xl text-gray-600">Loading...</p>
      </div>
    );
  }

  const currentQuestion = questions[poll.active_question_index];
  const mainUrl = buildPollUrl('main', pollId);
  const userUrl = buildPollUrl('user', pollId);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="ui-panel p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <h1 className="ui-title text-4xl">{poll.title}</h1>
            <div className="ui-chip px-4 py-2">
              <Users className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-purple-800">{participantCount} participants</span>
            </div>
          </div>

          <div className="ui-card mb-8 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="ui-chip px-4 py-2 text-sm font-medium">
                Question {poll.active_question_index + 1} of {questions.length}
              </span>
              <span className="text-sm text-gray-600">
                {answerCount} / {participantCount} answered
              </span>
            </div>

            {currentQuestion ? (
              <div>
                <h2 className="ui-title mb-4 text-2xl">
                  {currentQuestion.question_text}
                </h2>
                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => (
                    <div key={index} className="relative ml-5 flex min-h-[52px] items-center overflow-visible rounded-[8px] border border-slate-200 bg-white pl-10 pr-3 py-3">
                      <div className="absolute left-0 top-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF5150] text-lg font-black leading-none text-white">
                        {String.fromCharCode(97 + index)}
                      </div>
                      <span className="text-[1.08rem] text-gray-700">{option}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No questions available</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handlePrevious}
              disabled={poll.active_question_index === 0}
              className="flex items-center gap-2 rounded-[5px] border border-slate-300 bg-white px-6 py-3 font-semibold transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>

            <div className="flex gap-2">
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

            <div className="flex items-center gap-3">
              {!poll.is_display_started ? (
                <button
                  onClick={handleStartDisplay}
                  className="rounded-[5px] bg-[#1652F0] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#1142c5]"
                >
                  Start Displaying Questions
                </button>
              ) : (
                <div className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  Question screen is live
                </div>
              )}

              <button
                onClick={handleNext}
                disabled={poll.active_question_index >= questions.length - 1}
                className="flex items-center gap-2 rounded-[5px] bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-4">Control Panel URLs:</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600">Main Screen:</span>
                <code className="rounded-[5px] bg-gray-100 px-2 py-1 text-gray-800">
                  {mainUrl}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600">User Screen:</span>
                <code className="rounded-[5px] bg-gray-100 px-2 py-1 text-gray-800">
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
