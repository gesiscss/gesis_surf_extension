import axios, { AxiosResponse } from "axios";
import { runtime } from "webextension-polyfill";
import { getHostVersion, getHosts } from "../middleware/hosts";
import { getCurrentTab } from "../helpers/tabs";
//import qs from "qs";

const API_URL:any = 'https://surfcollect.gesis.org/api/'

export async function login(username: string, password: string){
        try {

          let data = JSON.stringify({
            'user_id': username,
            'password': password 
          });
              const _login:any = await axios.post(`${API_URL}user/token/`,data,{
                headers: { 
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin':'*',
                  'Accept':'application/json, text/plain, */*'
                },
              });
              await setCurrentUser(_login.data);
             // await getHosts();
          let myError = runtime.lastError;
          if(myError){
            console.log('Waiting Background');
          }else{
            runtime.sendMessage('',{ from: 'content', 
            to: 'background', 
              action:"login", 
                info:'done'}).then((resp:any)=>{
               console.log('SUCCESS LOGIN',resp);
               
            }).catch((error)=>{
             })
          }
        
              return {status:true} 

        } catch (error:any) {
    
            console.error('Error conection', error.response.data.non_field_errors[0]);
            return {status:false, message:error}
            
        }
};

export const logout = () => {
  localStorage.removeItem("WTG_User");
};

export const getCurrentUser = () => {
  //const userStr = localStorage.getItem("WTG_User");
  const userStr = localStorage.getItem("WTG_User");
  if (userStr) return JSON.parse(userStr);
  return null;
};

export const setCurrentUser = async (token:Object) =>{
  localStorage.setItem("WTG_User", JSON.stringify(token));
  runtime.sendMessage({ from: 'content', 
      to: 'background', 
        action:"setToken", 
          meta:token});
}
