// import React, { useState } from 'react';
// import { useNavigate, useLocation, Navigate, Route } from 'react-router-dom';
// import ConnectedPage from '../connected/ConnectedPage'
// import { login } from '../../../services/authService';

// function Login() {

//   const [formData, setFormData] = useState({
//     username: "",
//     password: "",
//     errors:{
//       username: "",
//       password: ""
//     }
//   });
//   const [error, setError] = useState('');

//   const navigate = useNavigate();

//   const [isButtonDisabled, setIsButtonDisabled] = useState(true);

//   const handleInputChange = (e:any) => {
//     const { name, value } = e.target;
//     setFormData((prevState) => ({ ...prevState, [name]: value }));
//     setError('');
//     setIsButtonDisabled(!formData.username || !formData.password); // Actualiza el estado del botón
//   };
  
//   const validateForm = () => {
//     const errors:any = {  };

//     // Check if username is empty
//     if (!formData.username) {
//       errors.username = "GESIS Surf-ID ist erforderlich";
//     }

//     // Check if password is empty
//     if (!formData.password) {
//       errors.password = "GESIS Surf-Passwort ist erforderlich";
//     }

//     setFormData((prevState) => ({ ...prevState, errors }));

//     // Return true if there are no errors
//     return Object.keys(errors).length === 0;
//   };

//   const handleLogin = (e:any) => {
//     e.preventDefault();
//     setIsButtonDisabled(true);
//     const noerrors =  validateForm();
//     if(noerrors){
//       setTimeout(async () => {
//         const _login = await login(formData.username,formData.password);
//         // eslint-disable-next-line @typescript-eslint/no-unused-expressions
//         _login.status ? navigate('/') : _login.message.response ? setError(_login.message.response.data.non_field_errors[0]) : _login.message.message ? setError(_login.message.message) :  setError(_login.message);
//       }, 500);
//     }
    
//   }

//   return (
//     <div className="login-container">
//       <img className='logoGlogin' src='logoGesis.png'></img>
//       <form id="login-form">
//             <div className="form-group">
//                 <label >GESIS Surf-ID:</label>
//                 <input
//                   type="email"
//                   name="username"
//                   value={formData.username}
//                   onChange={handleInputChange}
//                   placeholder="GESIS Surf-ID"
//                 />
//                 {formData.errors.username && (
//                     <p style={{ color: "red" }}>{formData.errors.username}</p>
//                 )}
//             </div>
//             <div className="form-group">
//                 <label >GESIS Surf-Passwort:</label>
//                 <input
//                       type="password"
//                       name="password"
//                       placeholder="GESIS Surf-Passwort" onChange={handleInputChange}
//                       value={formData.password}
//                     />
//                   {formData.errors.password && (
//                     <p style={{ color: "red" }}>{formData.errors.password}</p>
//                 )}

//             </div>
//             <button onClick={handleLogin} >Anmelden</button>
//             {error && (
//                     <p style={{ color: "red" }}>{error}</p>
//                 )}
//         </form>
//     </div>
//   )
// }

// export default Login
