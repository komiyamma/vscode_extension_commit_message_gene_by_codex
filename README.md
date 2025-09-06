# Commit Message Generator (by Codex)

A lightweight VS Code extension that generates a conventional commit message for your current repository by calling a small Windows helper (codex_proxy.exe), which in turn invokes the local codex CLI. Designed for environments where GitHub Copilot is unavailable or when using alternative providers.

## Highlights

- One command to generate a Conventional Commits-style message
- Writes the result into the Git commit input box automatically
	- "Commit message generation command execution" (`commit-mesasge-gene-by-codex.runCodexCmd`)
	- You can find it from the Command Palette (Ctrl+Shift+P) by typing "Commit message generation".

## Requirements
	- Inserted into the Source Control commit message input
	- Saved to `.vscode-commit-message.txt` at the workspace root

- The helper searches `%APPDATA%\npm\codex.cmd` and runs it via `cmd.exe`.
- Make sure you have installed the codex CLI globally so that `codex.cmd` exists there.

```
codex exec "<prompt>" -m "gpt-5" -c model_reasoning_effort="minimal" -c hide_agent_reasoning="true" --dangerously-bypass-approvals-and-sandbox
```
 - The prompt asks Codex to output only the final commit message in Japanese and to wrap the full message between these exact marker lines:
	- Open the Source Control view once and retry.
	- Ensure the built-in Git extension is enabled.
	- Check the Output channel "codex exec output" for errors.

## Usage

2. Run the command:
	- "Commit message generation command execution" (`commit-mesasge-gene-by-codex.runCodexCmd`)
	- You can find it from the Command Palette (Ctrl+Shift+P) by typing "Commit message generation".
3. Watch "codex exec output" in the Output panel as the helper runs.
4. When it finishes, the generated message will be:
	- Inserted into the Source Control commit message input
	- Saved to `.vscode-commit-message.txt` at the workspace root

## How it works

- The extension launches `codex_proxy.exe` (bundled next to the compiled extension) with an `utf8` flag.
- The helper locates `%APPDATA%\npm\codex.cmd` and runs:

	`codex exec "<prompt>" -m "gpt-5" -c model_reasoning_effort="minimal" -c hide_agent_reasoning="true" --dangerously-bypass-approvals-and-sandbox`

- The prompt asks Codex to output only the final commit message in Japanese and to wrap the full message between these exact marker lines:
- The extension reads standard output, extracts text between the markers, saves it to `.vscode-commit-message.txt`, and writes it into the Git commit input box using the Git extension API (fallbacks to `scm.inputBox`).

## Privacy & Data

- The extension itself doesn’t upload your code. However, your local codex CLI may send repository context to its backend provider depending on its configuration. Please review codex’s own privacy and data handling.

## Troubleshooting

- "codex command not found": Ensure `%APPDATA%\npm\codex.cmd` exists and is executable. Reinstall/update the codex CLI globally.
- Nothing appears in the commit box:
	- Open the Source Control view once and retry.
	- Ensure the built-in Git extension is enabled.
	- Check the Output channel "codex exec output" for errors.
- `.vscode-commit-message.txt` not created: Verify workspace has write permission and that the command completed without errors.

## Development

- Build: `npm run compile`
- Watch: `npm run watch`
- Lint: `npm run lint`
- Test scaffolding exists via `@vscode/test-electron`.

Main sources:
- `src/extension.ts` — VS Code activation and command registration
- `codex_proxy/` — Windows helper that shells out to codex

## License

MIT License © 2025 komiyamma
