# Change Log

## 0.3.13

- Added a plain-text instruction to the default Codex intro prompts to avoid Markdown formatting in generated commit messages.

## 0.3.12

- Strip surrounding bold markers when the generated commit message is wrapped in `**`.

## 0.3.11

- Adjusted commit message cleaning logic to trim whitespace inside backticks when removing them.

## 0.3.10

- Removed leading and trailing backticks from the generated commit message if present.

## 0.3.9

- Update Codex threads to the `gpt-5.1-codex-mini` model so message generation keeps working with the renamed AI Model.
- Upgrade to `@openai/codex-sdk` 0.58.0 to stay compatible with the latest SDK release.

## 0.3.7

- Explicitly pin Codex threads to the `gpt5-codex-mini` model.

## 0.3.6

- Added configuration settings so the English and Japanese Codex intro prompts can be customized from VS Code.
- Updated the prompt builder to read the configured paragraphs, trim blank lines, and fall back to the bundled defaults when unset.

## 0.3.5

- Eliminated specification of specific AI models.

## 0.3.4

- Improved commit message generation error handling so failures in Codex or invalid messages surface clear guidance.
- Added smarter repository selection that respects the active workspace when choosing where to insert the commit message.
- Applied soft output limits and richer error reporting to Git commands to prevent buffer overrun issues.

## 0.3.3

- Listed under the "SCM Providers" category in the Marketplace so the extension is easier to find.

## 0.3.2

- Due to the large file size, this is only available for Windows.

## 0.3.1

- Because the file size was too large, only major platform & CPU combinations were used.

## 0.3.0

- Rebuilt commit message generation around the official `@openai/codex-sdk`, gathering repository Git context inside the extension so the separate `codex_proxy` helper is no longer required.
- This is the first step towards making it work not only on Windows, but also on MacOS and Linux.


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
