// src/components/social/FriendRequests.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, acceptFriendRequestCallable } from '../../firebase'; // NEW IMPORT
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { User, Check, X, Trash2, Loader2, MessageCircle } from 'lucide-react';
import './FriendRequests.css';
import { motion } from 'framer-motion';

const FriendRequests = ({ onBack, onViewUser, userProfile, onStartChat }) => {
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionStatus, setActionStatus] = useState({});

  const currentUserId = auth.currentUser?.uid;

  const fetchSenderInfo = useCallback(async (senderId) => {
    try {
      const userDocRef = doc(db, 'users', senderId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        return {
          uid: senderId,
          username: userData.username || 'Unknown User',
          profilePicUrl: userData.profilePicUrl || null,
        };
      }
    } catch (err) {
      console.error("Error fetching sender info:", err);
    }
    return { uid: senderId, username: 'Unknown User', profilePicUrl: null };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setError('User not authenticated.');
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', currentUserId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setIsLoading(true);
      setError(null);
      try {
        const requestsDataPromises = snapshot.docs.map(async (d) => {
          const request = { id: d.id, ...d.data() };
          const senderInfo = await fetchSenderInfo(request.senderId);
          return { ...request, senderInfo };
        });
        const fetchedRequests = await Promise.all(requestsDataPromises);
        setIncomingRequests(fetchedRequests.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate()));
      }
      catch (err) {
        console.error("Error fetching friend requests:", err);
        setError('Failed to load friend requests.');
      }
      finally {
        setIsLoading(false);
      }
    }, (err) => {
      console.error("onSnapshot error:", err);
      setError('Failed to load real-time friend requests.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId, fetchSenderInfo]);

  const handleAcceptRequest = async (requestId, senderId) => {
    if (!currentUserId) return;
    setActionStatus(prev => ({ ...prev, [requestId]: 'loading' }));

    try {
      // Call the new Cloud Function to securely accept the request
      await acceptFriendRequestCallable({ requestId });
      
      setActionStatus(prev => ({ ...prev, [requestId]: 'success' }));
      console.log('Friend request accepted:', requestId);

    } catch (err) {
      console.error("Error accepting friend request:", err);
      setActionStatus(prev => ({ ...prev, [requestId]: 'error' }));
      setError(err.message || 'Failed to accept request. Please try again.');
    }
  };

  const handleRejectRequest = async (requestId) => {
    if (!currentUserId) return;
    setActionStatus(prev => ({ ...prev, [requestId]: 'loading' }));

    try {
      const requestRef = doc(db, 'friendRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        updatedAt: new Date()
      });
      setActionStatus(prev => ({ ...prev, [requestId]: 'success' }));
      console.log('Friend request rejected:', requestId);
    } catch (err) {
      console.error("Error rejecting friend request:", err);
      setActionStatus(prev => ({ ...prev, [requestId]: 'error' }));
      setError('Failed to reject request. Please try again.');
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!currentUserId) return;
    setActionStatus(prev => ({ ...prev, [requestId]: 'loading' }));

    try {
      const requestRef = doc(db, 'friendRequests', requestId);
      await deleteDoc(requestRef);
      setActionStatus(prev => ({ ...prev, [requestId]: 'success' }));
      console.log('Friend request deleted:', requestId);
    } catch (err) {
      console.error("Error deleting friend request:", err);
      setActionStatus(prev => ({ ...prev, [requestId]: 'error' }));
      setError('Failed to delete request. Please try again.');
    }
  };

  const handleStartChatAndClose = (senderInfo) => {
    onStartChat(senderInfo);
    onBack(); // Close the floating menu
  };

  return (
    <motion.div
      className="friend-requests-container"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="friend-requests-header">
        <button onClick={onBack} className="back-button" title="Close">
          ←
        </button>
        <h2>Friend Requests</h2>
      </div>

      <div className="friend-requests-content">
        {isLoading && (
          <div className="loading-message">
            <Loader2 size={20} className="spinner" /> Loading requests...
          </div>
        )}
        {!isLoading && error && <div className="error-message">{error}</div>}
        {!isLoading && !error && incomingRequests.length === 0 ? (
          <div className="no-requests-message">No friend requests.</div>
        ) : (
          <motion.div
            className="request-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {incomingRequests.map((request, index) => (
              <motion.div
                key={request.id}
                className="request-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="request-sender-info">
                  {request.senderInfo.profilePicUrl ? (
                    <img src={request.senderInfo.profilePicUrl} alt="Profile" className="profile-pic" />
                  ) : (
                    <div className="profile-pic-placeholder">
                      {request.senderInfo.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="sender-details">
                    <span className="sender-username">{request.senderInfo.username}</span>
                    <span className={`request-status status-${request.status}`}>
                      {request.status === 'pending' && 'Pending'}
                      {request.status === 'accepted' && 'Accepted'}
                      {request.status === 'rejected' && 'Rejected'}
                    </span>
                  </div>
                </div>
                <div className="request-actions">
                  {request.status === 'pending' ? (
                    <>
                      <button
                        className="action-btn accept-btn"
                        onClick={() => handleAcceptRequest(request.id, request.senderId)}
                        disabled={actionStatus[request.id] === 'loading'}
                        title="Accept Request"
                      >
                        {actionStatus[request.id] === 'loading' ? <Loader2 className="spinner" size={16} /> : <Check size={16} />}
                      </button>
                      <button
                        className="action-btn reject-btn"
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={actionStatus[request.id] === 'loading'}
                        title="Reject Request"
                      >
                        {actionStatus[request.id] === 'loading' ? <Loader2 className="spinner" size={16} /> : <X size={16} />}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="action-btn chat-btn"
                        onClick={() => handleStartChatAndClose(request.senderInfo)}
                        title="Start Chat"
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDeleteRequest(request.id)}
                        disabled={actionStatus[request.id] === 'loading'}
                        title="Delete Request"
                      >
                        {actionStatus[request.id] === 'loading' ? <Loader2 className="spinner" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default FriendRequests;