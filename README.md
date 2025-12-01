[Japanese README](README.ja.md)

[![Version](https://img.shields.io/badge/version-v0.3.9-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10|11](https://img.shields.io/badge/Windows-_10_|_11-6479ff.svg?logo=windows&logoColor=white) ![macOS 13+](https://img.shields.io/badge/macOS-13%2B-000000.svg?logo=apple&logoColor=white)

# Commit Message Generator (by Codex)

VSCode extension that automatically generates a Conventional Commits-style commit message from your repository changes and inserts it into the Source Control input box.  
It can be used in any environment where Codex runs.  
It’s also handy in environments where GitHub Copilot is not available.

## Usage

- From the UI (recommended)
  - A button is added to the Source Control view title bar and near the commit input box. Click it to run “Commit message generation by codex.”
  - It appears when the Git provider is active.  
  [![Commit Input Box Button](images/button.png)](images/button.png)
  - While generating, the status bar shows “$(sync~spin) Generating commit message…” and it disappears automatically when finished.  
  [![Commit StatusBar](images/statusbar.png)](images/statusbar.png)
- From the Command Palette
  - Press `Ctrl+Shift+P` and type “Commit message generation by codex”.
  - Or run “Commit message generation by codex” (`commit-message-gene-by-codex.runCodexCmd`) directly.
  - When finished, the generated message is inserted into the commit input box. You can check the execution log in the Output panel “codex exec output”.

## Requirements

- Windows 10/11 or macOS (Git extension enabled in VSCode)
- Source Control (SCM) view is open
- Codex CLI installed globally and reachable on your PATH  
  - Windows: `%APPDATA%\npm\codex.cmd` (launched via `cmd.exe`)  
  - macOS: Homebrew installs under `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel); the extension patches PATH to include these so VSCode can find `codex` and `git`

## Notes

- Privacy: The extension itself does not send your code externally, but the Codex CLI may send repository context to its provider depending on its settings. Please review Codex’s policies.

## License

MIT License © 2025 komiyamma
