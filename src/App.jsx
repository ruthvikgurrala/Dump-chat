// src/App.jsx

import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Helper function to convert hex to RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// ADDED: Function to apply accent colors immediately
const applyAccentColor = (accent) => {
  const rgb = hexToRgb(accent);
  if (rgb) {
    // Set both hex and RGB values
    document.documentElement.style.setProperty('--accent-primary', accent);
    document.documentElement.style.setProperty('--accent-hover', accent);
    document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    
    // Also store in localStorage
    localStorage.setItem('accent', accent);
    
    // Force a repaint to ensure CSS animations pick up new values
    document.documentElement.offsetHeight;
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Theme + Accent state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'linear-dark');
  const [accent, setAccent] = useState(() => {
    const savedAccent = localStorage.getItem('accent') || '#7E22CE';
    // Apply accent immediately on load to prevent flicker
    applyAccentColor(savedAccent);
    return savedAccent;
  });

  // Apply theme changes
  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Apply accent changes - IMPROVED
  useEffect(() => {
    applyAccentColor(accent);
  }, [accent]);

  // ADDED: Listen for storage changes from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'accent' && e.newValue && e.newValue !== accent) {
        setAccent(e.newValue);
      }
      if (e.key === 'theme' && e.newValue && e.newValue !== theme) {
        setTheme(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [accent, theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // If signing out (currentUser becomes null) clear cached chats
      if (!currentUser) {
        // remove all cached chat keys with prefix 'wisp_chat_'
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('wisp_chat_')) localStorage.removeItem(k);
        });
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--background-primary)',
        color: 'var(--text-primary)'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="app">
      {user ? (
        <Chat
          theme={theme}
          setTheme={setTheme}
          accent={accent}
          setAccent={setAccent}
        />
      ) : (
        <Auth />
      )}
    </div>
  );
}

export default App;