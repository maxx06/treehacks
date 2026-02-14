export const createPullRequest = async ({
  token,
  owner,
  repo,
  title,
  body,
  head,
  base,
}) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'background-agent',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      head,
      base,
      body,
      maintainer_can_modify: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub PR API error (${response.status}): ${details}`);
  }

  const pr = await response.json();
  return pr.html_url || pr.url;
};
