// Command go-embedder shows a non-JS app embedding Blast: it spawns
// `blast serve`, speaks embedder protocol v1 over NDJSON stdio
// (docs/embedding.md), opens an extension, launches a command, prints every
// published scene as an indented tree, runs the selected item's primary
// action on Enter, and answers `clipboard.copy` by printing the copied text.
//
// Usage from this directory:
//
//	go run . [-serve ../../packages/serve/src/main.ts] <extensionDir> <command>
//
// The Go standard library only; the message structs below are hand-written
// against packages/protocol/schema/embedder-v1.schema.json.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Relative to this directory, matching `bun run blast:serve`'s entry.
const defaultServePath = "../../packages/serve/src/main.ts"

const (
	protocolVersion = 1
	// The server's line cap; scenes can be large, so read up to the same size.
	maxLineBytes  = 8 << 20
	handshakeWait = 30 * time.Second
	sceneWait     = 30 * time.Second
	shutdownWait  = 10 * time.Second
)

// Embedder → server messages.

// helloMessage is schema $defs/embedder.hello.
type helloMessage struct {
	Type         string   `json:"type"`
	Protocol     int      `json:"protocol"`
	Capabilities []string `json:"capabilities"`
}

// requestMessage is schema $defs/request.*: params carries the per-method
// params struct defined below.
type requestMessage struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	Method string `json:"method"`
	Params any    `json:"params,omitempty"`
}

// capabilityResultMessage is schema $defs/embedder.capability.result, ok:true
// variant — the only answer this embedder sends; a null value is the result
// shape the catalog declares for clipboard.copy.
type capabilityResultMessage struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Value any    `json:"value"`
}

// Per-method request params (request.*.params).

type openParams struct {
	Dir string `json:"dir"`
}

type launchParams struct {
	Extension string `json:"extension"`
	Command   string `json:"command"`
}

type eventParams struct {
	Session string `json:"session"`
	Node    string `json:"node"`
	Handler string `json:"handler"`
	Args    []any  `json:"args"`
}

// Per-method results.

type openResult struct {
	Extension string `json:"extension"`
}

type launchResult struct {
	Session string `json:"session"`
}

// Server → embedder messages.

type engineInfo struct {
	Version string `json:"version"`
}

// welcomeMessage is schema $defs/server.welcome.
type welcomeMessage struct {
	Type     string         `json:"type"`
	Protocol int            `json:"protocol"`
	Engine   engineInfo     `json:"engine"`
	Catalog  map[string]any `json:"catalog"`
}

// sceneNode is schema $defs/sceneNode; handler references sit in props as
// {"$handler": "<name>"}.
type sceneNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Props    map[string]any `json:"props"`
	Children []*sceneNode   `json:"children"`
}

// sceneMessage is schema $defs/sceneMessage.
type sceneMessage struct {
	Type     string     `json:"type"`
	Revision int        `json:"revision"`
	Root     *sceneNode `json:"root"`
}

