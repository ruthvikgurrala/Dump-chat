// src/components/social/ProfilePage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, updateUsernameCallable, unfriendUserCallable } from '../../firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { User, Mail, Info, Users, Edit, Check, X, UserPlus, UserCheck, UserMinus, Clock, MessageCircle } from 'lucide-react';
import './ProfilePage.css';

const ProfilePage = ({ onBack, userProfile, viewingUserId, handleAddFriend, onRespondToRequests, onStartChat, handleCancelFriendRequest, onViewFriendsList }) => {
  const [profileData, setProfileData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableUsername, setEditableUsername] = useState('');
  const [editableBio, setEditableBio] = useState('');
  const [friendCount, setFriendCount] = useState(0);
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [friendshipStatus, setFriendshipStatus] = useState('none'); // 'none', 'friends', 'pending_sent', 'pending_received'

  const isViewingOwnProfile = !viewingUserId || (auth.currentUser && viewingUserId === auth.currentUser.uid);
  const currentProfileUid = isViewingOwnProfile ? auth.currentUser?.uid : viewingUserId;

  const fetchProfileAndStatus = useCallback(async () => {
    if (!currentProfileUid) {
      setIsLoadingProfile(false);
      return;
    }

    setIsLoadingProfile(true);
    setSaveMessage('');

    try {
      const profileRef = doc(db, 'users', currentProfileUid);
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const data = profileSnap.data();
        setProfileData(data);
        setEditableUsername(data.username || '');
        setEditableBio(data.bio || 'No bio set yet.');
        setFriendCount(data.friends && Array.isArray(data.friends) ? data.friends.length : 0);

        if (!isViewingOwnProfile && auth.currentUser) {
          const isFriend = userProfile?.friends?.includes(currentProfileUid) || false;
          if (isFriend) {
            setFriendshipStatus('friends');
          } else {
            // Check for outgoing pending request
            const sentRequestQuery = query(
              collection(db, 'friendRequests'),
              where('senderId', '==', auth.currentUser.uid),
              where('receiverId', '==', currentProfileUid),
              where('status', '==', 'pending')
            );
            const sentRequestSnap = await getDocs(sentRequestQuery);

            // Check for incoming pending request
            const receivedRequestQuery = query(
              collection(db, 'friendRequests'),
              where('senderId', '==', currentProfileUid),
              where('receiverId', '==', auth.currentUser.uid),
              where('status', '==', 'pending')
            );
            const receivedRequestSnap = await getDocs(receivedRequestQuery);

            if (!sentRequestSnap.empty) {
              setFriendshipStatus('pending_sent');
            } else if (!receivedRequestSnap.empty) {
              setFriendshipStatus('pending_received');
            } else {
              setFriendshipStatus('none');
            }
          }
        } else {
          setFriendshipStatus('friends'); // Own profile is always a "friend" to self for logic purposes
        }
      } else {
        setProfileData(null);
        setSaveMessage('Profile not found.');
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfileData(null);
      setSaveMessage('Failed to load profile.');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [currentProfileUid, isViewingOwnProfile, userProfile]);

  useEffect(() => {
    let unsubscribeFriendRequests = () => {};
    if (isViewingOwnProfile && userProfile) {
      setProfileData(userProfile);
      setEditableUsername(userProfile.username || '');
      setEditableBio(userProfile.bio || 'No bio set yet.');
      setFriendCount(userProfile.friends && Array.isArray(userProfile.friends) ? userProfile.friends.length : 0);
      setIsLoadingProfile(false);
      setFriendshipStatus('friends');
    } else {
      fetchProfileAndStatus();
      if (auth.currentUser && viewingUserId) {
        const friendRequestQuery = query(
          collection(db, 'friendRequests'),
          where('senderId', '==', auth.currentUser.uid),
          where('receiverId', '==', viewingUserId)
        );
        const unsubscribe = onSnapshot(friendRequestQuery, (snapshot) => {
          if (!snapshot.empty) {
            const requestStatus = snapshot.docs[0].data().status;
            if (requestStatus === 'pending') {
              setFriendshipStatus('pending_sent');
            } else if (requestStatus === 'accepted') {
              // This is now handled by the userProfile listener in App.jsx
            } else {
              setFriendshipStatus('none');
            }
          } else {
            if (userProfile?.friends?.includes(viewingUserId)) {
              setFriendshipStatus('friends');
            } else {
              setFriendshipStatus('none');
            }
          }
        }, (error) => {
          console.error("Error listening to friend requests:", error);
        });
        unsubscribeFriendRequests = unsubscribe;
      }
    }
    return () => {
      unsubscribeFriendRequests();
    };
  }, [currentProfileUid, userProfile, isViewingOwnProfile, fetchProfileAndStatus, viewingUserId]);

  const handleUnfriend = async () => {
    if (!auth.currentUser || !currentProfileUid || friendshipStatus !== 'friends') return;
    try {
      await unfriendUserCallable({ otherUserId: currentProfileUid });
      setSaveMessage('Unfriended successfully.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error("Error unfriending:", error);
      setSaveMessage('Failed to unfriend user.');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || !isViewingOwnProfile) {
      setSaveMessage('Error: Not authorized to edit this profile.');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    setSaveMessage('');
    setIsSaving(true);

    const updates = {};
    let hasChanges = false;
    let usernameChanged = false;

    const trimmedUsername = editableUsername.trim();
    if (trimmedUsername !== profileData.username) {
      if (!trimmedUsername) {
      setSaveMessage('Username cannot be empty.');
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
      return;
      }
      usernameChanged = true;
      hasChanges = true;
    }

    const trimmedBio = editableBio.trim();
    if (trimmedBio !== profileData.bio) {
      updates.bio = trimmedBio;
      hasChanges = true;
    }

    if (!hasChanges) {
      setSaveMessage('No changes to save.');
      setIsEditing(false);
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    try {
      if (usernameChanged) {
        const result = await updateUsernameCallable({ newUsername: trimmedUsername });
        if (result.data && result.data.success) {
          setSaveMessage(result.data.message);
          setProfileData(prev => ({ ...prev, username: trimmedUsername }));
        } else {
          const errorMessage = result.data?.message || 'Failed to update username due to an unknown reason.';
          setSaveMessage(errorMessage);
          setEditableUsername(profileData.username);
          setIsSaving(false);
          setTimeout(() => setSaveMessage(''), 3000);
          return;
        }
      }

      if (updates.bio !== undefined) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { bio: updates.bio });
        setProfileData(prev => ({ ...prev, bio: updates.bio }));
        if (!usernameChanged) {
          setSaveMessage('Profile updated successfully!');
        }
      } else if (usernameChanged) {
      } else {
        setSaveMessage('No changes to save.');
      }

      setTimeout(() => setSaveMessage(''), 3000);
      setIsEditing(false);
      setIsSaving(false);

    } catch (error) {
      let errorMessage = 'Failed to update profile. Please try again.';
      if (error.code) {
        switch (error.code) {
          case 'already-exists':
            errorMessage = 'This username is already taken. Please choose another.';
            break;
          case 'invalid-argument':
            errorMessage = 'Invalid username provided.';
            break;
          case 'unauthenticated':
            errorMessage = 'You must be logged in to update your profile.';
            break;
          case 'internal':
            errorMessage = 'An internal server error occurred. Please try again.';
            break;
          default:
            errorMessage = error.message || `An unexpected error occurred: ${error.code}`;
        }
      } else if (error.message) {
          errorMessage = error.message;
      }

      setSaveMessage(errorMessage);
      setEditableUsername(profileData.username);
      setEditableBio(profileData.bio);
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleCancelEdit = () => {
    setEditableUsername(profileData.username);
    setEditableBio(profileData.bio);
    setIsEditing(false);
    setSaveMessage('');
  };

  const handleStartChatFromProfile = () => {
    if (onStartChat && profileData) {
      onStartChat({ uid: profileData.uid, username: profileData.username, profilePicUrl: profileData.profilePicUrl });
    }
  };

  const handleAddFriendClick = () => {
    if (handleAddFriend) {
      setFriendshipStatus('pending_sent');
      handleAddFriend(profileData.uid);
    }
  };
  
  const handleCancelRequestClick = () => {
    if (handleCancelFriendRequest) {
      setFriendshipStatus('none');
      handleCancelFriendRequest(profileData.uid);
    }
  };

  const renderFriendActionButton = () => {
    if (isViewingOwnProfile) {
      return (
        <div className="profile-actions-row">
            <button onClick={onViewFriendsList} className="action-btn">
                <Users size={18} /> {profileData?.friends?.length || 0} Friends
            </button>
        </div>
      );
    }

    switch (friendshipStatus) {
      case 'friends':
        return (
          <>
            <button className="action-btn" onClick={handleStartChatFromProfile}>
              <MessageCircle size={18} /> Chat
            </button>
            <button className="action-btn edit-btn" onClick={handleUnfriend}>
              <UserMinus size={18} /> Unfriend
            </button>
          </>
        );
      case 'pending_sent':
        return (
          <>
            <button className="action-btn request-sent-btn" disabled>
              <Clock size={20} /> Request Sent
            </button>
            <button className="action-btn cancel-btn" onClick={handleCancelRequestClick}>
              <X size={20} /> Cancel
            </button>
          </>
        );
      case 'pending_received':
        return (
          <button onClick={onRespondToRequests} className="action-btn accept-request-btn">
            <UserPlus size={20} /> Respond to Request
          </button>
        );
      case 'none':
      default:
        return (
          <button onClick={handleAddFriendClick} className="action-btn add-friend-btn">
            <UserPlus size={20} /> Add Friend
          </button>
        );
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="profile-page-container card">
        <div className="profile-header">
          <button onClick={onBack} className="back-button">←</button>
        </div>
        <div className="loading-message">Loading Profile...</div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="profile-page-container card">
        <div className="profile-header">
          <button onClick={onBack} className="back-button">←</button>
        </div>
        <div className="error-message">Profile not found.</div>
      </div>
    );
  }

  return (
    <div className="profile-page-container card">
      <div className="profile-header">
        <button onClick={onBack} className="back-button">←</button>
        <h2>{isViewingOwnProfile ? 'My Profile' : `${profileData.username}'s Profile`}</h2>
        <div className="profile-actions">
          {isViewingOwnProfile ? (
            isEditing ? (
              <>
                <button onClick={handleSave} className="action-btn save-btn" disabled={isSaving}>
                  {isSaving ? 'Saving...' : <><Check size={20} /> Save</>}
                </button>
                <button onClick={handleCancelEdit} className="action-btn cancel-btn" disabled={isSaving}>
                  <X size={20} /> Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="action-btn edit-btn">
                <Edit size={20} /> Edit Profile
              </button>
            )
          ) : (
            <div className="friend-action-buttons">
              {renderFriendActionButton()}
            </div>
          )}
        </div>
      </div>

      <div className="profile-content">
        {saveMessage && (
          <div className={`profile-message ${
            saveMessage.includes('successfully') || saveMessage.includes('No changes') ? 'success' : 'error'}`}>
            {saveMessage}
          </div>
        )}

        <div className="profile-pic-section">
          {profileData.profilePicUrl ? (
            <img src={profileData.profilePicUrl} alt="Profile" className="profile-pic" />
          ) : (
            <div className="profile-pic-placeholder">
              {profileData.username ? profileData.username.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
        </div>

        <div className="profile-info-section">
          <div className="info-item">
            <User size={20} className="info-icon" />
            <span className="info-label">Username:</span>
            {isEditing && isViewingOwnProfile ? (
              <input
                type="text"
                className="editable-input"
                value={editableUsername}
                onChange={(e) => setEditableUsername(e.target.value)}
                maxLength="30"
              />
            ) : (
              <span className="info-value">{profileData.username}</span>
            )}
          </div>

          {isViewingOwnProfile && (
            <div className="info-item">
              <Mail size={20} className="info-icon" />
              <span className="info-label">Email:</span>
              <span className="info-value">{profileData.email}</span>
            </div>
          )}

          <div className="info-item bio-item">
            <Info size={20} className="info-icon" />
            <span className="info-label">Bio:</span>
            {isEditing && isViewingOwnProfile ? (
              <textarea
                className="editable-textarea"
                value={editableBio}
                onChange={(e) => setEditableBio(e.target.value)}
                rows="3"
                maxLength="150"
              />
            ) : (
              <span className="info-value bio-value">{profileData.bio || 'No bio set yet.'}</span>
            )}
          </div>

          <div className="info-item friends-item">
            <Users size={20} className="info-icon" />
            <span className="info-label">Friends:</span>
            <span className="info-value">
              {friendCount}
            </span>
            {isViewingOwnProfile && (
              <div className="profile-actions-row">
                  <button onClick={onViewFriendsList} className="view-friends-btn">View Friends</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;