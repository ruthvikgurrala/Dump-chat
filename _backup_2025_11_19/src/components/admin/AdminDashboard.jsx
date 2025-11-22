// src/components/admin/AdminDashboard.jsx

import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../firebase';
// UPDATED: Added 'getDoc' and 'setDoc' for the config view
import { doc, onSnapshot, collection, getDocs, updateDoc, query, where, getDoc, setDoc } from 'firebase/firestore';

import SettingsMenu from '../settings/SettingsMenu';
import './AdminDashboard.css';

// --- Dashboard View Component ---
const DashboardView = () => {
  const [stats, setStats] = useState({ totalUsers: 0, freeUsers: 0, webUsers: 0, mobileUsers: 0, omniumUsers: 0, bannedUsers: 0});
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'analytics', 'summary'), (doc) => {
      if (doc.exists()) { setStats(doc.data()); }
      else { console.log("No analytics document yet. Run your cloud function to create it."); }
    });
    return () => unsub();
  }, []);
  return (
    <div>
      <h2>Analytics Overview</h2>
      <div className="stats-container">
        <div className="stat-card"><h3>Total Users</h3><p>{stats.totalUsers || 0}</p></div>
        <div className="stat-card"><h3>Freemium Users</h3><p>{stats.freeUsers || 0}</p></div>
        <div className="stat-card"><h3>Webium Users</h3><p>{stats.webUsers || 0}</p></div>
        <div className="stat-card"><h3>Mobilum Users</h3><p>{stats.mobileUsers || 0}</p></div>
        <div className="stat-card"><h3>Omnium Users</h3><p>{stats.omniumUsers || 0}</p></div>
        <div className="stat-card"><h3>Banned Users</h3><p>{stats.bannedUsers || 0}</p></div>
      </div>
    </div>
  );
};

// Inside src/components/admin/AdminDashboard.jsx

