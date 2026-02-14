import { spawn } from 'node:child_process';

export const runCommand = ({ command, cwd, env, onLine }) =>
  new Promise((resolve, reject) => {
    const shell = process.platform === 'win32' ? 'cmd' : 'bash';
    const args = process.platform === 'win32' ? ['/c', command] : ['-lc', command];

    const proc = spawn(shell, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLine?.(text, 'stdout');
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLine?.(text, 'stderr');
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const error = new Error(
          `Command failed with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`
        );
        error.code = code;
        reject(error);
      }
    });
  });