// logMessage is schema $defs/logMessage.
type logMessage struct {
	Type    string `json:"type"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

// embedderError is schema $defs/embedderError.
type embedderError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// responseMessage is schema $defs/response, both ok variants in one struct:
// OK picks whether result or error carries the payload.
type responseMessage struct {
	Type   string          `json:"type"`
	ID     string          `json:"id"`
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *embedderError  `json:"error,omitempty"`
}

// eventMessage is schema $defs/server.event: the fields of every event in one
// struct, with the event name saying which ones are present.
type eventMessage struct {
	Type      string          `json:"type"`
	Event     string          `json:"event"`
	Extension string          `json:"extension,omitempty"`
	Session   string          `json:"session,omitempty"`
	Manifest  json.RawMessage `json:"manifest,omitempty"`
	Error     *embedderError  `json:"error,omitempty"`
	Message   string          `json:"message,omitempty"` // dependencies.log
	Scene     *sceneMessage   `json:"scene,omitempty"`
	Log       *logMessage     `json:"log,omitempty"`
	Code      *int            `json:"code,omitempty"` // session.exited
}

// capabilityRequestMessage is schema $defs/server.capability.request; params
// stays raw and is decoded per the catalog shape the name declares.
type capabilityRequestMessage struct {
	Type    string          `json:"type"`
	ID      string          `json:"id"`
	Session string          `json:"session"`
	Name    string          `json:"name"`
	Params  json.RawMessage `json:"params"`
}

// errorMessage is schema $defs/server.error.
type errorMessage struct {
	Type  string        `json:"type"`
	Error embedderError `json:"error"`
}

// serverMessage is the decoded envelope of one server line: exactly one of
// the pointer fields is set, chosen by the wire type.
type serverMessage struct {
	Type string `json:"type"`

	welcome    *welcomeMessage
	response   *responseMessage
	event      *eventMessage
	capRequest *capabilityRequestMessage
	err        *errorMessage
}

func (m *serverMessage) UnmarshalJSON(data []byte) error {
	var probe struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return err
	}
	m.Type = probe.Type
	switch probe.Type {
	case "welcome":
		m.welcome = &welcomeMessage{}
		return json.Unmarshal(data, m.welcome)
	case "response":
		m.response = &responseMessage{}
		return json.Unmarshal(data, m.response)
	case "event":
		m.event = &eventMessage{}
		return json.Unmarshal(data, m.event)
	case "capability.request":
		m.capRequest = &capabilityRequestMessage{}
		return json.Unmarshal(data, m.capRequest)
	case "error":
		m.err = &errorMessage{}
		return json.Unmarshal(data, m.err)
	default:
		return fmt.Errorf("unknown server message type %q", probe.Type)
	}
}

// ExitStatus is a session.exited event.
type ExitStatus struct {
	Session string
	Code    int
	Error   string
}

// Client is one `blast serve` child process and its protocol connection.
type Client struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
	out   io.Writer
	outMu sync.Mutex

	// Requests and capability answers are written from different goroutines.
	stdinOnce sync.Once

	mu      sync.Mutex
	seq     int
	pending map[string]chan *responseMessage
	welcome *welcomeMessage
	latest  *sceneMessage
	waiters []sceneWaiter

	welcomed chan *welcomeMessage
	exited   chan ExitStatus
	done     chan struct{}

	// Set by Launch, read by Enter, both on the caller's goroutine.
	sessionID string
}

type sceneWaiter struct {
	after  int
	scenes chan *sceneMessage
}

// Start spawns the server, performs the hello/welcome handshake and returns a
// ready client. The server writes protocol output to stdout only, so its
// stderr is diagnostics and passes through to ours.
func Start(servePath string, out io.Writer) (*Client, error) {
	cmd := exec.Command("node", servePath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("cannot start node %s: %w", servePath, err)
	}
	c := &Client{
		cmd:      cmd,
		stdin:    stdin,
		out:      out,
		pending:  map[string]chan *responseMessage{},
		welcomed: make(chan *welcomeMessage, 1),
		exited:   make(chan ExitStatus, 1),
		done:     make(chan struct{}),
	}
	go func() {
		defer close(c.done)
		c.read(stdout)
		// Output has ended, so the process is gone; reap it.
		_ = cmd.Wait()
	}()
	if err := c.send(helloMessage{
		Type:         "hello",
		Protocol:     protocolVersion,
		Capabilities: []string{"clipboard.copy"},
	}); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}
	select {
	case <-c.welcomed:
		return c, nil
	case <-c.done:
		return nil, errors.New("server exited before answering the handshake")
	case <-time.After(handshakeWait):
		_ = cmd.Process.Kill()
		return nil, errors.New("no welcome within " + handshakeWait.String())
	}
}

// Welcome returns the handshake's welcome message.
func (c *Client) Welcome() *welcomeMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.welcome
}

// Exited returns the channel receiving the session's session.exited event.
func (c *Client) Exited() <-chan ExitStatus { return c.exited }

// Open opens an extension directory and returns its opaque handle id.
func (c *Client) Open(dir string) (string, error) {
	raw, err := c.request("extension.open", openParams{Dir: dir})
	if err != nil {
		return "", err
	}
	var result openResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", err
	}
	return result.Extension, nil
}

// Launch launches a command and remembers the session for Enter.
func (c *Client) Launch(extension, command string) (string, error) {
	raw, err := c.request("extension.launch", launchParams{Extension: extension, Command: command})
	if err != nil {
		return "", err
	}
	var result launchResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", err
	}
	c.sessionID = result.Session
	return result.Session, nil
}

// Latest returns the most recent scene, or nil before the first one.
func (c *Client) Latest() *sceneMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.latest
}

// WaitScene returns the first scene newer than after, or fails on timeout.
func (c *Client) WaitScene(after int, timeout time.Duration) (*sceneMessage, error) {
	c.mu.Lock()
	if c.latest != nil && c.latest.Revision > after {
		scene := c.latest
		c.mu.Unlock()
		return scene, nil
	}
	waiter := sceneWaiter{after: after, scenes: make(chan *sceneMessage, 1)}
	c.waiters = append(c.waiters, waiter)
	c.mu.Unlock()
	select {
	case scene := <-waiter.scenes:
		return scene, nil
	case <-c.done:
		return nil, errors.New("server closed while waiting for a scene")
	case <-time.After(timeout):
		c.mu.Lock()
		for index, registered := range c.waiters {
			if registered == waiter {
				c.waiters = append(c.waiters[:index], c.waiters[index+1:]...)
				break
			}
		}
		c.mu.Unlock()
		return nil, fmt.Errorf("no scene newer than revision %d within %s", after, timeout)
	}
}

// Enter runs the scene's primary action the way a client does on pressing
// Enter: the first action with its own onAction handler (an ActionPanel node
// also matches the Action prefix but never carries a handler).
func (c *Client) Enter() error {
	if c.sessionID == "" {
		return errors.New("no session launched")
	}
	scene := c.Latest()
	if scene == nil || scene.Root == nil {
		return errors.New("no scene to act on")
	}
	action := firstAction(scene.Root)
	if action == nil {
		return errors.New("scene has no Action")
	}
	handler := handlerRef(action.Props["onAction"])
	if handler == "" {
		return fmt.Errorf("first Action (%s) has no onAction handler", action.Type)
	}
	_, err := c.request("session.event", eventParams{
		Session: c.sessionID,
		Node:    action.ID,
		Handler: handler,
		Args:    []any{},
	})
	return err
}

// Close asks the server to shut down by closing its stdin — blast serve exits
// gracefully on EOF — and waits for the process to leave. Idempotent.
func (c *Client) Close() error {
	c.stdinOnce.Do(func() { _ = c.stdin.Close() })
	select {
	case <-c.done:
		return nil
	case <-time.After(shutdownWait):
		_ = c.cmd.Process.Kill()
		<-c.done
		return errors.New("server ignored stdin EOF and was killed")
	}
}

// request sends a request and awaits its response; responses may return out
// of order, so each outstanding id has its own reply channel.
func (c *Client) request(method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	c.seq++
	id := strconv.Itoa(c.seq)
	replies := make(chan *responseMessage, 1)
	c.pending[id] = replies
	c.mu.Unlock()
	if err := c.send(requestMessage{Type: "request", ID: id, Method: method, Params: params}); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, err
	}
	select {
	case response := <-replies:
		if !response.OK {
			message := "request failed"
			if response.Error != nil {
				message = fmt.Sprintf("%s: %s", response.Error.Code, response.Error.Message)
			}
			return nil, errors.New(method + " failed: " + message)
		}
		return response.Result, nil
	case <-c.done:
		return nil, errors.New("server closed while " + method + " was outstanding")
	}
}

// send writes one protocol line. Sends come from the caller (requests) and
// the reader (capability answers), so they share outMu.
func (c *Client) send(message any) error {
	line, err := json.Marshal(message)
	if err != nil {
		return err
	}
	c.outMu.Lock()
	defer c.outMu.Unlock()
	_, err = c.stdin.Write(append(line, '\n'))
	return err
}

// read consumes server lines until the server's output ends (it exited, or we
// closed our stdin).
func (c *Client) read(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLineBytes)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue // blank lines are ignored by the protocol
		}
		var message serverMessage
		if err := json.Unmarshal(line, &message); err != nil {
			c.printf("# undecodable server line: %v\n", err)
			continue
		}
		c.handle(&message)
	}
	if err := scanner.Err(); err != nil {
		c.printf("# server output error: %v\n", err)
	}
}

func (c *Client) handle(message *serverMessage) {
	switch {
	case message.welcome != nil:
		c.mu.Lock()
		c.welcome = message.welcome
		c.mu.Unlock()
		select {
		case c.welcomed <- message.welcome:
		default:
		}
	case message.response != nil:
		c.mu.Lock()
		replies := c.pending[message.response.ID]
		c.mu.Unlock()
		if replies != nil {
			replies <- message.response
		}
	case message.event != nil:
		c.handleEvent(message.event)
	case message.capRequest != nil:
		c.answerCapability(message.capRequest)
	case message.err != nil:
		c.printf("# server error %s: %s\n", message.err.Error.Code, message.err.Error.Message)
	}
}

func (c *Client) handleEvent(event *eventMessage) {
	switch event.Event {
	case "session.scene":
		if event.Scene == nil {
			return
		}
		c.printScene(event.Scene)
		c.mu.Lock()
		c.latest = event.Scene
		kept := c.waiters[:0]
		for _, waiter := range c.waiters {
			if event.Scene.Revision > waiter.after {
				waiter.scenes <- event.Scene
			} else {
				kept = append(kept, waiter)
			}
		}
		c.waiters = kept
		c.mu.Unlock()
	case "session.exited":
		status := ExitStatus{Session: event.Session}
		if event.Code != nil {
			status.Code = *event.Code
		}
		if event.Error != nil {
			status.Error = event.Error.Message
		}
		select {
		case c.exited <- status:
		default:
		}
	default:
		// manifest.changed, manifest.error, dependencies.log and session.log
		// have nothing to draw in this minimal embedder.
	}
}

// printScene draws the tree the way a client would: one line per node with
// type and title, the first List.Item marked as the selection.
func (c *Client) printScene(scene *sceneMessage) {
	if scene.Root == nil {
		return // scenes published during shutdown carry an empty tree
	}
	var tree strings.Builder
	marked := false
	var walk func(node *sceneNode, depth int)
	walk = func(node *sceneNode, depth int) {
		line := strings.Repeat("  ", depth) + node.Type
		if title := nodeTitle(node); title != "" {
			line += " " + strconv.Quote(title)
		}
		if !marked && node.Type == "List.Item" {
			marked = true
			line += " *"
		}
		tree.WriteString(line)
		tree.WriteByte('\n')
		for _, child := range node.Children {
			walk(child, depth+1)
		}
	}
	walk(scene.Root, 0)
	c.printf("%s", tree.String())
}

// answerCapability prints the request and answers ok. For clipboard.copy the
// copied text is the whole point of this example, so it is printed as such.
func (c *Client) answerCapability(request *capabilityRequestMessage) {
	copied := ""
	if request.Name == "clipboard.copy" {
		var params struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(request.Params, &params)
		copied = params.Text
	}
	if copied != "" {
		c.printf("capability.request %s %q\n", request.Name, copied)
	} else {
		c.printf("capability.request %s %s\n", request.Name, request.Params)
	}
	c.printf("capability.result ok\n")
	if err := c.send(capabilityResultMessage{Type: "capability.result", ID: request.ID, OK: true}); err != nil {
		c.printf("# cannot answer capability %s: %v\n", request.ID, err)
	}
}

func (c *Client) printf(format string, args ...any) {
	c.outMu.Lock()
	defer c.outMu.Unlock()
	fmt.Fprintf(c.out, format, args...)
}

// handlerRef extracts the `$handler` name from a handler-reference prop.
func handlerRef(prop any) string {
	ref, ok := prop.(map[string]any)
	if !ok {
		return ""
	}
	handler, _ := ref["$handler"].(string)
	return handler
}

// firstAction walks the scene depth-first and returns the first node that is
// an action with its own onAction handler.
func firstAction(node *sceneNode) *sceneNode {
	if strings.HasPrefix(node.Type, "Action") && handlerRef(node.Props["onAction"]) != "" {
		return node
	}
	for _, child := range node.Children {
		if found := firstAction(child); found != nil {
			return found
		}
	}
	return nil
}

// nodeTitle picks the human label of a node: items carry `title`, views like
// List carry `navigationTitle`.
func nodeTitle(node *sceneNode) string {
	for _, key := range []string{"title", "navigationTitle"} {
		if value, ok := node.Props[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func main() {
	serve := flag.String("serve", defaultServePath, "path to the `serve entry`, spawned with node")
	flag.Parse()
	if flag.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run . [-serve <main.ts>] <extensionDir> <command>")
		os.Exit(2)
	}
	if err := run(*serve, flag.Arg(0), flag.Arg(1)); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(servePath, extensionDir, command string) error {
	client, err := Start(servePath, os.Stdout)
	if err != nil {
		return err
	}
	defer client.Close()

	welcome := client.Welcome()
	fmt.Printf("connected: engine %s, protocol v%d, %d capabilities in the catalog\n",
		welcome.Engine.Version, welcome.Protocol, len(welcome.Catalog))

	extension, err := client.Open(extensionDir)
	if err != nil {
		return err
	}
	if _, err := client.Launch(extension, command); err != nil {
		return err
	}
	if _, err := client.WaitScene(-1, sceneWait); err != nil {
		return err
	}

	// Enter (an empty line) runs the selection's primary action; any other
	// input is ignored in this minimal example.
	input := bufio.NewScanner(os.Stdin)
	inputDone := make(chan struct{})
	go func() {
		defer close(inputDone)
		for input.Scan() {
			if input.Text() != "" {
				continue
			}
			if err := client.Enter(); err != nil {
				fmt.Fprintln(os.Stderr, err)
			}
		}
	}()

	select {
	case status := <-client.Exited():
		fmt.Printf("session exited: code %d %s\n", status.Code, status.Error)
		if status.Code != 0 || status.Error != "" {
			return errors.New("session did not exit cleanly")
		}
		return client.Close()
	case <-inputDone:
		// stdin EOF: closing the server's stdin asks it to shut down.
		return client.Close()
	}
}
