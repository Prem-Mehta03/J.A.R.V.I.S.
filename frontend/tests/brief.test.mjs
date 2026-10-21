import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_RE } from '../briefview.js';

test('phrases that ask for the brief', () => {
  for (const t of ['brief me', 'Brief me.', 'morning brief', 'give me my morning brief', 'my brief', 'Hey Jarvis, brief me', 'what is my day', "what's my day like", 'start my day', 'daily briefing please']) {
    assert.ok(BRIEF_RE.test(t), t);
  }
});

test('ordinary sentences that merely contain the word do not', () => {
  for (const t of ['remind me to brief the team at 5pm', 'add a task: write the project brief', 'what is a brief', 'set my brief to 8 am', 'brief the professor tomorrow', 'close them']) {
    assert.ok(!BRIEF_RE.test(t), t);
  }
});
