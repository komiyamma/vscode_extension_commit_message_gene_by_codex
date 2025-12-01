// src/extension_default.ts
// Default activation logic for Linux/Windows environments
// Linux/Windows 用のデフォルトアクティベーションロジック

import * as vscode from 'vscode';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

// Promisify execFile for async/await use
// execFile を async/await で使うために promisify
const execFileAsync = promisify(execFile);

// Max section size to keep Codex prompt short
// Codex に渡すテキスト量を制限する最大サイズ
const MAX_SECTION_LENGTH = 3000;

// Soft limit for Git streaming output
// Git 出力のソフト上限
const GIT_STDOUT_SOFT_LIMIT = 40000;

// Minimal Git repository type for interacting with VSCode Git API
// VSCode Git API とやり取りするための簡易型
type GitRepositoryLike = {
	rootUri?: vscode.Uri;
	inputBox?: { value: string };
	ui?: { selected?: boolean };
};

// Localized messages (EN/JA)
// メッセージ（英語 / 日本語）
const M = {
	status: {
		processing: () =>
			isJapanese()
				? '$(sync~spin) Commit Message を生成しています...'
				: '$(sync~spin) Generating commit message...',
	},
	commitArea: {
		copiedGitApi: () =>
			isJapanese()
				? 'Git API 経由でコミットメッセージをコピーしました。'
				: 'Copied commit message via Git API.',
		copiedScm: () =>
			isJapanese()
				? 'SCM inputBox にコミットメッセージをコピーしました。'
				: 'Copied commit message to SCM input box.',
		warnNoAccess: () =>
			isJapanese()
				? 'コミットメッセージ欄にアクセスできませんでした。'
				: 'Unable to access commit message input.',
		errorSet: (e: string) =>
			isJapanese()
				? `コミットメッセージの設定に失敗しました: ${e}`
				: `Failed to set commit message: ${e}`,
	},
	errors: {
		noResult: () =>
			isJapanese()
				? 'Codex から有効なコミットメッセージを受信できませんでした。'
				: 'No valid commit message was received from Codex.',
		failed: (e: string) =>
			isJapanese()
				? `Codex の実行に失敗しました: ${e}`
				: `Failed to run Codex: ${e}`,
	},
};

// Default activation for platforms other than macOS
// macOS 以外のプラットフォームで使用されるデフォルトアクティベーション
export async function activateDefault(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('commit message gene');
	const statusSpinner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
	context.subscriptions.push(output, statusSpinner);

	// Main command: generate commit message using Codex
	// メインコマンド：Codex を使ってコミットメッセージ生成
	const disposable = vscode.commands.registerCommand(
		'commit-message-gene-by-codex.runCodexCmd',
		async () => {
			try {
				const workspaceDir = await resolveWorkspaceDirectory();
				if (!workspaceDir) {
					vscode.window.showErrorMessage(
						'No workspace folder is open, so Git context cannot be gathered.'
					);
					return;
				}

				statusSpinner.text = M.status.processing();
				statusSpinner.show();

				// Collect Git data used as Codex input
				// Codex への入力となる Git 情報を収集
				const gitContext = await collectGitContext(workspaceDir);

				// Codex SDK dynamic import (ESM)
				// Codex SDK の動的インポート（ESM）
				const { Codex } = await import('@openai/codex-sdk');
				const codex = new Codex();
				const thread = codex.startThread({
					model: 'gpt-5.1-codex-mini',
					workingDirectory: workspaceDir,
					skipGitRepoCheck: true,
				});

				const prompt = buildPrompt(gitContext);
				const result = await thread.run(prompt);
				const finalMessage = result.finalResponse?.trim();

				if (finalMessage) {
					await setCommitMessage(finalMessage, output, workspaceDir);
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
		}
	);

	context.subscriptions.push(disposable);
}

// Insert generated commit message into SCM input
// 生成したコミットメッセージを SCM 入力欄へ挿入
async function setCommitMessage(message: string, output: vscode.OutputChannel, workspaceDir?: string) {
	try {
		// Open SCM panel
		// SCM パネルを開く
		await vscode.commands.executeCommand('workbench.view.scm');

		// Try Git API first
		// まず Git API を試す
		const gitApi = await getGitApi();
		if (gitApi) {
			const repos = (gitApi.repositories ?? []) as GitRepositoryLike[];
			const targetRepo = selectRepositoryForCommit(repos, workspaceDir);
			if (targetRepo?.inputBox) {
				targetRepo.inputBox.value = message;
				output.appendLine(M.commitArea.copiedGitApi());
				return;
			}
		}

		// Fallback: direct SCM inputBox
		// フォールバック：SCM inputBox を直接使用
		const scmAny = vscode.scm as any;
		if (scmAny && scmAny.inputBox) {
			scmAny.inputBox.value = message;
			output.appendLine(M.commitArea.copiedScm());
			return;
		}

		output.appendLine(M.commitArea.warnNoAccess());
	} catch (e: any) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		output.appendLine(M.commitArea.errorSet(errorMessage));
	}
}

// Select proper repository when multiple repos exist
// 複数リポジトリが存在する場合に適切なものを選択
function selectRepositoryForCommit(repos: GitRepositoryLike[], workspaceDir?: string) {
	if (!repos || repos.length === 0) return undefined;

	// Prefer the repo matching workspace path
	// ワークスペースのパスに一致するリポジトリを優先
	if (workspaceDir) {
		const byContext = findRepoByFsPath(repos, workspaceDir);
		if (byContext) return byContext;
	}

	// Fallback to selected repository
	// 選択されているリポジトリを使用
	const selected = repos.find(repo => repo?.ui?.selected);
	if (selected) return selected;

	// Fallback to repo owning active editor
	// アクティブエディタが属するリポジトリ
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (activeFolder?.uri?.fsPath) {
			const byActive = findRepoByFsPath(repos, activeFolder.uri.fsPath);
			if (byActive) return byActive;
		}
	}

	// Final fallback
	// 最後のフォールバック
	return repos[0];
}

