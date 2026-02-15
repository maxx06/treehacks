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

export const getDefaultBranch = async ({ token, owner, repo }) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'background-agent',
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub repo lookup failed (${response.status}): ${details}`);
  }

  const data = await response.json();
  return data.default_branch || 'main';
};

export const branchExists = async ({ token, owner, repo, branch }) => {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(
      branch
    )}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'background-agent',
      },
    }
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub branch lookup failed (${response.status}): ${details}`);
  }

  return true;
};
