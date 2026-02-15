import { App } from '@slack/bolt';
import process from 'node:process';
import 'dotenv/config';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const DEFAULT_GITHUB_TOKEN = process.env.DEFAULT_GITHUB_TOKEN || null;
const HARDCODED_REPO = (process.env.DEFAULT_REPO || '').trim();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: Boolean(process.env.SLACK_APP_TOKEN),
  appToken: process.env.SLACK_APP_TOKEN,
});

const buildRequestReply = async ({ client, channelId, threadTs, rootText, prompt }) => {
  const rootThread = threadTs ? { thread_ts: threadTs } : {};
  const statusMessage = await client.chat.postMessage({
    channel: channelId,
    ...rootThread,
    text: `${rootText}`,
  });

  const rootThreadTs = statusMessage.ts || threadTs;
  let lastStatus = '';

  const poller = setInterval(async () => {
    try {
      const sessionRes = await fetch(`${API_BASE_URL}/api/sessions/${prompt.id}`);
      if (!sessionRes.ok) {
        clearInterval(poller);
        return;
      }

      const current = await sessionRes.json();
      if (current.status === lastStatus) return;
      lastStatus = current.status;

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: rootThreadTs,
        text: `Session \`${prompt.id}\` update: *${current.status}*`,
      });

      if (['completed', 'failed'].includes(current.status)) {
        clearInterval(poller);
        if (current.prUrl) {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: rootThreadTs,
            text: `✅ Done: <${current.prUrl}|Open PR>`,
          });
        }
      }
    } catch (error) {
      clearInterval(poller);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: rootThreadTs,
        text: `Polling error: ${error.message}`,
      });
    }
  }, 4000);

  setTimeout(() => clearInterval(poller), 1000 * 60 * 30);
};

const parseSessionRequest = (text) => {
  const clean = (text || '')
    .replace(/<@[A-Z0-9]+>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { prompt: clean.trim() };
};

const resolveAndStart = async ({
  source,
  text,
  createdBy,
  channelId,
  threadTs,
  client,
  say,
  respond,
}) => {
  const { prompt } = parseSessionRequest(text);
  const repo = HARDCODED_REPO;
  const needsReply = respond || ((...args) => say(args[0]));

  if (!repo) {
    await needsReply({
      text: 'Set `DEFAULT_REPO` in `.env` to hardcode the target repo.',
    });
    return;
  }

  if (!prompt) {
    await needsReply({
      text: 'I can run this, but I need a task phrase. Example: `@Bot fix auth bug`',
    });
    return;
  }

  const sessionResponse = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo,
      prompt,
      createdBy,
      channelId,
      threadTs: threadTs || null,
      githubToken: DEFAULT_GITHUB_TOKEN,
    }),
  });

  if (!sessionResponse.ok) {
    const data = await sessionResponse.json().catch(() => ({}));
    await needsReply({
      text: `Failed to start session: ${data.error || sessionResponse.statusText}`,
    });
    return;
  }

  const session = await sessionResponse.json();
  const rootText = `⚙️ Starting background session \`${session.id}\` on \`${session.repo}\``;
  session.id = session.id;
  await buildRequestReply({
    client,
    channelId,
    threadTs: threadTs || undefined,
    rootText,
    prompt: session,
  });
};

app.command('/agent', async ({ command, ack, client, respond }) => {
  await ack();
  await resolveAndStart({
    source: '/agent',
    text: command.text || '',
    createdBy: command.user_id,
    channelId: command.channel_id,
    threadTs: command.thread_ts || null,
    client,
    respond,
  });
});

app.event('app_mention', async ({ event, client, say }) => {
  if (event.bot_id) return;
  await resolveAndStart({
    source: 'app_mention',
    text: event.text || '',
    createdBy: event.user || 'unknown',
    channelId: event.channel,
    threadTs: event.thread_ts || null,
    client,
    say,
  });
});

const start = async () => {
  await app.start();
  console.log('Slack bot running');
};
start().catch((error) => {
  console.error(error);
  process.exit(1);
});
