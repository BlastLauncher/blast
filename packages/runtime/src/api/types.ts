// Types mirroring the parts of the Raycast declarations the shim implements.
// Image-likes and color-likes keep their declared shapes, so the serialized
// form stays the one extensions authored; shortcut shapes are widened to what
// reaches the scene as JSON.

/** `Color.Raw`: any of the literal color formats Raycast accepts. */
export type ColorRaw = string;

/** `Color.Dynamic`: a light/dark pair with optional contrast adjustment. */
export type ColorDynamic = {
  light: ColorRaw;
  dark: ColorRaw;
  adjustContrast?: boolean | null;
};

/** `Color.ColorLike`: a built-in color, a literal, or a dynamic pair. */
export type ColorLike = string | ColorDynamic;

/** `Image.URL` / `Image.Asset`: a remote URL or an `assets/` file name. */
export type ImagePath = string;

/** `Image.Source` / `Image.Fallback` for the light and dark themes. */
export type ImageThemeSource = { light: ImagePath; dark: ImagePath };

/** `Image.Source`: a URL, asset, icon name, emoji, or a theme-aware pair. */
export type ImageSource = ImagePath | ImageThemeSource;

/** `Image.Fallback`: the source to use when `Image.source` cannot be loaded. */
export type ImageFallback = ImagePath | ImageThemeSource;

/** The `Image` object: a source with optional fallback, mask and tint. */
export type ImageObject = {
  source: ImageSource;
  fallback?: ImageFallback | null;
  mask?: string | null;
  tintColor?: ColorLike | null;
};

/** `Image.ImageLike`: a URL, asset, icon, emoji, file icon or image object. */
export type ImageLike = ImagePath | { fileIcon: string } | ImageObject;

/** One platform's `Keyboard.Shortcut`, widened to what reaches the scene. */
export interface KeyShortcut {
  modifiers: string[];
  key: string;
}

/** `Keyboard.Shortcut`: one shortcut, or one per platform. */
export type Shortcut =
  | KeyShortcut
  | {
      macOS: KeyShortcut;
      Windows: KeyShortcut;
      /** @deprecated Use `Windows` instead. */
      windows?: KeyShortcut;
    };
