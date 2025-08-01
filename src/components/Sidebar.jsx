// src/components/Sidebar.jsx

import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const Sidebar = ({ onStartChat, activeChats, onSelectChat, selectedChat }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    if (searchQuery.trim() === '') {
      setSearchResults([]); // Clear results if search is empty
      return;
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', searchQuery)); // No need for .toLowerCase() here anymore

    try {
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((doc) => {
        if (doc.data().uid !== auth.currentUser.uid) {
          results.push(doc.data());
        }
      });
      if (results.length === 0) {
        setError('No user found.');
        setSearchResults([]); // Clear results on no match
      } else {
        setSearchResults(results);
      }
    } catch (err) {
      console.error("Error searching for user:", err);
      setError('Failed to search.');
    }
  };

  const handleSelectUser = (user) => {
    onStartChat(user);
    setSearchResults([]); // Clear search results after starting a chat
    setSearchQuery('');   // Clear the search input text
  };

  return (
    <div className="sidebar">
      <form onSubmit={handleSearch} className="sidebar-search">
        <input
          type="text"
          placeholder="Search for a user..."
          value={searchQuery}
          // NEW: Force input to lowercase for better UX
          onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
        />
        <button type="submit">Search</button>
      </form>
      
      <div className="sidebar-content">
        {searchResults.length > 0 ? (
          <div className="sidebar-results">
            <h4>Search Results</h4>
            {searchResults.map((user) => (
              <div key={user.uid} className="search-result-item">
                <span>{user.username}</span>
                <button onClick={() => handleSelectUser(user)}>+</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="active-chats-list">
            <h4>Active Chats</h4>
            {activeChats.length > 0 ? activeChats.map((chat) => (
              <div 
                key={chat.uid} 
                className={`active-chat-item ${selectedChat?.uid === chat.uid ? 'selected' : ''}`}
                onClick={() => onSelectChat(chat)}
              >
                <span>{chat.username}</span>
              </div>
            )) : <p className="no-chats-message">Search for a user to start a chat.</p>}
          </div>
        )}
        {error && !searchResults.length > 0 && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
};

export default Sidebar;