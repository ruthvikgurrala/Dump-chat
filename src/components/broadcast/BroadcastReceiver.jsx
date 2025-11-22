import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import './BroadcastReceiver.css';

const BroadcastReceiver = ({ userProfile }) => {
    const [currentBroadcast, setCurrentBroadcast] = useState(null);
    const [seenBroadcasts, setSeenBroadcasts] = useState(() => {
        const saved = localStorage.getItem('wisp_seen_broadcasts');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        if (!userProfile) return;

        // We only want broadcasts created AFTER the user joined, or maybe just recent ones.
        // For simplicity, let's just listen to all relevant broadcasts and filter by 'seen' locally.
        // In a real app with millions of broadcasts, you'd want a better query (e.g. createdAt > user.lastSeenBroadcast).

        const broadcastsRef = collection(db, 'broadcasts');

        // Query for broadcasts that are either for 'all' or specifically for the user's plan
        // Note: Firestore doesn't support logical OR in 'where' clauses easily without multiple queries.
        // So we'll listen to 'all' and filter client-side for plan-specific ones if needed, 
        // OR we can just make two listeners (one for 'all', one for plan).
        // Let's try a simple approach: Listen to recent broadcasts and filter.

        const q = query(
            broadcastsRef,
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newBroadcasts = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                const broadcastId = doc.id;

                // 1. Check if already seen
                if (seenBroadcasts.includes(broadcastId)) return;

                // 2. Check targeting
                const target = data.target;
                const userPlan = userProfile.plan || 'free';

                let isRelevant = false;
                if (target === 'all') isRelevant = true;
                else if (target === userPlan) isRelevant = true;

                if (isRelevant) {
                    newBroadcasts.push({ id: broadcastId, ...data });
                }
            });

            // If we have unseen relevant broadcasts, show the most recent one
            if (newBroadcasts.length > 0) {
                // Sort by date just in case, though query did it
                // We pick the first one (most recent)
                setCurrentBroadcast(newBroadcasts[0]);
            }
        }, (error) => {
            console.error("Error listening for broadcasts:", error);
        });

        return () => unsubscribe();
    }, [userProfile, seenBroadcasts]);

    const handleDismiss = () => {
        if (!currentBroadcast) return;

        const newSeen = [...seenBroadcasts, currentBroadcast.id];
        setSeenBroadcasts(newSeen);
        localStorage.setItem('wisp_seen_broadcasts', JSON.stringify(newSeen));
        setCurrentBroadcast(null);
    };

    if (!currentBroadcast) return null;

    return (
        <div className="broadcast-overlay">
            <div className="broadcast-modal">
                <div className="broadcast-header">
                    <span className="broadcast-icon">📢</span>
                    <h3 className="broadcast-title">System Announcement</h3>
                </div>
                <div className="broadcast-content">
                    {currentBroadcast.message}
                </div>
                <div className="broadcast-footer">
                    <button onClick={handleDismiss} className="broadcast-dismiss-btn">
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BroadcastReceiver;
