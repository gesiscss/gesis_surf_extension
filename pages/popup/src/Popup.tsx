import React from 'react';
import Login from './components/Login/Login';
import { AuthProvider } from './components/Login/AuthContext';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import Login from './login/Login';
// import PrivateRoutes from  '../../utils/PriveteRoutes';
import Home  from './components/Login/HomePage';


const Popup = () => {
 
  return (
    <div id="app-container">
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </div>
  );
};

export default Popup
