import React from 'react';
import Login from './components/Login/Login';
import { AuthProvider } from './components/Login/AuthContext';
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Login/HomePage';
import PrivateRoute from './components/Login/PrivateRoutes';

interface PopupProps {
  isLoginWindow: boolean;
}

const Popup: React.FC<PopupProps> = ({ isLoginWindow }) => {
  const Router = isLoginWindow ? MemoryRouter : BrowserRouter;

  const content = (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login isLoginWindow={isLoginWindow} />} />
          <Route
            path="/home"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );

  return isLoginWindow ? <div style={{ width: '100%', height: '100%' }}>{content}</div> : content;
};

export default Popup;
