import { execFile } from 'node:child_process';

// Spawns a Python CLI script with an argv array (never a shell string) so no
// argument — including a DB-sourced file path — can be interpreted as shell
// syntax. Scripts under worker/ (see error-handling.md's worker contract)
// print exactly one JSON line and may still exit non-zero on an expected,
// reported failure (e.g. {ok: false, code, reason}); callers parse that body
// instead of treating every non-zero exit as a crash. Only a truly broken
// invocation (missing interpreter, missing script) has no stdout to fall
// back on and rejects here.
export function runPythonScript(
  pythonBin: string,
  scriptPath: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      pythonBin,
      [scriptPath, ...args],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout.trim()) {
          reject(new Error(error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}
