// src/components/social/FriendsList.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, MessageCircle, User as UserIcon } from 'lucide-react';
import './FriendsList.css';

const FriendsList = ({ onBack, friendsList, onStartChat, onViewUser }) => {
  const [friendsData, setFriendsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFriends = useCallback(async () => {
    if (!friendsList || friendsList.length === 0) {
      setFriendsData([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const friendPromises = friendsList.map(uid => getDoc(doc(db, 'users', uid)));
      const docs = await Promise.all(friendPromises);
      const fetchedFriends = docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
      setFriendsData(fetchedFriends);
    } catch (err) {
      console.error("Error fetching friends data:", err);
      setError("Failed to load friends list.");
    } finally {
      setIsLoading(false);
    }
  }, [friendsList]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);
  
  const handleChatClick = (friend) => {
    onStartChat(friend);
  };

  if (isLoading) {
    return (
      <div className="friends-list-container card">
        <div className="friends-list-header">
          <button onClick={onBack} className="back-button"><ChevronLeft size={24} /></button>
          <h2>Friends</h2>
        </div>
        <div className="loading-message">Loading friends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="friends-list-container card">
        <div className="friends-list-header">
          <button onClick={onBack} className="back-button"><ChevronLeft size={24} /></button>
          <h2>Friends</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="friends-list-container card">
      <div className="friends-list-header">
        <button onClick={onBack} className="back-button"><ChevronLeft size={24} /></button>
        <h2>Friends</h2>
      </div>
      <div className="friends-list-content">
        {friendsData.length > 0 ? (
          <ul className="friends-list">
            {friendsData.map(friend => (
              <li key={friend.id} className="friend-item" onClick={() => onViewUser(friend.id)}>
                <div className="friend-info">
                  <div className="profile-pic-container">
                    {friend.profilePicUrl ? (
                      <img src={friend.profilePicUrl} alt={`${friend.username}'s profile`} className="profile-pic" />
                    ) : (
                      <div className="profile-pic-placeholder">
                        {friend.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="friend-username">{friend.username}</span>
                </div>
                <div className="friend-actions">
                  <button onClick={(e) => { e.stopPropagation(); onViewUser(friend.id); }} className="action-btn view-profile-btn" title="View Profile">
                    <UserIcon size={18} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleChatClick(friend); }} className="action-btn chat-btn" title="Start Chat">
                    <MessageCircle size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="no-friends-message">
            <p>You don't have any friends yet.</p>
            <p>Use the search bar to find people!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendsList;