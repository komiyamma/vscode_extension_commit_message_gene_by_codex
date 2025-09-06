
# Change Log

## 0.1.2

- Handle cases where the installation path of npm -g is non-standard.
- When staging, I made it so that messages are created only for the set of files being staged

## 0.1.1

- Support for Japanese and English

## 0.0.20

- Fixed the badge version number.

## 0.0.19

- Fixed an incorrect link to the Marketplace.

## 0.0.18

- Initial release of the VS Code extension "commit-message-gene-by-codex".
- Added the command: "Commit message generation command execution" (`commit-message-gene-by-codex.runCodexCmd`).
- Generates Conventional Commits style messages by calling the local `codex` CLI through a small Windows helper (`codex_proxy.exe`).
- Automatically inserts the generated message into the Source Control commit input box and saves it to `.vscode-commit-message.txt` at the root of the workspace.
- Provides a "codex exec output" output channel for diagnostics.

