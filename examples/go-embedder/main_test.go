package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newClient(t *testing.T) (*Client, *bytes.Buffer) {
	t.Helper()
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	out := &bytes.Buffer{}
	client, err := Start(defaultServePath, out)
	if err != nil {
		t.Fatalf("start + handshake: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if welcome := client.Welcome(); welcome.Protocol != protocolVersion {
		t.Fatalf("handshake: got protocol %d, want %d", welcome.Protocol, protocolVersion)
	}
	return client, out
}

func waitEvent(t *testing.T, client *Client, match func(*eventMessage) bool) *eventMessage {
	t.Helper()
	deadline := time.Now().Add(shutdownWait)
	for time.Now().Before(deadline) {
		client.mu.Lock()
		for index, event := range client.events {
			if match(event) {
				matched := event
				client.events = append(client.events[:index], client.events[index+1:]...)
				client.mu.Unlock()
				return matched
			}
		}
		client.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("no matching event")
	return nil
}

func resetEvents(client *Client) {
	client.mu.Lock()
	client.events = nil
	client.mu.Unlock()
}

func items(view *controllerView) []string {
	var ids []string
	for _, row := range view.Rows {
		if row.Kind == "item" {
			ids = append(ids, row.ID)
		}
	}
	return ids
}

func TestEmbedder(t *testing.T) {
	client, out := newClient(t)

	if _, err := client.Open("../../fixtures/extensions/hello-list"); err != nil {
		t.Fatalf("open: %v", err)
	}
	root, err := client.OpenRoot()
	if err != nil {
		t.Fatalf("root.open: %v", err)
	}
	listed := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "root.view" && len(e.View.Rows) > 0
	})
	if got := items(listed.View); len(got) != 1 || got[0] != "hello-list:index" {
		t.Fatalf("root list: %v", got)
	}

	resetEvents(client)
	if err := client.Input(controllerInput{Type: "search", Text: textPointer("zzz")}); err != nil {
		t.Fatalf("search: %v", err)
	}
	empty := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "root.view" && len(e.View.Rows) == 0
	})
	if empty.View.Search.Text != "zzz" {
		t.Fatalf("narrowed search text: %q", empty.View.Search.Text)
	}

	resetEvents(client)
	if err := client.Input(controllerInput{Type: "search", Text: textPointer("")}); err != nil {
		t.Fatalf("clear search: %v", err)
	}
	waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "root.view" && len(e.View.Rows) > 0
	})

	resetEvents(client)
	if err := client.Input(controllerInput{Type: "primary"}); err != nil {
		t.Fatalf("primary: %v", err)
	}
	launched := waitEvent(t, client, func(e *eventMessage) bool { return e.Event == "root.launched" })
	if launched.Root != root {
		t.Fatalf("launched root: %q, want %q", launched.Root, root)
	}
	session := launched.Session
	view := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.view" && e.Session == session && len(e.View.Rows) > 0
	})
	if !view.View.Rows[0].Selected || view.View.Rows[0].Title != "apple" {
		t.Fatalf("first row should be selected apple: %+v", view.View.Rows[0])
	}
	if !strings.Contains(out.String(), "> apple") {
		t.Fatalf("rendered view is missing selected row; output:\n%s", out.String())
	}

	// Primary runs the selected row's CopyToClipboard; the embedder answers it.
	resetEvents(client)
	if err := client.Input(controllerInput{Type: "primary"}); err != nil {
		t.Fatalf("session primary: %v", err)
	}
	waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.view" && e.Session == session &&
			strings.Contains(e.View.Title, "copied apple")
	})
	printed := out.String()
	for _, want := range []string{`capability.request clipboard.copy "apple"`, "capability.result ok"} {
		if !strings.Contains(printed, want) {
			t.Errorf("output is missing %q; printed:\n%s", want, printed)
		}
	}

	// Back closes the command; the root resumes with its search cleared.
	resetEvents(client)
	if err := client.Input(controllerInput{Type: "back"}); err != nil {
		t.Fatalf("back: %v", err)
	}
	exited := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.exited" && e.Session == session
	})
	if exited.Code == nil || *exited.Code != 0 {
		t.Fatalf("session exit: %v", exited.Code)
	}
	resumed := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "root.view" && len(e.View.Rows) > 0
	})
	if got := items(resumed.View); len(got) != 1 || got[0] != "hello-list:index" {
		t.Fatalf("resumed root list: %v", got)
	}

	if _, err := client.request("engine.shutdown", struct{}{}); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	code, err := client.ExitStatus()
	if err != nil || code != 0 {
		t.Fatalf("server exit: %d %v", code, err)
	}
}

