# Change Log

## 0.0.19

- マーケットプレイスへのリンクミスの修正

## 0.0.18

- VS Code 拡張機能 "commit-mesasge-gene-by-codex" の初回リリース。
- コマンド: "Commit message generation command execution" (`commit-mesasge-gene-by-codex.runCodexCmd`).
- 小さな Windows ヘルパー (`codex_proxy.exe`) を介してローカルの `codex` CLI を呼び出し、Conventional Commits 形式のメッセージを生成。
- 生成メッセージをソース管理のコミット入力欄へ自動挿入し、ワークスペース直下の `.vscode-commit-message.txt` に保存。
- 診断用に "codex exec output" 出力チャンネルを提供。

