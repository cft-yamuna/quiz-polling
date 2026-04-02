import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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

export function UserScreen({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [participant, setParticipant] = useState<{ id: string; name: string } | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backgroundImage = '/commonbg.png';
  const startBackgroundImage = '/mobilebg1.png';
  const thankYouImage = '/thankyou.png';
  const participantStorageKey = `poll-participant:${pollId}`;

  useEffect(() => {
    void loadPollData();
    const cleanup = subscribeToUpdates();
    return cleanup;
  }, [pollId]);

  useEffect(() => {
    if (poll && participant) {
      void loadCurrentQuestion();
      setHasAnswered(false);
    }
  }, [poll?.active_question_index, participant]);

  const loadPollData = async () => {
    const { data } = await supabase
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .maybeSingle();

    if (data) setPoll(data as Poll);
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

      if (participant) {
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('id')
          .eq('question_id', question.id)
          .eq('participant_id', participant.id)
          .maybeSingle();

        setHasAnswered(!!existingAnswer);
      }
    }
  };

  const subscribeToUpdates = () => {
    const channel = supabase
      .channel(`poll-updates-user-${pollId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'polls',
        filter: `id=eq.${pollId}`
      }, (payload) => {
        setPoll(payload.new as Poll);
      })
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();

    const storedParticipant = window.localStorage.getItem(participantStorageKey);
    if (storedParticipant) {
      try {
        const parsedParticipant = JSON.parse(storedParticipant) as { id: string; name: string };
        setParticipant(parsedParticipant);
        return;
      } catch {
        window.localStorage.removeItem(participantStorageKey);
      }
    }

    setIsSubmitting(true);
    const generatedName = `Participant ${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await supabase
      .from('participants')
      .insert({ poll_id: pollId, name: generatedName })
      .select()
      .single();

    if (data && !error) {
      const createdParticipant = data as { id: string; name: string };
      const nextParticipant = { id: createdParticipant.id, name: createdParticipant.name };
      window.localStorage.setItem(participantStorageKey, JSON.stringify(nextParticipant));
      setParticipant(nextParticipant);
    }
    setIsSubmitting(false);
  };

  const handleAnswer = async (answer: string) => {
    if (!participant || !currentQuestion || hasAnswered) return;

    setIsSubmitting(true);
    const { error } = await supabase
      .from('answers')
      .insert({
        question_id: currentQuestion.id,
        participant_id: participant.id,
        answer
      });

    if (!error) {
      setHasAnswered(true);
    }
    setIsSubmitting(false);
  };

  const optionBadges = currentQuestion?.options.map((option, index) => ({
    key: option,
    label: String.fromCharCode(65 + index),
    text: option
  })) ?? [];

  if (!poll) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-2xl text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white">
        <img
          src={startBackgroundImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative z-10 flex min-h-screen flex-col px-6 py-10 sm:px-12 sm:py-12">
          <form onSubmit={handleStart} className="mt-80">
            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-button-primary min-w-[11rem] px-8 py-4 text-3xl font-semibold tracking-[-0.04em]"
            >
              {isSubmitting ? 'Loading...' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (hasAnswered) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white">
        <img
          src={thankYouImage}
          alt="Thank you"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white">
        <img
          src={backgroundImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="relative z-10 min-h-screen" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-10 sm:px-12 sm:py-12">
        <div className="mt-16 px-0 py-4 sm:mt-20 sm:px-1 sm:py-6">
          <div className="pb-5 text-center">
            <p className="text-[2.5rem] font-black leading-none tracking-[-0.06em] text-[#1652F0] sm:text-[3rem]">
              {`Q${poll.active_question_index + 1}`}
            </p>
            <h1 className="ui-title mx-auto mt-3 max-w-[68rem] text-[1.7rem] leading-[1.02] sm:text-[2rem]">
              {currentQuestion.question_text}
            </h1>
          </div>

          <div className="mx-auto mt-5 grid max-w-[228px] grid-cols-1 justify-items-center gap-3 min-[500px]:max-w-[474px] min-[500px]:grid-cols-2">
            {optionBadges.map((option, index) => (
              <button
                key={`${option.key}-${index}`}
                onClick={() => handleAnswer(option.text)}
                disabled={isSubmitting}
                className="relative h-[64px] w-full max-w-[228px] text-left transition-opacity disabled:opacity-60"
              >
                <div className="absolute inset-y-0 left-0 z-10 flex w-[64px] items-center justify-center rounded-full bg-[#FF5150] text-[1.18rem] font-black leading-none text-white sm:text-[1.28rem]">
                  {option.label}
                </div>
                <div className="absolute inset-y-0 left-[32px] z-0 flex right-0 items-center rounded-[8px] border border-white/20 bg-[#1652F0] pl-[2.7rem] pr-3">
                  <span className="text-[1.06rem] font-medium leading-tight tracking-[-0.03em] text-white sm:text-[1.16rem]">
                    {option.text}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
