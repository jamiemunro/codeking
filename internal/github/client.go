package github

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type Repo struct {
	FullName      string `json:"full_name"`
	HTMLURL       string `json:"html_url"`
	CloneURL      string `json:"clone_url"`
	Owner         string `json:"owner_login"`
	Name          string `json:"name"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	Description   string `json:"description"`
}

type ghRepo struct {
	FullName      string `json:"full_name"`
	HTMLURL       string `json:"html_url"`
	CloneURL      string `json:"clone_url"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	Description   string `json:"description"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
	Name string `json:"name"`
}

type ghOrg struct {
	Login string `json:"login"`
}

func convertRepos(ghRepos []ghRepo) []Repo {
	repos := make([]Repo, 0, len(ghRepos))
	for _, r := range ghRepos {
		repos = append(repos, Repo{
			FullName:      r.FullName,
			HTMLURL:       r.HTMLURL,
			CloneURL:      r.CloneURL,
			Owner:         r.Owner.Login,
			Name:          r.Name,
			Private:       r.Private,
			DefaultBranch: r.DefaultBranch,
			Description:   r.Description,
		})
	}
	return repos
}

func ghRequest(pat, url string, target interface{}) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+pat)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("github API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("github API error %d: %s", resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(target)
}

// paginateRepos fetches all pages from a paginated GitHub repos endpoint.
func paginateRepos(pat, baseURL string) ([]Repo, error) {
	var all []ghRepo
	page := 1
	for {
		url := fmt.Sprintf("%s&page=%d", baseURL, page)
		var repos []ghRepo
		if err := ghRequest(pat, url, &repos); err != nil {
			return nil, err
		}
		all = append(all, repos...)
		if len(repos) < 100 {
			break
		}
		page++
	}
	return convertRepos(all), nil
}

// ListAllRepos returns all repos the user has access to: their own repos
// plus repos from all orgs they belong to, fully paginated and deduplicated.
func ListAllRepos(pat string) ([]Repo, error) {
	// Fetch all user repos (owned, collaborator, org member)
	allRepos, err := paginateRepos(pat, "https://api.github.com/user/repos?per_page=100&sort=updated&type=all")
	if err != nil {
		return nil, fmt.Errorf("listing user repos: %w", err)
	}

	// Fetch user's orgs
	var orgs []ghOrg
	if err := ghRequest(pat, "https://api.github.com/user/orgs?per_page=100", &orgs); err != nil {
		// Non-fatal: we still have user repos
		return allRepos, nil
	}

	// Fetch repos for each org
	seen := make(map[string]bool, len(allRepos))
	for _, r := range allRepos {
		seen[r.FullName] = true
	}

	for _, org := range orgs {
		orgRepos, err := paginateRepos(pat, fmt.Sprintf("https://api.github.com/orgs/%s/repos?per_page=100&sort=updated", org.Login))
		if err != nil {
			continue // skip orgs that fail (permissions, etc.)
		}
		for _, r := range orgRepos {
			if !seen[r.FullName] {
				seen[r.FullName] = true
				allRepos = append(allRepos, r)
			}
		}
	}

	return allRepos, nil
}
