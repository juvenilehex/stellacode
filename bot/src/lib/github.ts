const GITHUB_API = "https://api.github.com";
const REPO = "juvenilehex/stellacode";

interface IssueResult {
  html_url: string;
  number: number;
}

export async function createIssue(
  title: string,
  body: string,
  labels: string[],
): Promise<IssueResult> {
  const token = process.env.GITHUB_TOKEN!;

  const res = await fetch(`${GITHUB_API}/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as IssueResult;
  return { html_url: data.html_url, number: data.number };
}
