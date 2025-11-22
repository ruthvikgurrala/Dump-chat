// src/components/SettingsMenu.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './SettingsMenu.css';
import { motion } from 'framer-motion';

const themes = ["linear-dark", "solarized-light", "cyberpunk", "forest"];
const accents = ["#7E22CE", "#10B981", "#F59E0B", "#E11D48", "#06B6D4", "#3B82F6", "#84CC16", "#F43F5E"];

const SettingsMenu = ({ user, onAutoDumpChange, theme, setTheme, accent, setAccent, onShowPremium, onShowProfile }) => {
  const [isAutoDumpOn, setIsAutoDumpOn] = useState(true);
  
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
      <div className="menu-header">
        Signed in as <br />
        <strong>{user.displayName || user.email}</strong>
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