import * as vscode from 'vscode';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { CodexAppServerClient } from './codexAppServerClient';

// Promisified wrapper for spawning git commands without direct callback usage.
const execFileAsync = promisify(execFile);
// Upper bound for each collected git section to keep prompts within Codex limits.
const MAX_SECTION_LENGTH = 3000;
// Soft cap for git stdout when we stream output to avoid buffer exhaustion.
const GIT_STDOUT_SOFT_LIMIT = 40000;
const CODEX_REASONING_EFFORT = 'low';
const APP_SERVER_CLIENT_NAME = 'commit_message_gene_by_codex';
const APP_SERVER_CLIENT_TITLE = 'Commit Message Gene by Codex';
const APP_SERVER_CLIENT_VERSION = '0.3.31';
const CUSTOM_PROMPT_PROFILES_KEY = 'customPromptProfiles';
const SELECTED_PROMPT_PROFILE_KEY = 'selectedPromptProfile';

type CommitMessageLanguage = 'en' | 'ja' | 'ko';
type CommitMessageMode = 'summary' | 'detailed';

type PromptProfile = {
	id: string;
	label: string;
	language: CommitMessageLanguage;
	introLines: string[];
	builtIn: boolean;
};

type GitRepositoryLike = {
	rootUri?: vscode.Uri;
	inputBox?: { value: string };
	ui?: { selected?: boolean };
};

const M = {
	status: {
		processing: () => (isJapanese() ? '$(sync~spin) Commit Message を生成しています...' : '$(sync~spin) Generating commit message...'),
	},
	commitArea: {
		copiedGitApi: () => (isJapanese() ? 'Git API 経由でコミットメッセージをコピーしました。' : 'Copied commit message via Git API.'),
		copiedScm: () => (isJapanese() ? 'SCM inputBox にコミットメッセージをコピーしました。' : 'Copied commit message to SCM input box.'),
		warnNoAccess: () => (isJapanese() ? 'コミットメッセージ欄にアクセスできませんでした。' : 'Unable to access commit message input.'),
		errorSet: (e: string) => (isJapanese() ? `コミットメッセージの設定に失敗しました: ${e}` : `Failed to set commit message: ${e}`),
	},
	errors: {
		noResult: () => (isJapanese() ? 'Codex から有効なコミットメッセージを受信できませんでした。' : 'No valid commit message was received from Codex.'),
		failed: (e: string) => (isJapanese() ? `Codex の実行に失敗しました: ${e}` : `Failed to run Codex: ${e}`),
	},
};

