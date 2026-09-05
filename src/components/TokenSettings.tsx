import { useEffect, useState } from 'react';
import { clearGofileToken, getGofileToken, setGofileToken } from '../lib/storage';
import { PasteButton } from './PasteButton';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (token: string) => void;
}

export function TokenSettings({ open, onClose, onSaved }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(getGofileToken());
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed) setGofileToken(trimmed);
    else clearGofileToken();
    onSaved(trimmed);
    onClose();
  };

  const handleClear = () => {
    clearGofileToken();
    setValue('');
    onSaved('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">Gofile account token</h2>
        <p className="mt-1.5 text-sm text-zinc-400">
          Adding your account token lets GoFlix access private folders and content that
          requires sign-in, using the same permissions as your Gofile account.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="Paste your Gofile API token"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-accent"
          />
          <PasteButton onPaste={setValue} className="rounded-md border border-zinc-700 px-3 text-sm text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white" />
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          Found under your Gofile profile settings. Stored only in this browser's local storage —
          never sent anywhere but Gofile's API.
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:text-white"
          >
            Clear token
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
