import { supabase } from './supabase';

export interface QuestionResults {
  totalAnswers: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
}

interface QuestionResultsRow {
  total_answers: number;
  option_counts: Record<string, number> | null;
  option_percentages: Record<string, number> | null;
}

function toNumberMap(input: Record<string, unknown> | null | undefined) {
  const normalized: Record<string, number> = {};

  for (const [key, value] of Object.entries(input ?? {})) {
    normalized[key] = typeof value === 'number' ? value : Number(value ?? 0);
  }

  return normalized;
}

export async function fetchQuestionResults(questionId: string) {
  const { data, error } = await supabase
    .from('question_results')
    .select('total_answers, option_counts, option_percentages')
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as QuestionResultsRow | null;

  return {
    totalAnswers: row?.total_answers ?? 0,
    counts: toNumberMap(row?.option_counts),
    percentages: toNumberMap(row?.option_percentages),
  } satisfies QuestionResults;
}
