// src/App.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

// ... (keep existing code)



import Auth from './components/authentication/Auth';
import Chat from './components/Chat';
import AdminDashboard from './components/admin/AdminDashboard';
import BroadcastReceiver from './components/broadcast/BroadcastReceiver';

import './App.css';


// Helper function to convert hex to RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
};

// Function to apply accent colors immediately
const applyAccentColor = (accent) => {
  const rgb = hexToRgb(accent);
  if (rgb) {
    document.documentElement.style.setProperty('--accent-primary', accent);
    document.documentElement.style.setProperty('--accent-hover', accent);
    document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    localStorage.setItem('accent', accent);
    document.documentElement.offsetHeight;
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'linear-dark');
  const [accent, setAccent] = useState(() => {
    const savedAccent = localStorage.getItem('accent') || '#7E22CE';
    applyAccentColor(savedAccent);
    return savedAccent;
  });

  useEffect(() => { document.body.className = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { applyAccentColor(accent); }, [accent]);
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'accent' && e.newValue && e.newValue !== accent) { setAccent(e.newValue); }
      if (e.key === 'theme' && e.newValue && e.newValue !== theme) { setTheme(e.newValue); }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [accent, theme]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const unsubscribeProfile = onSnapshot(userRef, async (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.isBanned === true) {
              setAuthError("This account has been suspended. Please contact support.");
              auth.signOut();
            } else {
              setAuthError("");
              setUser(currentUser);
              setUserProfile(userData);
            }
          } else {
            // User exists in Auth but not in Firestore (zombie state). Recreate the profile.
            const newProfile = {
              uid: currentUser.uid,
              username: currentUser.displayName || currentUser.email.split('@')[0],
              email: currentUser.email,
              autoDump: true,
              dailyMessageCount: 0,
              plan: 'free',
              createdAt: new Date().toISOString(),
              isAdmin: false
            };

            try {
              await setDoc(userRef, newProfile, { merge: true });
              setUser(currentUser);
              setUserProfile(newProfile);
              setAuthError("");
            } catch (err) {
              console.error("Error recreating profile:", err);
              setAuthError("Failed to restore user profile.");
              auth.signOut();
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to user profile:", error);
          setAuthError("Failed to load user profile. Please try again.");
          setLoading(false);
        });
        return () => unsubscribeProfile();
      } else {
        setUser(null);
        setUserProfile(null);
        setAuthError("");
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('wisp_chat_')) localStorage.removeItem(k);
        });
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--background-primary)', color: 'var(--text-primary)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="app">
      {user && userProfile ? (
        userProfile.isAdmin ? (
          <AdminDashboard
            user={userProfile}
            theme={theme}
            setTheme={setTheme}
            accent={accent}
            setAccent={setAccent}
          />
        ) : (
          <Chat
            userProfile={userProfile}
            theme={theme}
            setTheme={setTheme}
            accent={accent}
            setAccent={setAccent}
          />
        )
      ) : (
        <Auth authError={authError} setAuthError={setAuthError} />
      )}
      {user && userProfile && !userProfile.isAdmin && (
        <BroadcastReceiver userProfile={userProfile} />
      )}
    </div>
  );
}

export default App;