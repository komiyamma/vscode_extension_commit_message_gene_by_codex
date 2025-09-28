# Change Log

## 0.2.5

- Switch the Codex helper to the `gpt-5-codex` model so commit message generation keeps working with the latest API.

## 0.2.4

- Improved process shutdown handling when multiple comment generations are triggered concurrently.

## 0.2.3

- Timeout if no message is generated within 40 seconds.

## 0.2.2

- Extracted Codex-dependent parts into separate files and unified the source between the Codex and Gemini CLI versions to improve maintainability.

## 0.2.1

- If the command is run again while a message is being generated, the previous generation is canceled.

## 0.1.9

- Readme.md has been made more concise and content has been redesigned.

## 0.1.8

- Added UI images to readme.md

## 0.1.6

- Add buttons to run the command in Source Control (commit input box toolbar and Source Control title bar)
- Docs: explain button locations and status bar spinner; align EN/JA README
- Manifest/Menus polish: command icon, activation event, schema fixes

## 0.1.4

- Changed the command name in the Command Palette to "Commit message generation by codex" for better clarity.

## 0.1.3

- Fixed a problem where commit messages were prone to errors when the display language was English.

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

- Initial release of the VSCode extension "commit-message-gene-by-codex".
- Added the command: "Commit message generation command execution" (`commit-message-gene-by-codex.runCodexCmd`).
- Generates Conventional Commits style messages by calling the local `codex` CLI through a small Windows helper (`codex_proxy.exe`).
- Automatically inserts the generated message into the Source Control commit input box and saves it to `.vscode-commit-message.txt` at the root of the workspace.
- Provides a "codex exec output" output channel for diagnostics.
