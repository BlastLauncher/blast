// Command go-embedder shows a non-JS app embedding Blast on the engine-owned
// flow: it spawns `blast serve`, speaks embedder protocol v1 over NDJSON
// stdio (docs/embedding.md), opens the extension directories given on the
// command line, draws the engine's root search views, maps terminal keys to
// `root.input`/`session.input`, and answers `clipboard.copy` by printing the
// copied text.
//
// Usage from this directory:
//
//	go run . [-serve ../../packages/serve/src/main.ts] <extensionDir>...
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
	shutdownWait    = 10 * time.Second
)

type helloMessage struct {
	Type         string   `json:"type"`
	Protocol     int      `json:"protocol"`
	Capabilities []string `json:"capabilities"`
	// Views turns on view models for every launch; root launches need no options.
	Views viewsOptions `json:"views"`
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

type rootInputParams struct {
	Root  string          `json:"root"`
	Input controllerInput `json:"input"`
}

type sessionInputParams struct {
	Session string          `json:"session"`
	Input   controllerInput `json:"input"`
}

type controllerInput struct {
	Type string `json:"type"`
	// Text is a pointer so a cleared search still sends the required
	// `"text":""`; every other input omits it.
	Text      *string `json:"text,omitempty"`
	Direction string  `json:"direction,omitempty"`
	ID        string  `json:"id,omitempty"`
	Value     string  `json:"value,omitempty"`
}

type openResult struct {
	Extension string `json:"extension"`
}

type rootResult struct {
	Root string `json:"root"`
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
	Text string `json:"text"`
}

type rowView struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Selected bool   `json:"selected"`
}

type fieldView struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type formView struct {
	Fields []fieldView `json:"fields"`
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
	Title   string `json:"title"`
	Message string `json:"message"`
}

type feedbackView struct {
	Toast *toastView `json:"toast"`
}

type controllerView struct {
	Kind     string       `json:"kind"`
	Title    string       `json:"title"`
	Search   searchView   `json:"search"`
	Rows     []rowView    `json:"rows"`
	Form     formView     `json:"form"`
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
	Root    string          `json:"root,omitempty"`
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

type Client struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
	out   io.Writer
	outMu sync.Mutex

	stdinOnce sync.Once

	mu        sync.Mutex
	seq       int
	pending   map[string]chan *responseMessage
	welcome   *welcomeMessage
	rootID    string
	sessionID string // set by root.launched; keys go to root.input until then
	events    []*eventMessage

	welcomed chan *welcomeMessage
	done     chan struct{}
	exitErr  error
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
		welcomed: make(chan *welcomeMessage, 1), done: make(chan struct{}),
	}
	go func() {
		c.read(stdout)
		err := cmd.Wait()
		c.mu.Lock()
		c.exitErr = err
		c.mu.Unlock()
		close(c.done)
	}()
	if err := c.send(helloMessage{Type: "hello", Protocol: protocolVersion, Capabilities: []string{"clipboard.copy"}, Views: viewsOptions{Platform: "Linux"}}); err != nil {
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

// ExitStatus waits for the server process and returns its exit code.
func (c *Client) ExitStatus() (int, error) {
	<-c.done
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.exitErr == nil {
		return 0, nil
	}
	return c.cmd.ProcessState.ExitCode(), c.exitErr
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

func (c *Client) OpenRoot() (string, error) {
	// views fall back to the hello's, so root.open needs no params.
	raw, err := c.request("root.open", struct{}{})
	if err != nil {
		return "", err
	}
	var result rootResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", err
	}
	c.mu.Lock()
	c.rootID = result.Root
	c.mu.Unlock()
	return result.Root, nil
}

func (c *Client) Input(input controllerInput) error {
	c.mu.Lock()
	root, session := c.rootID, c.sessionID
	c.mu.Unlock()
	if session != "" {
		_, err := c.request("session.input", sessionInputParams{Session: session, Input: input})
		return err
	}
	_, err := c.request("root.input", rootInputParams{Root: root, Input: input})
	return err
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
		// A rejected line never gets a response; fail every pending request.
		c.mu.Lock()
		for id, replies := range c.pending {
			replies <- &responseMessage{Type: "response", ID: id, OK: false, Error: &message.err.Error}
		}
		c.pending = map[string]chan *responseMessage{}
		c.mu.Unlock()
	}
}

func (c *Client) handleEvent(event *eventMessage) {
	c.mu.Lock()
	c.events = append(c.events, event)
	switch event.Event {
	case "root.launched":
		c.sessionID = event.Session
	case "session.exited":
		c.sessionID = ""
	}
	c.mu.Unlock()
	if event.Event == "root.view" || event.Event == "session.view" {
		if event.View != nil {
			c.printView(event.View)
		}
	}
}

func (c *Client) printView(view *controllerView) {
	var output strings.Builder
	if view.Title != "" {
		fmt.Fprintf(&output, "view %q\n", view.Title)
	}
	if view.Search.Text != "" {
		fmt.Fprintf(&output, "search %q\n", view.Search.Text)
	}
	if view.Kind == "form" {
		for _, field := range view.Form.Fields {
			state := ""
			if field.Error != "" {
				state = ` error "` + field.Error + `"`
			}
			fmt.Fprintf(&output, "  field %q%s\n", field.ID, state)
		}
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
		return controllerInput{Type: "search", Text: textPointer(*search)}, true, nil
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
		return controllerInput{Type: "search", Text: textPointer(*search)}, true, nil
	}
}

func textPointer(value string) *string { return &value }

func main() {
	serve := flag.String("serve", defaultServePath, "path to the `serve` entry, spawned with node")
	flag.Parse()
	if flag.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "usage: go run . [-serve <main.ts>] <extensionDir>...")
		os.Exit(2)
	}
	if err := run(*serve, flag.Args()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(servePath string, dirs []string) error {
	client, err := Start(servePath, os.Stdout)
	if err != nil {
		return err
	}
	defer client.Close()

	welcome := client.Welcome()
	client.printf("connected: engine %s, protocol v%d, %d capabilities in the catalog\n",
		welcome.Engine.Version, welcome.Protocol, len(welcome.Catalog))
	for _, dir := range dirs {
		if _, err := client.Open(dir); err != nil {
			return err
		}
	}
	if _, err := client.OpenRoot(); err != nil {
		return err
	}

	// Keys go to the root until root.launched, then to the session, and back
	// to the root after session.exited; stdin EOF shuts the server down.
	input := bufio.NewReader(os.Stdin)
	search := ""
	for {
		action, send, readErr := terminalInput(input, &search)
		if readErr != nil {
			return nil
		}
		if send {
			if err := client.Input(action); err != nil {
				return err
			}
		}
	}
}
