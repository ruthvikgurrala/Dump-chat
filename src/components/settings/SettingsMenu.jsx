// src/components/settings/SettingsMenu.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import './SettingsMenu.css';
import { motion } from 'framer-motion';

const themes = ["linear-dark", "solarized-light", "cyberpunk", "forest"];
const accents = ["#7E22CE", "#10B981", "#F59E0B", "#E11D48", "#06B6D4", "#3B82F6", "#84CC16", "#F43F5E"];

const SettingsMenu = ({ user, onAutoDumpChange, theme, setTheme, accent, setAccent, onShowPremium, onShowProfile }) => {
  const [isAutoDumpOn, setIsAutoDumpOn] = useState(true);
  const [username, setUsername] = useState(user?.displayName || 'User');

  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.autoDump !== undefined) setIsAutoDumpOn(data.autoDump);
        }
      }
    };
    fetchUserPreferences();
  }, [user]);

  // Listen for real-time username updates
  useEffect(() => {
    if (user?.uid) {
      const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          setUsername(doc.data().username || 'User');
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  const savePref = async (field, value) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { [field]: value }, { merge: true });
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    savePref("theme", newTheme);
  };

  const handleAccentChange = (newColor) => {
    setAccent(newColor);
    savePref("accent", newColor);
  };

  const handleDumpToggle = async () => {
    const newAutoDumpState = !isAutoDumpOn;
    setIsAutoDumpOn(newAutoDumpState);
    savePref("autoDump", newAutoDumpState);
    if (newAutoDumpState) savePref("savedChats", []);
    onAutoDumpChange(newAutoDumpState);
  };

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <motion.div
      className="settings-menu"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="settings-header">
        <div className="user-info">
          {user?.photoURL ? (
            <img src={user.photoURL} alt={username} className="settings-avatar" />
          ) : (
            <div className="settings-avatar-placeholder">
              {username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="user-details">
            <span className="settings-username">{username}</span>
            <span className="settings-email">{user?.email}</span>
          </div>
        </div>
      </div>
      <ul>
        <li className="profile-item" onClick={onShowProfile}>
          Profile
        </li>
        <li className="premium-item" onClick={onShowPremium}>
          Go Premium
        </li>
        <li>
          <span>Theme</span>
          <select
            className="theme-select"
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            {themes.map((t) => (
              <option key={t} value={t}>
                {t.replace("-", " ")}
              </option>
            ))}
          </select>
        </li>
        <li>
          <span>Accent</span>
          <div className="accent-swatches">
            {accents.map((c) => (
              <div
                key={c}
                className={`accent-swatch ${accent === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => handleAccentChange(c)}
              />
            ))}
          </div>
        </li>
        <li>
          <span>Auto-Dump</span>
          <label className="switch">
            <input type="checkbox" checked={isAutoDumpOn} onChange={handleDumpToggle} />
            <span className="slider round"></span>
          </label>
        </li>
        <li onClick={handleLogout}>
          Sign Out
        </li>
      </ul>
    </motion.div>
  );
};

export default SettingsMenu;