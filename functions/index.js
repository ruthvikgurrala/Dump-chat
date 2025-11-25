const { onCall, HttpsError } = require("firebase-functions/v2/https"); // NEW: Import HttpsError
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions/v1"); // Explicitly import v1
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp();

// ... (rest of the file) ...

/**
 * Triggered when a new user is created in Firebase Auth.
 * Securely initializes the user document in Firestore with default values.
 */
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const db = getFirestore();
  const { uid, email } = user;

  console.log(`New user created: ${uid}, ${email}`);

  try {
    // Check if document already exists (edge case if client created it first)
    // If it exists, we overwrite the sensitive fields to be safe.
    const userRef = db.collection('users').doc(uid);

    await userRef.set({
      uid: uid,
      email: email,
      plan: 'free',            // SECURE DEFAULT
      dailyMessageCount: 0,    // SECURE DEFAULT
      isAdmin: false,          // SECURE DEFAULT
      isBanned: false,         // SECURE DEFAULT
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // We don't set username here because it might not be available yet.
      // The client sets the username via updateProfile/updateUsername.
    }, { merge: true });

    console.log(`User document initialized for ${uid}`);
  } catch (error) {
    console.error("Error initializing user document:", error);
  }
});

exports.calculateAnalytics = onSchedule("every 1 hours", async (event) => {
  console.log("Executing scheduled analytics calculation...");
  const db = getFirestore();

  try {
    const usersRef = db.collection("users");

    // 1. Get total user count
    const allUsersSnapshot = await usersRef.get();
    const totalUsers = allUsersSnapshot.size;

    // 2. Get counts for each specific paid plan
    const webUsersSnapshot = await usersRef.where("plan", "==", "web").get();
    const webUsers = webUsersSnapshot.size;

    const mobileUsersSnapshot = await usersRef.where("plan", "==", "mobile").get();
    const mobileUsers = mobileUsersSnapshot.size;

    // Assuming you name the combined plan 'omnium' in your database
    const omniumUsersSnapshot = await usersRef.where("plan", "==", "omnium").get();
    const omniumUsers = omniumUsersSnapshot.size;

    // 3. Calculate free users by subtracting all paid tiers from the total
    const freeUsers = totalUsers - webUsers - mobileUsers - omniumUsers;
    const bannedUsersSnapshot = await usersRef.where("isBanned", "==", true).get();
    const bannedUsers = bannedUsersSnapshot.size;

    const analyticsData = {
      totalUsers,
      freeUsers,
      webUsers,
      mobileUsers,
      omniumUsers,
      bannedUsers,
      lastUpdated: new Date(),
    };

    // 4. Write the new data structure to the document
    await db.collection("analytics").doc("summary").set(analyticsData);

    console.log("Analytics data updated successfully:", analyticsData);
  } catch (error) {
    console.error("Error calculating analytics:", error);
  }
});

/**
 * This scheduled function runs every day at midnight (America/New_York timezone).
 * It finds all users who have a dailyMessageCount greater than 0 and resets it to 0.
 */
exports.resetDailyCounts = onSchedule({
  schedule: "every day 00:00",
  timezone: "America/New_York",
}, async (event) => {
  console.log("Executing daily message count reset...");
  const db = getFirestore();
  const usersRef = db.collection("users");

  try {
    const snapshot = await usersRef.where("dailyMessageCount", ">", 0).get();

    if (snapshot.empty) {
      console.log("No user message counts to reset.");
      return;
    }

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { dailyMessageCount: 0 });
    });

    await batch.commit();
    console.log(`Successfully reset message counts for ${snapshot.size} users.`);

  } catch (error) {
    console.error("Error resetting daily message counts:", error);
  }
});

exports.getPublicConfig = onCall({ cors: true }, async (request) => {
  console.log("getPublicConfig function called.");
  const db = getFirestore();
  try {
    const settingsRef = db.collection("config").doc("settings");
    const docSnap = await settingsRef.get();

    if (!docSnap.exists) {
      console.log("Settings document not found!");
      return { error: "Configuration not found." };
    }

    const settingsData = docSnap.data();

    return {
      priceWeb: settingsData.priceWeb,
      priceMobilum: settingsData.priceMobilum,
      priceOmnium: settingsData.priceOmnium,
      referralPointsWebium: settingsData.referralPointsWebium,
      referralPointsMobilum: settingsData.referralPointsMobilum,
      referralPointsOmnium: settingsData.referralPointsOmnium,
      redemptionCostWebium: settingsData.redemptionCostWebium,
      redemptionCostMobilum: settingsData.redemptionCostMobilum,
      redemptionCostOmnium: settingsData.redemptionCostOmnium,
    };
  } catch (error) {
    console.error("Error fetching public config:", error);
    return { error: "An internal error occurred." };
  }
});

