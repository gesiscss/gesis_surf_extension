import React from 'react';
import ReactDOM, { createRoot } from 'react-dom/client';
import Popup from './Popup';

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = ReactDOM.createRoot(appContainer);
  root.render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  )
}

init();