export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('commit message gene');
	const statusSpinner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
	context.subscriptions.push(output, statusSpinner);

	let appServerClient: CodexAppServerClient | undefined;
	let appServerConnection: Promise<void> | undefined;
	let appServerConnectionError: string | undefined;
	let appServerConnectionGeneration = 0;
	let appServerFirstTurn = true;

	const disconnectAppServer = () => {
		appServerConnectionGeneration += 1;
		appServerClient?.close();
		appServerClient = undefined;
		appServerConnection = undefined;
		appServerFirstTurn = true;
	};

	const connectAppServer = () => {
		if (appServerClient || appServerConnection || !vscode.workspace.workspaceFolders?.length) {
			return;
		}

		output.appendLine('Connecting to Codex app-server...');
		const connectionGeneration = ++appServerConnectionGeneration;
		appServerConnection = CodexAppServerClient.connect({
			clientName: APP_SERVER_CLIENT_NAME,
			clientTitle: APP_SERVER_CLIENT_TITLE,
			clientVersion: APP_SERVER_CLIENT_VERSION,
			model: getCodexModel(),
			reasoningEffort: CODEX_REASONING_EFFORT,
			onLog: (message) => output.appendLine(message),
		})
			.then((client) => {
				if (connectionGeneration !== appServerConnectionGeneration) {
					client.close();
					return;
				}
				appServerClient = client;
				appServerConnectionError = undefined;
				output.appendLine(`Connected to Codex app-server (${client.mode}).`);
			})
			.catch((error) => {
				if (connectionGeneration !== appServerConnectionGeneration) {
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				appServerConnectionError = message;
				output.appendLine(`Codex app-server connection failed: ${message}`);
				appServerClient = undefined;
			})
			.finally(() => {
				if (connectionGeneration === appServerConnectionGeneration) {
					appServerConnection = undefined;
				}
			});
	};

	connectAppServer();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('commitMessageGene.model')) {
			output.appendLine('Codex model setting changed; reconnecting to apply it.');
			disconnectAppServer();
			connectAppServer();
		}
		if (event.affectsConfiguration('commitMessageGene.prompt.profile')) {
			void loadBuiltInPromptProfile(context);
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
		if (!vscode.workspace.workspaceFolders?.length) {
			disconnectAppServer();
			return;
		}
		connectAppServer();
	}));
	context.subscriptions.push({ dispose: disconnectAppServer });
	context.subscriptions.push(
		vscode.commands.registerCommand('commit-message-gene-by-codex.selectPromptProfile', () => selectPromptProfile(context)),
		vscode.commands.registerCommand('commit-message-gene-by-codex.managePromptProfiles', () => managePromptProfiles(context)),
	);

	// Register the command that gathers git context, queries Codex, and updates the SCM input.
	const disposable = vscode.commands.registerCommand('commit-message-gene-by-codex.runCodexCmd', async (...commandArgs: unknown[]) => {
		try {
			const workspaceDir = await resolveWorkspaceDirectory(commandArgs);
			if (!workspaceDir) {
				vscode.window.showErrorMessage('No workspace folder is open, so Git context cannot be gathered.');
				return;
			}

			statusSpinner.text = M.status.processing();
			statusSpinner.show();

			connectAppServer();
			const gitPath = await resolveGitPath();
			const gitContext = await collectGitContext(workspaceDir, gitPath);

			// vscode.window.showInformationMessage(gitContext);

			const prompt = buildPrompt(gitContext, resolvePromptProfile(context));
			const result = await generateCommitMessage(prompt, workspaceDir, output, {
				getAppServerClient: () => appServerClient,
				waitForAppServerConnection: () => appServerConnection,
				getAppServerConnectionError: () => appServerConnectionError,
				takeAppServerSessionStartSource: () => {
					const source = appServerFirstTurn ? 'startup' : 'clear';
					appServerFirstTurn = false;
					return source;
				},
				disconnectAppServer,
			});

			let finalMessage = result?.trim();

			if (finalMessage) {
				// finalMessageの先頭と末尾の両方に「`」が３つずつ付いてるなら、先頭と末尾の「`」を３つずつ削除する
				if (finalMessage.startsWith('```') && finalMessage.endsWith('```')) {
					finalMessage = finalMessage.slice(3, -3).trim();
				}
				// finalMessageの先頭と末尾の両方に「`」が付いてるなら、先頭と末尾の「`」を削除する
				else if (finalMessage.startsWith('`') && finalMessage.endsWith('`')) {
					finalMessage = finalMessage.slice(1, -1).trim();
				}

				// finalMessageの先頭と末尾の両方に「**」が付いてるなら、先頭と末尾の「**」を削除する
				else if (finalMessage.startsWith('**') && finalMessage.endsWith('**')) {
					finalMessage = finalMessage.slice(2, -2).trim();
				}

				await setCommitMessage(finalMessage, output, workspaceDir, commandArgs);
			} else {
				reportError(M.errors.noResult(), output);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			reportError(M.errors.failed(message), output);
		} finally {
			statusSpinner.hide();
			statusSpinner.text = '';
		}
	});

	context.subscriptions.push(disposable);
}

type GenerateCommitMessageOptions = {
	getAppServerClient: () => CodexAppServerClient | undefined;
	waitForAppServerConnection: () => Promise<void> | undefined;
	getAppServerConnectionError: () => string | undefined;
	takeAppServerSessionStartSource: () => 'startup' | 'clear';
	disconnectAppServer: () => void;
};

async function generateCommitMessage(
	prompt: string,
	workspaceDir: string,
	output: vscode.OutputChannel,
	options: GenerateCommitMessageOptions,
): Promise<string | undefined> {
	await options.waitForAppServerConnection()?.catch(() => undefined);

			const appServerClient = options.getAppServerClient();
	if (appServerClient) {
		try {
			const result = await appServerClient.runFreshTurn(prompt, workspaceDir, options.takeAppServerSessionStartSource());
			if (result.status !== 'completed') {
				output.appendLine(`Codex app-server turn finished with status: ${result.status}`);
			}
			return result.output;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			output.appendLine(`Codex app-server turn failed: ${message}`);
			options.disconnectAppServer();
			throw error;
		}
	}

	if (process.platform !== 'win32') {
		throw new Error('Codex app-server is not connected. The Codex SDK fallback is only enabled on Windows.');
	}

	const connectionError = options.getAppServerConnectionError();
	output.appendLine(`Falling back to @openai/codex-sdk on Windows.${connectionError ? ` Codex app-server connection error: ${connectionError}` : ''}`);
	const sdkResult = await generateCommitMessageWithSdk(prompt, workspaceDir);
	return sdkResult;
}

