// src/components/chat/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import './Sidebar.css';

const Sidebar = ({ onStartChat, activeChats, onSelectChat, selectedChat, onViewUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // handle search
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const q = query(
      collection(db, 'users'),
      where('username', '>=', searchQuery),
      where('username', '<=', searchQuery + '\uf8ff')
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));

    setSearchResults(results);
  };

  const clearSearch = () => {
    setSearchResults([]);
    setSearchQuery('');
  };

  return (
    <div className="sidebar">
      {/* Search Bar */}
      <form className="sidebar-search" onSubmit={handleSearch}>
        <input 
          type="text" 
          placeholder="Search users..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            type="button" 
            className="clear-btn"
            onClick={clearSearch}
          >
            ❌
          </button>
        )}
        <button type="submit">Search</button>
      </form>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="sidebar-results">
          {searchResults.map((user) => (
            <div 
              key={user.uid} 
              className="search-result-item" 
              onClick={() => onViewUser(user.uid)}
            >
              <div className="search-user-info">
                {user.profilePicUrl ? (
                  <img 
                    src={user.profilePicUrl} 
                    alt={user.username} 
                    className="search-profile-pic" 
                  />
                ) : (
                  <div className="search-profile-placeholder">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="search-username">{user.username}</span>
              </div>
              <div className="search-result-actions">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onStartChat(user); 
                  }}
                >
                  Chat
                </button>
                
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Chats */}
      <div className="chat-list">
        {activeChats.map((chatUser) => (
          <div
            key={chatUser.uid}
            className={`chat-list-item ${selectedChat?.uid === chatUser.uid ? 'active' : ''}`}
            onClick={() => onSelectChat(chatUser)}
          >
            {chatUser.profilePicUrl ? (
              <img 
                src={chatUser.profilePicUrl} 
                alt={chatUser.username} 
                className="chat-list-pic" 
              />
            ) : (
              <div className="chat-list-placeholder">
                {chatUser.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="chat-list-username">{chatUser.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
