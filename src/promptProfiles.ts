import * as vscode from 'vscode';

const CUSTOM_PROMPT_PROFILES_KEY = 'customPromptProfiles';
type CommitMessageLanguage = 'en' | 'ja' | 'ko';
type CommitMessageMode = 'summary' | 'detailed';
type PromptProfile = {
	id: string;
	label: string;
	language: CommitMessageLanguage;
	introLines: string[];
	builtIn: boolean;
};

// Craft the instruction set for Codex, switching language based on UI locale.
const DEFAULT_PROFILE_EN = [
	'You are an assistant that drafts commit messages using the provided Git information.',
	'All required Git data has already been collected below. Do not run additional git commands.',
	'Follow the Conventional Commits style (type(scope?): subject) for the summary line and add a body only if it helps explain the change. Write the message in English. Do not use Markdown syntax; write in plain text.',
	'Return only the final commit message proposal.'
];

const DEFAULT_PROFILE_JA = [
	'あなたは収集されたGit情報でコミットメッセージを作成するアシスタントです。',
	'必要なGitデータはすべて下に用意済みです。追加のgitコマンドは実行しないでください。',
	'サマリー行はConventional Commitsスタイル（type(scope?): subject）に従い、必要な場合のみ本文を追加してください。コミットメッセージは日本語で記述してください。Markdown表記は使わずプレーンなテキストで記述してください。',
	'最終的なコミットメッセージ案だけを返してください。'
];

const DEFAULT_PROFILE_KO = [
	'제공된 Git 정보를 바탕으로 커밋 메시지 초안을 작성하는 도우미입니다.',
	'필요한 Git 정보는 아래에 이미 수집되어 있습니다. 추가 Git 명령을 실행하지 마세요.',
	'요약 줄은 Conventional Commits 형식(type(scope?): subject)을 따르고, 변경 사항을 설명하는 데 도움이 될 때만 본문을 추가하세요. 메시지는 한국어로 작성하세요. Markdown 문법을 사용하지 말고 일반 텍스트로 작성하세요.',
	'최종 커밋 메시지 제안만 반환하세요.'
];

function getCommitMessageLanguage(): CommitMessageLanguage {
	const lang = (vscode.env.language || '').toLowerCase();
	if (lang === 'ja' || lang.startsWith('ja-')) {
		return 'ja';
	}
	if (lang === 'ko' || lang.startsWith('ko-')) {
		return 'ko';
	}
	return 'en';
}

function buildCommitTypeInstruction(language: CommitMessageLanguage): string {
	if (language === 'ko') {
		return 'Git 변경을 분석해 가장 적절한 Conventional Commit 유형(feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert 등)을 스스로 선택하세요. 제목은 반드시 `type(scope): subject` 형식으로 작성하세요. 변경된 파일 또는 모듈이 분명하면 scope에 넣고, 적절한 scope이 없으면 `type: subject` 형식을 사용하세요. 본문이 필요하면 제목 뒤에 빈 줄을 하나 넣은 뒤 작성하세요.';
	}
	if (language === 'ja') {
		return 'Git の変更を分析して、最も適切な Conventional Commit 種別（feat、fix、docs、style、refactor、perf、test、build、ci、chore、revert など）を自分で選択してください。タイトルは必ず `type(scope): subject` 形式で記述してください。変更したファイルまたはモジュールが明確な場合は scope に入れ、適切な scope がない場合は `type: subject` 形式を使用してください。本文が必要な場合は、タイトルの後に空行を 1 行入れてください。';
	}
	return 'Analyze the Git changes and choose the most appropriate Conventional Commit type (such as feat, fix, docs, style, refactor, perf, test, build, ci, chore, or revert). The summary must use `type(scope): subject`. Use a changed file or module as the scope when it is clear; otherwise use `type: subject`. If a body is needed, separate it from the summary with one blank line.';
}

function getCommitMessageMode(): CommitMessageMode {
	return vscode.workspace
		.getConfiguration('commitMessageGene')
		.get<CommitMessageMode>('messageMode') === 'detailed'
		? 'detailed'
		: 'summary';
}

