package main

import (
	"bufio"
	"bytes"
	"strings"
	"testing"
)

func TestEmbedder(t *testing.T) {
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

	view, sequence := waitForView(t, client, -1)
	if view.Kind != "list" || len(view.Rows) != 3 {
		t.Fatalf("first view: kind=%q rows=%d", view.Kind, len(view.Rows))
	}
	if !view.Rows[0].Selected || view.Rows[0].Title != "apple" {
		t.Fatalf("first row should be selected apple: %+v", view.Rows[0])
	}
	if !strings.Contains(out.String(), "> apple") {
		t.Fatalf("rendered view is missing selected row; output:\n%s", out.String())
	}

	beforeMove := sequence
	if err := client.Input(controllerInput{Type: "move", Direction: "down"}); err != nil {
		t.Fatalf("move selection: %v", err)
	}
	view, sequence = waitForView(t, client, beforeMove)
	if !view.Rows[1].Selected || view.Rows[1].Title != "banana" {
		t.Fatalf("selection did not move to banana: %+v", view.Rows)
	}

	beforePrimary := sequence
	if err := client.Input(controllerInput{Type: "primary"}); err != nil {
		t.Fatalf("primary: %v", err)
	}
	view, _ = waitForView(t, client, beforePrimary)
	if !strings.Contains(view.Title, "copied banana") {
		t.Fatalf("primary did not update view title: %q", view.Title)
	}
	printed := out.String()
	for _, want := range []string{`capability.request clipboard.copy "banana"`, "capability.result ok"} {
		if !strings.Contains(printed, want) {
			t.Errorf("output is missing %q; printed:\n%s", want, printed)
		}
	}
}

func waitForView(t *testing.T, client *Client, after int) (*controllerView, int) {
	t.Helper()
	view, err := client.WaitView(after, viewWait)
	if err != nil {
		t.Fatalf("view after %d: %v", after, err)
	}
	_, sequence := client.LatestView()
	return view, sequence
}

func TestTerminalInput(t *testing.T) {
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
		{name: "search starts with a", input: "a", want: controllerInput{Type: "search", Text: "a"}},
		{name: "search", input: "e", want: controllerInput{Type: "search", Text: "apple"}, search: "appl"},
		{name: "back", input: "\x1b", want: controllerInput{Type: "back"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			search := test.search
			action, send, err := terminalInput(bufio.NewReader(strings.NewReader(test.input)), &search)
			if err != nil || !send || action != test.want {
				t.Fatalf("got action=%+v send=%v err=%v, want %+v", action, send, err, test.want)
			}
		})
	}
}
