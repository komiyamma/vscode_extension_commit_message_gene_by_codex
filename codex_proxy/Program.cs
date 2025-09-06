using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class Program
{
    static int Main(string[] args)
    {
        // 第1引数が"utf8"なら出力をUTF-8に設定（.NET Framework 4.8ではConsole.OutputEncodingのみ対応)
        if (args.Length > 0 && args[0] == "utf8")
        {
            Console.OutputEncoding = Encoding.UTF8;
        }

        // 第2引数で言語切り替え（"en" または "ja"、デフォルトは "ja"）
        string lang = "ja";
        if (args.Length > 1)
        {
            if (args[1] == "en") lang = "en";
            else if (args[1] == "ja") lang = "ja";
        }

        // codex 実行ファイルのパスを探索
        string codexPath = FindCodexCmdPath();

        // ローカライズされたエラーメッセージ（見つからない場合)
        string notFoundMessage = lang == "en"
            ? "codex command was not found. Ensure it is installed globally (e.g., via 'npm i -g'). Check your npm global prefix with 'npm config get prefix'."
            : "codex コマンドが見つかりませんでした。グローバルインストール（例: 'npm i -g'）されているか確認し、'npm config get prefix' で npm のグローバル prefix を確認してください。";

        if (string.IsNullOrEmpty(codexPath) || !File.Exists(codexPath))
        {
            Console.Error.WriteLine(notFoundMessage);
            return 1;
        }

        // promptの日本語・英語バージョン
        string promptJa = "このリポジトリで「gitでステージングされている場合は、ステージングされたもののみを対象としたコミットメッセージを考案してください。」、ステージングされていない場合は、「次に行う予定のコミット」のメッセージを日本語で作成してください。いずれの場合でも「コミットは実行はしません、文面のみ考案してください」。但し、。コミットメッセージは、最初に Conventional Commits に則って記述してください。最終返答だけを表示してください。ファイルの作成や編集は絶対に行わないこと。git系以外はコマンド実行しないこと。「コミットメッセージ全体の開始位置」に■★■★■と改行を、「コミットメッセージ全体の終了位置」に改行＋▲★▲★▲＋改行を付けてください。";
        string promptEn = "In this repository, if there are files staged in git, you must create a commit message in English that refers strictly and exclusively to the staged content and nothing else, and if there are no files staged in git, you must instead create a commit message in English that refers strictly and exclusively to the next commit that is planned, and in both of these cases you must not execute an actual commit under any circumstances but only generate the commit message text itself, and you must always begin the commit message by following the Conventional Commits specification, and you must display only the final response consisting of the commit message text itself, and you must never create, edit, or delete any files, and you must never run any command other than what is required for generating the commit message, and you must never run any non-git commands, and furthermore you must place the exact marker ■★■★■ followed by a line break at the very beginning of the commit message, and you must place a line break followed by the exact marker ▲★▲★▲ followed by another line break at the very end of the commit message, and you must always ensure that these markers appear exactly as written to surround the entire commit message.";

        // 言語に応じた prompt を選択
        string prompt = lang == "en" ? promptEn : promptJa;

        string safePrompt = prompt.Replace("\"", "'");
        string arguments = $"exec \"{safePrompt}\" -m \"gpt-5\" -c model_reasoning_effort=\"minimal\" -c hide_agent_reasoning=\"true\" --dangerously-bypass-approvals-and-sandbox";

        string cmdArguments = $"/c \"\"{codexPath}\" {arguments}\"";
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = cmdArguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            CreateNoWindow = true
        };

        try
        {
            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    Console.Error.WriteLine(lang == "en" ? "Could not start the process." : "プロセスを開始できませんでした。");
                    return 1;
                }

                process.OutputDataReceived += (s, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
                process.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine((lang == "en" ? "Startup error: " : "起動時エラー: ") + ex.Message);
            return 1;
        }
    }

    // codex.cmd の探索ロジック（Windows/.NET Framework 4.8 を想定）
    private static string FindCodexCmdPath()
    {
        // 1) npm config get prefix の出力を利用し、<prefix>\codex.cmd のみを見る
        string prefix = TryReadStdout("cmd.exe", "/c npm config get prefix");
        prefix = NormalizeLine(prefix);
        if (!string.IsNullOrEmpty(prefix))
        {
            string candidate = Path.Combine(prefix, "codex.cmd");
            if (File.Exists(candidate)) return candidate;
        }

        // 2) フォールバック %APPDATA%\npm\codex.cmd
        string appdata = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string fallback = Path.Combine(appdata, "npm", "codex.cmd");
        if (File.Exists(fallback)) return fallback;

        return null;
    }

    private static string TryReadStdout(string fileName, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8
            };
            using (var p = Process.Start(psi))
            {
                if (p == null) return null;
                string stdout = p.StandardOutput.ReadToEnd();
                p.WaitForExit();
                return stdout;
            }
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeLine(string s)
    {
        if (string.IsNullOrEmpty(s)) return s;
        string t = s.Trim();
        // 1行目のみを使う
        int i = t.IndexOf('\n');
        if (i >= 0) t = t.Substring(0, i).Trim();
        // 余計な引用符を削除
        if (t.Length >= 2 && t[0] == '"' && t[t.Length - 1] == '"')
        {
            t = t.Substring(1, t.Length - 2);
        }
        return t;
    }
}