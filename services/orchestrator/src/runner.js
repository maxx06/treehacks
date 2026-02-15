import fs from 'node:fs';
import path from 'node:path';
import {
  createPullRequest,
  getDefaultBranch,
  branchExists,
} from './github.js';
import { runCommand } from './exec.js';
import { config } from './config.js';
import { runOpenCodeTask } from './opencode.js';
import {
  getSession,
  setSessionStatus,
  setSessionError,
  setSessionBranch,
  setSessionPr,
  appendEvent,
} from './store.js';

export const runSession = async (sessionId) => {
  const session = getSession(sessionId);
  if (!session || session.status !== 'queued') return;

  const token = session.githubToken || config.githubToken;
  if (!token) {
    throw new Error('No GitHub token configured for this session');
  }

  setSessionStatus(sessionId, 'provisioning', 'Provisioning runner workspace.');
  const workspace = path.join(
    config.workspaceRoot,
    `${session.id}-${Date.now()}`
  );
  fs.mkdirSync(workspace, { recursive: true });

  try {
    const repoUrl = `https://x-access-token:${token}@github.com/${session.repo}.git`;
    const cloneCmd = `git clone "${repoUrl}" .`;
    await runCommand({
      command: cloneCmd,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });

    const branch = `agent/${session.id}`;
    setSessionBranch(sessionId, branch);
    await runCommand({
      command: `git checkout -b ${branch}`,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });
    await runCommand({
      command: `git config user.name "${config.gitUserName}"`,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });
    await runCommand({
      command: `git config user.email "${config.gitUserEmail}"`,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });

    setSessionStatus(sessionId, 'running', 'Running OpenCode task.');
    await runOpenCodeTask({
      sessionId,
      workdir: workspace,
      prompt: session.prompt,
      model: session.model,
      onLog: (line) => appendEvent(sessionId, 'opencode', line),
    });

    const changed = await runCommand({
      command: 'git status --short',
      cwd: workspace,
    });
    const changedLines = changed.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!changedLines.length) {
      setSessionStatus(sessionId, 'completed', 'OpenCode finished with no edits.');
      return;
    }

    await runCommand({
      command: 'git add .',
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });
    await runCommand({
      command:
        `git commit -m "chore: agent session ${session.id} update"`,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });
    await runCommand({
      command: `git push origin "${branch}"`,
      cwd: workspace,
      onLine: (line, stream) =>
        appendEvent(sessionId, `shell.${stream}`, line.trim()),
    });

    setSessionStatus(sessionId, 'creating_pr', 'Opening pull request.');
    let baseBranch = (config.githubBaseBranch || '').trim();
    const configuredBase = baseBranch;

    if (baseBranch) {
      const exists = await branchExists({
        token,
        owner: session.owner,
        repo: session.repoName,
        branch: baseBranch,
      });
      if (!exists) {
        appendEvent(
          sessionId,
          'lifecycle',
          `Configured base branch '${configuredBase}' not found; resolving from GitHub default branch.`
        );
        baseBranch = await getDefaultBranch({
          token,
          owner: session.owner,
          repo: session.repoName,
        });
      }
    } else {
      baseBranch = await getDefaultBranch({
        token,
        owner: session.owner,
        repo: session.repoName,
      });
    }

    const prBody = [
      `## Session ${session.id}`,
      '',
      `Working branch: \`${branch}\``,
      '',
      `Prompt: ${session.prompt}`,
      '',
      '### Changed files',
      '```',
      ...changedLines,
      '```',
    ].join('\n');

    const prUrl = await createPullRequest({
      token,
      owner: session.owner,
      repo: session.repoName,
      title: `Agent task: ${session.prompt.slice(0, 80)}`,
      body: prBody,
      head: branch,
      base: baseBranch,
    });

    setSessionPr(sessionId, prUrl);
  } catch (error) {
    setSessionError(sessionId, error.message || String(error));
  } finally {
    cleanup(workspace);
  }
};

const cleanup = (workspace) => {
  if (!workspace) return;
  try {
    fs.rmSync(workspace, { recursive: true, force: true });
  } catch {
    // Best effort cleanup.
  }
};
