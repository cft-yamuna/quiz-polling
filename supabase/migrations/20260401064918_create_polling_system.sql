/*
  # Real-time Polling System

  1. New Tables
    - `polls`
      - `id` (uuid, primary key)
      - `title` (text)
      - `active_question_index` (integer) - tracks which question is currently active
      - `is_active` (boolean) - whether poll is currently running
      - `created_at` (timestamptz)
    
    - `questions`
      - `id` (uuid, primary key)
      - `poll_id` (uuid, foreign key)
      - `question_text` (text)
      - `options` (jsonb) - array of answer options
      - `order_index` (integer)
      - `created_at` (timestamptz)
    
    - `participants`
      - `id` (uuid, primary key)
      - `poll_id` (uuid, foreign key)
      - `name` (text)
      - `joined_at` (timestamptz)
    
    - `answers`
      - `id` (uuid, primary key)
      - `question_id` (uuid, foreign key)
      - `participant_id` (uuid, foreign key)
      - `answer` (text) - the selected option
      - `answered_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Allow public read access for polls, questions, and aggregated answer data
    - Allow authenticated users to insert participants and answers
    - Restrict poll and question management to authenticated users
*/

-- Create polls table
CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  active_question_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active polls"
  ON polls FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Authenticated users can create polls"
  ON polls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update polls"
  ON polls FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create questions table
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view questions"
  ON questions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can create questions"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  joined_at timestamptz DEFAULT now()
);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view participants"
  ON participants FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can join as participant"
  ON participants FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create answers table
CREATE TABLE IF NOT EXISTS answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  answer text NOT NULL,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(question_id, participant_id)
);

ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view answers"
  ON answers FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can submit answers"
  ON answers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_questions_poll_id ON questions(poll_id);
CREATE INDEX IF NOT EXISTS idx_participants_poll_id ON participants(poll_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_participant_id ON answers(participant_id);