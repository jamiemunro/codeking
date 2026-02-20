package shepherd

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
)

// cachedBuildHash is computed once at init and never changes.
var cachedBuildHash string

func init() {
	cachedBuildHash = computeBuildHash()
}

// BuildHash returns a truncated SHA-256 of the running executable.
// Computed at process startup so the value reflects the binary that was
// on disk when this process started, not the current file.
func BuildHash() string {
	return cachedBuildHash
}

func computeBuildHash() string {
	exe, err := os.Executable()
	if err != nil {
		return "unknown"
	}
	f, err := os.Open(exe)
	if err != nil {
		return "unknown"
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}
