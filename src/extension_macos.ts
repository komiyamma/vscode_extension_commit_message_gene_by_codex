// src/extension_macos.ts
// macOS-specific activation shim.
// macOS 用のアクティベーション処理（環境調整を行う）

import * as vscode from 'vscode';
import { promisify } from 'util';
import * as child_process from 'child_process';
import { activateDefault } from './extension_default';

// Promisify execFile for async/await
// execFile を async/await で使えるようにする
const execFileAsync = promisify(child_process.execFile);

// macOS entry point called from extension.ts
// extension.ts から呼ばれる macOS 専用アクティベーション
export async function activateMacOS(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('commit message gene (macOS)');
	context.subscriptions.push(output);

	// Inform user that macOS adapter is active
	// macOS アダプタが動作していることを出力
	output.appendLine('[macOS] macOS platform detected — applying macOS adapter.');

	try {
		// Patch PATH for VS Code sandbox environment
		// VSCode サンドボックス環境向けに PATH を補正
		await ensurePathForMacOS(output);

		// Ensure git is available
		// git が利用可能か確認
		await ensureGitAvailable(output);

		output.appendLine('[macOS] macOS environment ready.');
	} catch (err) {
		// Error handling if macOS setup fails
		// macOS 初期化に失敗した場合のエラーハンドリング
		const m = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage('[macOS] Initialization failed: ' + m);
		output.appendLine('[macOS] Initialization failed: ' + m);
	}

	// Continue with default logic (shared with Windows/Linux)
	// 以降は通常の処理（Windows/Linux と共通）
	return activateDefault(context);
}

// Ensures PATH contains typical macOS binary locations
// macOS の一般的なバイナリパスを PATH に追加
async function ensurePathForMacOS(output: vscode.OutputChannel) {
	const current = process.env.PATH ?? '';

	const macPaths = [
		'/opt/homebrew/bin',  // Apple Silicon Homebrew
		'/usr/local/bin',     // Intel Homebrew
		'/usr/bin',
		'/bin',
		current,
	];

	process.env.PATH = macPaths.filter(Boolean).join(':');

	// Inform user that PATH was patched
	// PATH を補正したことを出力
	output.appendLine('[macOS] PATH patched.');
}

// Check whether git is installed and reachable
// git がインストールされていて実行可能か確認
async function ensureGitAvailable(output: vscode.OutputChannel) {
	try {
		const { stdout } = await execFileAsync('git', ['--version']);
		output.appendLine('[macOS] git detected: ' + stdout.trim());
	} catch {
		// git missing → user must install Xcode CLT
		// git が無い場合 → Xcode コマンドラインツールのインストールが必要
		output.appendLine('[macOS] ERROR: git not found.');
		vscode.window.showErrorMessage('Install XCode Tools: xcode-select --install');
		throw new Error('git unavailable');
	}
}
