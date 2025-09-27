import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

interface PrivacyTimerProps {
  isActive: boolean;
  onTimerEnd: () => void;
  duration?: number;
}

const PRIVATE_MODE_DURATION = 15 * 60; // 15 minutes in seconds

export const PrivacyTimer: React.FC<PrivacyTimerProps> = ({ 
  isActive, 
  onTimerEnd, 
  duration = PRIVATE_MODE_DURATION 
}) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Format seconds to MM:SS display
  const formatTimeLeft = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isActive) {
      // Reset timer when private mode is enabled
      setTimeLeft(duration);
      
      // Start countdown timer
      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            // Time's up - turn off private mode
            clearInterval(timerRef.current!);
            timerRef.current = null;
            onTimerEnd();
            return duration;
          }
          return prevTime - 1;
        });
      }, 1000);
    }

    // Cleanup timer on component unmount or when active state changes
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isActive, duration, onTimerEnd]);

  // Only render when active
  if (!isActive) return null;

  return (
    <Box sx={{ mb: 1 }}>
      <Typography 
        variant="subtitle2" 
        sx={{ 
          color: '#E53935', 
          fontWeight: 'bold',
          fontSize: '1rem'
        }}
      >
        {formatTimeLeft()}
      </Typography>
    </Box>
  );
};

export default PrivacyTimer;