// Safely copy the generated message into the most relevant SCM commit input.
async function setCommitMessage(message: string, output: vscode.OutputChannel, workspaceDir?: string, commandArgs: unknown[] = []) {
	try {
		// SCMビューをアクティブ化
		await vscode.commands.executeCommand('workbench.view.scm');
		// git拡張のAPIを取り出し（存在すれば）
		const gitApi = await getGitApi(output);
		if (gitApi) {
			const repos = (gitApi.repositories ?? []) as GitRepositoryLike[];
			const targetRepo = selectRepositoryForCommit(repos, workspaceDir, commandArgs);
			if (targetRepo?.inputBox) {
				targetRepo.inputBox.value = message;
				output.appendLine(M.commitArea.copiedGitApi());
				return;
			}
		}
		// Fallback: only use an input box supplied by the current SCM command context.
		const contextInputBox = findInputBoxFromCommandArgs(commandArgs);
		if (contextInputBox) {
			contextInputBox.value = message;
			output.appendLine(M.commitArea.copiedScm());
			return;
		}
		output.appendLine(M.commitArea.warnNoAccess());
	} catch (e: any) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		output.appendLine(M.commitArea.errorSet(errorMessage));
	}
}

// Locate the repository whose commit input should be updated, prioritising context matches first.
function selectRepositoryForCommit(repos: GitRepositoryLike[], workspaceDir?: string, commandArgs: unknown[] = []) {
	if (!repos || repos.length === 0) {
		return undefined;
	}

	for (const fsPath of extractFsPathsFromCommandArgs(commandArgs)) {
		const byExactContext = findRepoByFsPath(repos, fsPath);
		if (byExactContext) {
			return byExactContext;
		}

		const byContainingContext = findRepoContainingFsPath(repos, fsPath);
		if (byContainingContext) {
			return byContainingContext;
		}
	}

	if (workspaceDir) {
		const byContext = findRepoByFsPath(repos, workspaceDir);
		if (byContext) {
			return byContext;
		}
	}

	const selected = repos.find(repo => repo?.ui?.selected);
	if (selected) {
		return selected;
	}

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (activeFolder?.uri?.fsPath) {
			const byActive = findRepoByFsPath(repos, activeFolder.uri.fsPath);
			if (byActive) {
				return byActive;
			}
		}
	}

	return repos[0];
}

// Prepare filesystem paths for reliable equality checks across platforms.
function normalizeFsPath(fsPath: string): string {
	const normalized = path.normalize(fsPath);
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

// Retrieve a repository whose root matches the provided filesystem path.
function findRepoByFsPath(repos: GitRepositoryLike[], targetFsPath: string) {
	const normalizedTarget = normalizeFsPath(targetFsPath);
	return repos.find(repo => repo?.rootUri?.fsPath && normalizeFsPath(repo.rootUri.fsPath) === normalizedTarget);
}

// Retrieve the deepest repository whose root contains the provided filesystem path.
function findRepoContainingFsPath(repos: GitRepositoryLike[], targetFsPath: string) {
	const normalizedTarget = normalizeFsPath(targetFsPath);
	return repos
		.filter(repo => {
			if (!repo?.rootUri?.fsPath) {
				return false;
			}
			const normalizedRoot = normalizeFsPath(repo.rootUri.fsPath);
			return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
		})
		.sort((a, b) => (b.rootUri?.fsPath.length ?? 0) - (a.rootUri?.fsPath.length ?? 0))[0];
}

// Pull repository or resource paths out of SCM command menu arguments.
function extractFsPathsFromCommandArgs(commandArgs: unknown[]): string[] {
	const paths: string[] = [];
	const seen = new Set<unknown>();

	const visit = (value: unknown, depth: number) => {
		if (!value || depth > 4) {
			return;
		}

		if (typeof value !== 'object') {
			return;
		}

		if (seen.has(value)) {
			return;
		}
		seen.add(value);

		if (Array.isArray(value)) {
			value.forEach(item => visit(item, depth + 1));
			return;
		}

		const maybeUri = value as { fsPath?: unknown };
		if (typeof maybeUri.fsPath === 'string') {
			paths.push(maybeUri.fsPath);
		}

		const record = value as Record<string, unknown>;
		for (const key of ['rootUri', 'resourceUri', 'uri', 'sourceUri']) {
			visit(record[key], depth + 1);
		}
		for (const key of ['sourceControl', 'repository', 'repo']) {
			visit(record[key], depth + 1);
		}
	};

	commandArgs.forEach(arg => visit(arg, 0));
	return [...new Set(paths)];
}

// Find an input box only when VS Code supplied it through the invoked SCM command context.
function findInputBoxFromCommandArgs(commandArgs: unknown[]) {
	const seen = new Set<unknown>();

	const visit = (value: unknown, depth: number): { value: string } | undefined => {
		if (!value || depth > 4 || typeof value !== 'object') {
			return undefined;
		}

		if (seen.has(value)) {
			return undefined;
		}
		seen.add(value);

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = visit(item, depth + 1);
				if (found) {
					return found;
				}
			}
			return undefined;
		}

		const record = value as Record<string, unknown>;
		const inputBox = record.inputBox as { value?: unknown } | undefined;
		if (inputBox && typeof inputBox.value === 'string') {
			return inputBox as { value: string };
		}

		for (const key of ['sourceControl', 'repository', 'repo']) {
			const found = visit(record[key], depth + 1);
			if (found) {
				return found;
			}
		}

		return undefined;
	};

	for (const arg of commandArgs) {
		const found = visit(arg, 0);
		if (found) {
			return found;
		}
	}

	return undefined;
}

