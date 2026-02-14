import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config.js';

const storeDir = path.resolve(config.dataDir);
const storePath = path.join(storeDir, 'sessions.json');

const ensureStore = () => {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
};

const defaultState = { sessions: {}, events: {} };

const loadState = () => {
  ensureStore();
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultState, null, 2));
    return structuredClone(defaultState);
  }
  const raw = fs.readFileSync(storePath, 'utf8');
  if (!raw.trim()) {
    return structuredClone(defaultState);
  }
  return { ...defaultState, ...JSON.parse(raw) };
};

const state = loadState();
let persistTimer = null;

const schedulePersist = () => {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
    persistTimer = null;
  }, 50);
};

export const createSession = ({
  repo,
  prompt,
  model,
  createdBy,
  channelId,
  threadTs,
  githubToken,
}) => {
  const id = `session_${nanoid(10)}`;
  const now = new Date().toISOString();
  const normalizedRepo = normalizeRepo(repo);

  const session = {
    id,
    repo: normalizedRepo.raw,
    owner: normalizedRepo.owner,
    repoName: normalizedRepo.repo,
    prompt,
    model: model || 'default',
    createdBy: createdBy || 'unknown',
    channelId: channelId || null,
    threadTs: threadTs || null,
    githubToken: githubToken || null,
    status: 'queued',
    branch: null,
    prUrl: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  state.sessions[id] = session;
  state.events[id] = [
    {
      type: 'lifecycle',
      message: 'Session created.',
      at: now,
    },
  ];
  schedulePersist();
  return session;
};

export const getSession = (id) => state.sessions[id] || null;

export const listSessions = () =>
  Object.values(state.sessions).sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

export const appendEvent = (id, type, message, metadata = null) => {
  const now = new Date().toISOString();
  if (!state.events[id]) {
    state.events[id] = [];
  }
  state.events[id].push({
    type,
    message,
    metadata,
    at: now,
  });
  schedulePersist();
};

export const getEvents = (id) => state.events[id] || [];

export const setSessionStatus = (id, status, message = null) => {
  if (!state.sessions[id]) return null;
  state.sessions[id].status = status;
  state.sessions[id].updatedAt = new Date().toISOString();
  if (message) {
    appendEvent(id, 'lifecycle', message);
  }
  schedulePersist();
  return state.sessions[id];
};

export const setSessionError = (id, error) => {
  if (!state.sessions[id]) return null;
  state.sessions[id].error = String(error);
  state.sessions[id].updatedAt = new Date().toISOString();
  state.sessions[id].status = 'failed';
  appendEvent(id, 'error', error);
  schedulePersist();
  return state.sessions[id];
};

export const setSessionBranch = (id, branch) => {
  if (!state.sessions[id]) return null;
  state.sessions[id].branch = branch;
  state.sessions[id].updatedAt = new Date().toISOString();
  appendEvent(id, 'lifecycle', `Branch created: ${branch}`);
  schedulePersist();
  return state.sessions[id];
};

export const setSessionPr = (id, prUrl) => {
  if (!state.sessions[id]) return null;
  state.sessions[id].prUrl = prUrl;
  state.sessions[id].status = 'completed';
  state.sessions[id].updatedAt = new Date().toISOString();
  appendEvent(id, 'lifecycle', `PR created: ${prUrl}`);
  schedulePersist();
  return state.sessions[id];
};

export const persistNow = () => {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
};

function normalizeRepo(input) {
  const clean = input
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\s+|\s+$/g, '');
  const parts = clean.split('/');
  return {
    raw: `${parts[0]}/${parts[1]}`,
    owner: parts[0],
    repo: parts[1],
  };
}
