// src/components/SettingsMenu.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './SettingsMenu.css';
import { motion } from 'framer-motion';

const themes = ["linear-dark", "solarized-light", "cyberpunk", "forest"];
const accents = ["#7E22CE", "#10B981", "#F59E0B", "#E11D48", "#06B6D4", "#3B82F6", "#84CC16", "#F43F5E"];

// --- FIX: Receive and use props for theme and accent from parent ---
const SettingsMenu = ({ user, onAutoDumpChange, theme, setTheme, accent, setAccent }) => {
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

  // --- FIX: Handlers now call the functions passed down via props ---
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
        <li>
          <span>Theme</span>
          <select
            className="theme-select"
            value={theme} // Controlled by the 'theme' prop
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
                className={`accent-swatch ${accent === c ? 'selected' : ''}`} // Controlled by the 'accent' prop
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
