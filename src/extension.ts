// The module 'vscode' contains the VSCode extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { provider } from './provider';

// 言語判定: VSCode のUI言語が日本語(ja*)かどうか
const isJapanese = (): boolean => {
	const lang = (vscode.env.language || '').toLowerCase();
	return lang === 'ja' || lang.startsWith('ja-');
};

// メッセージ辞書: 日本語/英語（その他言語は英語を既定）
const M = {
	outputChannel: () => (isJapanese() ? 'commit message gene' : 'commit message gene'), // 固有名は共通
	status: {
		generating: () => (isJapanese() ? '$(sync~spin) $(sparkle-filled)コミットメッセージを生成中$(sparkle-filled)' : '$(sync~spin) Generating commit message...'),
		generatingTip: () => (isJapanese() ? 'Commit Message を生成しています' : 'Generating commit message'),
	},
	commitArea: {
		copiedGitApi: () => (isJapanese() ? '[コミットメッセージ欄に転写しました: git API]' : '[Committed message pasted: git API]'),
		copiedScm: () => (isJapanese() ? '[コミットメッセージ欄に転写しました: scm.inputBox]' : '[Committed message pasted: scm.inputBox]'),
		warnNoAccess: () => (isJapanese() ? '[警告] コミットメッセージ欄にアクセスできませんでした' : '[Warn] Could not access commit message box'),
		errorSet: (e: any) => (isJapanese() ? `[エラー] コミットメッセージ設定に失敗: ${e?.message ?? e}` : `[Error] Failed to set commit message: ${e?.message ?? e}`),
		copiedDone: () => (isJapanese() ? '\n[コミットメッセージをコミット入力欄へ転写しました]' : '\n[Commit message pasted into input]'),
    },
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// ワークスペースごとに直近の子プロセスと共有StatusBarItemを保持
	// 後発を優先して先行をキャンセルしつつ、ステータスバーは1つだけ表示する
	const activeRuns = new Map<string, { proc: ChildProcess, runId: number, statusItem: vscode.StatusBarItem }>();
	let runCounter = 0;

	// Windows考慮の確実なKill（まずproc.kill、未終了なら強制Kill）
	const killProcess = (proc: ChildProcess) => {
		try {
			const pid = proc.pid;
			if (!pid) { return; }
			// まずは通常の kill（Windows でも有効）
			try { proc.kill(); } catch { /* noop */ }
			// 少し待っても生きていたら強制終了
			setTimeout(() => {
				try {
					if (proc.exitCode === null) {
						if (process.platform === 'win32') {
							const cp = require('child_process');
							cp.spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
						} else {
							try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
						}
					}
				} catch { /* noop */ }
			}, 200);
		} catch { /* noop */ }
	};

	// 旧プロセスの終了を待つ（最大 timeoutMs）
	const killAndWait = (proc: ChildProcess, timeoutMs = 2000) => new Promise<void>((resolve) => {
		try {
			if (proc.exitCode !== null) { return resolve(); }
			killProcess(proc);
			const onClose = () => resolve();
			proc.once('close', onClose);
			setTimeout(() => {
				try { proc.removeListener('close', onClose); } catch { /* noop */ }
				resolve();
			}, timeoutMs);
		} catch { resolve(); }
	});
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
			output.appendLine(M.commitArea.errorSet(e));
		}
	}

    // 外部プロバイダーバイナリを呼び出し、utf8出力を処理するコマンド
    const disposable = vscode.commands.registerCommand(provider.commandId, async () => {
        const output = vscode.window.createOutputChannel(M.outputChannel());
        // 出力パネルは自動表示しない（必要なときだけ手動で開く）
        // output.show(true);

        const proxyPath = path.join(__dirname, provider.binaryName);
        const localeArg = isJapanese() ? 'ja' : 'en';
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '<no-workspace>';

		// 既存実行があればキャンセル。ステータスバーは再利用（重複表示を防止）
		const prev = activeRuns.get(workspacePath);
		let statusItem: vscode.StatusBarItem | undefined = prev?.statusItem;
		const myRunId = ++runCounter;
		if (!statusItem) {
			statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
		}
		statusItem.text = M.status.generating();
		statusItem.tooltip = M.status.generatingTip();
		statusItem.show();
		if (prev?.proc) {
			// 旧runがclose時に結果処理・ステータス破棄しないよう、最新runIdを差し替え
			activeRuns.set(workspacePath, { proc: prev.proc, runId: myRunId, statusItem });
			await killAndWait(prev.proc, 1500);
		}

		const proc = spawn(proxyPath, ['utf8', localeArg], { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
		activeRuns.set(workspacePath, { proc, runId: myRunId, statusItem });
		let buffer = '';
		// マーカー行を出力チャンネルに表示しないためのヘルパー
		const containsMarker = (line: string) => {
			const s = line.replace(/\s/g, '');
			return s.includes('■★■★■') || s.includes('▲★▲★▲');
		};
		let stdoutRemainder = '';
		let stderrRemainder = '';
		proc.stdout.on('data', (data) => {
			const text = data.toString('utf8');
			// 画面表示はマーカー行を隠す
			const combined = stdoutRemainder + text;
			const parts = combined.split(/\r?\n/);
			stdoutRemainder = parts.pop() ?? '';
			for (const line of parts) {
				if (!containsMarker(line)) {
					output.appendLine(line);
				}
			}
			// commit 抽出用には生データを保持
			buffer += text;
		});
		proc.stderr.on('data', (data) => {
			const text = data.toString('utf8');
			const combined = stderrRemainder + text;
			const parts = combined.split(/\r?\n/);
			stderrRemainder = parts.pop() ?? '';
			for (const line of parts) {
				if (!containsMarker(line)) {
					output.appendLine(line);
				}
			}
		});
        proc.on('error', (err) => {
            const locale = (isJapanese() ? 'ja' : 'en') as 'ja' | 'en';
            output.appendLine(provider.messages.runError(err.message, locale));
            // 最新の実行のみステータスバーを閉じる
            const current = activeRuns.get(workspacePath);
            if (current && current.runId === myRunId) {
                current.statusItem.hide();
                current.statusItem.dispose();
                activeRuns.delete(workspacePath);
            }
        });
        proc.on('close', async (code) => {
            const locale = (isJapanese() ? 'ja' : 'en') as 'ja' | 'en';
            output.appendLine(provider.messages.closed(code, locale));
            // 最新の実行でなければ結果・ステータス処理は破棄
            const current = activeRuns.get(workspacePath);
            if (!current || current.runId !== myRunId) {
                return;
            }
			// 自分が最新なのでステータスを閉じて登録解除
			current.statusItem.hide();
			current.statusItem.dispose();
			activeRuns.delete(workspacePath);
			// 最終行に改行がなかった場合の残余をフラッシュ（必要なら）
			if (stdoutRemainder && !containsMarker(stdoutRemainder)) {
				output.appendLine(stdoutRemainder);
			}
			if (stderrRemainder && !containsMarker(stderrRemainder)) {
				output.appendLine(stderrRemainder);
			}
			// ■★■★■～▲★▲★▲の間の行を抽出
			const lines = buffer.split(/\r?\n/);
			const isMarker = (line: string, marker: string) => line.replace(/\s/g, '') === marker;
			const start = lines.findIndex(line => isMarker(line, '■★■★■'));
			const end = lines.findIndex(line => isMarker(line, '▲★▲★▲'));
			if (start !== -1 && end !== -1 && end > start + 1) {
				const commitLines = lines.slice(start + 1, end);
				const commitMsg = commitLines.join('\n');
				// コミットメッセージ欄へ設定（git API優先、フォールバックあり）
				await setCommitMessage(commitMsg, output);
				output.appendLine(M.commitArea.copiedDone());
			}
		});
	});
    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
