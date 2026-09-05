import { useState } from 'react';
import { PasteButton } from './PasteButton';

interface Props {
  wrongPassword: boolean;
  busy: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPrompt({ wrongPassword, busy, onSubmit, onCancel }: Props) {
  const [password, setPassword] = useState('');

  const submit = () => {
    if (!password || busy) return;
    onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Password required</h2>
        <p className="mt-1.5 text-sm text-zinc-400">
          This folder is password-protected. Enter the password to continue.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Folder password"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-accent"
          />
          <PasteButton onPaste={setPassword} className="rounded-md border border-zinc-700 px-3 text-sm text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white" />
        </div>

        {wrongPassword && (
          <p className="mt-2 text-xs text-accent">Incorrect password. Try again.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!password || busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
