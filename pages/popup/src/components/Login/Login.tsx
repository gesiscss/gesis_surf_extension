import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent } from 'react';
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

interface LoginProps {
  isLoginWindow: boolean;
}

// Render
const Login: React.FC<LoginProps> = ({ isLoginWindow }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const { setIsAuthenticated } = useAuth();
  const navigate = useNavigate();

  const openLoginWindow = useCallback(async () => {
    setErrorMessage('');
    try {
      const response: unknown = await Browser.runtime.sendMessage({ type: 'OPEN_LOGIN_WINDOW' });
      if (
        typeof response !== 'object' ||
        response === null ||
        !('status' in response) ||
        response.status !== 'success'
      ) {
        throw new Error('The background did not confirm opening the login window.');
      }
      window.close();
    } catch (error) {
      console.error('[Login] Could not open the login window:', error);
      setErrorMessage('Das Anmeldefenster konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.');
    }
  }, []);

  useEffect(() => {
    let active = true;

    const checkAuthentication = async () => {
      setLoading(true);
      let storedToken: string | null = null;

      try {
        storedToken = (await readToken()) || null;
        if (!active) return;

        if (storedToken) {
          console.log('Validating token ...');
          const response = await apiRequest(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_ME}`,
            { method: 'GET' },
            { method: 'GET' },
          );
          if (!active) return;

          if (response.status === 401) {
            console.warn('[Login] Token rejected by server — removing');
            await writeToken(null);
            if (!active) return;
            setIsAuthenticated(false);
          } else {
            // ok / 403 / 5xx — keep the session; only a 401 logs the user out.
            if (!response.ok) {
              console.warn('[Login] Could not validate token, status:', response.status);
            }
            setIsAuthenticated(true);
            navigate('/home');
            return;
          }
        } else {
          console.log('No token found. User is not authenticated');
          setIsAuthenticated(false);
        }

        if (!isLoginWindow) {
          await openLoginWindow();
        }
      } catch (error) {
        if (!active) return;
        if (storedToken) {
          // Backend unreachable — keep the session instead of logging the user out.
          console.warn('[Login] Server unreachable — keeping session:', error);
          setIsAuthenticated(true);
          navigate('/home');
          return;
        }
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
        setErrorMessage('Das Zugriffstoken konnte nicht gelesen werden.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void checkAuthentication();
    return () => {
      active = false;
    };
  }, [isLoginWindow, navigate, openLoginWindow, setIsAuthenticated]);

  const handleOpenLoginWindow = async () => {
    setLoading(true);
    await openLoginWindow();
    setLoading(false);
  };

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

      if (response.ok) {
        if (typeof data?.token !== 'string' || data.token.trim().length === 0) {
          console.error('[Login] The server did not return a valid authentication token.');
          setErrorMessage('Die Anmeldung ist fehlgeschlagen: Es wurde kein gültiges Zugriffstoken empfangen.');
          return;
        }

        await writeToken(data.token);

        try {
          const result: unknown = await Browser.runtime.sendMessage({
            type: 'AUTH_SUCCESS',
          });
          if (typeof result !== 'object' || result === null || !('status' in result) || result.status !== 'success') {
            throw new Error('The background did not confirm authentication.');
          }
        } catch (error) {
          console.error('Error sending message to background script:', error);
          setErrorMessage(
            'Die Anmeldung konnte im Hintergrund nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
          );
          return;
        }
        setPassword('');
        setIsAuthenticated(true);
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

  if (!isLoginWindow) {
    return (
      <Box sx={{ padding: 1, backgroundColor: '#003C78', minHeight: '100vh', boxSizing: 'border-box' }}>
        <Card sx={{ textAlign: 'center' }}>
          <CardContent>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Die Anmeldung erfolgt in einem separaten Fenster.
            </Typography>
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {errorMessage}
              </Alert>
            )}
            <Button variant="contained" fullWidth onClick={() => void handleOpenLoginWindow()}>
              Anmeldefenster öffnen
            </Button>
          </CardContent>
        </Card>
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
        overflow: 'auto',
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
              autoComplete="username"
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
              autoComplete="current-password"
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