exports.updateUsername = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const newUsername = request.data.newUsername;
  const userId = request.auth.uid;

  console.log('updateUsername function invoked.');
  console.log('Request data:', request.data);
  console.log('Auth UID:', userId);

  if (!userId) {
    console.error('Error: User not authenticated.');
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  if (!newUsername || typeof newUsername !== 'string' || newUsername.trim().length === 0) {
    console.error('Error: Invalid username provided.');
    throw new HttpsError('invalid-argument', 'New username is required.');
  }

  const trimmedNewUsername = newUsername.trim().toLowerCase();
  console.log('Trimmed new username:', trimmedNewUsername);

  try {
    await db.runTransaction(async (transaction) => {
      console.log('Starting Firestore transaction...');
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        console.error('Error: User document not found for UID:', userId);
        throw new Error('not-found');
      }

      const oldUsername = userDoc.data().username;
      console.log('Old username from user doc:', oldUsername);

      if (oldUsername === trimmedNewUsername) {
        console.log('Username is already the same. No update needed.');
        return { success: true, message: 'Username is already the same.' };
      }

      const newUsernameRef = db.collection('usernames').doc(trimmedNewUsername);
      const newUsernameDoc = await transaction.get(newUsernameRef);

      if (newUsernameDoc.exists) {
        console.error('Error: New username already exists in /usernames:', trimmedNewUsername);
        throw new Error('already-exists');
      }

      console.log('Updating user document and username mappings...');
      transaction.update(userRef, { username: trimmedNewUsername });
      transaction.set(newUsernameRef, { uid: userId });

      if (oldUsername) {
        const oldUsernameRef = db.collection('usernames').doc(oldUsername);
        transaction.delete(oldUsernameRef);
        console.log('Old username mapping deleted:', oldUsername);
      }
      console.log('Transaction operations set.');
    });

    console.log('Firestore transaction completed successfully.');
    return { success: true, message: 'Username updated successfully.' };

  } catch (error) {
    console.error("Error caught in updateUsername function:", error);
    if (error.message === 'unauthenticated') {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    } else if (error.message === 'invalid-argument') {
      throw new HttpsError('invalid-argument', 'New username is required.');
    } else if (error.message === 'already-exists') {
      throw new HttpsError('already-exists', 'This username is already taken.');
    } else if (error.message === 'not-found') {
      throw new HttpsError('not-found', 'User profile not found.');
    } else {
      throw new HttpsError('internal', 'An internal error occurred during username update: ' + error.message);
    }
  }
});

exports.acceptFriendRequest = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const userId = request.auth.uid;

  if (!userId) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { requestId } = request.data;
  if (!requestId) {
    throw new HttpsError('invalid-argument', 'The request ID is missing.');
  }

  const requestRef = db.collection('friendRequests').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw new HttpsError('not-found', 'The friend request does not exist.');
    }

    const { senderId, receiverId, status } = requestDoc.data();

    if (receiverId !== userId) {
      throw new HttpsError('permission-denied', 'You do not have permission to accept this request.');
    }

    if (status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request is no longer pending.');
    }

    const receiverUserRef = db.collection('users').doc(receiverId);
    const senderUserRef = db.collection('users').doc(senderId);

    transaction.update(requestRef, {
      status: 'accepted',
      updatedAt: new Date(),
    });

    transaction.update(receiverUserRef, {
      friends: admin.firestore.FieldValue.arrayUnion(senderId),
    });

    transaction.update(senderUserRef, {
      friends: admin.firestore.FieldValue.arrayUnion(receiverId),
    });

    return { success: true, message: 'Friend request accepted successfully.' };
  }).catch((error) => {
    console.error("Transaction failed: ", error);
    if (error.code) {
      throw new HttpsError(error.code, error.message);
    } else {
      throw new HttpsError('internal', 'An internal error occurred.');
    }
  });
});

exports.unfriendUser = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const userId = request.auth.uid;

  if (!userId) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const { otherUserId } = request.data;
  if (!otherUserId) {
    throw new HttpsError('invalid-argument', 'The other user ID is required.');
  }

  return db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(userId);
    const otherUserRef = db.collection('users').doc(otherUserId);

    const userDoc = await transaction.get(userRef);
    const otherUserDoc = await transaction.get(otherUserRef);

    if (!userDoc.exists || !otherUserDoc.exists) {
      throw new HttpsError('not-found', 'One or both user profiles do not exist.');
    }

    transaction.update(userRef, { friends: admin.firestore.FieldValue.arrayRemove(otherUserId) });
    transaction.update(otherUserRef, { friends: admin.firestore.FieldValue.arrayRemove(userId) });

    return { success: true, message: 'Unfriended successfully.' };
  }).catch(error => {
    console.error("Unfriend transaction failed:", error);
    throw new HttpsError('internal', 'An error occurred during the unfriend operation.');
  });
});