// Normalize filesystem paths (Windows lowercase)
// ファイルパスを正規化（Windows は小文字化）
function normalizeFsPath(fsPath: string): string {
	const normalized = path.normalize(fsPath);
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

// Find repository by filesystem path
// ファイルパスでリポジトリを検索
function findRepoByFsPath(repos: GitRepositoryLike[], targetFsPath: string) {
	const normalizedTarget = normalizeFsPath(targetFsPath);
	return repos.find(
		repo => repo?.rootUri?.fsPath && normalizeFsPath(repo.rootUri.fsPath) === normalizedTarget
	);
}

// Show errors in Output + toast
// エラーを Output と通知に表示
function reportError(message: string, output: vscode.OutputChannel) {
	output.appendLine(message);
	vscode.window.showErrorMessage(message);
}

// Retrieve VSCode Git API
// VSCode Git API を取得
async function getGitApi(): Promise<any | undefined> {
	const gitExt = vscode.extensions.getExtension('vscode.git');
	if (!gitExt) return undefined;

	const exportsAny = gitExt.isActive ? (gitExt.exports as any) : await gitExt.activate();
	return typeof exportsAny?.getAPI === 'function' ? exportsAny.getAPI(1) : exportsAny;
}

// Determine workspace directory for git operations
// Git 操作用のワークスペースディレクトリを決定
async function resolveWorkspaceDirectory(): Promise<string | undefined> {
	const gitApi = await getGitApi();
	const repos = (gitApi?.repositories ?? []) as GitRepositoryLike[];

	const selectedRepo = repos.find(repo => repo?.ui?.selected);
	if (selectedRepo?.rootUri?.fsPath) return selectedRepo.rootUri.fsPath;

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const containingWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
		if (containingWorkspace?.uri?.fsPath) return containingWorkspace.uri.fsPath;
	}

	if (repos.length > 0 && repos[0]?.rootUri?.fsPath) return repos[0].rootUri.fsPath;

	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Execute Git command safely
// Git コマンドを安全に実行
async function runGitCommand(
	args: string[],
	cwd: string,
	options?: { softLimit?: number }
): Promise<string> {
	if (options?.softLimit) {
		return runGitCommandWithSoftLimit(args, cwd, options.softLimit);
	}
	try {
		const { stdout } = await execFileAsync('git', args, {
			cwd,
			maxBuffer: 1024 * 1024 * 20,
		});
		return stdout.trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to run git ${args.join(' ')}: ${message}`);
	}
}

// Check if HEAD exists
// HEAD が存在しない場合の判定
function isHeadMissingError(message: string): boolean {
	return (
		/ambiguous argument 'HEAD'/i.test(message) ||
		/unknown revision/i.test(message) ||
		/does not have any commits yet/i.test(message)
	);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Collect Git information for Codex prompt
// Codex プロンプト用の Git 情報を収集
async function collectGitContext(cwd: string): Promise<string> {
	const gitVersion = await runGitCommand(['--version'], cwd);
	const repoRoot = await runGitCommand(['rev-parse', '--show-toplevel'], cwd);

	const branch = await (async () => {
		try {
			return await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
		} catch (error) {
			const message = toErrorMessage(error);
			if (isHeadMissingError(message)) return 'No commits yet (HEAD not created)';
			throw error;
		}
	})();

	const status = await runGitCommand(['status', '--short', '--branch'], cwd);

	const stagedDiff = await runGitCommand(['diff', '--cached', '--color=never'], cwd, {
		softLimit: GIT_STDOUT_SOFT_LIMIT,
	});

	let diffSectionTitle = 'Staged diff';
	let diffBody = stagedDiff;

	// If no staged changes, use working tree diff
	// ステージされていない場合、作業ツリーディフを使用
	if (!diffBody) {
		diffSectionTitle = 'Working tree diff (no staged changes)';
		diffBody = await runGitCommand(['diff', '--color=never'], cwd, {
			softLimit: GIT_STDOUT_SOFT_LIMIT,
		});
	}

	const untrackedFiles = await runGitCommand(['ls-files', '--others', '--exclude-standard'], cwd);

	const recentCommits = await (async () => {
		try {
			return await runGitCommand(['log', '--oneline', '-5'], cwd);
		} catch (error) {
			const message = toErrorMessage(error);
			if (isHeadMissingError(message)) return 'No commits yet';
			throw error;
		}
	})();

	// Build structured markdown for Codex
	// Codex 用に Markdown 形式でまとめる
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

// Format section with truncation
// セクションを整形し、必要なら切り捨て
function formatSection(title: string, body: string): string {
	const safeBody = truncateForPrompt(body || 'N/A', MAX_SECTION_LENGTH);
	return `### ${title}\n${safeBody}`;
}

// Truncate long text for prompt safety
// プロンプトが長くなりすぎないよう切り捨て
function truncateForPrompt(text: string, limit: number): string {
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n... (truncated to ${limit} chars)`;
}

// Determine language from VS Code UI
// VSCode の UI 言語から日本語判定
function isJapanese(): boolean {
	const lang = (vscode.env.language || '').toLowerCase();
	return lang === 'ja' || lang.startsWith('ja-');
}

// Default prompt templates (EN/JA)
// デフォルトプロンプト（英語 / 日本語）
const DEFAULT_INTRO_EN = [
	'You are an assistant that drafts commit messages using the provided Git information.',
	'All required Git data has already been collected below. Do not run additional git commands.',
	'Follow the Conventional Commits style (type(scope?): subject) for the summary line and add a body only if it helps explain the change. Write the message in English.',
	'Return only the final commit message proposal.',
];

const DEFAULT_INTRO_JA = [
	'あなたは収集されたGit情報でコミットメッセージを作成するアシスタントです。',
	'必要なGitデータはすべて下に用意済みです。追加のgitコマンドは実行しないでください。',
	'サマリー行はConventional Commitsスタイル（type(scope?): subject）に従い、必要な場合のみ本文を追加してください。',
	'コミットメッセージは日本語で記述してください。',
	'最終的なコミットメッセージ案だけを返してください。',
];

// Build final prompt passed to Codex
// Codex に渡す最終プロンプトを構築
function buildPrompt(gitContext: string): string {
	const config = vscode.workspace.getConfiguration();
	const japanese = isJapanese();
	const configKey = japanese
		? 'commitMessageGene.prompt.intro.ja'
		: 'commitMessageGene.prompt.intro.en';
	const defaultIntro = japanese ? DEFAULT_INTRO_JA : DEFAULT_INTRO_EN;

	const configuredIntro = config.get<string[]>(configKey);
	const resolvedIntro = Array.isArray(configuredIntro)
		? configuredIntro
				.map(line => (typeof line === 'string' ? line.trim() : ''))
				.filter(line => line.length > 0)
		: [];

	const introLines = resolvedIntro.length > 0 ? resolvedIntro : defaultIntro;

	return [...introLines, gitContext].join('\n\n');
}

// Execute Git command with streaming and soft limit
// Git コマンドをストリーミングで実行しソフト制限を適用
async function runGitCommandWithSoftLimit(
	args: string[],
	cwd: string,
	limit: number
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('git', args, { cwd });
		let stdout = '';
		let stderr = '';
		let truncated = false;
		let settled = false;

		const finishSuccess = (value: string) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};

		const finishFailure = (error: Error) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		};

		child.stdout.on('data', chunk => {
			if (truncated) return;
			const text = chunk.toString();
			if (stdout.length + text.length > limit) {
				const remaining = Math.max(limit - stdout.length, 0);
				if (remaining > 0) stdout += text.slice(0, remaining);
				truncated = true;
				child.kill('SIGTERM');
			} else {
			stdout += text;
			}
		});

		child.stderr.on('data', chunk => {
			if (!truncated) stderr += chunk.toString();
		});

		child.on('error', err => {
			finishFailure(new Error(`Failed to run git ${args.join(' ')}: ${err}`));
		});

		child.on('close', (code, signal) => {
			if (truncated) {
				resolve(`${stdout.trim()}\n... (truncated to ${limit} chars)`.trim());
				return;
			}
			if (code === 0) {
				resolve(stdout.trim());
				return;
			}
			const message = stderr.trim() || `exit code ${code ?? 'unknown'} signal ${signal ?? ''}`;
			finishFailure(new Error(`Failed to run git ${args.join(' ')}: ${message}`));
		});
	});
}
