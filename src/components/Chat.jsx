import React, { useState } from 'react';
import { auth } from '../firebase';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import SettingsMenu from './SettingsMenu';
import './Chat.css';

const Chat = ({ isDarkMode, setIsDarkMode }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeChats, setActiveChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);

  const handleStartChat = (user) => {
    if (!activeChats.find(chat => chat.uid === user.uid)) {
      setActiveChats(prevChats => [...prevChats, user]);
    }
    setSelectedChat(user);
  };

  const handleBack = () => {
    setSelectedChat(null);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Dump Chat</h1>
        <div className="header-controls">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="settings-btn">
            ⚙️
          </button>
          {isMenuOpen && <SettingsMenu 
            user={auth.currentUser} 
            isDarkMode={isDarkMode} 
            setIsDarkMode={setIsDarkMode} 
          />}
        </div>
      </div>
      <div className={`chat-body ${selectedChat ? 'show-chat-window' : ''}`}>
        <Sidebar 
          onStartChat={handleStartChat} 
          activeChats={activeChats}
          onSelectChat={setSelectedChat}
          selectedChat={selectedChat}
        />
        <ChatWindow 
          selectedChat={selectedChat} 
          onBack={handleBack}
        />
      </div>
    </div>
  );
};

export default Chat;