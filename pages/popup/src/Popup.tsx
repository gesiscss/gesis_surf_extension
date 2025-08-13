import React from 'react';
import Login from './components/Login';
// import { BrowserRouter as Router, Routes, Route, Navigate} from 'react-router-dom'
// import Login from './login/Login';
// import PrivateRoutes from  '../../utils/PriveteRoutes';
// import ConnectedPage from "./login/ConnectedPage";


const Popup = () => {
 
  return (
    <Login />
    // <Router>
    //     <Routes>
    //     <Route path='/' element={<PrivateRoutes />}>
    //         <Route path='/' element={<ConnectedPage />} />
    //       </Route>
    //         <Route path='/login' element={<Login />} />
    //         <Route path="*" element={<Navigate to="/"/>} />
    //     </Routes>
    // </Router>

  );
};

export default Popup
