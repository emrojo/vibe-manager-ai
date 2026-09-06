import re
from typing import Optional, Tuple
import httpx

def extract_owner_repo(repo_url: str) -> Optional[Tuple[str, str]]:
    """Extract owner and repo name from GitHub URL or owner/repo format."""
    cleaned = repo_url.strip().rstrip("/")
    # Check if https://github.com/owner/repo or git@github.com:owner/repo
    pattern = r"(?:https?://github\.com/|git@github\.com:)([^/]+)/([^/\.]+)(?:\.git)?"
    match = re.search(pattern, cleaned)
    if match:
        return match.group(1), match.group(2)
    # Check if format is simply "owner/repo"
    parts = cleaned.split("/")
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0], parts[1]
    return None

async def create_github_pr(
    repo_url: str,
    github_token: str,
    title: str,
    body: str,
    head_branch: str,
    base_branch: str = "main"
) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Creates a Pull Request on GitHub using the REST API.
    Returns: (pr_url, pr_number, error_message)
    """
    owner_repo = extract_owner_repo(repo_url)
    if not owner_repo:
        return None, None, f"No se pudo extraer owner/repo de {repo_url}"
        
    owner, repo = owner_repo
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VibeManagerAI"
    }
    
    payload = {
        "title": title,
        "body": body,
        "head": head_branch,
        "base": base_branch
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(api_url, json=payload, headers=headers)
            if response.status_code in [200, 201]:
                data = response.json()
                return data.get("html_url"), data.get("number"), None
            else:
                return None, None, f"GitHub API error ({response.status_code}): {response.text}"
    except Exception as exc:
        return None, None, f"Error de conexión con GitHub: {str(exc)}"
