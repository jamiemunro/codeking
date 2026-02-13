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

func ListRepos(pat string) ([]Repo, error) {
	var all []Repo
	page := 1
	for {
		url := fmt.Sprintf("https://api.github.com/user/repos?per_page=100&page=%d&sort=updated", page)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+pat)
		req.Header.Set("Accept", "application/vnd.github+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("github API request: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("github API error %d: %s", resp.StatusCode, string(body))
		}

		var repos []ghRepo
		if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}

		for _, r := range repos {
			all = append(all, Repo{
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

		if len(repos) < 100 {
			break
		}
		page++
	}
	return all, nil
}
