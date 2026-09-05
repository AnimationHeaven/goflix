interface Props {
  onPaste: (text: string) => void;
  className?: string;
}

/** A tap-to-paste button for fields where a WebView's long-press-to-paste
 * gesture is awkward or unreliable (Android in particular) — reads the
 * clipboard directly instead. Falls back to the field's normal paste
 * gesture, which still works either way, if the browser refuses clipboard
 * access (unsupported, or permission denied). */
export function PasteButton({ onPaste, className }: Props) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const text = (await navigator.clipboard.readText()).trim();
          if (text) onPaste(text);
        } catch {
          /* clipboard unavailable/denied — long-press paste still works */
        }
      }}
      title="Paste from clipboard"
      className={
        className ??
        'rounded-md border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white'
      }
    >
      📋 Paste
    </button>
  );
}
