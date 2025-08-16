import React from 'react';
import Login from './components/Login';
import { AuthProvider } from './components/AuthContext';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import Login from './login/Login';
// import PrivateRoutes from  '../../utils/PriveteRoutes';
// import ConnectedPage from "./login/ConnectedPage";


const Popup = () => {
 
  return (
    <div id="app-container">
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </div>
  );
};

export default Popup
