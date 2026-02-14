import { App } from '@slack/bolt';
import process from 'node:process';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const DEFAULT_GITHUB_TOKEN = process.env.DEFAULT_GITHUB_TOKEN || null;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: Boolean(process.env.SLACK_APP_TOKEN),
  appToken: process.env.SLACK_APP_TOKEN,
});

app.command('/agent', async ({ command, ack, client, respond }) => {
  await ack();

  const raw = (command.text || '').trim();
  const parts = raw.split(/\s+/);
  const repo = parts.shift();
  const prompt = parts.join(' ').trim();

  if (!repo || !prompt) {
    await respond({
      text: 'Usage: `/agent <owner/repo> <what to do>`',
    });
    return;
  }

  const sessionResponse = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo,
      prompt,
      createdBy: command.user_id,
      channelId: command.channel_id,
      threadTs: command.thread_ts || null,
      githubToken: DEFAULT_GITHUB_TOKEN,
    }),
  });

  if (!sessionResponse.ok) {
    const data = await sessionResponse.json().catch(() => ({}));
    await respond({
      text: `Failed to start session: ${data.error || sessionResponse.statusText}`,
    });
    return;
  }

  const session = await sessionResponse.json();
  const statusMessage = await client.chat.postMessage({
    channel: command.channel_id,
    thread_ts: command.thread_ts || undefined,
    text: `⚙️ Starting background session \`${session.id}\` on \`${session.repo}\``,
  });

  const rootThreadTs = statusMessage.ts || command.message_ts;
  let lastStatus = '';

  const poller = setInterval(async () => {
    try {
      const sessionRes = await fetch(
        `${API_BASE_URL}/api/sessions/${session.id}`
      );
      if (!sessionRes.ok) {
        clearInterval(poller);
        return;
      }

      const current = await sessionRes.json();
      if (current.status === lastStatus) return;
      lastStatus = current.status;

      await client.chat.postMessage({
        channel: command.channel_id,
        thread_ts: rootThreadTs,
        text: `Session \`${session.id}\` update: *${current.status}*`,
      });

      if (['completed', 'failed'].includes(current.status)) {
        clearInterval(poller);
        if (current.prUrl) {
          await client.chat.postMessage({
            channel: command.channel_id,
            thread_ts: rootThreadTs,
            text: `✅ Done: <${current.prUrl}|Open PR>`,
          });
        }
      }
    } catch (error) {
      clearInterval(poller);
      await client.chat.postMessage({
        channel: command.channel_id,
        thread_ts: rootThreadTs,
        text: `Polling error: ${error.message}`,
      });
    }
  }, 4000);

  setTimeout(() => clearInterval(poller), 1000 * 60 * 30);
});

const start = async () => {
  await app.start();
  console.log('Slack bot running');
};
start().catch((error) => {
  console.error(error);
  process.exit(1);
});