func TestPromptsForm(t *testing.T) {
	client, out := newClient(t)

	// The 0157 prompt fixture: engine-handle plus a required password
	// preference and a required argument.
	dir := filepath.Join(t.TempDir(), "prompt-extension")
	if err := os.CopyFS(dir, os.DirFS("../../fixtures/extensions/engine-handle")); err != nil {
		t.Fatalf("copy fixture: %v", err)
	}
	file := filepath.Join(dir, "package.json")
	var manifest map[string]any
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	manifest["preferences"] = []map[string]any{
		{"name": "token", "type": "password", "title": "Token", "required": true},
	}
	commands := manifest["commands"].([]any)
	commands[0].(map[string]any)["arguments"] = []map[string]any{
		{"name": "query", "type": "text", "required": true},
	}
	updated, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("encode manifest: %v", err)
	}
	if err := os.WriteFile(file, updated, 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	extension, err := client.Open(dir)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	launchRaw, err := client.request("extension.launch", map[string]any{
		"extension": extension,
		"command":   "index",
		"prompts":   true,
	})
	if err != nil {
		t.Fatalf("launch with prompts: %v", err)
	}
	var launch struct {
		Session string `json:"session"`
	}
	if err := json.Unmarshal(launchRaw, &launch); err != nil {
		t.Fatalf("parse launch result: %v", err)
	}
	session := launch.Session
	form := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.view" && e.Session == session && e.View.Kind == "form"
	})
	fields := form.View.Form.Fields
	if len(fields) != 2 || fields[0].ID != "token" || fields[1].ID != "argument:query" {
		t.Fatalf("form fields: %+v", fields)
	}
	input := func(value controllerInput) {
		t.Helper()
		if _, err := client.request("session.input", sessionInputParams{Session: session, Input: value}); err != nil {
			t.Fatalf("session.input %s: %v", value.Type, err)
		}
	}
	input(controllerInput{Type: "primary"})
	invalid := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.view" && e.Session == session &&
			e.View.Kind == "form" && e.View.Form.Fields[0].Error != ""
	})
	for _, field := range invalid.View.Form.Fields {
		if field.Error != "Required" {
			t.Fatalf("field %q error: %q", field.ID, field.Error)
		}
	}
	input(controllerInput{Type: "setValue", ID: "token", Value: "hunter2"})
	input(controllerInput{Type: "setValue", ID: "argument:query", Value: "hello"})
	input(controllerInput{Type: "primary"})
	command := waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.view" && e.Session == session &&
			e.View.Kind == "list" && len(e.View.Rows) > 0
	})
	if command.View.Title != "Engine fixture" || !strings.Contains(command.View.Rows[0].Title, "hello") {
		t.Fatalf("command view after the form: %q %q", command.View.Title, command.View.Rows[0].Title)
	}
	// The form never echoes the password; only the command's own output may.
	for _, line := range strings.Split(out.String(), "\n") {
		if strings.Contains(line, `field "token"`) && strings.Contains(line, "hunter2") {
			t.Errorf("the form echoed the password: %q", line)
		}
	}
	input(controllerInput{Type: "back"})
	waitEvent(t, client, func(e *eventMessage) bool {
		return e.Event == "session.exited" && e.Session == session
	})
	if err := client.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
}

func TestEOFShutdown(t *testing.T) {
	client, _ := newClient(t)
	if err := client.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	code, err := client.ExitStatus()
	if err != nil || code != 0 {
		t.Fatalf("server exit: %d %v", code, err)
	}
}

func TestTerminalInput(t *testing.T) {
	text := func(value string) *string { return &value }
	tests := []struct {
		name   string
		input  string
		search string
		want   controllerInput
	}{
		{name: "down", input: "\x1b[B", want: controllerInput{Type: "move", Direction: "down"}},
		{name: "up shortcut", input: "k", want: controllerInput{Type: "move", Direction: "up"}},
		{name: "primary", input: "\r", want: controllerInput{Type: "primary"}},
		{name: "actions", input: "?", want: controllerInput{Type: "openActions"}},
		{name: "search starts with a", input: "a", want: controllerInput{Type: "search", Text: text("a")}},
		{name: "search", input: "e", want: controllerInput{Type: "search", Text: text("apple")}, search: "appl"},
		{name: "back", input: "\x1b", want: controllerInput{Type: "back"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			search := test.search
			action, send, err := terminalInput(bufio.NewReader(strings.NewReader(test.input)), &search)
			got, _ := json.Marshal(action)
			want, _ := json.Marshal(test.want)
			if err != nil || !send || string(got) != string(want) {
				t.Fatalf("got action=%s send=%v err=%v, want %s", got, send, err, want)
			}
		})
	}
}