function buildMessageModeInstruction(language: CommitMessageLanguage, mode: CommitMessageMode): string {
	if (mode === 'summary') {
		if (language === 'ko') {
			return '요약 모드입니다. 제목 한 줄만 반환하고 본문이나 목록은 추가하지 마세요.';
		}
		if (language === 'ja') {
			return '要約モードです。タイトル 1 行だけを返し、本文や箇条書きは追加しないでください。';
		}
		return 'Summary mode: return only the one-line summary. Do not add a body or bullet list.';
	}

	if (language === 'ko') {
		return '상세 모드입니다. 제목 뒤에 빈 줄을 하나 넣고, 실제 Git 변경에서 확인되는 코드·파일·동작 변경을 설명하는 2~6개의 `- ` 목록을 작성하세요. 추측하지 말고, 코드 펜스나 제목은 사용하지 마세요.';
	}
	if (language === 'ja') {
		return '詳細モードです。タイトルの後に空行を 1 行入れ、実際の Git 変更から確認できるコード、ファイル、動作の変更を説明する `- ` で始まる箇条書きを 2～6 件記述してください。推測はせず、コードフェンスや見出しは使用しないでください。';
	}
	return 'Detailed mode: after the summary, add one blank line followed by 2-6 `- ` bullet lines that describe concrete code, file, or behavior changes evidenced by the Git data. Do not guess or use a code fence or heading.';
}

function getBuiltInPromptProfile(language: CommitMessageLanguage): PromptProfile {
	const defaultIntro = language === 'ja'
		? DEFAULT_PROFILE_JA
		: language === 'ko'
			? DEFAULT_PROFILE_KO
			: DEFAULT_PROFILE_EN;
	return {
		id: language,
		label: language === 'ko' ? '한국어' : language === 'ja' ? '日本語' : 'English',
		language,
		introLines: defaultIntro,
		builtIn: true,
	};
}

function getCustomPromptProfiles(context: vscode.ExtensionContext): PromptProfile[] {
	const stored = context.globalState.get<unknown>(CUSTOM_PROMPT_PROFILES_KEY, []);
	if (!Array.isArray(stored)) {
		return [];
	}

	return stored.flatMap((value): PromptProfile[] => {
		if (!value || typeof value !== 'object') {
			return [];
		}
		const profile = value as Partial<PromptProfile>;
		if (
			typeof profile.id !== 'string'
			|| typeof profile.label !== 'string'
			|| !['en', 'ja', 'ko'].includes(profile.language ?? '')
			|| !Array.isArray(profile.introLines)
		) {
			return [];
		}
		const introLines = profile.introLines
			.filter((line): line is string => typeof line === 'string')
			.map(line => line.trim())
			.filter(Boolean);
		return introLines.length > 0
			? [{ id: profile.id, label: profile.label, language: profile.language as CommitMessageLanguage, introLines, builtIn: false }]
			: [];
	});
}

async function saveCustomPromptProfiles(context: vscode.ExtensionContext, profiles: PromptProfile[]): Promise<void> {
	await context.globalState.update(CUSTOM_PROMPT_PROFILES_KEY, profiles.map(({ id, label, language, introLines }) => ({ id, label, language, introLines })));
}

function getPromptProfiles(context: vscode.ExtensionContext): PromptProfile[] {
	return [
		getBuiltInPromptProfile('en'),
		getBuiltInPromptProfile('ja'),
		getBuiltInPromptProfile('ko'),
		...getCustomPromptProfiles(context),
	];
}

export function resolvePromptProfile(context: vscode.ExtensionContext): PromptProfile {
	const configuredId = vscode.workspace
		.getConfiguration('commitMessageGene.prompt')
		.get<string>('profile', 'auto');
	const selectedId = configuredId === 'auto' ? getCommitMessageLanguage() : configuredId;
	const selected = getPromptProfiles(context).find(profile => profile.id === selectedId)
		?? getBuiltInPromptProfile(getCommitMessageLanguage());
	const promptText = vscode.workspace
		.getConfiguration('commitMessageGene.prompt')
		.get<string>('text')
		?.trim();
	return promptText ? { ...selected, introLines: [promptText] } : selected;
}

export async function selectPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	type PromptProfilePickItem = vscode.QuickPickItem & { profile: PromptProfile };
	const selected = await vscode.window.showQuickPick<PromptProfilePickItem>(
		getPromptProfiles(context).map(profile => ({
				label: profile.label,
				description: profile.builtIn ? `Built-in · ${profile.language.toUpperCase()}` : `Custom · ${profile.language.toUpperCase()}`,
				detail: profile.introLines.join(' '),
				profile,
			})),
		{ placeHolder: profileUi("Select a commit message prompt profile.", "コミットメッセージのプロファイルを選択してください。"), matchOnDescription: true, matchOnDetail: true },
	);
	if (!selected) {
		return;
	}
	await activatePromptProfile(context, selected.profile);
	vscode.window.showInformationMessage(`Commit Message Gene prompt profile: ${selected.label}`);
}

