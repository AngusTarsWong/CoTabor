import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import { I18nextProvider } from 'react-i18next';
import { initI18n } from '../i18n';
import i18n from '../i18n';
import App from './App';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

initI18n().then(() => {
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
});
