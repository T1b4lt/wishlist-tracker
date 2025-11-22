import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { Provider } from '@/components/ui/provider';
import { Toaster } from '@/components/ui/toaster';
import './i18n/index.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider>
      <App />
      <Toaster />
    </Provider>
  </StrictMode>
);
