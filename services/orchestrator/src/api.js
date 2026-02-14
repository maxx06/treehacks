import express from 'express';
import { config } from './config.js';
import {
  createSession,
  getSession,
  listSessions,
  getEvents,
  persistNow,
} from './store.js';
import { runSession } from './runner.js';

const app = express();
app.use(express.json());

const activeSessions = new Set();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

app.post('/api/sessions', (req, res) => {
  try {
    const { repo, prompt, model, createdBy, channelId, threadTs, githubToken } =
      req.body || {};
    if (!repo || !prompt) {
      return res.status(400).json({ error: 'repo and prompt required' });
    }

    const session = createSession({
      repo,
      prompt,
      model,
      createdBy,
      channelId,
      threadTs,
      githubToken,
    });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json(session);
});

app.get('/api/sessions/:id/events', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json({ events: getEvents(req.params.id) });
});

const pump = () => {
  const sessions = listSessions().filter((s) => s.status === 'queued');
  if (activeSessions.size >= config.maxConcurrentSessions) return;

  for (const session of sessions) {
    if (activeSessions.size >= config.maxConcurrentSessions) break;
    if (activeSessions.has(session.id)) continue;
    activeSessions.add(session.id);
    runSession(session.id)
      .catch((error) => {
        console.error(`Session ${session.id} crashed`, error);
      })
      .finally(() => {
        activeSessions.delete(session.id);
      });
  }
};

setInterval(pump, 1500);
setInterval(() => persistNow(), 5000);

app.listen(config.apiPort, () => {
  console.log(`orchestrator listening on :${config.apiPort}`);
  pump();
});
