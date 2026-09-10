const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CodexAppServerClient } = require('../out/codexAppServerClient');

function client(model, fail) {
  const c = Object.create(CodexAppServerClient.prototype);
  Object.assign(c, { options: { model, reasoningEffort: 'low' }, runningTurn: null });
  const calls = [];
  c.request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/start') {
      if (params.model && fail === 'start') { return { error: { message: 'Model not available' } }; }
      return { result: { thread: { id: 'thread' } } };
    }
    return { result: {} };
  };
  let turns = 0;
  c.waitForTurnCompleted = async () => {
    if (++turns === 1 && fail === 'turn') { return { status: 'failed', error: 'Model not supported', output: '' }; }
    if (fail === 'auth') { throw new Error('Authentication failed'); }
    return { status: 'completed', output: 'fix: example' };
  };
  return { c, calls };
}

for (const failure of ['start', 'turn']) {
  test(`unavailable model at ${failure} retries once without model`, async () => {
    const { c, calls } = client('selected', failure);
    assert.equal((await c.runFreshTurn('prompt', 'cwd', 'startup')).output, 'fix: example');
    const starts = calls.filter(call => call.method === 'thread/start');
    assert.equal(starts.length, 2);
    assert.equal(starts[0].params.model, 'selected');
    assert.equal(Object.hasOwn(starts[1].params, 'model'), false);
  });
}

test('auto omits model and unrelated failures do not retry', async () => {
  const automatic = client(undefined);
  await automatic.c.runFreshTurn('prompt', 'cwd', 'startup');
  assert.equal(Object.hasOwn(automatic.calls[0].params, 'model'), false);
  const auth = client('selected', 'auth');
  await assert.rejects(auth.c.runFreshTurn('prompt', 'cwd', 'startup'), /Authentication/);
  assert.equal(auth.calls.filter(call => call.method === 'thread/start').length, 1);
});
