import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, CardMedia, Alert, FormLabel } from '@mui/material';
import { useAuth } from './AuthContext';
import { readToken, writeToken } from '@chrome-extension-boilerplate/shared/lib/storages/tokenStorage';
import { API_CONFIG } from '@chrome-extension-boilerplate/hmr/lib/constant';
import { validateToken, apiRequest } from '@chrome-extension-boilerplate/shared/lib/services/authServices';

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
                    console.log('Validating token ...')
                    const isValid = await validateToken(storedToken, `${API_CONFIG.LOCAL_URL}${API_CONFIG.ENDPOINTS.USER_TOKEN}`);
                    console.log('Token is valid:', isValid);
                    if (isValid) {
                        setIsAuthenticated(true);
                        navigate('/home')
                    } else {
                        // Remove it from storage
                        await writeToken(null);
                        setIsAuthenticated(false);
                    }
                }
            } catch (error) {
                console.error('Error reading token:', error);
                setErrorMessage('Failed to read authentication token.');
            } finally {
                setLoading(false);
            }
        };

        checkAuthentication();
    }, [setIsAuthenticated, navigate]);

    const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setPassword(event.target.value);
    };

    const handleUserIdChange = ( event: ChangeEvent<HTMLInputElement>) => {
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
                `${API_CONFIG.LOCAL_URL}${API_CONFIG.ENDPOINTS.USER_TOKEN}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ username, password }),
                    headers: {
                        'Content-Type': 'application/json',
                    }
                },
                'POST',
                true
            );
            console.log('Response:', response);

            const data = await response.json();
            if (response.ok) {
                await writeToken(data.token);
                setIsAuthenticated(true);
                
                chrome.runtime.sendMessage(
                    { type: 'AUTH_SUCCESS', token: data.token },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Error sending message to background script:', chrome.runtime.lastError);
                        } else {
                            console.log('Message sent to background script successfully:', response);
                        }
                    }
                );
                navigate('/home');
            } else {
                const message = data.non_field_errors?.[0] || data.message || 'Login failed. Please check your credentials.';
                setErrorMessage(message);
            }
        } catch (error) {
            console.error('Error during login:', error);
            setErrorMessage('An unexpected error occurred. Please try again later.');
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
                    backgroundColor: '#000',
                }}
            >
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
                height: '100%',
                width: '100%',
                backgroundColor: 'black',
                padding: 1,
                boxSizing: 'border-box',
                borderRadius: 1,
                overflow: 'hidden',
            }}
        >
            <Card
                sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 400,
                    boxShadow: 3,
                    borderRadius: 2,
                    textAlign: 'center',
                }}
            >
                <Typography
                    variant='h5'
                    component='div'
                    gutterBottom
                    sx = {{
                        fontFamily: 'Cabin, sans-serif',
                        fontSize: '1.2rem',
                        color: 'text.primary'
                    }}
                >
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
                                marginBottom: 0.5,
                                marginTop: 1,
                                fontFamily: 'Cabin, sans-serif',
                                fontSize: '0.8rem',
                                color: 'text.primary'
                            }}
                        >
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
                                sx: { fontFamily: 'Cabin, sans-serif', fontSize: '0.7rem' }
                            }}
                        />
                        <FormLabel 
                            sx={{ 
                                textAlign: 'center', 
                                display: 'block',
                                marginBottom: 0.5,
                                marginTop: 1,
                                fontFamily: 'Cabin, sans-serif',
                                fontSize: '0.8rem',
                                color: 'text.primary'
                            }}
                        >
                            GESIS Surf-Passwort:
                        </FormLabel>
                        <TextField
                            label="GESIS Surf-Passwort"
                            type="password"
                            value={password}
                            onChange={handlePasswordChange}
                            fullWidth
                            size="small"
                            margin="normal"
                            variant="outlined"
                            required
                            error={!password && errorMessage !== ''}
                            helperText={!password && errorMessage !== '' ? 'GESIS Surf-Passwort ist erforderlich.' : ''}
                            InputLabelProps={{
                                sx: { fontFamily: 'Cabin, sans-serif', fontSize: '0.7rem' }
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
                            sx = {{backgroundColor: '#080074ff', color: '#fff'}}
                        >
                            Anmelden
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Login;
