// Widened versions of the Raycast declaration types: M1 props pass through to
// the scene as JSON, so literal unions (icon names, key equivalents, masks)
// stay plain strings until those surfaces ship.

/** `Image.ImageLike`: a URL, asset path, icon name, file icon or image object. */
export type ImageLike =
  | string
  | { fileIcon: string }
  | {
      source: string | { light: string; dark: string };
      fallback?: string;
      mask?: string;
      tintColor?: string;
      title?: string;
    };

/** `Keyboard.Shortcut`, widened to its structural minimum. */
export interface Shortcut {
  modifiers?: string[];
  key: string;
}
