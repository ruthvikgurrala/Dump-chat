// src/components/SettingsMenu.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './SettingsMenu.css';

const SettingsMenu = ({ user, isDarkMode, setIsDarkMode }) => {
  const [isAutoDumpOn, setIsAutoDumpOn] = useState(true);

  // Effect to get the user's auto-dump preference from Firestore
  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().autoDump !== undefined) {
          setIsAutoDumpOn(userSnap.data().autoDump);
        }
      }
    };
    fetchUserPreferences();
  }, [user]);

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleDumpToggle = async () => {
    const newAutoDumpState = !isAutoDumpOn;
    
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { autoDump: newAutoDumpState }, { merge: true });
      setIsAutoDumpOn(newAutoDumpState); // Update state only after successful save
    } catch (error) {
      console.error("Failed to save preference:", error);
      alert("Could not save your setting. Please try again.");
    }
  };
  
  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <div className="settings-menu">
      <div className="menu-header">
        Signed in as <br />
        <strong>{user.displayName || user.email}</strong>
      </div>
      <ul>
        <li>
          <span>Dark Theme</span>
          <label className="switch">
            <input type="checkbox" checked={isDarkMode} onChange={handleThemeToggle} />
            <span className="slider round"></span>
          </label>
        </li>
        <li>
          <span>Auto-Dump Chats</span>
           <label className="switch">
            <input type="checkbox" checked={isAutoDumpOn} onChange={handleDumpToggle} />
            <span className="slider round"></span>
          </label>
        </li>
        <li onClick={handleLogout}>
          Sign Out
        </li>
      </ul>
    </div>
  );
};

export default SettingsMenu;