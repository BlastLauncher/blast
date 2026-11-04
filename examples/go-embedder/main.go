// Command go-embedder shows a non-JS app embedding Blast: it spawns
// `blast serve`, speaks embedder protocol v1 over NDJSON stdio
// (docs/embedding.md), draws the session.view model, forwards semantic input,
// and answers `clipboard.copy` by printing the copied text.
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

const defaultServePath = "../../packages/serve/src/main.ts"

const (
	protocolVersion = 1
	maxLineBytes    = 8 << 20
	handshakeWait   = 30 * time.Second
	viewWait        = 30 * time.Second
	shutdownWait    = 10 * time.Second
)

type helloMessage struct {
	Type         string   `json:"type"`
	Protocol     int      `json:"protocol"`
	Capabilities []string `json:"capabilities"`
}

type requestMessage struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	Method string `json:"method"`
	Params any    `json:"params,omitempty"`
}

type capabilityResultMessage struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Value any    `json:"value"`
}

type openParams struct {
	Dir string `json:"dir"`
}

type viewsOptions struct {
	Platform string `json:"platform"`
}

type launchParams struct {
	Extension string       `json:"extension"`
	Command   string       `json:"command"`
	Views     viewsOptions `json:"views"`
}

type sessionInputParams struct {
	Session string          `json:"session"`
	Input   controllerInput `json:"input"`
}

type controllerInput struct {
	Type      string `json:"type"`
	Direction string `json:"direction,omitempty"`
	Text      string `json:"text,omitempty"`
}

type openResult struct {
	Extension string `json:"extension"`
}

type launchResult struct {
	Session string `json:"session"`
}

type engineInfo struct {
	Version string `json:"version"`
}

type welcomeMessage struct {
	Type     string         `json:"type"`
	Protocol int            `json:"protocol"`
	Engine   engineInfo     `json:"engine"`
	Catalog  map[string]any `json:"catalog"`
}

// These are the ControllerView fields this example draws. Unknown fields are
// deliberately ignored so the wire can grow without requiring a Go release.
type searchView struct {
	Text        string `json:"text"`
	Placeholder string `json:"placeholder"`
}

type rowView struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Selected bool   `json:"selected"`
}

type primaryView struct {
	Title   string `json:"title"`
	Enabled bool   `json:"enabled"`
}

type actionRowView struct {
	Title    string `json:"title"`
	Selected bool   `json:"selected"`
}

type actionsView struct {
	Open  bool            `json:"open"`
	Query string          `json:"query"`
	Rows  []actionRowView `json:"rows"`
}

type toastView struct {
	Style   string `json:"style"`
	Title   string `json:"title"`
	Message string `json:"message"`
}

type feedbackView struct {
	Toast *toastView `json:"toast"`
}

type controllerView struct {
	Kind     string       `json:"kind"`
	Title    string       `json:"title"`
	Loading  bool         `json:"loading"`
	Search   searchView   `json:"search"`
	Rows     []rowView    `json:"rows"`
	Selected string       `json:"selectedId"`
	Primary  primaryView  `json:"primary"`
	Actions  actionsView  `json:"actions"`
	Feedback feedbackView `json:"feedback"`
}

type embedderError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type responseMessage struct {
	Type   string          `json:"type"`
	ID     string          `json:"id"`
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *embedderError  `json:"error,omitempty"`
}

type eventMessage struct {
	Type    string          `json:"type"`
	Event   string          `json:"event"`
	Session string          `json:"session,omitempty"`
	View    *controllerView `json:"view,omitempty"`
	Error   *embedderError  `json:"error,omitempty"`
	Code    *int            `json:"code,omitempty"`
}

type capabilityRequestMessage struct {
	Type    string          `json:"type"`
	ID      string          `json:"id"`
	Session string          `json:"session"`
	Name    string          `json:"name"`
	Params  json.RawMessage `json:"params"`
}

type errorMessage struct {
	Type  string        `json:"type"`
	Error embedderError `json:"error"`
}

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

type ExitStatus struct {
	Session string
	Code    int
	Error   string
}

type Client struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
	out   io.Writer
	outMu sync.Mutex

	stdinOnce sync.Once

	mu       sync.Mutex
	seq      int
	pending  map[string]chan *responseMessage
	welcome  *welcomeMessage
	view     *controllerView
	viewSeq  int
	viewWait []viewWaiter

	welcomed chan *welcomeMessage
	exited   chan ExitStatus
	done     chan struct{}

	sessionID string
}

type viewWaiter struct {
	after int
	views chan *controllerView
}

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
		cmd: cmd, stdin: stdin, out: out, pending: map[string]chan *responseMessage{},
		welcomed: make(chan *welcomeMessage, 1), exited: make(chan ExitStatus, 1), done: make(chan struct{}),
	}
	go func() {
		defer close(c.done)
		c.read(stdout)
		_ = cmd.Wait()
	}()
	if err := c.send(helloMessage{Type: "hello", Protocol: protocolVersion, Capabilities: []string{"clipboard.copy"}}); err != nil {
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

func (c *Client) Welcome() *welcomeMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.welcome
}

func (c *Client) Exited() <-chan ExitStatus { return c.exited }

