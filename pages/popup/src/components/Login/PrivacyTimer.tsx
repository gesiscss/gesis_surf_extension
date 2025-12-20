import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

interface PrivacyTimerProps {
  isActive: boolean;
  onTimerEnd: () => void;
  initialTime?: number | null;
  duration?: number;
}

const PRIVATE_MODE_DURATION = 1 * 60; // 15 minutes in seconds

export const PrivacyTimer: React.FC<PrivacyTimerProps> = ({ 
  isActive, 
  onTimerEnd,
  initialTime,
  duration = PRIVATE_MODE_DURATION 
}) => {
  const [timeLeft, setTimeLeft] = useState(initialTime || PRIVATE_MODE_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeEndRef = useRef(onTimerEnd);

  // Initialize timeLeft when initialTime prop changes
  useEffect(() => {
    if (initialTime !== null && initialTime !== undefined && initialTime > 0) {
      setTimeLeft(initialTime);
    }
  }, [initialTime]);

  // Update onTimerEnd ref to latest prop
  useEffect(() => {
    onTimeEndRef.current = onTimerEnd;
  }, [onTimerEnd]);

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
      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            // Time's up - turn off private mode
            clearInterval(timerRef.current!);
            timerRef.current = null;

            setTimeout(() => {
              onTimeEndRef.current();
            }, 0);

            return 0;
          }

          return prevTime - 1;
        })
      }, 1000);
    }
    return () => {
      // Cleanup on unmount
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isActive, timeLeft > 0]);

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