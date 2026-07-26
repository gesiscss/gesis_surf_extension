import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, CardMedia, Alert, FormLabel } from '@mui/material';
import { useAuth } from './AuthContext';
import { readToken, writeToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { apiRequest } from '@chrome-extension-boilerplate/shared/lib/services/apiClient';
import Browser from 'webextension-polyfill';

/**
 * Sends a log entry to Django's /extension-logs/ endpoint (which forwards to ES).
 * Used for login failures — the popup can't access the ElasticLogger singleton
 * (it lives in chrome-extension), so we send directly via fetch.
 * Fire-and-forget: never throws, never blocks the login flow.
 * Password is NEVER included in the log body.
 */
async function logToExtensionLogs(level: string, message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API_CONFIG.BASE_URL}/extension-logs/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        source: 'app-extension',
        message,
        ...context,
      }),
    });
  } catch {
    // Logging must never break the login flow
  }
}

interface LoginProps {}

// Render
const Login: React.FC<LoginProps> = () => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const { setIsAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthentication = async () => {
      setLoading(true);

      try {
        const data = await readToken();
        const storedToken = data || null;

        console.log('Stored Token:', storedToken);

        if (storedToken) {
          console.log('Validating token ...');
          const response = await apiRequest(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`,
            { method: 'GET' },
            { method: 'GET' },
          );

          if (response.status === 401) {
            await writeToken(null);
            setIsAuthenticated(false);
          } else if (response.status >= 500) {
            console.warn('Server unavailable, deferring validation');
            setIsAuthenticated(true);
            navigate('/home');
          } else if (response.ok) {
            const data = await response.json();
            if (typeof data === 'object' && data !== null && 'user_id' in data) {
              setIsAuthenticated(true);
              navigate('/home');
              console.log('Token is valid. User is authenticated.');
            } else {
              console.warn('Unexpected response format');
              setIsAuthenticated(true);
              navigate('/home');
            }
          } else {
            console.warn('Unexpected status:', response.status);
            setIsAuthenticated(true);
            navigate('/home');
          }
        } else {
          console.log('No token found. User is not authenticated');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthentication();
  }, [setIsAuthenticated, navigate]);

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  };

  const handleUserIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // To German Language
    if (!username || !password) {
      setErrorMessage('Bitte geben Sie Ihre GESIS Surf-ID und Passwort ein.');
      return;
    }
    setLoading(true);

    try {
      const response = await apiRequest(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_TOKEN}`,
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: username,
            password,
          }),
        },
        { method: 'POST', skipAuth: true },
      );

      const data = await response.json();
      console.log('Login response data:', data);

      if (response.ok) {
        await writeToken(data.token);
        setIsAuthenticated(true);

        try {
          const msgResponse = await Browser.runtime.sendMessage({
            type: 'AUTH_SUCCESS',
            token: data.token,
          });
          console.log('Message sent to background script successfully:', msgResponse);
        } catch (error) {
          console.error('Error sending message to background script:', error);
        }
        navigate('/home');
      } else {
        const message = data.non_field_errors?.[0] || data.message || 'Login failed. Please check your credentials.';
        setErrorMessage(message);

        // Log login failure to ES (password is NEVER included)
        void logToExtensionLogs('warn', `Login failed: ${message}`, {
          endpoint: API_CONFIG.ENDPOINTS.USER_TOKEN,
          method: 'POST',
          response_status: response.status,
          response_ok: false,
          request_body: JSON.stringify({ user_id: username }),
        });
      }
    } catch (error) {
      console.error('Error during login:', error);
      setErrorMessage('An unexpected error occurred. Please try again later.');

      // Log network error to ES (password is NEVER included)
      void logToExtensionLogs('error', 'Login network error', {
        endpoint: API_CONFIG.ENDPOINTS.USER_TOKEN,
        method: 'POST',
        error: error instanceof Error ? error.message : String(error),
        request_body: JSON.stringify({ user_id: username }),
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#1E8CC8',
        }}>
        <Typography variant="h5">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100%',
        width: '100%',
        backgroundColor: '#003C78',
        padding: 1,
        boxSizing: 'border-box',
        borderRadius: 1,
        overflow: 'hidden',
      }}>
      <Card
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          boxShadow: 3,
          borderRadius: 2,
          textAlign: 'center',
        }}>
        <Typography
          variant="h1"
          component="div"
          gutterBottom
          sx={{
            fontFamily: 'Cabin, sans-serif',
            fontSize: '1.7rem',
            fontWeight: 'bold',
            marginTop: 1,
            color: '#003C78',
          }}>
          GESIS Surf
        </Typography>
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
          <form onSubmit={handleSubmit} noValidate>
            <FormLabel
              sx={{
                textAlign: 'center',
                display: 'block',
                marginBottom: 0.2,
                marginTop: 1,
                fontFamily: 'Cabin, sans-serif',
                fontSize: '0.9rem',
                color: '#1E8CC8',
              }}>
              GESIS Surf-ID:
            </FormLabel>
            <TextField
              label="GESIS Surf-ID"
              type="text"
              value={username}
              onChange={handleUserIdChange}
              fullWidth
              size="small"
              margin="dense"
              variant="outlined"
              required
              error={!username && errorMessage !== ''}
              helperText={!username && errorMessage !== '' ? 'GESIS Surf-ID ist erforderlich.' : ''}
              InputLabelProps={{
                sx: { fontFamily: 'Cabin, sans-serif', fontSize: '0.7rem' },
              }}
            />
            <FormLabel
              sx={{
                textAlign: 'center',
                display: 'block',
                marginBottom: 0.2,
                marginTop: 1,
                fontFamily: 'Cabin, sans-serif',
                fontSize: '0.9rem',
                color: '#D20064',
              }}>
              GESIS Surf-Passwort:
            </FormLabel>
            <TextField
              label="GESIS Surf-Passwort"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              fullWidth
              size="small"
              margin="dense"
              variant="outlined"
              required
              error={!password && errorMessage !== ''}
              helperText={!password && errorMessage !== '' ? 'GESIS Surf-Passwort ist erforderlich.' : ''}
              InputLabelProps={{
                sx: { fontFamily: 'Cabin, sans-serif', fontSize: '0.7rem' },
              }}
            />
            {errorMessage && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {errorMessage}
              </Alert>
            )}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{
                backgroundColor: '#1E8CC8',
                color: '#fff',
                fontFamily: 'Cabin, sans-serif',
                fontWeight: 'bold',
                mt: 1,
              }}>
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
