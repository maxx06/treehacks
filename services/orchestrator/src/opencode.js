import fs from 'node:fs';
import { runCommand } from './exec.js';
import { config } from './config.js';

export const runOpenCodeTask = async ({
  sessionId,
  workdir,
  prompt,
  model,
  onLog,
}) => {
  const promptFile = `${workdir}/.agent_prompt`;
  fs.writeFileSync(promptFile, prompt, 'utf8');

  const command = config.openCodeCommandTemplate;
  const env = {
    ...process.env,
    OPENCODE_SESSION_ID: sessionId,
    OPENCODE_WORKDIR: workdir,
    OPENCODE_PROMPT_FILE: promptFile,
    OPENCODE_MODEL: model || 'default',
  };

  await runCommand({
    command,
    cwd: workdir,
    env,
    onLine: (line, stream) => {
      onLog?.(`${stream}: ${line.trim()}`);
    },
  });
};
