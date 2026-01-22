import * as vscode from 'vscode';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

// Promisified wrapper for spawning git commands without direct callback usage.
const execFileAsync = promisify(execFile);
// Upper bound for each collected git section to keep prompts within Codex limits.
const MAX_SECTION_LENGTH = 3000;
// Soft cap for git stdout when we stream output to avoid buffer exhaustion.
const GIT_STDOUT_SOFT_LIMIT = 40000;

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

	// Register the command that gathers git context, queries Codex, and updates the SCM input.
	const disposable = vscode.commands.registerCommand('commit-message-gene-by-codex.runCodexCmd', async () => {
		try {
			const workspaceDir = await resolveWorkspaceDirectory();
			if (!workspaceDir) {
				vscode.window.showErrorMessage('No workspace folder is open, so Git context cannot be gathered.');
				return;
			}

			statusSpinner.text = M.status.processing();
			statusSpinner.show();

			const gitContext = await collectGitContext(workspaceDir);

			// Load the ESM-only Codex package dynamically to avoid require() in CommonJS
			const { Codex } = await import('@openai/codex-sdk');
			const codex = new Codex();

			// vscode.window.showInformationMessage(gitContext);

			const prompt = buildPrompt(gitContext);
			const result = await runWithEffortFallback(codex, prompt, workspaceDir);

			let finalMessage = result.finalResponse?.trim();

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
	});

	context.subscriptions.push(disposable);
}

// Safely copy the generated message into the most relevant SCM commit input.
async function setCommitMessage(message: string, output: vscode.OutputChannel, workspaceDir?: string) {
	try {
		// SCMビューをアクティブ化
		await vscode.commands.executeCommand('workbench.view.scm');
		// git拡張のAPIを取り出し（存在すれば）
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
		// フォールバック: scm.inputBox
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

// Locate the repository whose commit input should be updated, prioritising context matches first.
function selectRepositoryForCommit(repos: GitRepositoryLike[], workspaceDir?: string) {
	if (!repos || repos.length === 0) {
		return undefined;
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
// Report failure to both the output channel and a toast without touching SCM text.
function reportError(message: string, output: vscode.OutputChannel) {
	output.appendLine(message);
	vscode.window.showErrorMessage(message);
}

// Fetch and return the Git extension API, activating the extension lazily if needed.
async function getGitApi(): Promise<any | undefined> {
	const gitExt = vscode.extensions.getExtension('vscode.git');
	if (!gitExt) {
		return undefined;
	}
	const exportsAny = gitExt.isActive ? (gitExt.exports as any) : await gitExt.activate();
	return typeof exportsAny?.getAPI === 'function' ? exportsAny.getAPI(1) : exportsAny;
}

// Determine which repository Codex should treat as the working directory.
async function resolveWorkspaceDirectory(): Promise<string | undefined> {
	const gitApi = await getGitApi();
	const repos = (gitApi?.repositories ?? []) as GitRepositoryLike[];
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
async function runGitCommand(args: string[], cwd: string, options?: { softLimit?: number }): Promise<string> {
	if (options?.softLimit) {
		return runGitCommandWithSoftLimit(args, cwd, options.softLimit);
	}
	try {
		const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 * 20 });
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
async function collectGitContext(cwd: string): Promise<string> {
	const gitVersion = await runGitCommand(['--version'], cwd);
	const repoRoot = await runGitCommand(['rev-parse', '--show-toplevel'], cwd);
	const branch = await (async () => {
		try {
			return await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
		} catch (error) {
			const message = toErrorMessage(error);
			if (isHeadMissingError(message)) {
				return 'No commits yet (HEAD not created)';
			}
			throw error;
		}
	})();
	const status = await runGitCommand(['status', '--short', '--branch'], cwd);
	const stagedDiff = await runGitCommand(['diff', '--cached', '--color=never'], cwd, { softLimit: GIT_STDOUT_SOFT_LIMIT });
	let diffSectionTitle = 'Staged diff';
	let diffBody = stagedDiff;
	if (!diffBody) {
		diffSectionTitle = 'Working tree diff (no staged changes)';
		diffBody = await runGitCommand(['diff', '--color=never'], cwd, { softLimit: GIT_STDOUT_SOFT_LIMIT });
	}
	const untrackedFiles = await runGitCommand(['ls-files', '--others', '--exclude-standard'], cwd);
	const recentCommits = await (async () => {
		try {
			return await runGitCommand(['log', '--oneline', '-5'], cwd);
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
const DEFAULT_INTRO_EN = [
	'You are an assistant that drafts commit messages using the provided Git information.',
	'All required Git data has already been collected below. Do not run additional git commands.',
	'Follow the Conventional Commits style (type(scope?): subject) for the summary line and add a body only if it helps explain the change. Write the message in English. Do not use Markdown syntax; write in plain text.',
	'Return only the final commit message proposal.'
];

const DEFAULT_INTRO_JA = [
	'あなたは収集されたGit情報でコミットメッセージを作成するアシスタントです。',
	'必要なGitデータはすべて下に用意済みです。追加のgitコマンドは実行しないでください。',
	'サマリー行はConventional Commitsスタイル（type(scope?): subject）に従い、必要な場合のみ本文を追加してください。コミットメッセージは日本語で記述してください。Markdown表記は使わずプレーンなテキストで記述してください。',
	'最終的なコミットメッセージ案だけを返してください。'
];

function buildPrompt(gitContext: string): string {
	const config = vscode.workspace.getConfiguration();
	const japanese = isJapanese();
	const configKey = japanese ? 'commitMessageGene.prompt.intro.ja' : 'commitMessageGene.prompt.intro.en';
	const defaultIntro = japanese ? DEFAULT_INTRO_JA : DEFAULT_INTRO_EN;
	const configuredIntro = config.get<string[]>(configKey);
	const resolvedIntro = Array.isArray(configuredIntro)
		? configuredIntro
			.map((line) => (typeof line === 'string' ? line.trim() : ''))
			.filter((line) => line.length > 0)
		: [];
	const introLines = resolvedIntro.length > 0 ? resolvedIntro : defaultIntro;

	return [...introLines, gitContext].join('\n\n');
}

async function runWithEffortFallback(codex: any, prompt: string, workspaceDir: string) {
	const baseOpts = {
		model: 'gpt-5.1-codex-mini',
		workingDirectory: workspaceDir,
		skipGitRepoCheck: true,
		modelReasoningEffort: "low" // minimal/low/medium/high and xhigh(=over 5.2) 
	} as const;

	try {
		const t1 = codex.startThread(baseOpts);
		return await t1.run(prompt);
	} catch (e: any) {
		const msg = (e?.message ?? String(e)).toLowerCase();
		const isEffortXhighError =
			msg.includes('param') &&
			msg.includes('reasoning.effort') &&
			msg.includes('xhigh') &&
			(msg.includes('unsupported_value') || msg.includes('unsupported value'));

		if (!isEffortXhighError) {
			throw e;
		}

		const t2 = codex.startThread({ ...baseOpts, modelReasoningEffort: 'medium' });
		return await t2.run(prompt);
	}
}
// Stream git stdout while enforcing a soft character limit to prevent buffer overruns.
async function runGitCommandWithSoftLimit(args: string[], cwd: string, limit: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('git', args, { cwd });
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