// Report failure to both the output channel and a toast without touching SCM text.
function reportError(message: string, output: vscode.OutputChannel) {
	output.appendLine(message);
	vscode.window.showErrorMessage(message);
}

// Fetch and return the Git extension API, activating the extension lazily if needed.
async function getGitApi(_output?: vscode.OutputChannel): Promise<any | undefined> {
	const gitExt = vscode.extensions.getExtension('vscode.git')
		?? vscode.extensions.all.find(extension => extension.id.toLowerCase() === 'vscode.git');
	if (!gitExt) {
		return undefined;
	}
	try {
		const exportsAny = gitExt.isActive ? (gitExt.exports as any) : await gitExt.activate();
		if (typeof exportsAny?.getAPI !== 'function') {
			return exportsAny;
		}
		return exportsAny.getAPI(1);
	} catch {
		return undefined;
	}
}

// Resolve the git binary path from VS Code's Git extension to avoid PATH dependency.
async function resolveGitPath(): Promise<string> {
	const gitApi = await getGitApi();
	const resolvedPath: string | undefined = gitApi?.git?.path;
	if (resolvedPath) {
		return resolvedPath;
	}
	// Fallback: assume git is on PATH (should not normally happen in VS Code)
	return 'git';
}

// Determine which repository Codex should treat as the working directory.
async function resolveWorkspaceDirectory(commandArgs: unknown[] = []): Promise<string | undefined> {
	const gitApi = await getGitApi();
	const repos = (gitApi?.repositories ?? []) as GitRepositoryLike[];
	const contextRepo = selectRepositoryForCommit(repos, undefined, commandArgs);
	if (contextRepo?.rootUri?.fsPath) {
		return contextRepo.rootUri.fsPath;
	}

	const selectedRepo = repos.find(repo => repo?.ui?.selected);
	if (selectedRepo?.rootUri?.fsPath) {
		return selectedRepo.rootUri.fsPath;
	}

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		// アクティブエディターのファイルが属するフォルダーを優先する
		const containingWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (containingWorkspace?.uri?.fsPath) {
			return containingWorkspace.uri.fsPath;
		}
	}

	if (repos.length > 0 && repos[0]?.rootUri?.fsPath) {
		return repos[0].rootUri.fsPath;
	}

	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Run a git subcommand and return trimmed stdout or throw a descriptive error.
