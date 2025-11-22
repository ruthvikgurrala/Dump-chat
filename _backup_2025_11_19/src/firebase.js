// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const functions = getFunctions(app, 'us-central1');

const getPublicConfig = httpsCallable(functions, 'getPublicConfig');
const updateUsernameCallable = httpsCallable(functions, 'updateUsername');
const acceptFriendRequestCallable = httpsCallable(functions, 'acceptFriendRequest');
const unfriendUserCallable = httpsCallable(functions, 'unfriendUser');

export { getPublicConfig , updateUsernameCallable, acceptFriendRequestCallable, unfriendUserCallable };