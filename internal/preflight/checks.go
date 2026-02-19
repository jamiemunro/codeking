package preflight

import (
	"database/sql"
	"fmt"
	"os/exec"
	"strings"

	"github.com/peterje/superposition/internal/models"
)

func CheckAll(db *sql.DB) ([]models.CLIStatus, bool) {
	gitOk := checkGit()
	clis := []models.CLIStatus{
		checkCLI("claude", db),
		checkCLI("codex", db),
		checkCLI("gemini", db),
	}

	if !gitOk {
		fmt.Println("⚠ git is not installed. Please install git to use Superposition.")
	}
	for _, cli := range clis {
		if !cli.Installed {
			fmt.Printf("⚠ %s is not installed. Install it to use %s sessions.\n", cli.Name, cli.Name)
		} else {
			if cli.Command != "" {
				fmt.Printf("✓ %s found (%s) [override: %s]\n", cli.Name, cli.Path, cli.Command)
			} else {
				fmt.Printf("✓ %s found (%s)\n", cli.Name, cli.Path)
			}
		}
	}

	return clis, gitOk
}

func checkGit() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

func checkCLI(name string, db *sql.DB) models.CLIStatus {
	// Check for a command override in settings
	var override string
	if db != nil {
		var val string
		err := db.QueryRow(`SELECT value FROM settings WHERE key = ?`, "cli_command."+name).Scan(&val)
		if err == nil && val != "" {
			override = val
		}
	}

	// Determine which binary to look up
	binary := name
	if override != "" {
		binary = strings.Fields(override)[0]
	}

	path, err := exec.LookPath(binary)
	if err != nil {
		return models.CLIStatus{Name: name, Installed: false, Command: override}
	}
	return models.CLIStatus{Name: name, Installed: true, Authed: true, Path: path, Command: override}
}
