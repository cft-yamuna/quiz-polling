CREATE TABLE IF NOT EXISTS public.question_results (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  total_answers integer NOT NULL DEFAULT 0,
  option_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  option_percentages jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.question_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view question results"
  ON public.question_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.recalculate_question_results(target_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  question_options text[] := ARRAY[]::text[];
  option_text text;
  option_count integer;
  total_count integer := 0;
  counts_json jsonb := '{}'::jsonb;
  percentages_json jsonb := '{}'::jsonb;
BEGIN
  SELECT options
  INTO question_options
  FROM public.questions
  WHERE id = target_question_id;

  IF NOT FOUND THEN
    DELETE FROM public.question_results
    WHERE question_id = target_question_id;
    RETURN;
  END IF;

  SELECT count(*)
  INTO total_count
  FROM public.answers
  WHERE question_id = target_question_id;

  FOREACH option_text IN ARRAY COALESCE(question_options, ARRAY[]::text[]) LOOP
    SELECT count(*)
    INTO option_count
    FROM public.answers
    WHERE question_id = target_question_id
      AND answer = option_text;

    counts_json := counts_json || jsonb_build_object(option_text, option_count);
    percentages_json := percentages_json || jsonb_build_object(
      option_text,
      CASE
        WHEN total_count = 0 THEN 0
        ELSE round((option_count::numeric * 100.0) / total_count, 2)
      END
    );
  END LOOP;

  INSERT INTO public.question_results (
    question_id,
    total_answers,
    option_counts,
    option_percentages,
    updated_at
  )
  VALUES (
    target_question_id,
    total_count,
    counts_json,
    percentages_json,
    now()
  )
  ON CONFLICT (question_id) DO UPDATE
  SET total_answers = EXCLUDED.total_answers,
      option_counts = EXCLUDED.option_counts,
      option_percentages = EXCLUDED.option_percentages,
      updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_question_results_from_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_question_results(OLD.question_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.question_id <> NEW.question_id THEN
    PERFORM public.recalculate_question_results(OLD.question_id);
  END IF;

  PERFORM public.recalculate_question_results(NEW.question_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS answers_sync_question_results ON public.answers;

CREATE TRIGGER answers_sync_question_results
AFTER INSERT OR UPDATE OR DELETE ON public.answers
FOR EACH ROW
EXECUTE FUNCTION public.sync_question_results_from_answers();

CREATE OR REPLACE FUNCTION public.sync_question_results_from_questions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.question_results
    WHERE question_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_question_results(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_sync_question_results ON public.questions;

CREATE TRIGGER questions_sync_question_results
AFTER INSERT OR UPDATE OF options ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.sync_question_results_from_questions();

DO $$
DECLARE
  question_record record;
BEGIN
  FOR question_record IN SELECT id FROM public.questions LOOP
    PERFORM public.recalculate_question_results(question_record.id);
  END LOOP;
END;
$$;
