/**
 * @file admin-panel/src/components/UsersView.jsx
 * @description Administrative user management panel providing account search, role delegation,
 * account status toggles, inline editing modal, and secure account deletion.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  Shield,
  ShieldAlert,
  HardHat,
  User,
  X,
  Loader2,
  Mail,
  Calendar,
  Clock,
  Filter
} from 'lucide-react';
import adminApiDefault, { adminApi as adminApiNamed } from '../services/api.js';

const adminApi = adminApiDefault || adminApiNamed;

const formatDate = (dateStr) => {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(dateStr);
  }
};

export function UsersView({ onRefresh }) {
  // Data states
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Feedback states
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Edit Modal states
  const [editingUser, setEditingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', role: 'user', isActive: true });
  const [isSaving, setIsSaving] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    if (!adminApi || typeof adminApi.getUsers !== 'function') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = {
        page,
        limit,
        sortBy,
        sortOrder
      };

      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (statusFilter !== 'ALL') params.isActive = statusFilter === 'ACTIVE';

      const data = await adminApi.getUsers(params);
      const userList = data?.users || data?.data?.users || (Array.isArray(data) ? data : []);
      const totalCount = data?.total ?? data?.pagination?.total ?? data?.count ?? userList.length;
      const pages = data?.totalPages ?? data?.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCount / limit));

      setUsers(userList);
      setTotal(totalCount);
      setTotalPages(pages);
    } catch (err) {
      console.error('Failed to load users:', err);
      setActionError(`Failed to load users: ${err.message || 'Network error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, roleFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = async () => {
    await fetchUsers();
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name || '',
      role: user.role || 'user',
      isActive: user.isActive !== undefined ? Boolean(user.isActive) : true
    });
  };

  // Close Edit Modal
  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditFormData({ name: '', role: 'user', isActive: true });
  };

  // Save Edit Form
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    const userId = editingUser._id || editingUser.id;
    setIsSaving(true);
    setActionSuccess('');
    setActionError('');

    try {
      await adminApi.updateUser(userId, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        isActive: editFormData.isActive
      });

      setActionSuccess(`User account "${editFormData.name || editingUser.email}" updated successfully.`);
      handleCloseEdit();
      await fetchUsers();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to update user: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Activation (Active <-> Inactive)
  const handleToggleActive = async (user) => {
    const userId = user._id || user.id;
    const nextState = !user.isActive;
    const actionLabel = nextState ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} user "${user.name || user.email}"?`)) {
      return;
    }

    setActionInProgressId(userId);
    setActionSuccess('');
    setActionError('');

    try {
      await adminApi.updateUser(userId, { isActive: nextState });
      setActionSuccess(`User "${user.name || user.email}" has been ${nextState ? 'activated' : 'deactivated'}.`);
      await fetchUsers();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to ${actionLabel} user: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Delete User
  const handleDeleteUser = async (user) => {
    const userId = user._id || user.id;
    if (!window.confirm(`PERMANENT ACTION: Are you sure you want to delete user "${user.name || user.email}" (${userId})? This cannot be undone.`)) {
      return;
    }

    setActionInProgressId(userId);
    setActionSuccess('');
    setActionError('');

    try {
      await adminApi.deleteUser(userId);
      setActionSuccess(`User "${user.name || user.email}" has been successfully deleted.`);
      await fetchUsers();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to delete user: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Role Badge Helper
  const getRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-dalBlue-50 text-dalBlue-700 dark:bg-dalBlue-900/60 dark:text-blue-300 border border-dalBlue-200 dark:border-blue-800 flex items-center gap-1 w-fit">
            <Shield className="w-3 h-3 text-dalBlue" />
            Admin
          </span>
        );
      case 'owner':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-chinarRed-50 text-chinarRed-700 dark:bg-chinarRed-950/80 dark:text-orange-300 border border-chinarRed-200 dark:border-chinarRed-800 flex items-center gap-1 w-fit">
            <ShieldAlert className="w-3 h-3 text-chinarRed" />
            Owner
          </span>
        );
      case 'contractor':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1 w-fit">
            <HardHat className="w-3 h-3 text-amber-600" />
            Contractor
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 w-fit">
            <User className="w-3 h-3 text-slate-500" />
            User
          </span>
        );
    }
  };

  // Status Badge Helper
  const getStatusBadge = (isActive) => {
    if (isActive !== false) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
          Active
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Inactive
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* 1. Header with Title & Total Count Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-charcoal-900 dark:text-paper-50 tracking-tight">
                User Management
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono bg-dalBlue-50 dark:bg-dalBlue-900/60 text-dalBlue-700 dark:text-blue-300 border border-dalBlue-200 dark:border-blue-800">
                {total.toLocaleString('en-IN')} Users
              </span>
            </div>
            <p className="text-xs sm:text-sm text-charcoal-500 dark:text-slate-400 mt-1">
              Audit registered accounts, update role permissions, toggle activation status, and view activity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-subtle transition-all cursor-pointer disabled:opacity-50"
            title="Refresh users list"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-dalBlue dark:text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Notification Banners */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess('')}
            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError('')}
            className="text-rose-600 hover:text-rose-800 dark:text-rose-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Filters & Search Strip */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email address..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="user">User (Citizen)</option>
              <option value="contractor">Contractor</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so);
                setPage(1);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
            >
              <option value="createdAt:desc">Newest Registered</option>
              <option value="createdAt:asc">Oldest Registered</option>
              <option value="name:asc">Name (A — Z)</option>
              <option value="name:desc">Name (Z — A)</option>
              <option value="lastLogin:desc">Recently Active</option>
            </select>
          </div>

        </div>
      </div>

      {/* 4. Responsive Data Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card overflow-hidden">
        
        {/* Table summary bar */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
          <span>
            Showing <strong className="text-slate-900 dark:text-white font-mono">{users.length}</strong> of{' '}
            <strong className="text-slate-900 dark:text-white font-mono">{total}</strong> users
          </span>
          <div className="flex items-center gap-2">
            <span>Per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-mono"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-dalBlue dark:text-blue-400 mx-auto" />
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Loading user accounts from database...
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No users found
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No registered user accounts matched your search terms or filter selection.
            </p>
            {(searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('ALL');
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline pt-2 cursor-pointer"
              >
                Clear all active filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                {users.map((u) => {
                  const userId = u._id || u.id;
                  const isProcessing = actionInProgressId === userId;
                  return (
                    <tr
                      key={userId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-dalBlue-50 dark:bg-dalBlue-950/60 text-dalBlue dark:text-blue-300 font-bold text-xs flex items-center justify-center border border-dalBlue-200 dark:border-blue-900 shrink-0">
                            {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {u.name || 'Anonymous User'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              ID: {userId ? String(userId).slice(-8) : '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-700 dark:text-slate-300">
                          {u.email}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        {getRoleBadge(u.role)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {getStatusBadge(u.isActive)}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {formatDate(u.createdAt)}
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {formatDate(u.lastLogin || u.lastLoginAt)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEdit(u)}
                            disabled={isProcessing}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-dalBlue dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Edit user details"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Deactivate / Activate Toggle */}
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={isProcessing}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.isActive !== false
                                ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                            }`}
                            title={u.isActive !== false ? 'Deactivate account' : 'Activate account'}
                          >
                            {u.isActive !== false ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={isProcessing}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Delete user account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Strip */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono bg-slate-50/50 dark:bg-slate-900/30">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="text-slate-500 dark:text-slate-400">
              Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{' '}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>

      {/* 6. Edit User Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
                  Edit User Account
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingUser.email}
                </p>
              </div>
              <button
                onClick={handleCloseEdit}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-200">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="e.g. Tariq Ahmad Khan"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-900 dark:text-white focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
                />
              </div>

              {/* Role Selection */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-200">
                  Account Role &amp; Privileges
                </label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-900 dark:text-white focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
                >
                  <option value="user">User (Citizen / General Viewer)</option>
                  <option value="contractor">Contractor (Bidder / Vendor)</option>
                  <option value="admin">Admin (Operational &amp; Ingestion Manager)</option>
                  <option value="owner">Owner (Superuser &amp; System Authority)</option>
                </select>
              </div>

              {/* Status Toggle */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-200">
                  Account Status
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editFormData.isActive === true}
                      onChange={() => setEditFormData({ ...editFormData, isActive: true })}
                      className="text-dalBlue focus:ring-dalBlue"
                    />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editFormData.isActive === false}
                      onChange={() => setEditFormData({ ...editFormData, isActive: false })}
                      className="text-chinarRed focus:ring-chinarRed"
                    />
                    <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Inactive / Suspended
                    </span>
                  </label>
                </div>
              </div>

              {/* Readonly Account Details */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <div>User ID: <span className="text-slate-700 dark:text-slate-300">{editingUser._id || editingUser.id}</span></div>
                <div>Registered: <span className="text-slate-700 dark:text-slate-300">{formatDate(editingUser.createdAt)}</span></div>
                <div>Last Login: <span className="text-slate-700 dark:text-slate-300">{formatDate(editingUser.lastLogin || editingUser.lastLoginAt)}</span></div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-dalBlue-600 hover:bg-dalBlue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

export default UsersView;