exports.broadcastMessage = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const userId = request.auth.uid;

  if (!userId) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists || !userDoc.data().isAdmin) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { message, target } = request.data;
  if (!message) {
    throw new HttpsError('invalid-argument', 'Message is required.');
  }

  try {
    await db.collection('broadcasts').add({
      message,
      target: target || 'all',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      senderId: userId,
      type: 'system_broadcast'
    });
    return { success: true, message: 'Broadcast sent successfully.' };
  } catch (error) {
    console.error("Error sending broadcast:", error);
    throw new HttpsError('internal', 'Failed to send broadcast.');
  }
});

exports.deleteUser = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const callerUid = request.auth.uid;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  // Check if caller is admin
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { targetUserId } = request.data;
  if (!targetUserId) {
    throw new HttpsError('invalid-argument', 'Target User ID is required.');
  }

  try {
    // 1. Delete from Auth (requires admin SDK)
    await admin.auth().deleteUser(targetUserId);

    // 2. Delete User Document
    await db.collection('users').doc(targetUserId).delete();

    // 3. Delete Username Mapping (if exists)
    // We need to find the username first or just query the usernames collection
    // Ideally we should have stored the username before deleting the doc, but let's try to find it.
    const usernamesSnap = await db.collection('usernames').where('uid', '==', targetUserId).get();
    usernamesSnap.forEach(doc => doc.ref.delete());

    // 4. Remove from all chats (optional but recommended)
    // This is expensive, so maybe just remove them from the 'participants' array of chats they are in
    const chatsSnap = await db.collection('chats').where('participants', 'array-contains', targetUserId).get();
    const batch = db.batch();
    chatsSnap.forEach(doc => {
      // Either delete the chat or remove the user. 
      // For now, let's just remove the user from participants so they can't access it, 
      // but keep the chat for the other person.
      batch.update(doc.ref, {
        participants: admin.firestore.FieldValue.arrayRemove(targetUserId)
      });
    });
    await batch.commit();

    return { success: true, message: 'User deleted successfully.' };
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new HttpsError('internal', 'Failed to delete user: ' + error.message);
  }
});



exports.updateAnalytics = onCall({ cors: true }, async (request) => {
  // Manually trigger the analytics calculation
  const db = getFirestore();
  const callerUid = request.auth.uid;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  // Check admin
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  console.log("Manual analytics update triggered by", callerUid);

  try {
    const usersRef = db.collection("users");
    const allUsersSnapshot = await usersRef.get();
    const totalUsers = allUsersSnapshot.size;

    const webUsersSnapshot = await usersRef.where("plan", "==", "web").get();
    const webUsers = webUsersSnapshot.size;

    const mobileUsersSnapshot = await usersRef.where("plan", "==", "mobile").get();
    const mobileUsers = mobileUsersSnapshot.size;

    const omniumUsersSnapshot = await usersRef.where("plan", "==", "omnium").get();
    const omniumUsers = omniumUsersSnapshot.size;

    const freeUsers = totalUsers - webUsers - mobileUsers - omniumUsers;
    const bannedUsersSnapshot = await usersRef.where("isBanned", "==", true).get();
    const bannedUsers = bannedUsersSnapshot.size;

    const analyticsData = {
      totalUsers,
      freeUsers,
      webUsers,
      mobileUsers,
      omniumUsers,
      bannedUsers,
      lastUpdated: new Date().toISOString(), // Use ISO string for easier parsing
    };

    await db.collection("analytics").doc("summary").set(analyticsData);
    return { success: true, data: analyticsData };
  } catch (error) {
    console.error("Error updating analytics:", error);
    throw new HttpsError('internal', 'Failed to update analytics.');
  }
});

exports.updateUserAdmin = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const callerUid = request.auth.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Authentication required.');

  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { targetUserId, updates } = request.data;
  if (!targetUserId || !updates) {
    throw new HttpsError('invalid-argument', 'Target User ID and updates are required.');
  }

  try {
    await db.collection('users').doc(targetUserId).update(updates);
    return { success: true, message: 'User updated successfully.' };
  } catch (error) {
    console.error("Error updating user:", error);
    throw new HttpsError('internal', 'Failed to update user.');
  }
});

exports.updateConfigAdmin = onCall({ cors: true }, async (request) => {
  const db = getFirestore();
  const callerUid = request.auth.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Authentication required.');

  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { settings } = request.data;
  if (!settings) {
    throw new HttpsError('invalid-argument', 'Settings data is required.');
  }

  try {
    await db.collection('config').doc('settings').set(settings, { merge: true });
    return { success: true, message: 'Configuration updated successfully.' };
  } catch (error) {
    console.error("Error updating config:", error);
    throw new HttpsError('internal', 'Failed to update configuration.');
  }
});