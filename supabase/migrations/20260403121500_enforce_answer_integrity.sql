CREATE OR REPLACE FUNCTION public.validate_answer_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  question_poll_id uuid;
  participant_poll_id uuid;
  question_options jsonb;
BEGIN
  SELECT poll_id, options
  INTO question_poll_id, question_options
  FROM public.questions
  WHERE id = NEW.question_id;

  IF question_poll_id IS NULL THEN
    RAISE EXCEPTION 'Question % does not exist', NEW.question_id;
  END IF;

  SELECT poll_id
  INTO participant_poll_id
  FROM public.participants
  WHERE id = NEW.participant_id;

  IF participant_poll_id IS NULL THEN
    RAISE EXCEPTION 'Participant % does not exist', NEW.participant_id;
  END IF;

  IF participant_poll_id <> question_poll_id THEN
    RAISE EXCEPTION 'Participant % does not belong to poll %', NEW.participant_id, question_poll_id;
  END IF;

  IF jsonb_typeof(COALESCE(question_options, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Question % options must be a JSON array', NEW.question_id;
  END IF;

  IF NOT COALESCE(question_options, '[]'::jsonb) @> jsonb_build_array(NEW.answer) THEN
    RAISE EXCEPTION 'Answer "%" is not a valid option for question %', NEW.answer, NEW.question_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS answers_validate_integrity ON public.answers;

CREATE TRIGGER answers_validate_integrity
BEFORE INSERT OR UPDATE ON public.answers
FOR EACH ROW
EXECUTE FUNCTION public.validate_answer_integrity();
