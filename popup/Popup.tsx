
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate} from 'react-router-dom'
import Login from './login/Login';
import PrivateRoutes from  './utils/PriveteRoutes';
import ConnectedPage from "./connected/ConnectedPage";


const Popup = () => {
 
  return (
    <Router>
        <Routes>
        <Route path='/' element={<PrivateRoutes />}>
            <Route path='/' element={<ConnectedPage />} />
          </Route>
            <Route path='/login' element={<Login />} />
            <Route path="*" element={<Navigate to="/"/>} />
        </Routes>
    </Router>

  );
};

export default Popup
