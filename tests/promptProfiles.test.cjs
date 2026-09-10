const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function fixture(language = 'ja') {
  const values = { globalValue: {}, workspaceValue: {}, workspaceFolderValue: {} };
  const state = new Map();
  const picks = [];
  const fields = ['', 'globalValue', 'workspaceValue', 'workspaceFolderValue'];
  const configuration = {
    get(key, fallback) {
      return values.workspaceValue[key] ?? values.globalValue[key] ?? fallback;
    },
    inspect(key) {
      return Object.fromEntries(fields.slice(1).map(field => [field, values[field][key]]));
    },
    async update(key, value, target) {
      if (value === undefined) { delete values[fields[target]][key]; }
      else { values[fields[target]][key] = value; }
    },
  };
  const vscode = {
    env: { language }, ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), workspaceFolders: [{ uri: { toString: () => 'file:///test' } }], getConfiguration: () => configuration },
    window: {
      showQuickPick: async items => picks.shift()(items),
      showInputBox: async () => 'My prompt',
      showInformationMessage() {},
      showWarningMessage: async (_message, _options, confirmation) => confirmation,
    },
  };
  const context = { subscriptions: [], globalState: {
    get: (key, fallback) => state.get(key) ?? fallback,
    update: async (key, value) => { state.set(key, value); },
  } };
  const exports = {};
  vm.runInNewContext(readFileSync('out/promptProfiles.js', 'utf8'), {
    exports, require: name => { assert.equal(name, 'vscode'); return vscode; },
  });
  return { api: exports, values, state, context, picks };
}

test('initial text and repeated template loading', async () => {
  for (const language of ['en', 'ja', 'ko']) {
    const f = fixture(language);
    await f.api.initializePromptSettings(f.context);
    assert.ok(f.values.globalValue.text.length > 50);
    const original = f.values.globalValue.text;
    for (let i = 0; i < 2; i++) {
      f.values.globalValue.text = 'edited';
      f.values.globalValue.loadTemplate = language;
      await f.api.loadPromptTemplate();
      assert.equal(f.values.globalValue.text, original);
      assert.equal(f.values.globalValue.loadTemplate, undefined);
    }
  }
});
test('legacy migration backs up all scopes and preserves later edits', async () => {
  const f = fixture();
  f.values.globalValue['intro.en'] = ['english'];
  f.values.workspaceValue['intro.ja'] = ['active'];
  f.values.workspaceFolderValue['intro.ja'] = ['folder'];
  await f.api.initializePromptSettings(f.context);
  assert.equal(f.values.globalValue.text, 'active');
  assert.equal(Object.keys(f.state.get('promptSettingsBackup')).length, 3);
  assert.equal(f.values.workspaceValue['intro.ja'], undefined);
  assert.equal(f.values.workspaceFolderValue['intro.ja'], undefined);
  f.values.globalValue.text = 'later';
  await f.api.initializePromptSettings(f.context);
  assert.equal(f.values.globalValue.text, 'later');
});
test('backup failure preserves legacy settings', async () => {
  const f = fixture();
  f.values.globalValue['intro.ja'] = ['keep'];
  f.context.globalState.update = async () => { throw new Error('disk failure'); };
  await assert.rejects(f.api.initializePromptSettings(f.context), /disk failure/);
  assert.equal(f.values.globalValue['intro.ja'][0], 'keep');
});
test('generation only uses user text', () => {
  const f = fixture('en');
  f.values.globalValue.text = 'user prompt';
  f.values.workspaceValue.text = 'workspace prompt';
  f.values.globalValue.messageMode = 'detailed';
  const prompt = f.api.buildPrompt('git context', f.api.resolvePromptProfile());
  assert.match(prompt, /user prompt/);
  assert.doesNotMatch(prompt, /workspace prompt/);
  assert.match(prompt, /Detailed mode/);
});
