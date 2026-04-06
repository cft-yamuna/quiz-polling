import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildPollUrl } from '../lib/app-url';
import { Plus, Trash2 } from 'lucide-react';

interface QuestionInput {
  question_text: string;
  options: string[];
}

const DEFAULT_POLL_TITLE = 'Team Pulse Check';

const DEFAULT_QUESTIONS: QuestionInput[] = [
  {
    question_text: 'What came first in HP, the PC or the Printer?',
    options: ['PC', 'Printer', 'Neither', 'A real chicken and egg situation!']
  },
  {
    question_text: 'How small can the ink droplets in an HP inkjet printhead be?',
    options: ['1 nanolitre', '1.3 femtolitre', '1.5 picolitre', '0.8 millilitre']
  },
  {
    question_text: 'What is the maximum NPU processing capability that our AI PCs currently offer?',
    options: ['128 BLIPS', '48 FLOPS', '50 TOPS', '512 MOPS']
  },
  {
    question_text: 'Internal code name for next generation compute product being developed by HP IDC for launch in India & global market is:',
    options: ['Mahabharat', 'Agni', 'Vayu', 'Arjuna']
  },
  {
    question_text: 'How many countries and languages does the HP Customer Care Centre Bangalore support?',
    options: ['6 countries, 3 languages', '38 countries, 16 languages', '16 countries, 6 languages', '21 countries, 5 languages']
  },
  {
    question_text: 'How many podium finishes has the HP Ferrari Formula 1 team had in the 2026 Formula 1 season?',
    options: ['1', '3', '2', '0']
  },
  {
    question_text: 'What is one value that Ipsita holds dearly that shows up in how she is the MD of the company?',
    options: ['Having a purpose beyond yourself', 'Conviction', 'Never settling', 'Restlessness']
  },
  {
    question_text: 'What powers Ipsita\'s typical workday?',
    options: ['Green tea and calm', 'Structured planning', 'Coffee ! loads of it !', 'People.. Always!']
  },
  {
    question_text: 'What is Ipsita currently reading?',
    options: ['The War of the Roses', 'Ghost-Eye', 'The Chip War', 'War and Peace']
  },
  {
    question_text: 'What does Ipsita love doing during her free time?',
    options: ['Practising mindfulness', 'Building her personal AI Agent', 'Doom scrolling reels on Insta', 'Spending time with her family']
  },
  {
    question_text: 'Is Ipsita a morning person or a night owl?',
    options: ['Morning', 'Night', 'Neither', 'Both']
  },
  {
    question_text: 'What does Ipsita prefer about her holidays:',
    options: ['Planned to the minute', 'Completely spontaneous', 'Starts planned, goes completely offscript', 'Plans everything, abandons it by day 2']
  }
];

function createDefaultQuestions() {
  return DEFAULT_QUESTIONS.map((question) => ({
    question_text: question.question_text,
    options: [...question.options]
  }));
}

export function SetupScreen() {
  const [title, setTitle] = useState(DEFAULT_POLL_TITLE);
  const [questions, setQuestions] = useState<QuestionInput[]>(createDefaultQuestions());
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  const addQuestion = () => {
    setQuestions([...questions, { question_text: '', options: ['', ''] }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, field: keyof QuestionInput, value: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const addOption = (questionIndex: number) => {
    const updated = [...questions];
    updated[questionIndex].options.push('');
    setQuestions(updated);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    updated[questionIndex].options[optionIndex] = value;
    setQuestions(updated);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updated = [...questions];
    if (updated[questionIndex].options.length > 2) {
      updated[questionIndex].options.splice(optionIndex, 1);
      setQuestions(updated);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert({ title, active_question_index: 0, is_active: true, is_display_started: false })
      .select()
      .single();

    if (pollError || !poll) {
      console.error('Error creating poll:', pollError);
      setIsCreating(false);
      return;
    }

    const createdPoll = poll as { id: string };

    const questionsToInsert = questions.map((q, index) => ({
      poll_id: createdPoll.id,
      question_text: q.question_text,
      options: q.options.filter(opt => opt.trim() !== ''),
      order_index: index
    }));

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToInsert);

    if (questionsError) {
      console.error('Error creating questions:', questionsError);
      setIsCreating(false);
      return;
    }

    setIsCreated(true);
    setIsCreating(false);
  };

  if (isCreated) {
    const mainUrl = buildPollUrl('main');
    const userUrl = buildPollUrl('user');
    const controlUrl = buildPollUrl('control');

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="ui-panel w-full max-w-2xl p-8 sm:p-10">
          <h2 className="ui-title mb-6 text-3xl text-center">Poll Created Successfully</h2>

          <div className="space-y-4 mb-8">
            <div className="ui-card p-4">
              <p className="mb-2 font-semibold text-gray-700">Main Screen</p>
              <a
                href={mainUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {mainUrl}
              </a>
            </div>

            <div className="ui-card p-4">
              <p className="mb-2 font-semibold text-gray-700">User Screen</p>
              <a
                href={userUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:underline break-all"
              >
                {userUrl}
              </a>
            </div>

            <div className="ui-card p-4">
              <p className="mb-2 font-semibold text-gray-700">Control Screen</p>
              <a
                href={controlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:underline break-all"
              >
                {controlUrl}
              </a>
            </div>
          </div>

          <button
            onClick={() => {
              setIsCreated(false);
              setTitle(DEFAULT_POLL_TITLE);
              setQuestions(createDefaultQuestions());
            }}
            className="w-full rounded-[5px] border border-slate-300 bg-white py-3 font-semibold text-gray-800 transition-colors hover:bg-slate-100"
          >
            Create Another Poll
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="ui-panel p-8 sm:p-10">
          <h1 className="ui-title mb-2 text-4xl">Create a New Poll</h1>
          <p className="ui-subtle mb-8">Set up the questions, generate links, and launch the session.</p>

          <form onSubmit={handleCreate} className="space-y-8">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Poll Title
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter poll title"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Questions</h3>
                <button
                type="button"
                onClick={addQuestion}
                  className="flex items-center gap-2 rounded-[5px] border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <Plus className="w-4 h-4" />
                  Add Question
                </button>
              </div>

              <div className="space-y-6">
                {questions.map((question, qIndex) => (
                  <div key={qIndex} className="ui-card p-6">
                    <div className="flex items-start justify-between mb-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Question {qIndex + 1}
                      </label>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIndex)}
                          className="rounded-[5px] text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={question.question_text}
                      onChange={(e) => updateQuestion(qIndex, 'question_text', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all mb-4"
                      placeholder="Enter question"
                      required
                    />

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Answer Options
                      </label>
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex gap-2">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                            className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder={`Option ${oIndex + 1}`}
                            required
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(qIndex, oIndex)}
                              className="rounded-[5px] px-3 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(qIndex)}
                        className="rounded-[5px] text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="ui-button-primary w-full px-6 py-4 text-lg font-semibold"
            >
              {isCreating ? 'Creating Poll...' : 'Create Poll'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
