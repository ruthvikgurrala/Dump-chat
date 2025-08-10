// src/components/Chat.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import SettingsMenu from './SettingsMenu';
import './Chat.css';

// --- FIX: Receive theme/accent state and setters from App.jsx ---
const Chat = ({ theme, setTheme, accent, setAccent }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeChats, setActiveChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [autoDumpEnabled, setAutoDumpEnabled] = useState(true);

  // responsive
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadUserData = async () => {
      if (!auth.currentUser) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const autoDumpPref = userData.autoDump !== undefined ? userData.autoDump : true;
        setAutoDumpEnabled(autoDumpPref);

        if (autoDumpPref === false && userData.savedChats?.length > 0) {
          const chatPromises = userData.savedChats.map(uid => getDoc(doc(db, 'users', uid)));
          const chatDocs = await Promise.all(chatPromises);
          const loadedChats = chatDocs.filter(d => d.exists()).map(d => d.data());
          setActiveChats(loadedChats);
        }
      }
    };
    loadUserData();
  }, []);

  useEffect(() => {
    const saveActiveChats = async () => {
      if (autoDumpEnabled || !auth.currentUser) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      if (activeChats.length > 0) {
        const chatUIDs = activeChats.map(chat => chat.uid);
        await setDoc(userRef, { savedChats: chatUIDs }, { merge: true });
      } else {
        await setDoc(userRef, { savedChats: [] }, { merge: true });
      }
    };
    if (auth.currentUser) saveActiveChats();
  }, [activeChats, autoDumpEnabled]);

  const handleStartChat = (user) => {
    if (!activeChats.find(chat => chat.uid === user.uid)) {
      setActiveChats(prev => [...prev, user]);
    }
    setSelectedChat(user);
  };

  const handleBack = () => {
    setSelectedChat(null);
  };

  const handleAutoDumpChange = (newDumpState) => {
    setAutoDumpEnabled(newDumpState);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Wisp</h1>
        <div className="header-controls">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="settings-btn">⚙️</button>
          {isMenuOpen && (
            // --- FIX: Pass the props down to the SettingsMenu ---
            <SettingsMenu
              user={auth.currentUser}
              onAutoDumpChange={handleAutoDumpChange}
              theme={theme}
              setTheme={setTheme}
              accent={accent}
              setAccent={setAccent}
            />
          )}
        </div>
      </div>

      <div className="chat-body">
        {/* MOBILE: when a chat is selected, hide sidebar completely and only render ChatWindow */}
        {isMobile ? (
          selectedChat ? (
            <ChatWindow selectedChat={selectedChat} onBack={handleBack} />
          ) : (
            <Sidebar
              onStartChat={handleStartChat}
              activeChats={activeChats}
              onSelectChat={setSelectedChat}
              selectedChat={selectedChat}
            />
          )
        ) : (
          /* DESKTOP: show both */
          <>
            <Sidebar
              onStartChat={handleStartChat}
              activeChats={activeChats}
              onSelectChat={setSelectedChat}
              selectedChat={selectedChat}
            />
            <ChatWindow selectedChat={selectedChat} onBack={handleBack} />
          </>
        )}
      </div>
    </div>
  );
};

export default Chat;
