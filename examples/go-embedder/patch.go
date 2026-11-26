package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// viewPatchOp is one generic JSON patch operation from embedder protocol v2
// (docs/decisions/0020-embedder-protocol-v2.md).
type viewPatchOp struct {
	Op     string          `json:"op"`
	Path   []string        `json:"path"`
	Value  json.RawMessage `json:"value,omitempty"`
	At     *int            `json:"at,omitempty"`
	Remove *int            `json:"remove,omitempty"`
	Insert []any           `json:"insert,omitempty"`
}

// viewPatch mirrors packages/protocol/src/view-patch.ts ViewPatch.
type viewPatch struct {
	Revision     *int          `json:"revision,omitempty"`
	BaseRevision *int          `json:"baseRevision,omitempty"`
	Ops          []viewPatchOp `json:"ops"`
}

func formatPatchPath(path []string) string {
	if len(path) == 0 {
		return "<root>"
	}
	return strings.Join(path, ".")
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = cloneJSONValue(item)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for index, item := range typed {
			out[index] = cloneJSONValue(item)
		}
		return out
	default:
		return value
	}
}

func shallowCopyMap(object map[string]any) map[string]any {
	copyMap := make(map[string]any, len(object))
	for key, val := range object {
		copyMap[key] = val
	}
	return copyMap
}

func applyAt(node any, path []string, depth int, leaf func(any) (any, error)) (any, error) {
	if depth == len(path) {
		return leaf(node)
	}
	object, ok := node.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(path))
	}
	key := path[depth]
	isFinal := depth == len(path)-1
	child, exists := object[key]
	if !isFinal && !exists {
		return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(path))
	}
	updated, err := applyAt(child, path, depth+1, leaf)
	if err != nil {
		return nil, err
	}
	copyMap := shallowCopyMap(object)
	copyMap[key] = updated
	return copyMap, nil
}

func applyOp(root any, op viewPatchOp) (any, error) {
	if op.Path == nil {
		return nil, errors.New("view patch op missing path")
	}
	switch op.Op {
	case "set":
		if len(op.Value) == 0 {
			return nil, fmt.Errorf("set op missing value at %s", formatPatchPath(op.Path))
		}
		var value any
		if err := json.Unmarshal(op.Value, &value); err != nil {
			return nil, fmt.Errorf("invalid set value at %s: %w", formatPatchPath(op.Path), err)
		}
		cloned := cloneJSONValue(value)
		if len(op.Path) == 0 {
			return cloned, nil
		}
		return applyAt(root, op.Path, 0, func(any) (any, error) {
			return cloned, nil
		})

	case "delete":
		if len(op.Path) == 0 {
			return nil, errors.New("cannot delete view root")
		}
		parentPath := op.Path[:len(op.Path)-1]
		key := op.Path[len(op.Path)-1]
		applyDelete := func(target any) (any, error) {
			object, ok := target.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(op.Path))
			}
			if _, exists := object[key]; !exists {
				return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(op.Path))
			}
			copyMap := shallowCopyMap(object)
			delete(copyMap, key)
			return copyMap, nil
		}
		if len(parentPath) == 0 {
			return applyDelete(root)
		}
		return applyAt(root, parentPath, 0, applyDelete)

	case "splice":
		if op.At == nil || op.Remove == nil || op.Insert == nil {
			return nil, fmt.Errorf("splice op missing at, remove, or insert at %s", formatPatchPath(op.Path))
		}
		applySplice := func(target any) (any, error) {
			array, ok := target.([]any)
			if !ok {
				return nil, fmt.Errorf("splice target is not an array: %s", formatPatchPath(op.Path))
			}
			at, remove := *op.At, *op.Remove
			if at < 0 || at > len(array) {
				return nil, fmt.Errorf("splice index out of bounds: %d (length %d)", at, len(array))
			}
			if remove < 0 || remove > len(array)-at {
				return nil, fmt.Errorf("splice remove count out of bounds: %d at %d (length %d)", remove, at, len(array))
			}
			next := make([]any, 0, len(array)-remove+len(op.Insert))
			next = append(next, array[:at]...)
			for _, item := range op.Insert {
				next = append(next, cloneJSONValue(item))
			}
			next = append(next, array[at+remove:]...)
			return next, nil
		}
		if len(op.Path) == 0 {
			return applySplice(root)
		}
		parentPath := op.Path[:len(op.Path)-1]
		key := op.Path[len(op.Path)-1]
		spliceInParent := func(parent any) (any, error) {
			object, ok := parent.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(op.Path))
			}
			target, exists := object[key]
			if !exists {
				return nil, fmt.Errorf("path does not exist: %s", formatPatchPath(op.Path))
			}
			updated, err := applySplice(target)
			if err != nil {
				return nil, err
			}
			copyMap := shallowCopyMap(object)
			copyMap[key] = updated
			return copyMap, nil
		}
		if len(parentPath) == 0 {
			return spliceInParent(root)
		}
		return applyAt(root, parentPath, 0, spliceInParent)

	default:
		return nil, fmt.Errorf("unknown view patch op: %q", op.Op)
	}
}

// applyViewPatch purely applies a protocol-2 view patch without mutating view.
// When currentRevision > 0, patch.BaseRevision must equal currentRevision.
func applyViewPatch(view any, patch viewPatch, currentRevision int) (any, error) {
	if currentRevision < 0 {
		return nil, fmt.Errorf("invalid currentRevision: %d", currentRevision)
	}
	if currentRevision > 0 {
		if patch.BaseRevision == nil {
			return nil, fmt.Errorf("view patch missing baseRevision (expected %d)", currentRevision)
		}
		if *patch.BaseRevision != currentRevision {
			return nil, fmt.Errorf("view patch baseRevision mismatch: expected %d, got %d", currentRevision, *patch.BaseRevision)
		}
	}
	if patch.BaseRevision != nil && patch.Revision != nil && *patch.Revision != *patch.BaseRevision+1 {
		return nil, fmt.Errorf("view patch revision mismatch: expected %d, got %d", *patch.BaseRevision+1, *patch.Revision)
	}
	if patch.Ops == nil {
		return nil, errors.New("view patch missing ops")
	}
	current := view
	for _, op := range patch.Ops {
		next, err := applyOp(current, op)
		if err != nil {
			return nil, err
		}
		current = next
	}
	return current, nil
}
