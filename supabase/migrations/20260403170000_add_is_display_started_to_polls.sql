ALTER TABLE public.polls
ADD COLUMN IF NOT EXISTS is_display_started boolean NOT NULL DEFAULT false;
