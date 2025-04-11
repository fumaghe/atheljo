import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Trash2,
  Edit,
  Save,
  X,
  Search,
  Crown,
  User as UserIcon,
  Star
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { User } from '../../types/auth';

const Admin: React.FC = () => {
  const { getUsers, addUser, updateUser, deleteUser } = useAuth();
  const { companies } = useCompany();

  const [users, setUsers] = useState<User[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<Partial<User> | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'customer' as 'admin' | 'customer' | 'extra',
    company: '',
    subscription: 'None' as 'None' | 'Essential' | 'Advantage' | 'Premiere',
    subscriptionExpires: null as string | null
  });

  useEffect(() => {
    getUsers().then(fetchedUsers => setUsers(fetchedUsers));
  }, [getUsers]);

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.company) {
      alert('Please fill in required fields (username, password, company).');
      return;
    }

    const createdUser = await addUser({
      username: newUser.username,
      password: newUser.password,
      role: newUser.role,
      company: newUser.company,
      subscription: newUser.subscription,
      subscriptionExpires: newUser.subscriptionExpires
    });

    if (createdUser) {
      setUsers(prev => [...prev, createdUser]);
      setNewUser({
        username: '',
        password: '',
        role: 'customer',
        company: '',
        subscription: 'None',
        subscriptionExpires: null
      });
      setIsAddingUser(false);
    } else {
      alert('Failed to add user.');
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditUser({ ...user });
  };

  const handleSaveEdit = async () => {
    if (!editUser || !editingUserId) return;

    // Gestione del campo password
    const dataToUpdate = { ...editUser };
    if (!dataToUpdate.password) {
      delete dataToUpdate.password;
    }

    // Conversione delle permissions in un array di stringhe
    dataToUpdate.permissions = dataToUpdate.permissions?.map((p: any) =>
      typeof p === 'object' ? p.id : p
    ) || [];

    const updated = await updateUser(editingUserId, dataToUpdate);
    if (updated) {
      setUsers(prev => prev.map(u => (u.id === editingUserId ? updated : u)));
      setEditingUserId(null);
      setEditUser(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditUser(null);
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      const deleted = await deleteUser(userId);
      if (deleted) {
        setUsers(prev => prev.filter(u => u.id !== userId));
      }
    }
  };

  // Filtra gli utenti in base ai criteri di ricerca e filtro
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany = companyFilter ? user.company === companyFilter : true;
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    return matchesSearch && matchesCompany && matchesRole;
  });

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'admin':
        return 'px-2 py-0.5 rounded bg-[#22c1d4] text-[#06272b] font-bold flex items-center gap-1';
      case 'customer':
        return 'px-2 py-0.5 rounded bg-[#0b3c43] text-[#22c1d4] font-bold flex items-center gap-1';
      case 'extra':
        return 'px-2 py-0.5 rounded bg-[#eeeeee] text-[#06272b] font-bold flex items-center gap-1';
      default:
        return 'px-2 py-0.5 rounded bg-[#22c1d4]/20 text-[#22c1d4] font-bold flex items-center gap-1';
    }
  };

  // Funzione per resettare il walkthrough per un singolo utente (se true diventa false)
  const handleCompleteWalkthroughForUser = async (user: User) => {
    if (!user.walkthroughCompleted) return;
    const updated = await updateUser(user.id, { walkthroughCompleted: false });
    if (updated) {
      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, walkthroughCompleted: false } : u))
      );
      if (editingUserId === user.id && editUser) {
        setEditUser({ ...editUser, walkthroughCompleted: false });
      }
    }
  };

  // Funzione per resettare il walkthrough per tutti gli utenti (imposta walkthroughCompleted a false)
  const handleCompleteWalkthroughForAll = async () => {
    for (const user of users) {
      if (user.walkthroughCompleted) {
        const updated = await updateUser(user.id, { walkthroughCompleted: false });
        if (updated) {
          setUsers(prev =>
            prev.map(u => (u.id === user.id ? { ...u, walkthroughCompleted: false } : u))
          );
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <UserIcon className="w-6 h-6" />
          <h1 className="text-2xl font-bold">User Management</h1>
        </div>
        <div className="flex gap-4">
          {/* Pulsante per resettare il walkthrough per tutti */}
          <button
            onClick={handleCompleteWalkthroughForAll}
            className="flex items-center gap-2 bg-[#22c1d4] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
          >
            Reset Walkthrough
          </button>
          <button
            onClick={() => setIsAddingUser(!isAddingUser)}
            className="flex items-center gap-2 bg-[#22c1d4] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
          >
            {isAddingUser ? <X className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {isAddingUser ? 'Cancel' : 'Add User'}
          </button>
        </div>
      </div>

      <div className="bg-[#0b3c43] rounded-lg p-4 shadow-lg">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#eeeeee]/60" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#06272b] rounded-lg border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
            />
          </div>
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full md:w-auto px-4 py-2 bg-[#06272b] rounded-lg border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
            >
              <option value="">All Companies</option>
              {companies.filter(c => c !== 'all').map((company, i) => (
                <option key={i} value={company}>{company}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full md:w-auto px-4 py-2 bg-[#06272b] rounded-lg border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
              <option value="extra">Extra</option>
            </select>
          </div>
        </div>
      </div>

      {isAddingUser && (
        <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Add New User</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                  placeholder="Enter password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value as 'admin' | 'customer' | 'extra' })
                  }
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                >
                  <option value="admin">Admin</option>
                  <option value="customer">Customer</option>
                  <option value="extra">Extra</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company</label>
                <select
                  value={newUser.company}
                  onChange={(e) => setNewUser({ ...newUser, company: e.target.value })}
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                >
                  <option value="">Select Company</option>
                  {companies.filter(c => c !== 'all').map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subscription Level</label>
                <select
                  value={newUser.subscription}
                  onChange={(e) =>
                    setNewUser({ ...newUser, subscription: e.target.value as 'None' | 'Essential' | 'Advantage' | 'Premiere' })
                  }
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
                >
                  <option value="None">None</option>
                  <option value="Essential">Essential</option>
                  <option value="Advantage">Advantage</option>
                  <option value="Premiere">Premiere</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Subscription Expires</label>
                <DatePicker
                  selected={newUser.subscriptionExpires ? new Date(newUser.subscriptionExpires) : null}
                  onChange={(date: Date | null) =>
                    setNewUser({ ...newUser, subscriptionExpires: date ? date.toISOString() : null })
                  }
                  className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
                  placeholderText="Select expiration date"
                />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleAddUser}
              className="flex items-center gap-2 bg-[#22c1d4] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
            >
              <Save className="w-5 h-5" />
              Save User
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Users</h2>
        {filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-[#eeeeee]/60">
            No users found matching your filters
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-[#06272b] rounded-lg p-4 hover:shadow-lg transition-shadow">
                {editingUserId === user.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Username</label>
                        <input
                          type="text"
                          value={editUser?.username || ''}
                          onChange={(e) =>
                            setEditUser(prev => prev ? { ...prev, username: e.target.value } : null)
                          }
                          className="w-full bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">New Password (optional)</label>
                        <input
                          type="password"
                          value={editUser?.password || ''}
                          onChange={(e) =>
                            setEditUser(prev => prev ? { ...prev, password: e.target.value } : null)
                          }
                          className="w-full bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                          placeholder="Leave blank to keep current password"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Subscription Level</label>
                        <select
                          value={editUser?.subscription || 'None'}
                          onChange={(e) =>
                            setEditUser(prev => prev ? { ...prev, subscription: e.target.value as 'None' | 'Essential' | 'Advantage' | 'Premiere' } : null)
                          }
                          className="w-full bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
                        >
                          <option value="None">None</option>
                          <option value="Essential">Essential</option>
                          <option value="Advantage">Advantage</option>
                          <option value="Premiere">Premiere</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Subscription Expires</label>
                        <DatePicker
                          selected={editUser?.subscriptionExpires ? new Date(editUser.subscriptionExpires) : null}
                          onChange={(date: Date | null) =>
                            setEditUser(prev =>
                              prev ? { ...prev, subscriptionExpires: date ? date.toISOString() : null } : null
                            )
                          }
                          className="w-full bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20"
                          placeholderText="Select expiration date"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Walkthrough Status</label>
                        <select
                          value={editUser?.walkthroughCompleted ? 'Completed' : 'Pending'}
                          onChange={(e) => {
                            const newStatus = e.target.value;
                            setEditUser(prev =>
                              prev ? { ...prev, walkthroughCompleted: newStatus === 'Completed' } : null
                            );
                          }}
                          className="w-full bg-[#0b3c43] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-[#06272b] hover:bg-[#06272b]/80 transition-colors"
                      >
                        <X className="w-5 h-5" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="flex items-center gap-2 bg-[#22c1d4] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
                      >
                        <Save className="w-5 h-5" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <h3 className="font-semibold text-[#eeeeee]">{user.username}</h3>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={getRoleBadgeClasses(user.role)}>
                          {user.role === 'admin' && <Crown className="w-4 h-4" />}
                          {user.role === 'customer' && <UserIcon className="w-4 h-4" />}
                          {user.role === 'extra' && <Star className="w-4 h-4" />}
                          <span className="capitalize">{user.role}</span>
                        </span>
                        <span className="text-[#eeeeee]">{user.company}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
                      >
                        <Edit className="w-5 h-5 text-[#22c1d4]" />
                      </button>
                      {/* Pulsante per il reset del walkthrough rimosso in visualizzazione non-edit */}
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
                      >
                        <Trash2 className="w-5 h-5 text-[#f8485e]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