async function activatePromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	const profileId = profile.id;
	await configuration.update('text', profile.introLines.join('\n\n'), getPromptConfigurationTarget());
	if (configuration.get<string>('profile') !== profileId) {
		await configuration.update('profile', profileId, getPromptConfigurationTarget());
	}
}

export async function managePromptProfiles(context: vscode.ExtensionContext): Promise<void> {
	type PromptProfileActionItem = vscode.QuickPickItem & { action: 'add' | 'save' | 'edit' | 'delete' | 'default'; profile?: PromptProfile };
	const selected = await vscode.window.showQuickPick<PromptProfileActionItem>(
		[
			{ label: profileUi("$(save) Save current Prompt Text", "$(save) 現在の Prompt Text を保存"), description: profileUi("Save the current text to a custom profile.", "現在の内容をカスタムプロファイルに保存します。"), action: 'save' },
			{ label: profileUi("$(add) Add prompt profile", "$(add) プロファイルを追加"), action: 'add' },
			...getPromptProfiles(context).map(profile => ({
				label: profile.label,
				description: profile.builtIn ? profileUi("Built-in profile", "組み込みプロファイル") : profileUi("Custom profile", "カスタムプロファイル"),
				action: profile.builtIn ? 'default' as const : 'edit' as const,
				profile,
			})),
		],
		{ placeHolder: profileUi("Add or manage prompt profiles.", "プロファイルを追加・管理します。") },
	);
	if (!selected) {
		return;
	}
	if (selected.action === 'add') {
		await addPromptProfile(context);
		return;
	}
	if (selected.action === 'save') {
		await saveCurrentPromptProfile(context);
		return;
	}
	if (selected.action === 'default') {
		vscode.window.showInformationMessage(profileUi("Load built-in profiles using Select Prompt Profile. Built-in profiles cannot be deleted.", "組み込みプロファイルは選択コマンドから読み込めます。削除はできません。"));
		return;
	}
	if (!selected.profile) {
		return;
	}
	const action = await vscode.window.showQuickPick([
		{ label: profileUi("Edit", "編集"), action: 'edit' as const },
		{ label: profileUi("Delete", "削除"), action: 'delete' as const },
	], { placeHolder: selected.profile.label });
	if (action?.action === 'edit') {
		await editPromptProfile(context, selected.profile);
	} else if (action?.action === 'delete') {
		await deletePromptProfile(context, selected.profile);
	}
}

function getCurrentPromptText(): string | undefined {
	return vscode.workspace
		.getConfiguration('commitMessageGene.prompt')
		.get<string>('text')
		?.trim();
}

async function addPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	const promptText = getCurrentPromptText();
	if (!promptText) {
		vscode.window.showWarningMessage(profileUi("Enter a prompt in Prompt Text first.", "保存するプロンプトを Prompt Text に入力してください。"));
		return;
	}
	const label = await vscode.window.showInputBox({ prompt: profileUi("Profile name", "プロファイル名"), placeHolder: profileUi("Example: Concise English", "例: 簡潔な日本語") });
	if (!label?.trim()) {
		return;
	}
	const language = await selectProfileLanguage();
	if (!language) {
		return;
	}
	const profiles = getCustomPromptProfiles(context);
	profiles.push({ id: `custom-${Date.now()}`, label: label.trim(), language, introLines: [promptText], builtIn: false });
	await saveCustomPromptProfiles(context, profiles);
	await activatePromptProfile(context, profiles[profiles.length - 1]);
}

async function editPromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	await activatePromptProfile(context, profile);
	vscode.window.showInformationMessage(profileUi("Loaded into Prompt Text. Edit it in Settings, then use Manage Prompt Profiles to save it.", "Prompt Text に読み込みました。設定画面で編集し、管理コマンドから保存してください。"));
}

async function deletePromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	const confirmation = await vscode.window.showWarningMessage(`${profileUi('Delete profile?', 'プロファイルを削除しますか？')} ${profile.label}`, { modal: true }, profileUi("Delete", "削除"));
	if (confirmation !== profileUi("Delete", "削除")) {
		return;
	}
	await saveCustomPromptProfiles(context, getCustomPromptProfiles(context).filter(item => item.id !== profile.id));
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	if (configuration.get<string>('profile') === profile.id) {
		await configuration.update('profile', 'auto', getPromptConfigurationTarget());
		await configuration.update('text', '', getPromptConfigurationTarget());
	}

}

