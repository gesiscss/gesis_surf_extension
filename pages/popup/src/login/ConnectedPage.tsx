
import React, { useState } from 'react';
import { runtime, storage } from 'webextension-polyfill';
import ReactSwitch from 'react-switch';
import '../Popup.css'
import { getPrivateMode, setPrivateMode } from '../../services/privateMode';

function ConnectedPage() {

  const getPrivateConfig = async () => {
      const _private = await getPrivateMode();
      return _private;
  }

    const [checked, setChecked] = useState(false);

    getPrivateConfig().then((d:any)=>{
      setChecked(d.private.mode)
    });
  
    const handlePrivate = val => {
      setChecked(val)
      setPrivateMode(val)
    }

  return (
    <div className='centered-content'>
      <img className='logoG' src='logoGesis.png' style={{width:'70%'}}></img>
      <h2>Erfolgreich verbunden!</h2>

      <div className='private'>
      <h2>Privaten Modus einschalten</h2>
      <span>Der private Modus bleibt für 15 Minuten eingeschaltet, wenn Sie im Internet surfen.</span>
<br></br>
        <ReactSwitch
          checked={checked}
          onChange={handlePrivate}
        />
        </div>
      
    </div>
  );
}

export default ConnectedPage;