import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = ReactDOM.createRoot(appContainer);
  const isLoginWindow = document.body.dataset.loginWindow === 'true';
  root.render(
    <React.StrictMode>
      <Popup isLoginWindow={isLoginWindow} />
    </React.StrictMode>,
  );
}

init();
