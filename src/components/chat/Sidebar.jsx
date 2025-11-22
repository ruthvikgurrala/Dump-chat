import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../firebase';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    onSnapshot,
    updateDoc,
    arrayUnion,
    arrayRemove,
    deleteDoc,
    getDoc
} from 'firebase/firestore';
import './Sidebar.css';

const Sidebar = ({ onStartChat, activeChats, onSelectChat, selectedChat, onViewUser }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'friends'
    const [friendsTabChats, setFriendsTabChats] = useState([]);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, user: null });
    const contextMenuRef = useRef(null);

    // Fetch Friends Tab Data
    useEffect(() => {
        if (!auth.currentUser) return;
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const unsubscribe = onSnapshot(userRef, async (userSnap) => {
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const friendsTabUids = userData.friendsTab || [];

                if (friendsTabUids.length > 0) {
                    const promises = friendsTabUids.map(async (uid) => {
                        const friendSnap = await getDoc(doc(db, 'users', uid));
                        return friendSnap.exists() ? { uid: friendSnap.id, ...friendSnap.data() } : null;
                    });
                    const friends = (await Promise.all(promises)).filter(f => f !== null);
                    setFriendsTabChats(friends);
                } else {
                    setFriendsTabChats([]);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Close Context Menu on Outside Click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
                setContextMenu({ ...contextMenu, visible: false });
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu]);

    // Search Logic
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        const q = query(
            collection(db, 'users'),
            where('username', '>=', searchQuery),
            where('username', '<=', searchQuery + '\uf8ff')
        );
        const snapshot = await getDocs(q);

        const results = snapshot.docs
            .map(doc => ({
                uid: doc.id,
                ...doc.data()
            }))
            .filter(user => user.uid !== auth.currentUser.uid);

        setSearchResults(results);
    };

    const clearSearch = () => {
        setSearchResults([]);
        setSearchQuery('');
    };
    // Context Menu Handlers
    const handleContextMenu = (e, user) => {
        e.preventDefault();
        e.stopPropagation();

        // Get button position to anchor the menu
        const rect = e.currentTarget.getBoundingClientRect();

        // Calculate position
        // Align the RIGHT edge of the menu with the RIGHT edge of the button (or slightly left of it)
        // This forces the menu to extend to the LEFT, into the sidebar.
        // Assuming menu width is approx 160px.
        let x = rect.right - 170;

        // If for some reason this pushes it off-screen to the left (very narrow sidebar?), clamp it.
        if (x < 10) x = 10;

        let y = rect.top - 50; // Lift it up even more

        // Adjust if too close to bottom edge
        if (window.innerHeight - y < 200) {
            y = rect.top - 200; // Show above the button
        }

        setContextMenu({
            visible: true,
            x,
            y,
            user
        });
    };

    const handleMoveToFriends = async () => {
        if (!auth.currentUser || !contextMenu.user) return;
        try {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, {
                savedChats: arrayRemove(contextMenu.user.uid),
                friendsTab: arrayUnion(contextMenu.user.uid)
            });
        } catch (error) {
            console.error("Error moving to friends:", error);
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    const handleMoveToActive = async () => {
        if (!auth.currentUser || !contextMenu.user) return;
        try {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, {
                friendsTab: arrayRemove(contextMenu.user.uid),
                savedChats: arrayUnion(contextMenu.user.uid)
            });
        } catch (error) {
            console.error("Error moving to active:", error);
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    const handleDump = async () => {
        if (!auth.currentUser || !contextMenu.user) return;
        try {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            if (activeTab === 'active') {
                await updateDoc(userRef, { savedChats: arrayRemove(contextMenu.user.uid) });
            } else {
                await updateDoc(userRef, { friendsTab: arrayRemove(contextMenu.user.uid) });
            }
        } catch (error) {
            console.error("Error dumping user:", error);
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    const handleDelete = async () => {
        if (!auth.currentUser || !contextMenu.user) return;
        if (!window.confirm("Are you sure? This will delete the entire chat history for both users.")) return;
        try {
            const chatId = [auth.currentUser.uid, contextMenu.user.uid].sort().join('_');
            await deleteDoc(doc(db, 'chats', chatId));
            // Also remove from lists
            await handleDump();
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
        setContextMenu({ ...contextMenu, visible: false });
    };

    // Filter activeChats to exclude anyone who is already in friendsTabChats
    const filteredActiveChats = activeChats.filter(chat =>
        !friendsTabChats.some(friend => friend.uid === chat.uid)
    );

    const currentList = activeTab === 'active' ? filteredActiveChats : friendsTabChats;

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
                    <button type="button" className="clear-btn" onClick={clearSearch}>❌</button>
                )}
                <button type="submit">Search</button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 ? (
                <div className="sidebar-results">
                    {searchResults.map((user) => (
                        <div
                            key={user.uid}
                            className="search-result-item"
                            onClick={() => onViewUser(user.uid)}
                        >
                            <div className="search-user-info">
                                {user.profilePicUrl ? (
                                    <img src={user.profilePicUrl} alt={user.username} className="search-profile-pic" />
                                ) : (
                                    <div className="search-profile-placeholder">{user.username.charAt(0).toUpperCase()}</div>
                                )}
                                <span className="search-username">{user.username}</span>
                            </div>
                            <div className="search-result-actions">
                                <button onClick={(e) => { e.stopPropagation(); onStartChat(user); }}>Chat</button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* Tabs */}
                    <div className="sidebar-tabs">
                        <button
                            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                            onClick={() => setActiveTab('active')}
                        >
                            Active
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
                            onClick={() => setActiveTab('friends')}
                        >
                            Friends
                        </button>
                    </div>

                    {/* Chat List */}
                    <div className="chat-list">
                        {currentList.map((chatUser) => (
                            <div
                                key={chatUser.uid}
                                className={`chat-list-item ${selectedChat?.uid === chatUser.uid ? 'active' : ''}`}
                                onClick={() => onSelectChat(chatUser)}
                            >
                                {chatUser.profilePicUrl ? (
                                    <img src={chatUser.profilePicUrl} alt={chatUser.username} className="chat-list-pic" />
                                ) : (
                                    <div className="chat-list-placeholder">{chatUser.username.charAt(0).toUpperCase()}</div>
                                )}
                                <span className="chat-list-username">{chatUser.username}</span>

                                {/* Context Menu Trigger */}
                                <button
                                    className="context-menu-trigger"
                                    onClick={(e) => handleContextMenu(e, chatUser)}
                                >
                                    ⋮
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Context Menu */}
            {contextMenu.visible && (
                <div
                    className="context-menu"
                    ref={contextMenuRef}
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    {activeTab === 'active' ? (
                        <div className="context-menu-item" onClick={handleMoveToFriends}>Move to Friends</div>
                    ) : (
                        <div className="context-menu-item" onClick={handleMoveToActive}>Move to Active</div>
                    )}
                    <div className="context-menu-item" onClick={handleDump}>Dump (Remove)</div>
                    <div className="context-menu-item delete" onClick={handleDelete}>Delete Chat</div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
