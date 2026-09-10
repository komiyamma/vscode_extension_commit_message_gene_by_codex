import * as vscode from 'vscode';

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

// Only the user setting supplies the editable prompt; workspace overrides are ignored.
export function resolvePromptProfile(): PromptProfile {
	const profile = getBuiltInPromptProfile(getCommitMessageLanguage());
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	const text = configuration.inspect<string>('text')?.globalValue
		?? configuration.inspect<string>('text')?.defaultValue ?? profile.introLines.join('\n\n');
	return { ...profile, introLines: [text] };
}

export async function loadPromptTemplate(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	const language = configuration.inspect<string>('loadTemplate')?.globalValue;
	if (language !== 'en' && language !== 'ja' && language !== 'ko') { return; }
	await configuration.update('text', getBuiltInPromptProfile(language).introLines.join('\n\n'), vscode.ConfigurationTarget.Global);
	// Do not clear a newer selection while an earlier write is completing.
	if (configuration.inspect<string>('loadTemplate')?.globalValue === language) {
		await configuration.update('loadTemplate', undefined, vscode.ConfigurationTarget.Global);
	}
}

export async function initializePromptSettings(context: vscode.ExtensionContext): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	const scopes = [
		{ target: vscode.ConfigurationTarget.Global, field: 'globalValue' as const, resource: undefined },
		{ target: vscode.ConfigurationTarget.Workspace, field: 'workspaceValue' as const, resource: undefined },
		...(vscode.workspace.workspaceFolders ?? []).map(folder => ({
			target: vscode.ConfigurationTarget.WorkspaceFolder, field: 'workspaceFolderValue' as const, resource: folder.uri,
		})),
	];
	const backup = context.globalState.get<Record<string, unknown>>('promptSettingsBackup', {});
	const removals: { configuration: vscode.WorkspaceConfiguration; key: string; target: vscode.ConfigurationTarget }[] = [];
	for (const scope of scopes) {
		const config = vscode.workspace.getConfiguration('commitMessageGene.prompt', scope.resource);
		for (const key of ['intro.en', 'intro.ja']) {
			const value = config.inspect(key)?.[scope.field];
			if (value === undefined) { continue; }
			const id = `${scope.target}:${scope.resource?.toString() ?? vscode.workspace.workspaceFile?.toString() ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? 'user'}:${key}`;
			backup[id] = value;
			removals.push({ configuration: config, key, target: scope.target });
		}
	}
	// Save old values before changing any settings, including inactive workspace prompts.
	await context.globalState.update('promptSettingsBackup', backup);
	if (configuration.inspect<string>('text')?.globalValue === undefined) {
		const language = getCommitMessageLanguage();
		const legacy = configuration.get<unknown>(`intro.${language}`);
		if (legacy !== undefined && (!Array.isArray(legacy) || !legacy.every(line => typeof line === 'string'))) {
			throw new Error(`Cannot migrate invalid legacy prompt: intro.${language}`);
		}
		const text = Array.isArray(legacy) && legacy.some(line => line.trim())
			? legacy.join('\n\n') : getBuiltInPromptProfile(language).introLines.join('\n\n');
		await configuration.update('text', text, vscode.ConfigurationTarget.Global);
	}
	for (const removal of removals) {
		await removal.configuration.update(removal.key, undefined, removal.target);
	}
	await loadPromptTemplate();
	let pending = Promise.resolve();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (!event.affectsConfiguration('commitMessageGene.prompt.loadTemplate')) { return; }
		pending = pending.then(() => loadPromptTemplate()).catch(error => {
			vscode.window.showErrorMessage(`Failed to load prompt template: ${String(error)}`);
		});
	}));
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