async function runGitCommand(args: string[], cwd: string, options?: { softLimit?: number; gitPath?: string }): Promise<string> {
	const git = options?.gitPath ?? 'git';
	if (options?.softLimit) {
		return runGitCommandWithSoftLimit(args, cwd, options.softLimit, git);
	}
	try {
		const { stdout } = await execFileAsync(git, args, { cwd, maxBuffer: 1024 * 1024 * 20 });
		return stdout.trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to run git ${args.join(' ')}: ${message}`);
	}
}

function isHeadMissingError(message: string): boolean {
	return /ambiguous argument 'HEAD'/i.test(message) || /unknown revision/i.test(message) || /does not have any commits yet/i.test(message);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Gather the git facts Codex needs to craft a conventional commit message.
async function collectGitContext(cwd: string, gitPath: string): Promise<string> {
	const opts = { gitPath };
	const gitVersion = await runGitCommand(['--version'], cwd, opts);
	const repoRoot = await runGitCommand(['rev-parse', '--show-toplevel'], cwd, opts);
	const branch = await (async () => {
		try {
			return await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, opts);
		} catch (error) {
			const message = toErrorMessage(error);
			if (isHeadMissingError(message)) {
				return 'No commits yet (HEAD not created)';
			}
			throw error;
		}
	})();
	const status = await runGitCommand(['status', '--short', '--branch'], cwd, opts);
	const stagedDiff = await runGitCommand(['diff', '--cached', '--color=never'], cwd, { softLimit: GIT_STDOUT_SOFT_LIMIT, ...opts });
	let diffSectionTitle = 'Staged diff';
	let diffBody = stagedDiff;
	if (!diffBody) {
		diffSectionTitle = 'Working tree diff (no staged changes)';
		diffBody = await runGitCommand(['diff', '--color=never'], cwd, { softLimit: GIT_STDOUT_SOFT_LIMIT, ...opts });
	}
	const untrackedFiles = await runGitCommand(['ls-files', '--others', '--exclude-standard'], cwd, opts);
	const recentCommits = await (async () => {
		try {
			return await runGitCommand(['log', '--oneline', '-5'], cwd, opts);
		} catch (error) {
			const message = toErrorMessage(error);
			if (isHeadMissingError(message)) {
				return 'No commits yet';
			}
			throw error;
		}
	})();

	return [
		formatSection('Git version', gitVersion),
		formatSection('Repository root', repoRoot),
		formatSection('Current branch', branch),
		formatSection('Status (--short --branch)', status),
		formatSection(diffSectionTitle, diffBody),
		formatSection('Untracked files', untrackedFiles),
		formatSection('Recent commits', recentCommits),
	].join('\n\n');
}

// Wrap a single git data section in markdown and ensure bounded length.
function formatSection(title: string, body: string): string {
	const safeBody = truncateForPrompt(body || 'N/A', MAX_SECTION_LENGTH);
	return `### ${title}\n${safeBody}`;
}

// Apply a hard cap to command output so the prompt remains digestible.
function truncateForPrompt(text: string, limit: number): string {
	if (text.length <= limit) {
		return text;
	}
	return `${text.slice(0, limit)}\n... (truncated to ${limit} chars)`;
}

// 言語判定: VSCode のUI言語が日本語(ja*)かどうか
function isJapanese(): boolean {
	const lang = (vscode.env.language || '').toLowerCase();
	return lang === 'ja' || lang.startsWith('ja-');
}

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

function getCodexModel(): string | undefined {
	const configuredModel = vscode.workspace
		.getConfiguration('commitMessageGene')
		.get<string>('model')
		?.trim();
	return configuredModel && configuredModel !== 'auto' ? configuredModel : undefined;
}

function isUnavailableModelError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /model.*(not supported|requires a newer version|not available)/i.test(message);
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

function resolvePromptProfile(context: vscode.ExtensionContext): PromptProfile {
	const configuredId = vscode.workspace
		.getConfiguration('commitMessageGene.prompt')
		.get<string>('profile', 'en');
	const selectedId = configuredId === 'custom'
		? context.globalState.get<string>(SELECTED_PROMPT_PROFILE_KEY, 'en')
		: configuredId;
	const selected = getPromptProfiles(context).find(profile => profile.id === selectedId)
		?? getBuiltInPromptProfile('en');
	const promptText = vscode.workspace
		.getConfiguration('commitMessageGene.prompt')
		.get<string>('text')
		?.trim();
	return promptText ? { ...selected, introLines: [promptText] } : selected;
}

async function selectPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	type PromptProfilePickItem = vscode.QuickPickItem & { profile: PromptProfile };
	const selected = await vscode.window.showQuickPick<PromptProfilePickItem>(
		getPromptProfiles(context).map(profile => ({
				label: profile.label,
				description: profile.builtIn ? `기본 ${profile.language.toUpperCase()} 프로필` : `사용자 프로필 · ${profile.language.toUpperCase()}`,
				detail: profile.introLines.join(' '),
				profile,
			})),
		{ placeHolder: '커밋 메시지 프롬프트 프로필을 선택하세요.', matchOnDescription: true, matchOnDetail: true },
	);
	if (!selected) {
		return;
	}
	await activatePromptProfile(context, selected.profile);
	vscode.window.showInformationMessage(`Commit Message Gene prompt profile: ${selected.label}`);
}

