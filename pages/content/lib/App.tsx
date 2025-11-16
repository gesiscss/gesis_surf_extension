// import { runtime } from 'webextension-polyfill'

// function waitForPageLoad() {
//   return new Promise<Boolean>(resolve => {
//     window.addEventListener('load', () => {
//       resolve(true);
//     });
//   });
// }

// async function startScroll(){
//   let _metaTags = await getMetaTags();
//     document.addEventListener("scrollend", (event) => {
//       runtime.sendMessage({ from: 'content', 
//       to: 'background', 
//         action:"scrollEnd", 
//           info:{
//             x:scrollX,
//             y:scrollY
//           },meta:_metaTags});
//     });
// }

// async function startClick(){
//   let _metaTags = await getMetaTags();
//   document.addEventListener("click", (event:any) => {
//     //console.log(event);
//     let _click = {
//       click_target_element:"",
//       click_target_tag:"",
//       click_target_class: "",
//       click_target_id: "",
//       click_page_x: 0,
//       click_page_y: 0,
//       click_referrer: "",
//       click_type:"",
//       click_time:new Date()
//     }
//              _click.click_type = event.type ? event.type : 'notType' ;
//             _click.click_target_element = event.localName;
//             _click.click_target_tag=(event.target as Element).localName;
//             _click.click_target_class= (event.target as Element).className ? (event.target as Element).className : 'notClass'
//             _click.click_target_id= (event.target as Element).id ? (event.target as Element).id : 'notId'
//             _click.click_page_x = event.pageX;
//             _click.click_page_y = event.pageY;
//             _click.click_referrer = (event.target as Element).baseURI;

//     runtime.sendMessage({ from: 'content', 
//       to: 'background', 
//         action:"clickContent", 
//           info:
//           _click,
//             meta:_metaTags
//         });
//   });
// }


// async function sendData() {
//     const _body = document.body.outerHTML;
//     let _metaTags = await getMetaTags();
//     let error = runtime.lastError;
//     if(!error){
//       runtime.sendMessage({ 
//         from: 'content', 
//         to: 'background', 
//           action:"pageLoaded", 
//             info:_body,meta:_metaTags});
//     }
   
// }

// export function init() {
//   sendData();
// }

// async function getMetaTags() {
//   let url = document.URL;
//   let hostfinal = new URL(url);

//   console.log(hostfinal);
  
//   let host = hostfinal.host;
  
//   let title = document.title;

//   let description = document.querySelector('meta[name="description"]')?.getAttribute('content') ? document.querySelector('meta[name="description"]')?.getAttribute('content') : '';

//   let favicon = document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') || document.querySelector('link[rel="icon"]')?.getAttribute('href');
//   return {title, description, favicon, host };
// }
// init();
// startScroll();
// startClick();

// function App() {
//   return (
//     <div></div>
//   )
// }

// export default App;
