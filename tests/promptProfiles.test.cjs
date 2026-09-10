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
    workspace: { workspaceFolders: [{ uri: { toString: () => 'file:///test' } }], getConfiguration: () => configuration },
    window: {
      showQuickPick: async items => picks.shift()(items),
      showInputBox: async () => 'My prompt',
      showInformationMessage() {},
      showWarningMessage: async (_message, _options, confirmation) => confirmation,
    },
  };
  const context = { globalState: {
    get: (key, fallback) => state.get(key) ?? fallback,
    update: async (key, value) => { state.set(key, value); },
  } };
  const exports = {};
  vm.runInNewContext(readFileSync('out/promptProfiles.js', 'utf8'), {
    exports, require: name => { assert.equal(name, 'vscode'); return vscode; },
  });
  return { api: exports, values, state, context, picks };
}

test('migrates both languages once, removes old settings, uses only new profiles', async () => {
  const f = fixture();
  Object.assign(f.values.globalValue, { 'intro.en': ['English custom'], 'intro.ja': ['日本語設定'] });
  await f.api.migrateLegacyPrompts(f.context);
  assert.equal(f.state.get('customPromptProfiles').length, 2);
  assert.equal(f.values.globalValue['intro.ja'], undefined);
  assert.equal(f.api.resolvePromptProfile(f.context).introLines[0], '日本語設定');
  await f.api.migrateLegacyPrompts(f.context);
  assert.equal(f.state.get('customPromptProfiles').length, 2);
  f.values.globalValue['intro.ja'] = ['obsolete'];
  assert.equal(f.api.resolvePromptProfile(f.context).introLines[0], '日本語設定');
});

test('migration preserves explicit new settings and saves workspace/folder prompts', async () => {
  const f = fixture();
  Object.assign(f.values.globalValue, { 'intro.ja': ['old'], profile: 'en', text: 'new' });
  f.values.workspaceValue['intro.en'] = ['workspace'];
  f.values.workspaceFolderValue['intro.ja'] = ['folder'];
  await f.api.migrateLegacyPrompts(f.context);
  assert.equal(f.values.globalValue.profile, 'en');
  assert.equal(f.api.resolvePromptProfile(f.context).introLines[0], 'new');
  assert.equal(f.state.get('customPromptProfiles').length, 3);
  assert.equal(f.values.workspaceFolderValue['intro.ja'], undefined);
});

test('failed storage preserves legacy settings for retry', async () => {
  const f = fixture();
  f.values.globalValue['intro.ja'] = ['keep me'];
  f.context.globalState.update = async () => { throw new Error('disk failure'); };
  await assert.rejects(f.api.migrateLegacyPrompts(f.context), /disk failure/);
  assert.equal(f.values.globalValue['intro.ja'][0], 'keep me');
});

test('PR custom selection migrates and keeps its prompt and language', async () => {
  const f = fixture('en');
  f.state.set('customPromptProfiles', [{ id: 'custom-123', label: 'Korean', language: 'ko', introLines: ['saved'] }]);
  f.state.set('selectedPromptProfile', 'custom-123');
  Object.assign(f.values.globalValue, { profile: 'custom', text: 'unsaved edit' });
  await f.api.migrateLegacyPrompts(f.context);
  assert.equal(f.values.globalValue.profile, 'custom-123');
  assert.equal(f.api.resolvePromptProfile(f.context).language, 'ko');
  assert.equal(f.api.resolvePromptProfile(f.context).introLines[0], 'unsaved edit');
  f.state.delete('selectedPromptProfile');
  assert.equal(f.api.resolvePromptProfile(f.context).id, 'custom-123');
});

test('workspace and folder migration IDs cannot collide', async () => {
  const f = fixture();
  f.values.workspaceValue['intro.ja'] = ['workspace'];
  f.values.workspaceFolderValue['intro.ja'] = ['folder'];
  await f.api.migrateLegacyPrompts(f.context);
  const profiles = f.state.get('customPromptProfiles');
  assert.equal(profiles.length, 2);
  assert.notEqual(profiles[0].id, profiles[1].id);
  assert.equal(f.api.resolvePromptProfile(f.context).introLines[0], 'workspace');
});

test('auto follows UI language and detailed mode includes instructions', () => {
  const f = fixture('ko-KR');
  assert.equal(f.api.resolvePromptProfile(f.context).language, 'ko');
  f.values.globalValue.profile = 'en';
  f.values.globalValue.messageMode = 'detailed';
  assert.match(f.api.buildPrompt('git context', f.api.resolvePromptProfile(f.context)), /Detailed mode/);
});

test('add, save, delete uses active profile and clears deleted text', async () => {
  const f = fixture();
  f.values.workspaceValue.text = 'draft';
  f.picks.push(items => items.find(item => item.action === 'add'), items => items.find(item => item.language === 'ja'));
  await f.api.managePromptProfiles(f.context);
  const id = f.values.workspaceValue.profile;
  assert.match(id, /^custom-/);
  f.values.workspaceValue.text = 'edited';
  f.picks.push(items => items.find(item => item.action === 'save'));
  await f.api.managePromptProfiles(f.context);
  assert.equal(f.state.get('customPromptProfiles')[0].introLines[0], 'edited');
  f.picks.push(items => items.find(item => item.profile?.id === id), items => items.find(item => item.action === 'delete'));
  await f.api.managePromptProfiles(f.context);
  assert.equal(f.state.get('customPromptProfiles').length, 0);
  assert.equal(f.values.workspaceValue.profile, 'auto');
  assert.equal(f.values.workspaceValue.text, '');
});