// --- Users View Component ---
const UsersView = () => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState(''); // For the search bar
  const [searchError, setSearchError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null); // For the filter buttons

  const plans = ['free', 'web', 'mobile', 'omnium'];

  // This function is for the filter buttons
  const fetchUsersByFilter = async (filter) => {
    setIsLoading(true);
    setSearchError('');
    setUsers([]);
    setSearchTerm(''); // Clear search bar text
    setActiveFilter(filter);

    try {
      const usersRef = collection(db, 'users');
      let q;

      if (filter === 'all') {
        q = query(usersRef);
      } else if (filter === 'banned') {
        q = query(usersRef, where('isBanned', '==', true));
      } else {
        q = query(usersRef, where('plan', '==', filter));
      }

      const querySnapshot = await getDocs(q);
      const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (usersList.length === 0) {
        setSearchError(`No users found for the "${filter}" filter.`);
      }

      setUsers(usersList);

    } catch (error) {
      console.error("Error fetching users:", error);
      setSearchError("An error occurred. You may need to create a Firestore index. See the console (F12) for a link.");
    }
    setIsLoading(false);
  };

  // This function is for the search bar
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setSearchError('');
    setUsers([]);
    setActiveFilter(null); // De-select any active filter

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', searchTerm.toLowerCase()));
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (results.length === 0) {
        setSearchError(`No user found with username "${searchTerm}".`);
      } else {
        setUsers(results);
      }
    } catch (error) {
      console.error("Error searching for user:", error);
      setSearchError("An error occurred. You may need to create a Firestore index for usernames.");
    }
    setIsLoading(false);
  };

  // These action handlers for the table are now complete
  const handleToggleBan = async (userId, currentStatus) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { isBanned: !currentStatus });
    // This next line updates the UI instantly
    setUsers(users.map(u => u.id === userId ? { ...u, isBanned: !currentStatus } : u));
  };

  const handlePlanChange = async (userId, newPlan) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { plan: newPlan });
    // This next line updates the UI instantly
    setUsers(users.map(u => u.id === userId ? { ...u, plan: newPlan } : u));
  };

  const handleResetCount = async (userId) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { dailyMessageCount: 0 });
    // This next line updates the UI instantly
    setUsers(users.map(u => u.id === userId ? { ...u, dailyMessageCount: 0 } : u));
  };
  return (
    <div>
      <h2>User Management</h2>

      <div className="user-filters">
        <button onClick={() => fetchUsersByFilter('all')} className={activeFilter === 'all' ? 'active' : ''}>All Users</button>
        {plans.map(plan => (
          <button key={plan} onClick={() => fetchUsersByFilter(plan)} className={activeFilter === plan ? 'active' : ''}>
            {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </button>
        ))}
        <button onClick={() => fetchUsersByFilter('banned')} className={activeFilter === 'banned' ? 'active' : ''}>Banned</button>
      </div>

      <form onSubmit={handleSearch} className="user-search-form">
        <input
          type="text"
          placeholder="Or search for an exact username..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="admin-search-bar"
        />
        <button type="submit" disabled={isLoading}>Search</button>
      </form>

      {isLoading && <p>Loading...</p>}
      {searchError && <p className="search-error">{searchError}</p>}

      {users.length > 0 && (
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Plan</th>
              <th>Msg Count</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  <select
                    className="plan-selector"
                    value={user.plan || 'free'}
                    onChange={(e) => handlePlanChange(user.id, e.target.value)}
                  >
                    {plans.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td>{user.dailyMessageCount || 0}</td>
                <td>{user.isBanned ? 'Banned' : 'Active'}</td>
                <td>
                  <div className="action-buttons">
                    <button onClick={() => handleResetCount(user.id)} className="action-btn-reset">Reset Count</button>
                    <button onClick={() => handleToggleBan(user.id, user.isBanned)} className="action-btn-ban">
                      {user.isBanned ? 'Unban' : 'Ban'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// --- UPDATED: Configuration View Component with Referral Settings and better separation ---
const ConfigView = () => {
  const [settings, setSettings] = useState({
    dailyFreeLimit: 0,
    priceWeb: 0,
    priceMobilum: 0,
    priceOmnium: 0,
    referralPointsWebium: 0,
    referralPointsMobilum: 0,
    referralPointsOmnium: 0,
    redemptionCostWebium: 0,
    redemptionCostMobilum: 0,
    redemptionCostOmnium: 0,
    referralPointRedemptionCost: 0, // NEW: For the plan
  });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  // Reference to the 'settings' document in the 'config' collection
  const settingsRef = doc(db, 'config', 'settings');

  useEffect(() => {
    // Fetch the settings from Firestore when the component loads
    const fetchSettings = async () => {
      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        console.log("No settings document found! Please create one in Firestore.");
      }
      setIsLoading(false);
    };
    fetchSettings();
  }, []); // The empty array means this effect runs only once

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      // Save the current state of 'settings' back to Firestore
      await setDoc(settingsRef, settings, { merge: true });
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000); // Hide message after 3 seconds
    } catch (error) {
      console.error("Error saving settings: ", error);
      setMessage('Failed to save settings.');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Update state as the admin types in the form. Convert to Number for numeric fields.
    setSettings(prev => ({ ...prev, [name]: Number(value) }));
  };

  if (isLoading) {
    return <p>Loading configuration...</p>;
  }

  return (
    <div>
      <h2>App Configuration</h2>
      <form onSubmit={handleSave} className="config-form">
        <h3>General Settings</h3>
        <div className="form-field">
          <label htmlFor="dailyFreeLimit">Daily Free Message Limit</label>
          <input
            type="number"
            id="dailyFreeLimit"
            name="dailyFreeLimit"
            value={settings.dailyFreeLimit}
            onChange={handleChange}
          />
        </div>

        <h3>Pricing Settings</h3>
        <div className="form-field">
          <label htmlFor="priceWeb">Webium Price (₹)</label>
          <input type="number" id="priceWeb" name="priceWeb" value={settings.priceWeb} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="priceMobilum">Mobilum Price (₹)</label>
          <input type="number" id="priceMobilum" name="priceMobilum" value={settings.priceMobilum} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="priceOmnium">Omnium Price (₹)</label>
          <input type="number" id="priceOmnium" name="priceOmnium" value={settings.priceOmnium} onChange={handleChange} />
        </div>

        <h3>Referral Earning Points</h3>
        <div className="form-field">
          <label htmlFor="referralPointsWebium">Webium Plan Purchase (Points)</label>
          <input type="number" id="referralPointsWebium" name="referralPointsWebium" value={settings.referralPointsWebium} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="referralPointsMobilum">Mobilum Plan Purchase (Points)</label>
          <input type="number" id="referralPointsMobilum" name="referralPointsMobilum" value={settings.referralPointsMobilum} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="referralPointsOmnium">Omnium Plan Purchase (Points)</label>
          <input type="number" id="referralPointsOmnium" name="referralPointsOmnium" value={settings.referralPointsOmnium} onChange={handleChange} />
        </div>

        <h3>Referral Redemption Costs</h3>
        <div className="form-field">
          <label htmlFor="redemptionCostWebium">Redeem 1 Month of Webium (Points)</label>
          <input type="number" id="redemptionCostWebium" name="redemptionCostWebium" value={settings.redemptionCostWebium} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="redemptionCostMobilum">Redeem 1 Month of Mobilum (Points)</label>
          <input type="number" id="redemptionCostMobilum" name="redemptionCostMobilum" value={settings.redemptionCostMobilum} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="redemptionCostOmnium">Redeem 1 Month of Omnium (Points)</label>
          <input type="number" id="redemptionCostOmnium" name="redemptionCostOmnium" value={settings.redemptionCostOmnium} onChange={handleChange} />
        </div>

        <button type="submit">Save Settings</button>
        {message && <p className="save-message">{message}</p>}
      </form>
    </div>
  );
};


// --- Main Admin Dashboard Component ---
const AdminDashboard = ({ user, theme, setTheme, accent, setAccent }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const settingsMenuRef = useRef(null);
  const settingsBtnRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen &&
          settingsMenuRef.current &&
          !settingsMenuRef.current.contains(event.target) &&
          settingsBtnRef.current &&
          !settingsBtnRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // UPDATED: renderContent now includes the 'config' and 'broadcast' tabs
  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'users':
        return <UsersView />;
      case 'config':
        return <ConfigView />;
      case 'broadcast':
        return <div>Broadcast feature coming soon...</div>;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Wisp Admin Panel</h1>
        <div className="header-controls">
          <span>Welcome, {user.username}</span>
          <button ref={settingsBtnRef} onClick={() => setIsMenuOpen(!isMenuOpen)} className="settings-btn">⚙️</button>
          {isMenuOpen && (
            <div ref={settingsMenuRef}>
              <SettingsMenu user={auth.currentUser} theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} onAutoDumpChange={() => {}} />
            </div>
          )}
        </div>
      </div>
      <div className="admin-body">
        <nav className="admin-nav">
          <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'active' : ''}>Dashboard</button>
          <button onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'active' : ''}>Users</button>
          <button onClick={() => setActiveTab('broadcast')} className={activeTab === 'broadcast' ? 'active' : ''}>Broadcast</button>
          <button onClick={() => setActiveTab('config')} className={activeTab === 'config' ? 'active' : ''}>Configuration</button>
        </nav>
        <main className="admin-content">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;