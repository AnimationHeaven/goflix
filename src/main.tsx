import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import App from './App';
import './index.css';

// TanStack Query pauses retries whenever it thinks the tab isn't focused
// (document.visibilityState === 'hidden') — independent of networkMode.
// That's a real trap here: the app auto-opens a browser tab that may not
// land focused, and a member browsing casually with the tab backgrounded
// would see a load get stuck indefinitely mid-retry instead of settling to
// an error they could act on. Locking focus to "always true" removes that
// failure mode entirely; window-focus refetching isn't a feature this app
// uses anyway.
focusManager.setFocused(true);

// networkMode 'always' avoids queries getting stuck in a "paused" fetchStatus
// on setups where the browser's online/offline detection is unreliable — this
// app only ever talks to its own local server, so navigator.onLine isn't a
// meaningful signal anyway.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