func (c *Client) Launch(extension, command string) (string, error) {
	raw, err := c.request("extension.launch", launchParams{
		Extension: extension,
		Command:   command,
		Views:     viewsOptions{Platform: "Linux"},
	})
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

func (c *Client) Input(input controllerInput) error {
	if c.sessionID == "" {
		return errors.New("no session launched")
	}
	_, err := c.request("session.input", sessionInputParams{Session: c.sessionID, Input: input})
	return err
}

func (c *Client) LatestView() (*controllerView, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.view, c.viewSeq
}

func (c *Client) WaitView(after int, timeout time.Duration) (*controllerView, error) {
	c.mu.Lock()
	if c.view != nil && c.viewSeq > after {
		view := c.view
		c.mu.Unlock()
		return view, nil
	}
	waiter := viewWaiter{after: after, views: make(chan *controllerView, 1)}
	c.viewWait = append(c.viewWait, waiter)
	c.mu.Unlock()
	select {
	case view := <-waiter.views:
		return view, nil
	case <-c.done:
		return nil, errors.New("server closed while waiting for a view")
	case <-time.After(timeout):
		c.mu.Lock()
		for index, registered := range c.viewWait {
			if registered.after == waiter.after && registered.views == waiter.views {
				c.viewWait = append(c.viewWait[:index], c.viewWait[index+1:]...)
				break
			}
		}
		c.mu.Unlock()
		return nil, fmt.Errorf("no view newer than sequence %d within %s", after, timeout)
	}
}

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

func (c *Client) read(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLineBytes)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
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
		delete(c.pending, message.response.ID)
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
	case "session.view":
		if event.View == nil {
			return
		}
		c.printView(event.View)
		c.mu.Lock()
		c.view = event.View
		c.viewSeq++
		seq := c.viewSeq
		kept := c.viewWait[:0]
		for _, waiter := range c.viewWait {
			if seq > waiter.after {
				waiter.views <- event.View
			} else {
				kept = append(kept, waiter)
			}
		}
		c.viewWait = kept
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
	}
}

func (c *Client) printView(view *controllerView) {
	var output strings.Builder
	if view.Title != "" {
		fmt.Fprintf(&output, "view %q\n", view.Title)
	}
	if view.Search.Text != "" || view.Search.Placeholder != "" {
		fmt.Fprintf(&output, "search %q\n", view.Search.Text)
	}
	for _, row := range view.Rows {
		marker := "  "
		if row.Selected {
			marker = "> "
		}
		fmt.Fprintf(&output, "%s%s\n", marker, row.Title)
	}
	if view.Actions.Open {
		fmt.Fprintf(&output, "actions %q\n", view.Actions.Query)
		for _, row := range view.Actions.Rows {
			marker := "  "
			if row.Selected {
				marker = "> "
			}
			fmt.Fprintf(&output, "%s%s\n", marker, row.Title)
		}
	}
	if toast := view.Feedback.Toast; toast != nil {
		fmt.Fprintf(&output, "toast %q\n", toast.Message)
	}
	c.printf("%s", output.String())
}

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

// terminalInput converts common terminal bytes into controller inputs. The
// caller keeps the search text because ControllerView owns the authoritative
// value and echoes it asynchronously.
func terminalInput(reader *bufio.Reader, search *string) (controllerInput, bool, error) {
	b, err := reader.ReadByte()
	if err != nil {
		return controllerInput{}, false, err
	}
	switch b {
	case '\r', '\n':
		return controllerInput{Type: "primary"}, true, nil
	case 'j':
		return controllerInput{Type: "move", Direction: "down"}, true, nil
	case 'k':
		return controllerInput{Type: "move", Direction: "up"}, true, nil
	case '?':
		return controllerInput{Type: "openActions"}, true, nil
	case 8, 127:
		if len(*search) == 0 {
			return controllerInput{}, false, nil
		}
		*search = (*search)[:len(*search)-1]
		return controllerInput{Type: "search", Text: *search}, true, nil
	case 0x1b:
		next, readErr := reader.ReadByte()
		if readErr != nil {
			return controllerInput{Type: "back"}, true, nil
		}
		if next != '[' {
			_ = reader.UnreadByte()
			return controllerInput{Type: "back"}, true, nil
		}
		code, readErr := reader.ReadByte()
		if readErr != nil {
			return controllerInput{Type: "back"}, true, nil
		}
		direction := map[byte]string{'A': "up", 'B': "down", 'C': "right", 'D': "left"}[code]
		if direction == "" {
			return controllerInput{}, false, nil
		}
		return controllerInput{Type: "move", Direction: direction}, true, nil
	default:
		if b < 0x20 || b > 0x7e {
			return controllerInput{}, false, nil
		}
		*search += string(b)
		return controllerInput{Type: "search", Text: *search}, true, nil
	}
}

func main() {
	serve := flag.String("serve", defaultServePath, "path to the `serve` entry, spawned with node")
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
	view, _ := client.LatestView()
	if view == nil {
		if _, err := client.WaitView(-1, viewWait); err != nil {
			return err
		}
	}
	search := ""
	if view, _ := client.LatestView(); view != nil {
		search = view.Search.Text
	}

	input := bufio.NewReader(os.Stdin)
	inputDone := make(chan struct{})
	go func() {
		defer close(inputDone)
		for {
			action, send, readErr := terminalInput(input, &search)
			if readErr != nil {
				return
			}
			if send {
				if err := client.Input(action); err != nil {
					fmt.Fprintln(os.Stderr, err)
					return
				}
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
		return client.Close()
	}
}
