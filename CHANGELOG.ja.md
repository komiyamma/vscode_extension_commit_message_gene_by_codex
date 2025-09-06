# Change Log

この拡張機能 "commit-mesasge-gene-by-codex" のすべての重要な変更はこのファイルに記録します。

本プロジェクトは Keep a Changelog と Semantic Versioning に従います。

- Keep a Changelog: <https://keepachangelog.com/ja/1.1.0/>
- Semantic Versioning: <https://semver.org/spec/v2.0.0.html>

## [未リリース]

### 削除

- `.vscode-commit-message.txt` への書き出しを停止。生成メッセージはコミット入力欄への挿入のみとなりました。

## [0.0.18] - 2025-09-06

### 追加

- VS Code 拡張機能 "commit-mesasge-gene-by-codex" の初回リリース。
- コマンド: "Commit message generation command execution" (`commit-mesasge-gene-by-codex.runCodexCmd`).
- 小さな Windows ヘルパー (`codex_proxy.exe`) を介してローカルの `codex` CLI を呼び出し、Conventional Commits 形式のメッセージを生成。
- 生成メッセージをソース管理のコミット入力欄へ自動挿入し、ワークスペース直下の `.vscode-commit-message.txt` に保存。
- 診断用に "codex exec output" 出力チャンネルを提供。

### 注意

- Windows では `%APPDATA%\npm\codex.cmd` にグローバルインストールされた `codex` CLI が必要です。
- 対応 VS Code バージョン: `^1.103.0`。

[未リリース]: https://github.com/komiyamma/vscode_extension_commit_mesasge_gene_by_codex/compare/v0.0.18...HEAD
[0.0.18]: https://github.com/komiyamma/vscode_extension_commit_mesasge_gene_by_codex/releases/tag/v0.0.18
