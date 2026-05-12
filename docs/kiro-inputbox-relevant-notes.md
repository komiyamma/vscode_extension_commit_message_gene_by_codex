# Kiro extension inputBox relevant excerpts

Source:

`C:\usr\kiro\resources\app\extensions\kiro.kiro-agent\dist\extension.js`

## Commit message generation uses vscode.git Repository.inputBox

Approx. `extension.js:690512-690543`

```js
async function findRepositoryAndInputBox(scm2) {
  const gitExtension = vscode92.extensions.getExtension("vscode.git");
  if (!gitExtension) {
    vscode92.window.showErrorMessage("Git extension not found");
    return null;
  }
  if (!gitExtension.isActive) await gitExtension.activate();
  const git2 = gitExtension.exports.getAPI(1);
  if (!git2?.repositories?.length) {
    vscode92.window.showErrorMessage("No Git repositories found");
    return null;
  }
  const repositories = git2.repositories;
  if (scm2) {
    const repositoryPath = getRepositoryPath(scm2);
    if (repositoryPath) {
      const matchingRepo = repositories.find((repo) => repo.rootUri.fsPath === repositoryPath);
      if (matchingRepo) {
        return {
          repositoryPath,
          repository: matchingRepo,
          inputBox: matchingRepo.inputBox
        };
      }
    }
  }
  const firstRepo = repositories[0];
  return {
    repositoryPath: firstRepo.rootUri.fsPath,
    repository: firstRepo,
    inputBox: firstRepo.inputBox
  };
}
```

Approx. `extension.js:690606-690609`

```js
await vscode92.commands.executeCommand("workbench.view.scm");
inputBox.value = commitMessage;
await vscode92.commands.executeCommand("workbench.action.focusActiveEditorGroup");
await vscode92.commands.executeCommand("workbench.view.scm");
```

## Kiro also creates its own SourceControl, but hides its inputBox

Approx. `extension.js:696641-696645`

```js
this.rootUri = vscode225.workspace.workspaceFolders?.[0]?.uri;
this.sourceControl = vscode225.scm.createSourceControl("kiro", "Kiro", this.rootUri);
this.sourceControl.inputBox.visible = false;
this.sourceControl.count = 0;
```

This appears to be for Kiro execution/diff display, not Git commit message entry.

## Package manifest enables scm/inputBox proposed contribution

Source:

`C:\usr\kiro\resources\app\extensions\kiro.kiro-agent\package.json`

```json
"enabledApiProposals": [
  "...",
  "contribSourceControlInputBoxMenu",
  "..."
]
```

```json
"menus": {
  "scm/inputBox": [
    {
      "command": "kiroAgent.generateCommitMessage",
      "when": "scmProvider == git"
    }
  ]
}
```

## Current interpretation

Kiro's own hidden `SourceControl("kiro", "Kiro")` is not the commit message input owner.

The commit message input owner used by Kiro's generate command is still the built-in Git extension:

```js
vscode.extensions.getExtension("vscode.git")
  .exports.getAPI(1)
  .repositories[n]
  .inputBox
```

