import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.jsx';
import { Provider } from '@/components/ui/provider';
import { Toaster } from '@/components/ui/toaster';
import './i18n/index.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* `reducedMotion="user"` lets Motion itself skip transform/layout
        animations under `prefers-reduced-motion: reduce`, on top of the
        explicit `useReducedMotion()` checks in each preset. */}
    <MotionConfig reducedMotion="user">
      <Provider>
        <App />
        <Toaster />
      </Provider>
    </MotionConfig>
  </StrictMode>
);
