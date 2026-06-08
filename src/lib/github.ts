const REPO_OWNER = 'murphb52'
const REPO_NAME = 'nannery-world-cup'

export async function githubCommit(
  pat: string,
  path: string,
  content: unknown,
  message: string
): Promise<void> {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))))

  // Get current SHA
  const getRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' } }
  )
  if (!getRes.ok) throw new Error(`Failed to fetch ${path}: ${getRes.status}`)
  const current = await getRes.json()

  const putRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content: encoded, sha: current.sha }),
    }
  )
  if (!putRes.ok) {
    const err = await putRes.json()
    throw new Error(err.message ?? `Failed to commit ${path}`)
  }
}

export function getPat(): string {
  return sessionStorage.getItem('admin_pat') ?? ''
}

export function setPat(pat: string): void {
  sessionStorage.setItem('admin_pat', pat)
}
