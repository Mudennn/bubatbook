import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useFleet } from '../../hooks/useFleet';
import { useAdminCustomers, updateUserRole, getCustomerBookings, verifyCustomer, unverifyCustomer, rejectVerification } from '../../hooks/useAdmin';
import AdminLayout from '../../components/AdminLayout';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import { formatDate } from '../../utils/dates';
import { formatMYR } from '../../utils/pricing';
import {
  Search, Users, Shield, ShieldOff, Mail, Phone, CalendarDays,
  ChevronDown, ChevronUp, X, AlertTriangle, CheckCircle, Clock, FileCheck, Wallet,
  Edit3, Upload, FileImage, Loader2, UserPlus
} from 'lucide-react';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { uploadFileRobust } from '../../lib/uploadHelper';

const ROLE_OPTIONS = ['ALL', 'customer', 'admin', 'super_admin'];

export default function Customers() {
  const { user, isSuperAdmin } = useAuth();
  const { activeFleetId, isSuperGroup, canAccessSensitiveData, canWrite } = useFleet();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState(null);
  const [confirmRole, setConfirmRole] = useState(null);
  const [verifyChanging, setVerifyChanging] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductingId, setDeductingId] = useState(null);

  // Edit customer details
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editFiles, setEditFiles] = useState({ ic: null, licence: null });
  const [savingEdit, setSavingEdit] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const addDebugLog = (msg) => {
    console.log('[DEBUG]', msg);
    setDebugLog(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Add credit
  const [addCreditForm, setAddCreditForm] = useState({});
  const [addingCredit, setAddingCredit] = useState(null);

  const STATES = ['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang','Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu','W.P. Kuala Lumpur','W.P. Labuan','W.P. Putrajaya'];

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { customers, loading, refetch } = useAdminCustomers({
    search: debouncedSearch,
    role: roleFilter,
    fleetId: activeFleetId,
    verification: verificationFilter !== 'ALL' ? verificationFilter : undefined,
  });

  async function handleExpand(customerId) {
    if (expandedId === customerId) {
      setExpandedId(null);
      setBookings([]);
      return;
    }
    setExpandedId(customerId);
    setBookingsLoading(true);
    try {
      const data = await getCustomerBookings(customerId);
      setBookings(data);
    } catch {
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }

  async function handleRoleChange(customerId, newRole) {
    if (customerId === user?.id) return;
    if (!isSuperAdmin) return; // Only super admins can change roles
    setRoleChanging(customerId);
    try {
      await updateUserRole(customerId, newRole, user.id);
      await refetch();
      setConfirmRole(null);
    } catch (err) {
      toast.error('Failed to update role: ' + err.message);
    } finally {
      setRoleChanging(null);
    }
  }

  async function handleVerifyToggle(customerId, currentlyVerified) {
    setVerifyChanging(customerId);
    try {
      if (currentlyVerified) {
        await unverifyCustomer(customerId, user.id);
        toast.success('Verification revoked');
      } else {
        await verifyCustomer(customerId, user.id);
        toast.success('Customer verified!');
      }
      await refetch();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setVerifyChanging(null);
    }
  }

  async function handleRejectVerification(customerId) {
    setRejectingId(customerId);
    try {
      await rejectVerification(customerId, user.id, rejectReason || 'Documents rejected by admin');
      toast.success('Verification rejected — customer must re-upload documents');
      await refetch();
      setShowRejectConfirm(null);
      setRejectReason('');
    } catch (err) {
      toast.error('Failed to reject: ' + err.message);
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <AdminLayout title="Customer Management">
      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field !pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="input-field !py-1.5 !px-3 text-xs w-40">
            <option value="ALL">All Roles</option>
            <option value="customer">👤 Customer</option>
            <option value="admin">🛡️ Admin</option>
            <option value="super_admin">🟠 Super Admin</option>
          </select>
          {['ALL','verified','not_verified','pending'].map(v => (
            <button
              key={v}
              onClick={() => setVerificationFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                verificationFilter === v
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {v === 'ALL' ? 'All Status' : v === 'verified' ? '✅ Verified' : v === 'not_verified' ? '❌ Not Verified' : '⏳ Pending'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar + Action buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4 text-sm text-slate-400">
          <span>{customers.length} user{customers.length !== 1 ? 's' : ''} found</span>
          <span>•</span>
          <span>{customers.filter(c => c.role === 'admin').length} admin{customers.filter(c => c.role === 'admin').length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-2">
          <a href="/admin/customers/create" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 transition-all">
            <UserPlus className="w-3.5 h-3.5" /> Create Customer
          </a>
          <a href="/admin/bookings/create" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30 transition-all">
            <CalendarDays className="w-3.5 h-3.5" /> Book for Customer
          </a>
        </div>
      </div>

      {/* Customer List */}
      {loading ? (
        <LoadingSpinner />
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" message={search ? 'Try a different search term' : 'No registered users yet'} />
      ) : (
        <div className="space-y-3">
          {customers.map(customer => (
            <div key={customer.id} className="glass-card">
              {/* Main row */}
              <div
                className="flex items-center gap-4 cursor-pointer p-4 hover:bg-white/[0.02] transition-colors rounded-xl"
                onClick={() => handleExpand(customer.id)}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  customer.role === 'super_admin'
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                    : customer.role === 'admin'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-600'
                    : 'bg-gradient-to-br from-slate-600 to-slate-700'
                }`}>
                  <span className="text-white font-semibold text-sm">
                    {(customer.display_name || customer.username || '?')[0].toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">
                      {customer.display_name || 'Unnamed'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      customer.role === 'super_admin'
                        ? 'bg-amber-500/20 text-amber-300'
                        : customer.role === 'admin'
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'bg-slate-700/50 text-slate-400'
                    }`}>
                      {customer.role === 'super_admin' ? 'SUPER ADMIN' : customer.role}
                    </span>
                    {customer.is_verified ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Verified
                      </span>
                    ) : customer.ic_number ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" /> {customer.username}
                    </span>
                    {customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {customer.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Booking count */}
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-lg font-bold text-white">{customer.booking_count}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Bookings</div>
                </div>

                {/* Joined date */}
                <div className="text-right shrink-0 hidden md:block">
                  <div className="text-xs text-slate-400">
                    {customer.created_at ? formatDate(customer.created_at) : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">Joined</div>
                </div>

                {/* Expand arrow */}
                <div className="shrink-0 text-slate-500">
                  {expandedId === customer.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === customer.id && (
                <div className="border-t border-white/5 p-4 animate-fade-in">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Actions */}
                    <div className="lg:w-64 shrink-0 space-y-4">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</h4>

                      {/* Role management - Super Admin only */}
                      {customer.id === user?.id ? (
                        <p className="text-xs text-slate-500 italic">Cannot change your own role</p>
                      ) : !isSuperAdmin ? (
                        <p className="text-xs text-slate-500 italic">Only Super Admins can manage roles</p>
                      ) : confirmRole?.id === customer.id ? (
                        <div className="glass-card !p-3 border border-yellow-500/20">
                          <div className="flex items-center gap-2 text-yellow-400 text-xs mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="font-medium">Change role to: {confirmRole && confirmRole.newRole}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRoleChange(customer.id, confirmRole.newRole)}
                              disabled={roleChanging === customer.id}
                              className="btn-primary text-xs !py-1.5 !px-3 flex-1"
                            >
                              {roleChanging === customer.id ? 'Updating...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmRole(null)}
                              className="btn-secondary text-xs !py-1.5 !px-3"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {customer.role !== 'super_admin' && (
                            <button
                              onClick={() => setConfirmRole({ id: customer.id, newRole: 'super_admin' })}
                              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-all"
                            >
                              <Shield className="w-4 h-4" /> Make Super Admin
                            </button>
                          )}
                          {customer.role !== 'admin' && (
                            <button
                              onClick={() => setConfirmRole({ id: customer.id, newRole: customer.role === 'super_admin' ? 'admin' : 'admin' })}
                              className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                customer.role === 'super_admin'
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                  : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20'
                              }`}
                            >
                              {customer.role === 'super_admin' ? (
                                <><ShieldOff className="w-4 h-4" /> Demote to Admin</>
                              ) : (
                                <><Shield className="w-4 h-4" /> Make Admin</>
                              )}
                            </button>
                          )}
                          {customer.role !== 'customer' && (
                            <button
                              onClick={() => setConfirmRole({ id: customer.id, newRole: 'customer' })}
                              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
                            >
                              <ShieldOff className="w-4 h-4" /> Remove All Admin Access
                            </button>
                          )}
                        </div>
                      )}

                      {/* Verification & Details */}
                      <>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">Verification & Details</h4>
                        {customer.ic_number || customer.licence_number ? (
                          <div className="space-y-2">
                            <div className="text-xs text-slate-400 space-y-1">
                              {customer.ic_number && <p><span className="text-slate-500">IC:</span> {customer.ic_number}</p>}
                              {customer.licence_expiry && <p><span className="text-slate-500">Expiry:</span> {formatDate(customer.licence_expiry)}</p>}
                              {customer.phone && <p><span className="text-slate-500">Phone:</span> {customer.phone}</p>}
                              {customer.address_line1 && <p><span className="text-slate-500">Address:</span> {customer.address_line1}, {customer.city} {customer.state}</p>}
                              {customer.gdl_license && customer.gdl_license !== 'NONE' && (
                                <p><span className="text-slate-500">License Type:</span> <span className="text-amber-400">{customer.gdl_license}</span></p>
                              )}
                            </div>

                            {/* Verification Documents */}
                            <div className="mt-3">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Verification Documents</p>
                              <div className="grid grid-cols-2 gap-2">
                                {/* IC Document */}
                                <div className={`rounded-xl border p-2 ${customer.ic_file_path ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                  <p className="text-[10px] text-slate-500 mb-1">IC Image</p>
                                  {customer.ic_file_path ? (
                                    <a
                                      href={supabase.storage.from('customer-documents').getPublicUrl(customer.ic_file_path).data.publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={supabase.storage.from('customer-documents').getPublicUrl(customer.ic_file_path).data.publicUrl}
                                        alt="IC Document"
                                        className="w-full h-20 object-cover rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                                        onError={e => {
                                          e.target.style.display='none';
                                          const fallback = e.target.parentElement.querySelector('.doc-fallback');
                                          if (fallback) fallback.style.display='flex';
                                        }}
                                      />
                                      <div className="doc-fallback hidden items-center justify-center gap-1 h-20 rounded-lg bg-green-500/10 text-xs text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer">
                                        <FileImage className="w-4 h-4" /> Click to view
                                      </div>
                                    </a>
                                  ) : (
                                    <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing</p>
                                  )}
                                </div>
                                {/* Licence Document */}
                                <div className={`rounded-xl border p-2 ${customer.licence_file_path ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                  <p className="text-[10px] text-slate-500 mb-1">Driving Licence</p>
                                  {customer.licence_file_path ? (
                                    <a
                                      href={supabase.storage.from('customer-documents').getPublicUrl(customer.licence_file_path).data.publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={supabase.storage.from('customer-documents').getPublicUrl(customer.licence_file_path).data.publicUrl}
                                        alt="Licence Document"
                                        className="w-full h-20 object-cover rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                                        onError={e => {
                                          e.target.style.display='none';
                                          const fallback = e.target.parentElement.querySelector('.doc-fallback');
                                          if (fallback) fallback.style.display='flex';
                                        }}
                                      />
                                      <div className="doc-fallback hidden items-center justify-center gap-1 h-20 rounded-lg bg-green-500/10 text-xs text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer">
                                        <FileImage className="w-4 h-4" /> Click to view
                                      </div>
                                    </a>
                                  ) : (
                                    <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing</p>
                                  )}
                                </div>
                              </div>
                              {(!customer.ic_file_path || !customer.licence_file_path) && (
                                <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Some documents are missing. Use "Edit Customer Details" to upload.
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => handleVerifyToggle(customer.id, customer.is_verified)}
                              disabled={verifyChanging === customer.id}
                              className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                customer.is_verified
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                  : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                              }`}
                            >
                              {verifyChanging === customer.id ? 'Updating...' : customer.is_verified ? (
                                <><ShieldOff className="w-4 h-4" /> Revoke Verification</>
                              ) : (
                                <><FileCheck className="w-4 h-4" /> Verify Customer</>
                              )}
                            </button>

                            {/* Reject Verification — only for pending (not verified, docs exist) */}
                            {!customer.is_verified && customer.ic_number && customer.ic_file_path && (
                              showRejectConfirm === customer.id ? (
                                <div className="glass-card !p-3 border border-red-500/20 mt-2 space-y-2">
                                  <p className="text-xs text-red-400 font-medium">Reject verification? Customer must re-upload all documents.</p>
                                  <input
                                    type="text"
                                    placeholder="Reason (optional, e.g. blurry IC)"
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    className="input-field !py-1.5 text-xs w-full"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleRejectVerification(customer.id)}
                                      disabled={rejectingId === customer.id}
                                      className="btn-primary text-xs !py-1.5 !px-3 flex-1 !bg-red-600 hover:!bg-red-700"
                                    >
                                      {rejectingId === customer.id ? 'Rejecting...' : 'Confirm Reject'}
                                    </button>
                                    <button
                                      onClick={() => { setShowRejectConfirm(null); setRejectReason(''); }}
                                      className="btn-secondary text-xs !py-1.5 !px-3"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowRejectConfirm(customer.id)}
                                  className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all mt-2"
                                >
                                  <ShieldOff className="w-4 h-4" /> Reject & Re-submit
                                </button>
                              )
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No documents submitted yet</p>
                        )}

                        {/* Edit Details Button */}
                        {editingCustomer === customer.id ? (
                          <div className="mt-3 space-y-3 glass-card !p-3 border border-violet-500/20">
                            <div className="flex items-center justify-between">
                              <h5 className="text-xs font-semibold text-violet-300 uppercase">Edit Details</h5>
                              <button onClick={() => { setEditingCustomer(null); setEditFiles({ ic: null, licence: null }); }} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <input type="text" value={editForm.ic_number || ''} onChange={e => setEditForm(f => ({...f, ic_number: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="IC Number (e.g. 901234-14-5678)" />
                              <input type="text" value={editForm.phone || ''} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="Phone (e.g. +60191234567)" />
                              <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">Licence Expiry</label>
                                <input type="date" value={editForm.licence_expiry || ''} onChange={e => setEditForm(f => ({...f, licence_expiry: e.target.value}))} className="input-field !py-1.5 text-xs" />
                              </div>
                              <input type="text" value={editForm.address_line1 || ''} onChange={e => setEditForm(f => ({...f, address_line1: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="Address Line 1" />
                              <input type="text" value={editForm.address_line2 || ''} onChange={e => setEditForm(f => ({...f, address_line2: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="Address Line 2 (optional)" />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={editForm.city || ''} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="City" />
                                <select value={editForm.state || ''} onChange={e => setEditForm(f => ({...f, state: e.target.value}))} className="input-field !py-1.5 text-xs">
                                  <option value="">State</option>
                                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <input type="text" value={editForm.postcode || ''} onChange={e => setEditForm(f => ({...f, postcode: e.target.value}))} className="input-field !py-1.5 text-xs" placeholder="Postcode" />
                            </div>

                            {/* Document uploads */}
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">IC Image (auto-verified)</label>
                                <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                                  <FileImage className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-slate-300 truncate">{editFiles.ic?.name || 'Choose IC image...'}</span>
                                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setEditFiles(f => ({...f, ic: e.target.files[0]}))} />
                                </label>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">Licence Image (auto-verified)</label>
                                <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                                  <FileImage className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-slate-300 truncate">{editFiles.licence?.name || 'Choose licence image...'}</span>
                                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setEditFiles(f => ({...f, licence: e.target.files[0]}))} />
                                </label>
                              </div>
                            </div>

                            <button
                              disabled={savingEdit}
                              onClick={async () => {
                              setSavingEdit(true);
                              console.log('[EditSave] Starting save...');
                                try {
                                  const SENSITIVE_FIELDS = ['ic_number', 'address_line1', 'address_line2', 'city', 'state', 'postcode', 'licence_expiry'];

                                  const directUpdates = {};
                                  const sensitiveChanges = {};

                                  // Categorize changes into sensitive vs non-sensitive
                                  if (editForm.phone && editForm.phone !== (customer.phone || '')) directUpdates.phone = editForm.phone;

                                  SENSITIVE_FIELDS.forEach(field => {
                                    if (editForm[field] !== undefined && editForm[field] !== (customer[field] || '')) {
                                      sensitiveChanges[field] = { old: customer[field] || null, new: editForm[field] };
                                    }
                                  });
                                  console.log('[EditSave] Direct updates:', Object.keys(directUpdates), 'Sensitive:', Object.keys(sensitiveChanges));

                                  // Upload files if provided
                                  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for mobile camera photos

                                  if (editFiles.ic) {
                                    if (editFiles.ic.size > MAX_FILE_SIZE) throw new Error(`IC file too large (${(editFiles.ic.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`);
                                    addDebugLog(`IC file selected: ${editFiles.ic.name} (${(editFiles.ic.size/1024).toFixed(1)}KB)`);
                                    console.log('[EditSave] Uploading IC...');
                                    const ext = editFiles.ic.name.split('.').pop()?.toLowerCase() || 'jpg';
                                    const path = `${customer.id}/ic_admin_${Date.now()}.${ext}`;

                                    addDebugLog(`Uploading IC to: ${path}`);
                                    const { error: upErr } = await uploadFileRobust('customer-documents', path, editFiles.ic, toast);
                                    if (upErr) {
                                      addDebugLog(`IC upload ERROR: ${upErr.message}`);
                                      throw new Error(`IC upload failed: ${upErr.message}`);
                                    }

                                    addDebugLog(`IC uploaded successfully!`);
                                    console.log('[EditSave] IC uploaded to:', path);
                                    sensitiveChanges.ic_file_path = { old: customer.ic_file_path || null, new: path };
                                  }
                                  
                                  if (editFiles.licence) {
                                    if (editFiles.licence.size > MAX_FILE_SIZE) throw new Error(`Licence file too large (${(editFiles.licence.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`);
                                    addDebugLog(`Licence file selected: ${editFiles.licence.name} (${(editFiles.licence.size/1024).toFixed(1)}KB)`);
                                    console.log('[EditSave] Uploading licence...');
                                    const ext = editFiles.licence.name.split('.').pop()?.toLowerCase() || 'jpg';
                                    const path = `${customer.id}/licence_admin_${Date.now()}.${ext}`;

                                    addDebugLog(`Uploading licence to: ${path}`);
                                    const { error: upErr } = await uploadFileRobust('customer-documents', path, editFiles.licence, toast);
                                    if (upErr) {
                                      addDebugLog(`Licence upload ERROR: ${upErr.message}`);
                                      throw new Error(`Licence upload failed: ${upErr.message}`);
                                    }

                                    addDebugLog(`Licence uploaded successfully!`);
                                    console.log('[EditSave] Licence uploaded to:', path);
                                    sensitiveChanges.licence_file_path = { old: customer.licence_file_path || null, new: path };
                                  }

                                  // Auto-verify if docs uploaded AND group is Super Group
                                  if ((editFiles.ic || editFiles.licence) && isSuperGroup) {
                                    directUpdates.is_verified = true;
                                    directUpdates.verified_at = new Date().toISOString();
                                    directUpdates.verified_by = user.id;
                                    console.log('[EditSave] Auto-verify (Super Group)');
                                  }

                                  if (Object.keys(directUpdates).length === 0 && Object.keys(sensitiveChanges).length === 0) {
                                    toast.error('No changes to save');
                                    setSavingEdit(false);
                                    return;
                                  }

                                  let messages = [];

                                  // Super Group bypasses approval for everything
                                  if (isSuperGroup) {
                                    console.log('[EditSave] Super Group: applying all changes directly');
                                    // Apply all changes directly
                                    const allUpdates = { ...directUpdates };
                                    Object.keys(sensitiveChanges).forEach(f => { allUpdates[f] = sensitiveChanges[f].new; });
                                    console.log('[EditSave] Updating profile with:', Object.keys(allUpdates));
                                    const { error } = await supabase.from('bubatrent_booking_profiles').update(allUpdates).eq('id', customer.id);
                                    if (error) { console.error('[EditSave] Profile update failed:', error); throw error; }
                                    console.log('[EditSave] Profile updated successfully');
                                    messages.push('Changes applied directly (Super Group)');
                                  } else {
                                    // Apply non-sensitive directly
                                    if (Object.keys(directUpdates).length > 0) {
                                      console.log('[EditSave] Updating non-sensitive fields');
                                      const { error } = await supabase.from('bubatrent_booking_profiles').update(directUpdates).eq('id', customer.id);
                                      if (error) { console.error('[EditSave] Non-sensitive update failed:', error); throw error; }
                                      messages.push(`${Object.keys(directUpdates).length} field(s) updated`);
                                    }

                                    // Create change request for sensitive fields
                                    if (Object.keys(sensitiveChanges).length > 0) {
                                      console.log('[EditSave] Creating change request for sensitive fields, fleetId:', activeFleetId);
                                      const { error: crErr } = await supabase.from('bubatrent_booking_change_requests').insert({
                                        fleet_group_id: activeFleetId,
                                        customer_id: customer.id,
                                        requested_by: user.id,
                                        changes: sensitiveChanges,
                                      });
                                      if (crErr) { console.error('[EditSave] Change request failed:', crErr); throw crErr; }
                                      console.log('[EditSave] Change request created');
                                      messages.push(`${Object.keys(sensitiveChanges).length} sensitive field(s) sent for Super Group approval`);
                                    }
                                  }

                                  // Audit log
                                  console.log('[EditSave] Creating audit log');
                                  await supabase.from('bubatrent_booking_audit_logs').insert({
                                    admin_id: user.id,
                                    action: isSuperGroup ? 'UPDATE_CUSTOMER' : 'REQUEST_CUSTOMER_CHANGE',
                                    resource_type: 'profile',
                                    resource_id: customer.id,
                                    details: {
                                      direct_fields: Object.keys(directUpdates),
                                      sensitive_fields: Object.keys(sensitiveChanges),
                                      is_super_group: isSuperGroup,
                                    },
                                  });

                                  console.log('[EditSave] Done!', messages);
                                  toast.success(messages.join(' • '));
                                  setEditingCustomer(null);
                                  setEditFiles({ ic: null, licence: null });
                                  refetch();
                                } catch (err) {
                                  console.error('[EditSave] Error caught:', err);
                                  toast.error(err.message || 'Save failed');
                                } finally {
                                  setSavingEdit(false);
                                }
                              }}
                              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 transition-all"
                            >
                              {savingEdit ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Edit3 className="w-4 h-4" /> Save Changes</>}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCustomer(customer.id);
                              setEditForm({
                                ic_number: customer.ic_number || '',
                                phone: customer.phone || '',
                                licence_expiry: customer.licence_expiry || '',
                                address_line1: customer.address_line1 || '',
                                address_line2: customer.address_line2 || '',
                                city: customer.city || '',
                                state: customer.state || '',
                                postcode: customer.postcode || '',
                              });
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 transition-all mt-2"
                          >
                            <Edit3 className="w-4 h-4" /> Edit Customer Details
                          </button>
                        )}
                      </>

                      {/* Deposit Credit */}
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">Deposit Credit</h4>
                        <div className="flex items-center gap-2 mb-2">
                          <Wallet className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-white font-semibold">{formatMYR(customer.fleet_credit || 0)}</span>
                        </div>
                        <div className="space-y-2">
                          {/* Add Credit */}
                          <div className="glass-card !p-3 border border-green-500/20 space-y-2">
                            <h5 className="text-[10px] font-semibold text-green-300 uppercase">Add Credit</h5>
                            <input type="number" min="0" step="0.01"
                              value={expandedId === customer.id ? (addCreditForm.amount || '') : ''}
                              onChange={e => setAddCreditForm(f => ({...f, amount: e.target.value}))}
                              className="input-field !py-1.5 text-xs" placeholder="Amount (RM)" />
                            <input type="text"
                              value={expandedId === customer.id ? (addCreditForm.reason || '') : ''}
                              onChange={e => setAddCreditForm(f => ({...f, reason: e.target.value}))}
                              className="input-field !py-1.5 text-xs" placeholder="Reason (e.g. manual payment)" />
                            <div>
                              <label className="text-[10px] text-slate-500 mb-1 block">Transaction Date *</label>
                              <input type="date"
                                value={expandedId === customer.id ? (addCreditForm.txDate || '') : ''}
                                onChange={e => setAddCreditForm(f => ({...f, txDate: e.target.value}))}
                                className="input-field !py-1.5 text-xs" />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 mb-1 block">Transfer Receipt (proof) *</label>
                              <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                                <FileImage className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-slate-300 truncate">{addCreditForm.receipt?.name || 'Upload receipt...'}</span>
                                <input type="file" accept="image/*,.pdf" className="hidden"
                                  onChange={e => setAddCreditForm(f => ({...f, receipt: e.target.files[0]}))} />
                              </label>
                            </div>
                            <button
                              disabled={addingCredit === customer.id}
                              onClick={async () => {
                                const amt = Number(addCreditForm.amount);
                                if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
                                if (!addCreditForm.txDate) { toast.error('Transaction date is required'); return; }
                                if (!addCreditForm.receipt) { toast.error('Transfer receipt is required as proof'); return; }
                                setAddingCredit(customer.id);
                                try {
                                  // Upload receipt
                                  const ext = addCreditForm.receipt.name.split('.').pop();
                                  const receiptPath = `${customer.id}/credit_receipt_${Date.now()}.${ext}`;
                                  const { error: upErr } = await uploadFileRobust('customer-documents', receiptPath, addCreditForm.receipt, toast);
                                  if (upErr) throw upErr;

                                  // Update credit balance
                                  const newCredit = Number(customer.deposit_credit || 0) + amt;
                                  const { error: dbErr } = await supabase.from('bubatrent_booking_profiles')
                                    .update({ deposit_credit: newCredit }).eq('id', customer.id);
                                  if (dbErr) throw dbErr;

                                  // Log transaction
                                  await supabase.from('bubatrent_booking_credit_transactions').insert({
                                    user_id: customer.id,
                                    amount: amt,
                                    type: 'added',
                                    description: addCreditForm.reason || 'Manual credit (admin)',
                                    admin_id: user.id,
                                    fleet_group_id: activeFleetId,
                                  });

                                  // Audit log
                                  await supabase.from('bubatrent_booking_audit_logs').insert({
                                    admin_id: user.id,
                                    action: 'ADD_CREDIT',
                                    resource_type: 'profile',
                                    resource_id: customer.id,
                                    details: { amount: amt, tx_date: addCreditForm.txDate, receipt_path: receiptPath },
                                  });

                                  toast.success(`Added ${formatMYR(amt)} credit`);
                                  setAddCreditForm({});
                                  refetch();
                                } catch (err) { toast.error(err.message); }
                                finally { setAddingCredit(null); }
                              }}
                              className="flex items-center gap-1 w-full px-3 py-2 rounded-xl text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-all"
                            >
                              {addingCredit === customer.id ? 'Adding...' : '+ Add Credit'}
                            </button>
                          </div>

                          {/* Deduct Credit */}
                          <div className="space-y-2">
                            <h5 className="text-[10px] font-semibold text-red-300 uppercase">Deduct Credit</h5>
                            <input type="number" min="0" step="0.01" value={deductAmount}
                              onChange={e => setDeductAmount(e.target.value)}
                              className="input-field !py-1.5 text-xs" placeholder="Amount to deduct" />
                            <input type="text" value={deductReason}
                              onChange={e => setDeductReason(e.target.value)}
                              className="input-field !py-1.5 text-xs" placeholder="Reason (e.g. fine, damage)" />
                            <button
                              onClick={async () => {
                                if (!deductAmount || Number(deductAmount) <= 0) { toast.error('Enter a valid amount'); return; }
                                if (Number(deductAmount) > Number(customer.deposit_credit || 0)) { toast.error('Cannot deduct more than balance'); return; }
                                setDeductingId(customer.id);
                                try {
                                  const newCredit = Number(customer.deposit_credit || 0) - Number(deductAmount);
                                  const { error: upErr } = await supabase.from('bubatrent_booking_profiles')
                                    .update({ deposit_credit: newCredit }).eq('id', customer.id);
                                  if (upErr) throw upErr;
                                  await supabase.from('bubatrent_booking_credit_transactions').insert({
                                    user_id: customer.id,
                                    amount: -Number(deductAmount),
                                    type: 'deducted',
                                    description: deductReason || 'Admin deduction',
                                    admin_id: user.id,
                                    fleet_group_id: activeFleetId,
                                  });
                                  toast.success(`Deducted ${formatMYR(deductAmount)}`);
                                  setDeductAmount(''); setDeductReason('');
                                  refetch();
                                } catch (err) { toast.error(err.message); }
                                finally { setDeductingId(null); }
                              }}
                              disabled={deductingId === customer.id}
                              className="flex items-center gap-1 w-full px-3 py-2 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
                            >
                              {deductingId === customer.id ? 'Deducting...' : 'Deduct Credit'}
                            </button>
                          </div>
                        </div>
                    </div>

                    {/* Booking history */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Booking History
                      </h4>
                      {bookingsLoading ? (
                        <LoadingSpinner />
                      ) : bookings.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No bookings yet</p>
                      ) : (
                        <div className="space-y-2">
                          {bookings.map(b => (
                            <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                              {b.bubatrent_booking_cars?.image_url && (
                                <img
                                  src={b.bubatrent_booking_cars.image_url}
                                  alt={b.bubatrent_booking_cars.name}
                                  className="w-12 h-8 rounded-lg object-cover shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                  {b.bubatrent_booking_cars?.name || 'Unknown Car'}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" />
                                  {formatDate(b.pickup_date)} → {formatDate(b.return_date)}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-medium text-white">{formatMYR(b.total_price)}</div>
                                <BookingStatusBadge status={b.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {debugLog.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-slate-900 border border-red-500 rounded p-3 text-xs text-white z-50 max-w-sm max-h-48 overflow-y-auto font-mono space-y-1">
          <div className="font-bold text-red-400">DEBUG LOG</div>
          {debugLog.map((log, i) => (
            <div key={i} className="text-slate-300">{log}</div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