async function saveCurrentPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	const promptText = getCurrentPromptText();
	if (!promptText) {
		vscode.window.showWarningMessage(profileUi("Enter a prompt in Prompt Text first.", "保存するプロンプトを Prompt Text に入力してください。"));
		return;
	}
	const selectedId = vscode.workspace.getConfiguration('commitMessageGene.prompt').get<string>('profile');
	const existing = getCustomPromptProfiles(context).find(profile => profile.id === selectedId);
	if (!existing) {
		await addPromptProfile(context);
		return;
	}
	const profiles = getCustomPromptProfiles(context).map(profile => profile.id === existing.id
		? { ...profile, introLines: [promptText] }
		: profile);
	await saveCustomPromptProfiles(context, profiles);
	vscode.window.showInformationMessage(`${profileUi('Profile saved:', '保存しました:')} ${existing.label}`);
}

async function selectProfileLanguage(): Promise<CommitMessageLanguage | undefined> {
	const selected = await vscode.window.showQuickPick([
		{ label: '한국어', language: 'ko' as const },
		{ label: 'English', language: 'en' as const },
		{ label: '日本語', language: 'ja' as const },
	], { placeHolder: profileUi("Select the profile language.", "プロファイルの言語を選択してください。") });
	return selected?.language;
}

export function buildPrompt(gitContext: string, profile: PromptProfile): string {
	const messageMode = getCommitMessageMode();

	return [
		...profile.introLines,
		buildCommitTypeInstruction(profile.language),
		buildMessageModeInstruction(profile.language, messageMode),
		gitContext,
	].join('\n\n');
}


function getPromptConfigurationTarget(): vscode.ConfigurationTarget {
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	return ['profile', 'text'].some(key => configuration.inspect(key)?.workspaceValue !== undefined)
		? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

// Persist every explicit legacy prompt before removing the old settings. Re-running
// after an interrupted migration updates the same IDs rather than duplicating them.
export async function migrateLegacyPrompts(context: vscode.ExtensionContext): Promise<void> {
	const scopes = [
		{ target: vscode.ConfigurationTarget.Global, field: 'globalValue' as const, resource: undefined },
		{ target: vscode.ConfigurationTarget.Workspace, field: 'workspaceValue' as const, resource: undefined },
		...(vscode.workspace.workspaceFolders ?? []).map(folder => ({
			target: vscode.ConfigurationTarget.WorkspaceFolder, field: 'workspaceFolderValue' as const, resource: folder.uri,
		})),
	];
	for (const scope of scopes) {
		const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt', scope.resource);
		// The PR stored 'custom' in Settings and its actual ID in globalState.
		// Translate that selection once; generation only reads the new setting.
		if (configuration.inspect<string>('profile')?.[scope.field] === 'custom') {
			const previousId = context.globalState.get<string>('selectedPromptProfile');
			const previousProfile = getCustomPromptProfiles(context).find(profile => profile.id === previousId);
			await configuration.update('profile', previousProfile?.id ?? 'auto', scope.target);
		}
		const migrated: PromptProfile[] = [];
		const keys: string[] = [];
		for (const language of ['en', 'ja'] as const) {
			const key = `intro.${language}`;
			const value = configuration.inspect<unknown>(key)?.[scope.field];
			if (value === undefined) { continue; }
			if (!Array.isArray(value) || !value.every(line => typeof line === 'string')) {
				throw new Error(`Cannot migrate invalid legacy prompt: ${key}`);
			}
			keys.push(key);
			if (!value.some(line => line.trim())) { continue; }
			const location = scope.resource?.toString() ?? (scope.target === vscode.ConfigurationTarget.Global
				? 'global' : vscode.workspace.workspaceFile?.toString() ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? 'workspace');
			migrated.push({ id: `migrated-${scope.target}-${encodeURIComponent(location)}-${language}`,
				label: `Imported ${language.toUpperCase()} (${location})`, language, introLines: value, builtIn: false });
		}
		if (!keys.length) { continue; }
		const profiles = getCustomPromptProfiles(context);
		await saveCustomPromptProfiles(context, [...profiles.filter(profile => !migrated.some(item => item.id === profile.id)), ...migrated]);
		// Folder prompts remain available as imported profiles; active settings are window-scoped.
		if (scope.target !== vscode.ConfigurationTarget.WorkspaceFolder
			&& configuration.inspect('profile')?.[scope.field] === undefined
			&& configuration.inspect('text')?.[scope.field] === undefined) {
			const active = migrated.find(profile => profile.language === getCommitMessageLanguage());
			if (active) { await configuration.update('profile', active.id, scope.target); }
		}
		for (const key of keys) { await configuration.update(key, undefined, scope.target); }
	}
}

function profileUi(en: string, ja: string): string {
	return getCommitMessageLanguage() === 'ja' ? ja : en;
}
