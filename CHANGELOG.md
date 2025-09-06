# Change Log

All notable changes to the "commit-mesasge-gene-by-codex" extension will be documented in this file.

This project follows Keep a Changelog and Semantic Versioning.

- Keep a Changelog: <https://keepachangelog.com/en/1.1.0/>
- Semantic Versioning: <https://semver.org/spec/v2.0.0.html>

## [Unreleased]

### Removed

- Stop writing `.vscode-commit-message.txt`. The extension now only inserts the generated message into the Source Control commit input.

## [0.0.18] - 2025-09-06

### Added

- Initial release of the VS Code extension "commit-mesasge-gene-by-codex".
- Command: "Commit message generation command execution" (`commit-mesasge-gene-by-codex.runCodexCmd`).
- Generates Conventional Commits-style messages via a small Windows helper (`codex_proxy.exe`) that shells out to the local `codex` CLI.
- Automatically inserts the generated message into the Source Control commit input and saves it to `.vscode-commit-message.txt` at the workspace root.
- Output channel "codex exec output" for diagnostics.

### Notes

- Requires `codex` CLI to be installed globally at `%APPDATA%\npm\codex.cmd` (Windows).
- Targets VS Code `^1.103.0`.

[Unreleased]: https://github.com/komiyamma/vscode_extension_commit_mesasge_gene_by_codex/compare/v0.0.18...HEAD
[0.0.18]: https://github.com/komiyamma/vscode_extension_commit_mesasge_gene_by_codex/releases/tag/v0.0.18
