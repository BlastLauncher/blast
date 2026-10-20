package main

import (
	"bytes"
	"strings"
	"testing"
)

// TestEmbedder runs the whole example flow against the real `blast serve` and
// the hello-list fixture: the hello/welcome handshake, a printed scene tree,
// and the clipboard.copy round trip of running the first item's action.
func TestEmbedder(t *testing.T) {
	// The server inherits this environment, keeping engine state (storage,
	// support directories) out of the developer's own data directory.
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	out := &bytes.Buffer{}
	client, err := Start(defaultServePath, out)
	if err != nil {
		t.Fatalf("start + handshake: %v", err)
	}
	defer client.Close()

	if welcome := client.Welcome(); welcome.Protocol != protocolVersion {
		t.Fatalf("handshake: got protocol %d, want %d", welcome.Protocol, protocolVersion)
	}

	extension, err := client.Open("../../fixtures/extensions/hello-list")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := client.Launch(extension, "index"); err != nil {
		t.Fatalf("launch: %v", err)
	}

	scene, err := client.WaitScene(-1, sceneWait)
	if err != nil {
		t.Fatalf("first scene: %v", err)
	}
	printed := out.String()
	for _, want := range []string{"Navigation", `List.Item "apple" *`, `Action.CopyToClipboard "Copy apple"`} {
		if !strings.Contains(printed, want) {
			t.Errorf("printed scene is missing %q; printed:\n%s", want, printed)
		}
	}

	// Enter runs the first action, which copies the first item's title: the
	// embedder prints the capability request, answers ok, and the extension
	// repaints with the copied state.
	if err := client.Enter(); err != nil {
		t.Fatalf("enter: %v", err)
	}
	if _, err := client.WaitScene(scene.Revision, sceneWait); err != nil {
		t.Fatalf("scene after enter: %v", err)
	}
	printed = out.String()
	for _, want := range []string{`capability.request clipboard.copy "apple"`, "capability.result ok", `List "copied apple"`} {
		if !strings.Contains(printed, want) {
			t.Errorf("output after Enter is missing %q; printed:\n%s", want, printed)
		}
	}
}
