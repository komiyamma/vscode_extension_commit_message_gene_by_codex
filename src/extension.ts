import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MAX_SECTION_LENGTH = 3000;

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
};

export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('commit message gene');
	const statusSpinner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
	context.subscriptions.push(output, statusSpinner);

	const disposable = vscode.commands.registerCommand('commit-message-gene-by-codex.runCodexCmd', async () => {
		try {
			const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
			const thread = codex.startThread({
				model: 'gpt-5-codex',
				workingDirectory: workspaceDir,
				skipGitRepoCheck: true,
			});

			// vscode.window.showInformationMessage(gitContext);

			const prompt = buildPrompt(gitContext);
			const result = await thread.run(prompt);
			const finalMessage = result.finalResponse?.trim();
			if (finalMessage) {
				await setCommitMessage(finalMessage, output);
			} else {
				await setCommitMessage('No valid commit message was received from Codex.', output);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await setCommitMessage(message, output);
		} finally {
			statusSpinner.hide();
			statusSpinner.text = '';
		}
	});

	context.subscriptions.push(disposable);
}

// コミットメッセージ欄に安全に設定するヘルパー
async function setCommitMessage(message: string, output: vscode.OutputChannel) {
	try {
		// SCMビューをアクティブ化
		await vscode.commands.executeCommand('workbench.view.scm');
		// git拡張のAPIを取り出し（存在すれば）
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (gitExt) {
			const exportsAny = gitExt.isActive ? (gitExt.exports as any) : await gitExt.activate();
			// GitExtension 形式なら getAPI(1) で取得、既にAPIの場合はそのまま利用
			const gitApi = typeof exportsAny?.getAPI === 'function' ? exportsAny.getAPI(1) : exportsAny;
			// 最初のリポジトリのinputBoxがあればそこに設定
			const repos = (gitApi?.repositories ?? []) as any[];
			if (repos.length > 0 && repos[0]?.inputBox) {
				repos[0].inputBox.value = message;
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

async function runGitCommand(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 * 20 });
		return stdout.trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return `Failed to run git ${args.join(' ')}: ${message}`;
	}
}

async function collectGitContext(cwd: string): Promise<string> {
	const gitVersion = await runGitCommand(['--version'], cwd);
	const repoRoot = await runGitCommand(['rev-parse', '--show-toplevel'], cwd);
	const branch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
	const status = await runGitCommand(['status', '--short', '--branch'], cwd);
	const stagedDiff = await runGitCommand(['diff', '--cached'], cwd);
	const unstagedDiff = await runGitCommand(['diff'], cwd);
	const untrackedFiles = await runGitCommand(['ls-files', '--others', '--exclude-standard'], cwd);
	const recentCommits = await runGitCommand(['log', '--oneline', '-5'], cwd);

	return [
		formatSection('Git version', gitVersion),
		formatSection('Repository root', repoRoot),
		formatSection('Current branch', branch),
		formatSection('Status (--short --branch)', status),
		formatSection('Staged diff', stagedDiff),
		formatSection('Unstaged diff', unstagedDiff),
		formatSection('Untracked files', untrackedFiles),
		formatSection('Recent commits', recentCommits),
	].join('\n\n');
}

function formatSection(title: string, body: string): string {
	const safeBody = truncateForPrompt(body || 'N/A', MAX_SECTION_LENGTH);
	return `### ${title}\n${safeBody}`;
}

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

function buildPrompt(gitContext: string): string {
	if (!isJapanese()) {
		return [
			'You are an assistant that drafts commit messages using the provided Git information.',
			'All required Git data has already been collected below. Do not run additional git commands.',
			gitContext,
			'Follow the Conventional Commits style (type(scope?): subject) for the summary line and add a body only if it helps explain the change. Write the message in English.',
			'Return only the final commit message proposal.'
		].join('\n\n');
	}

	return [
		'あなたは提供されたGit情報を使ってコミットメッセージを作成するアシスタントです。',
		'必要なGitデータはすべて以下に収集済みです。追加のgitコマンドを実行しないでください。',
		gitContext,
		'サマリー行はConventional Commitsスタイル（type(scope?): subject）に従い、必要な場合のみ本文を追加してください。コミットメッセージは日本語で記述してください。',
		'最終的なコミットメッセージ案のみを返してください。'
	].join('\n\n');
}