async function activatePromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('commitMessageGene.prompt');
	const profileId = profile.builtIn ? profile.id : 'custom';
	await configuration.update('text', profile.introLines.join('\n\n'), vscode.ConfigurationTarget.Global);
	if (configuration.get<string>('profile') !== profileId) {
		await configuration.update('profile', profileId, vscode.ConfigurationTarget.Global);
	}
	await context.globalState.update(SELECTED_PROMPT_PROFILE_KEY, profile.builtIn ? undefined : profile.id);
}

async function loadBuiltInPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	const profileId = vscode.workspace.getConfiguration('commitMessageGene.prompt').get<string>('profile', 'en');
	if (!['en', 'ja', 'ko'].includes(profileId)) {
		return;
	}
	await activatePromptProfile(context, getBuiltInPromptProfile(profileId as CommitMessageLanguage));
}

async function managePromptProfiles(context: vscode.ExtensionContext): Promise<void> {
	type PromptProfileActionItem = vscode.QuickPickItem & { action: 'add' | 'save' | 'edit' | 'delete' | 'default'; profile?: PromptProfile };
	const selected = await vscode.window.showQuickPick<PromptProfileActionItem>(
		[
			{ label: '$(save) 현재 Prompt Text 저장', description: '현재 textarea 내용을 사용자 프로필에 저장합니다.', action: 'save' },
			{ label: '$(add) 새 프롬프트 프로필 추가', action: 'add' },
			...getPromptProfiles(context).map(profile => ({
				label: profile.label,
				description: profile.builtIn ? '기본 프로필' : '사용자 프로필',
				action: profile.builtIn ? 'default' as const : 'edit' as const,
				profile,
			})),
		],
		{ placeHolder: '프롬프트 프로필을 추가하거나 관리하세요.' },
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
		vscode.window.showInformationMessage('기본 프로필은 Prompt Profile에서 선택하면 아래 Prompt Text textarea에 불러옵니다. 기본 프로필은 삭제할 수 없습니다.');
		return;
	}
	if (!selected.profile) {
		return;
	}
	const action = await vscode.window.showQuickPick([
		{ label: '편집', action: 'edit' as const },
		{ label: '삭제', action: 'delete' as const },
	], { placeHolder: `${selected.profile.label} 프로필 관리` });
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
		vscode.window.showWarningMessage('Prompt Text textarea에 저장할 프롬프트를 먼저 입력하세요.');
		return;
	}
	const label = await vscode.window.showInputBox({ prompt: '프로필 이름', placeHolder: '예: 간결한 한국어' });
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
}

async function editPromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	await activatePromptProfile(context, profile);
	vscode.window.showInformationMessage('프로필을 Prompt Text textarea에 불러왔습니다. 수정한 뒤 Prompt Profile 관리에서 “현재 Prompt Text 저장”을 선택하세요.');
}

async function deletePromptProfile(context: vscode.ExtensionContext, profile: PromptProfile): Promise<void> {
	const confirmation = await vscode.window.showWarningMessage(`'${profile.label}' 프로필을 삭제할까요?`, { modal: true }, '삭제');
	if (confirmation !== '삭제') {
		return;
	}
	await saveCustomPromptProfiles(context, getCustomPromptProfiles(context).filter(item => item.id !== profile.id));
	if (context.globalState.get<string>(SELECTED_PROMPT_PROFILE_KEY) === profile.id) {
		await context.globalState.update(SELECTED_PROMPT_PROFILE_KEY, 'auto');
	}
}

async function saveCurrentPromptProfile(context: vscode.ExtensionContext): Promise<void> {
	const promptText = getCurrentPromptText();
	if (!promptText) {
		vscode.window.showWarningMessage('Prompt Text textarea에 저장할 프롬프트를 먼저 입력하세요.');
		return;
	}
	const selectedId = context.globalState.get<string>(SELECTED_PROMPT_PROFILE_KEY);
	const existing = getCustomPromptProfiles(context).find(profile => profile.id === selectedId);
	if (!existing) {
		await addPromptProfile(context);
		return;
	}
	const profiles = getCustomPromptProfiles(context).map(profile => profile.id === existing.id
		? { ...profile, introLines: [promptText] }
		: profile);
	await saveCustomPromptProfiles(context, profiles);
	vscode.window.showInformationMessage(`'${existing.label}' 프로필에 현재 Prompt Text를 저장했습니다.`);
}

