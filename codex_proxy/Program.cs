using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

class Program
{
    static int Main(string[] args)
    {
        // 実行開始時刻を計測
        var start = Stopwatch.StartNew();

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
        string promptJa = "このリポジトリで、gitでステージングされていればステージング対象のみ、されていなければ「次に行う予定のコミット」を対象として、日本語でConventional Commits（type[scope]: subject を先頭、必要なら本文/フッター可）に則ったコミットメッセージを考案し、出力は『■★■★■』→改行→メッセージ→改行→『▲★▲★▲』のみに限定（前置き・後置き・見出し・注釈・コードブロック・引用・余計な文字列は一切禁止）、コミット実行やファイル作成・編集は行わず、git系以外のコマンドは実行せず、コミットメッセージ以外は何も出力しないでください。";
        string promptEn = "In this repository, generate an English commit message that strictly conforms to the Conventional Commits specification—beginning with “type[scope]: subject” and, only if necessary, including a body and/or footer—targeting exclusively the staged changes when any files are staged, or otherwise targeting what would be included in the next intended commit, and produce output consisting only of the exact three-line sequence: the string “■★■★■”, then a newline, then the commit message, then a newline, then the string “▲★▲★▲”, with absolutely no preface, postscript, headings, annotations, code blocks, quotations, or any other extraneous characters, and do not execute a commit, do not create or edit files, do not run any non-git commands, and output nothing other than the commit message wrapped exactly as specified.";

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


        // タイムアウトメッセージ（40秒経過時）
        string timeoutMessage = lang == "en"
            ? "No response from AI within 40 seconds. Forcing termination."
            : "AIからの返答が無いため処理を強制終了します";

        System.Threading.Timer killTimer = null;
        Process process = null;


        try
        {
            process = Process.Start(psi);
            if (process == null)
            {
                Console.Error.WriteLine(lang == "en" ? "Could not start the process." : "プロセスを開始できませんでした。");
                return 1;
            }

            // 実行開始からの経過に応じて40秒までの残り時間でタイマー開始
            int due = (int)Math.Max(0, 40000 - start.ElapsedMilliseconds);
            killTimer = new Timer(_ =>
            {
                try
                {
                    Console.Error.WriteLine(timeoutMessage);
                    try
                    {
                        if (process != null && !process.HasExited)
                        {
                            process.Kill();
                        }
                    }
                    catch { /* 例外は無視 */ }
                }
                finally
                {
                    Environment.Exit(1);
                }
            }, null, due, Timeout.Infinite);

            process.OutputDataReceived += (s, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
            process.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();

            // 正常終了時はタイマーを破棄
            killTimer?.Dispose();
            return process.ExitCode;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine((lang == "en" ? "Startup error: " : "起動時エラー: ") + ex.Message);
            return 1;
        }
        finally
        {
            killTimer?.Dispose();
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