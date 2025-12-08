import React from 'react';
import { Box, Card, CardContent, Typography, CardMedia, Button} from '@mui/material';
import { CustomSwitch, handlePrivateModeToggle } from '../styles/privacy/PrivateModeToggle.styles';
import PrivacyTimer from './PrivacyTimer';


const Home: React.FC = () => {

  const [privateMode, setPrivateMode] = React.useState(false);

  const handleRedirect = () => {
    chrome.tabs.create({ url: 'https://www.gesis.org/info/surf' });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: privateMode ? '#E53935' : '#003C78',
        padding: 1,
        boxSizing: 'border-box',
        borderRadius: 1,
        transition: 'background-color 0.3s ease',
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 400,
          boxShadow: 3,
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        <CardMedia
          component="img"
          image="https://www.gesis.org/fileadmin/admin/Dateikatalog/Logos/gesis_surf.svg"
          alt="GESIS Surf"
          sx={{ 
              position: 'relative',
              zIndex: 1,
              padding: 1,
              objectFit: 'contain',
              width: '40%',
              height: '80%',
              margin: '0 auto',
              backgroundColor: 'transparent',
            }}
        />
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: '#003C78' }}>
            GESIS Surf
          </Typography>
          <Typography variant="subtitle1" component="div" gutterBottom sx={{ fontWeight: 'bold', color: '#1E8CC8' }}>
            Erfolgreich verbunden
          </Typography>
          <Typography variant="body1" color="text.primary" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}>
            Privaten Modus einschalten.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, mx: 'auto', maxWidth: '90%', lineHeight: 1.4 }}>
            Der private Modus bleibt für 15 Minuten eingeschaltet, Die Zeit wird nur gezählt, wenn Sie aktiv im Browser surfen.
          </Typography>
        </CardContent>

        {/* Toggle for Private Mode */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1, p: 2 }}>
          <Typography variant="body2" sx={{ mr: 1 }} color="text.secondary">Privater Modus</Typography>
          <CustomSwitch
            checked={privateMode}
            onChange={ (event) => handlePrivateModeToggle(event, setPrivateMode) }
            inputProps={{ 'aria-label': 'controlled' }}
          />
          <Typography variant="body2" sx={{ ml: 1 }} color="text.secondary">{privateMode ? 'An' : 'Aus'}</Typography>
        </Box>

        {/* Privacy Timer Component */}
        <PrivacyTimer 
          isActive={privateMode} 
          onTimerEnd={() => setPrivateMode(false)} 
        />

        {/* Button to redirect to GESIS Surf */}
        <Box sx={{ p: 2 }}>
          <Button
            variant="contained"
            fullWidth
            sx = {{backgroundColor: '#1E8CC8', color: '#fff'}}
            onClick={handleRedirect}
          >
            GESIS Surf
          </Button>
        </Box>
      </Card>
    </Box>
  );
};

export default Home;
