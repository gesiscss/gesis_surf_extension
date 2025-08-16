export const styles = {
  container: {
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
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: 400,
    boxShadow: 3,
    borderRadius: 2,
    textAlign: 'center',
  },
  logoContainer: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#080074',
    height: 100,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logo: {
    position: 'relative',
    zIndex: 1,
    padding: 1,
    objectFit: 'contain',
    width: '40%',
    height: '80%',
    margin: '0 auto',
    backgroundColor: 'transparent',
  },
  title: {
    fontFamily: 'Cabin, sans-serif',
    fontWeight: 700
  },
  textField: {
    '& .MuiInputLabel-root': {
      fontFamily: 'Cabin, sans-serif',
      fontSize: '0.7rem'
    }
  },
  submitButton: {
    backgroundColor: '#080074ff',
    color: '#fff',
    marginTop: 2
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#000',
  }
} as const;