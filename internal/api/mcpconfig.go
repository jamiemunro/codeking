package api

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// WriteSessionMCPConfig writes the .mcp.json for a regular coding session.
// Called at session creation and during re-adoption on server restart.
func WriteSessionMCPConfig(sessionID, worktreePath string) {
	mcpConfig := fmt.Sprintf(`{
  "mcpServers": {
    "codeking-notepad": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/notepad-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    },
    "codeking-ui": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/a2ui-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    }
  }
}`, sessionID, sessionID)
	if err := os.WriteFile(filepath.Join(worktreePath, ".mcp.json"), []byte(mcpConfig), 0644); err != nil {
		log.Printf("Failed to write .mcp.json for session %s: %v", sessionID, err)
	}
}

// WriteOrchestratorMCPConfig writes the .mcp.json for an orchestrator session.
// Called at orchestrator creation and during re-adoption on server restart.
func WriteOrchestratorMCPConfig(sessionID, workDir string) {
	mcpConfig := fmt.Sprintf(`{
  "mcpServers": {
    "codeking-orchestrator": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/orchestrator-server.js"],
      "env": {
        "CODEKING_API_URL": "http://localhost:8800"
      }
    },
    "codeking-notepad": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/notepad-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    },
    "codeking-ui": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/a2ui-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    }
  }
}`, sessionID, sessionID)
	if err := os.WriteFile(filepath.Join(workDir, ".mcp.json"), []byte(mcpConfig), 0644); err != nil {
		log.Printf("orchestrator: failed to write .mcp.json for session %s: %v", sessionID, err)
	}
}
