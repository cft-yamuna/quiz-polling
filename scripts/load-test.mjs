import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

function parseArgs(argv) {
  const options = {
    pollId: '',
    participants: 500,
    concurrency: 50,
    questionMode: 'active',
    validate: true,
    randomNames: false,
    cleanupAfter: false,
    namePrefix: 'TEST_',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--poll' && next) {
      options.pollId = next;
      index += 1;
      continue;
    }

    if (arg === '--participants' && next) {
      options.participants = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (arg === '--concurrency' && next) {
      options.concurrency = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (arg === '--questions' && next) {
      options.questionMode = next === 'all' ? 'all' : 'active';
      index += 1;
      continue;
    }

    if (arg === '--prefix' && next) {
      options.namePrefix = next;
      index += 1;
      continue;
    }

    if (arg === '--skip-validation') {
      options.validate = false;
    }

    if (arg === '--random-names') {
      options.randomNames = true;
    }

    if (arg === '--cleanup-after') {
      options.cleanupAfter = true;
    }
  }

  return options;
}

function loadEnvFile() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    throw new Error('Missing .env file in project root.');
  }

  const envContent = readFileSync(envPath, 'utf8');
  const values = {};

  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value;
  }

  return values;
}

function formatMs(value) {
  return `${value.toFixed(1)}ms`;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function randomAnswer(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function buildParticipantName(index, args) {
  if (args.randomNames) {
    return `${args.namePrefix}${randomUUID().slice(0, 8)}`;
  }

  return `${args.namePrefix}LoadTester_${String(index + 1).padStart(4, '0')}`;
}

async function selectCount(query) {
  const { count, error } = await query;
  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.pollId) {
    console.error('Usage: npm run loadtest -- --poll <poll-id> [--participants 500] [--concurrency 50] [--questions active|all] [--random-names] [--cleanup-after] [--prefix TEST_]');
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(args.participants) || args.participants <= 0) {
    throw new Error('--participants must be a positive integer.');
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error('--concurrency must be a positive integer.');
  }

  if (!args.namePrefix.trim()) {
    throw new Error('--prefix must not be empty.');
  }

  const env = loadEnvFile();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in .env.');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('id, title, active_question_index, is_active')
    .eq('id', args.pollId)
    .maybeSingle();

  if (pollError) {
    throw pollError;
  }

  if (!poll) {
    throw new Error(`Poll not found: ${args.pollId}`);
  }

  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id, question_text, options, order_index')
    .eq('poll_id', args.pollId)
    .order('order_index');

  if (questionsError) {
    throw questionsError;
  }

  if (!questions || questions.length === 0) {
    throw new Error(`Poll ${args.pollId} has no questions.`);
  }

  const targetQuestions = args.questionMode === 'all'
    ? questions
    : [questions[poll.active_question_index]].filter(Boolean);

  if (targetQuestions.length === 0) {
    throw new Error(`Active question index ${poll.active_question_index} is out of range for poll ${args.pollId}.`);
  }

  for (const question of targetQuestions) {
    if (!Array.isArray(question.options) || question.options.length === 0) {
      throw new Error(`Question ${question.id} has no answer options.`);
    }
  }

  const baselineParticipants = await selectCount(
    supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', args.pollId)
  );

  const baselineAnswers = {};
  for (const question of targetQuestions) {
    baselineAnswers[question.id] = await selectCount(
      supabase
        .from('answers')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', question.id)
    );
  }

  const results = {
    createdParticipants: 0,
    answeredQuestions: 0,
    participantFailures: [],
    answerFailures: [],
    participantDurations: [],
    answerDurations: [],
    participantIds: [],
    cleanupIds: [],
  };

  let nextIndex = 0;

  async function runVirtualUser() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;

      if (current >= args.participants) {
        return;
      }

      const participantName = buildParticipantName(current, args);
      const participantStarted = performance.now();
      const { data: participant, error: participantError } = await supabase
        .from('participants')
        .insert({ poll_id: args.pollId, name: participantName })
        .select('id')
        .single();

      results.participantDurations.push(performance.now() - participantStarted);

      if (participantError || !participant) {
        results.participantFailures.push({
          participantName,
          error: participantError?.message ?? 'Unknown participant insert failure',
        });
        continue;
      }

      results.createdParticipants += 1;
      results.participantIds.push(participant.id);
      results.cleanupIds.push(participant.id);

      for (const question of targetQuestions) {
        const answerStarted = performance.now();
        const { error: answerError } = await supabase
          .from('answers')
          .insert({
            question_id: question.id,
            participant_id: participant.id,
            answer: randomAnswer(question.options),
          });

        results.answerDurations.push(performance.now() - answerStarted);

        if (answerError) {
          results.answerFailures.push({
            participantId: participant.id,
            questionId: question.id,
            error: answerError.message,
          });
          continue;
        }

        results.answeredQuestions += 1;
      }
    }
  }

  console.log(`Starting load test for poll "${poll.title}" (${poll.id})`);
  console.log(`Participants: ${args.participants}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Question mode: ${args.questionMode}`);
  console.log(`Participant prefix: ${args.namePrefix}`);
  console.log(`Random names: ${args.randomNames ? 'yes' : 'no'}`);
  console.log(`Cleanup after run: ${args.cleanupAfter ? 'yes' : 'no'}`);
  console.log(`Target questions: ${targetQuestions.map((question) => question.order_index + 1).join(', ')}`);

  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, args.participants) }, () => runVirtualUser())
  );
  const duration = performance.now() - startedAt;

  const finalParticipants = await selectCount(
    supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('poll_id', args.pollId)
  );

  const finalAnswers = {};
  for (const question of targetQuestions) {
    finalAnswers[question.id] = await selectCount(
      supabase
        .from('answers')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', question.id)
    );
  }

  const validations = [];

  if (args.validate && results.participantIds.length > 0) {
    const duplicateParticipantId = results.participantIds[0];
    const duplicateQuestion = targetQuestions[0];
    const duplicateAnswer = randomAnswer(duplicateQuestion.options);

    const { error: duplicateError } = await supabase
      .from('answers')
      .insert({
        question_id: duplicateQuestion.id,
        participant_id: duplicateParticipantId,
        answer: duplicateAnswer,
      });

    validations.push({
      name: 'Duplicate answer for same participant/question should fail',
      passed: Boolean(duplicateError),
      details: duplicateError?.message ?? 'Unexpectedly accepted a duplicate answer.',
    });

    const { error: invalidQuestionError } = await supabase
      .from('answers')
      .insert({
        question_id: randomUUID(),
        participant_id: duplicateParticipantId,
        answer: duplicateAnswer,
      });

    validations.push({
      name: 'Answer against an invalid question should fail',
      passed: Boolean(invalidQuestionError),
      details: invalidQuestionError?.message ?? 'Unexpectedly accepted an answer with an invalid question id.',
    });

    const { error: invalidPollError } = await supabase
      .from('participants')
      .insert({
        poll_id: randomUUID(),
        name: 'Invalid Poll Guard',
      });

    validations.push({
      name: 'Participant join against an invalid poll should fail',
      passed: Boolean(invalidPollError),
      details: invalidPollError?.message ?? 'Unexpectedly accepted a participant for an invalid poll id.',
    });

    const { data: validationParticipant, error: validationParticipantError } = await supabase
      .from('participants')
      .insert({
        poll_id: args.pollId,
        name: `${args.namePrefix}Validation_${Date.now()}`,
      })
      .select('id')
      .single();

    if (validationParticipantError || !validationParticipant) {
      validations.push({
        name: 'Invalid option validation setup',
        passed: false,
        details: validationParticipantError?.message ?? 'Could not create a validation participant.',
      });
    } else {
      results.cleanupIds.push(validationParticipant.id);
      const { error: invalidOptionError } = await supabase
        .from('answers')
        .insert({
          question_id: duplicateQuestion.id,
          participant_id: validationParticipant.id,
          answer: '__INVALID_OPTION__',
        });

      validations.push({
        name: 'Answer outside the question options should fail',
        passed: Boolean(invalidOptionError),
        details: invalidOptionError?.message ?? 'Unexpectedly accepted an invalid option value.',
      });
    }
  }

  let cleanupCount = 0;
  let cleanupErrorMessage = '';

  if (args.cleanupAfter && results.cleanupIds.length > 0) {
    const cleanupIds = [...new Set(results.cleanupIds)];
    const { error: cleanupError } = await supabase
      .from('participants')
      .delete()
      .in('id', cleanupIds);

    if (cleanupError) {
      cleanupErrorMessage = cleanupError.message;
    } else {
      cleanupCount = cleanupIds.length;
    }
  }

  const avgParticipantDuration = results.participantDurations.length === 0
    ? 0
    : results.participantDurations.reduce((sum, value) => sum + value, 0) / results.participantDurations.length;

  const avgAnswerDuration = results.answerDurations.length === 0
    ? 0
    : results.answerDurations.reduce((sum, value) => sum + value, 0) / results.answerDurations.length;

  console.log('');
  console.log('Load Test Summary');
  console.log('-----------------');
  console.log(`Duration: ${formatMs(duration)}`);
  console.log(`Participants created: ${results.createdParticipants}/${args.participants}`);
  console.log(`Participant failures: ${results.participantFailures.length}`);
  console.log(`Answers inserted: ${results.answeredQuestions}/${args.participants * targetQuestions.length}`);
  console.log(`Answer failures: ${results.answerFailures.length}`);
  console.log(`Average participant insert: ${formatMs(avgParticipantDuration)}`);
  console.log(`Average answer insert: ${formatMs(avgAnswerDuration)}`);
  console.log(`Participant success rate: ${formatPercent((results.createdParticipants / args.participants) * 100)}`);
  console.log(`Answer success rate: ${formatPercent((results.answeredQuestions / (args.participants * targetQuestions.length)) * 100)}`);

  console.log('');
  console.log(`Participants before: ${baselineParticipants}`);
  console.log(`Participants after: ${finalParticipants}`);

  for (const question of targetQuestions) {
    console.log(
      `Question ${question.order_index + 1} answers before/after: ${baselineAnswers[question.id]} -> ${finalAnswers[question.id]}`
    );
  }

  if (results.participantFailures.length > 0) {
    console.log('');
    console.log('Participant failures');
    console.log('--------------------');
    for (const failure of results.participantFailures.slice(0, 10)) {
      console.log(`${failure.participantName}: ${failure.error}`);
    }
  }

  if (results.answerFailures.length > 0) {
    console.log('');
    console.log('Answer failures');
    console.log('---------------');
    for (const failure of results.answerFailures.slice(0, 10)) {
      console.log(`${failure.participantId} -> ${failure.questionId}: ${failure.error}`);
    }
  }

  if (validations.length > 0) {
    console.log('');
    console.log('Validation checks');
    console.log('-----------------');
    for (const validation of validations) {
      console.log(`${validation.passed ? 'PASS' : 'FAIL'}: ${validation.name}`);
      console.log(`  ${validation.details}`);
    }
  }

  if (args.cleanupAfter) {
    console.log('');
    console.log('Cleanup');
    console.log('-------');
    if (cleanupErrorMessage) {
      console.log(`FAIL: ${cleanupErrorMessage}`);
    } else {
      console.log(`Removed test participants: ${cleanupCount}`);
    }
  }

  if (
    results.participantFailures.length > 0 ||
    results.answerFailures.length > 0 ||
    validations.some((item) => !item.passed) ||
    Boolean(cleanupErrorMessage)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
