import 'dotenv/config';

export const config = {
  apiPort: Number(process.env.API_PORT || 3001),
  dataDir: process.env.DATA_DIR || 'data',
  workspaceRoot: process.env.WORKSPACE_ROOT || 'data/workspaces',
  githubBaseBranch: process.env.GITHUB_BASE_BRANCH || 'main',
  githubToken: process.env.GITHUB_TOKEN || '',
  gitUserName: process.env.GIT_USER_NAME || 'Background Coding Agent',
  gitUserEmail: process.env.GIT_USER_EMAIL || 'agent@local',
  maxConcurrentSessions: Number(process.env.MAX_CONCURRENT_SESSIONS || 2),
  openCodeCommandTemplate:
    process.env.OPENCODE_COMMAND_TEMPLATE ||
    'bash -lc "echo OPENCODE_COMMAND_TEMPLATE is not configured"',
};