async function selectProfileLanguage(): Promise<CommitMessageLanguage | undefined> {
	const selected = await vscode.window.showQuickPick([
		{ label: '한국어', language: 'ko' as const },
		{ label: 'English', language: 'en' as const },
		{ label: '日本語', language: 'ja' as const },
	], { placeHolder: '프로필 언어를 선택하세요.' });
	return selected?.language;
}

function buildPrompt(gitContext: string, profile: PromptProfile): string {
	const messageMode = getCommitMessageMode();

	return [
		...profile.introLines,
		buildCommitTypeInstruction(profile.language),
		buildMessageModeInstruction(profile.language, messageMode),
		gitContext,
	].join('\n\n');
}

async function generateCommitMessageWithSdk(prompt: string, workspaceDir: string): Promise<string | undefined> {
	// Load the ESM-only Codex package dynamically to avoid require() in CommonJS.
	const { Codex } = await import('@openai/codex-sdk');
	const codex = new Codex();
	const model = getCodexModel();
	const baseOpts = {
		workingDirectory: workspaceDir,
		skipGitRepoCheck: true,
		modelReasoningEffort: CODEX_REASONING_EFFORT, // minimal/low/medium/high and xhigh(=over 5.2)
	} as const;
	const configuredOpts = model ? { ...baseOpts, model } : baseOpts;

	try {
		const t1 = codex.startThread(configuredOpts);
		const result = await t1.run(prompt);
		return result.finalResponse?.trim();
	} catch (e: any) {
		if (model && isUnavailableModelError(e)) {
			const t = codex.startThread(baseOpts);
			const result = await t.run(prompt);
			return result.finalResponse?.trim();
		}

		/*
		const msg = (e?.message ?? String(e)).toLowerCase();
		const isEffortXhighError =
			msg.includes('param') &&
			msg.includes('reasoning.effort') &&
			msg.includes('xhigh') &&
			(msg.includes('unsupported_value') || msg.includes('unsupported value'));

		if (!isEffortXhighError) {
			throw e;
		}
		*/

		const t2 = codex.startThread({ ...baseOpts, modelReasoningEffort: 'medium' });
		const result = await t2.run(prompt);
		return result.finalResponse?.trim();
	}
}
// Stream git stdout while enforcing a soft character limit to prevent buffer overruns.
async function runGitCommandWithSoftLimit(args: string[], cwd: string, limit: number, gitPath: string = 'git'): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(gitPath, args, { cwd });
		let stdout = '';
		let stderr = '';
		let truncated = false;
		let settled = false;

		const finishSuccess = (value: string) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(value);
		};

		const finishFailure = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			reject(error);
		};

		const appendStdout = (chunk: Buffer | string) => {
			if (truncated) {
				return;
			}
			const text = chunk.toString();
			if (stdout.length + text.length > limit) {
				const remaining = Math.max(limit - stdout.length, 0);
				if (remaining > 0) {
					stdout += text.slice(0, remaining);
				}
				truncated = true;
				child.kill('SIGTERM');
			} else {
				stdout += text;
			}
		};

		child.stdout.on('data', appendStdout);
		child.stderr.on('data', chunk => {
			if (!truncated) {
				stderr += chunk.toString();
			}
		});

		child.on('error', err => {
			const message = err instanceof Error ? err.message : String(err);
			finishFailure(new Error(`Failed to run git ${args.join(' ')}: ${message}`));
		});

		child.on('close', (code, signal) => {
			if (truncated) {
				const suffix = `\n... (truncated to ${limit} chars)`;
				finishSuccess(`${stdout.trim()}${suffix}`.trim());
				return;
			}
			if (code === 0) {
				finishSuccess(stdout.trim());
				return;
			}
			const signalInfo = signal ? ` signal ${signal}` : '';
			const message = stderr.trim() || `exit code ${code ?? 'unknown'}${signalInfo}`;
			finishFailure(new Error(`Failed to run git ${args.join(' ')}: ${message}`));
		});
	});
}

