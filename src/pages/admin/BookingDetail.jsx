import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import { updateBookingStatus, getBookingDocuments, verifyDocument, getAuditLogs } from '../../hooks/useAdmin';
import { useAuth } from '../../hooks/useAuth';
import { useFleet } from '../../hooks/useFleet';
import { supabase } from '../../lib/supabase';
import { uploadFileRobust } from '../../lib/uploadHelper';
import { useToast } from '../../components/Toast';
import { formatDate, formatDateTime } from '../../utils/dates';
import { formatMYR } from '../../utils/pricing';
import { maskSensitive } from '../../utils/format';
import {
  ArrowLeft, User, Mail, Phone, FileText, Shield, CheckCircle,
  Clock, Eye, FileCheck, Edit3, Save, X, Upload, FileImage,
  Wallet, AlertTriangle, CarFront, Calendar, Trash2
} from 'lucide-react';

// Status flow definition
const STATUS_FLOW = {
  HOLD: ['DEPOSIT_PAID', 'CANCELLED'],
  DEPOSIT_PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKUP', 'CANCELLED'],
  PICKUP: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
  EXPIRED: ['DEPOSIT_PAID', 'CONFIRMED'],
};

export default function AdminBookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { activeFleetId } = useFleet();
  const toast = useToast();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Date editing
  const [editingDates, setEditingDates] = useState(false);
  const [editPickup, setEditPickup] = useState('');
  const [editReturn, setEditReturn] = useState('');
  const [reactivateReason, setReactivateReason] = useState('');
  const [showReactivate, setShowReactivate] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [savingDates, setSavingDates] = useState(false);

  // Full payment receipt upload
  const [fullPaymentFile, setFullPaymentFile] = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        console.log('[BookingDetail] Fetching booking:', id, 'activeFleetId:', activeFleetId);

        // Admin-direct query: fetch by ID without user_id filter
        const { data: bookingData, error: bookingErr } = await supabase
          .from('bubatrent_booking_bookings')
          .select('*, bubatrent_booking_cars(*), bubatrent_booking_payments(*)')
          .eq('id', id)
          .maybeSingle();

        if (bookingErr) {
          console.error('[BookingDetail] Query error:', bookingErr);
          throw bookingErr;
        }
        if (!bookingData) {
          console.warn('[BookingDetail] No booking found for id:', id);
          setNotFound(true);
          return;
        }

        console.log('[BookingDetail] Booking loaded:', bookingData.id, 'status:', bookingData.status);
        setBooking(bookingData);
        setEditPickup(bookingData.pickup_date);
        setEditReturn(bookingData.return_date);

        // Fetch docs and logs in parallel — don't fail the whole page if these error
        try {
          const [docsData, logsData] = await Promise.all([
            getBookingDocuments(id, user.id).catch(err => { console.warn('[BookingDetail] Docs error:', err); return []; }),
            getAuditLogs(id).catch(err => { console.warn('[BookingDetail] Logs error:', err); return []; }),
          ]);
          setDocuments(docsData);
          setAuditLogs(logsData);
        } catch (subErr) {
          console.warn('[BookingDetail] Error fetching docs/logs:', subErr);
        }
      } catch (err) {
        console.error('[BookingDetail] Error fetching booking:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [id, user.id, activeFleetId]);

  async function handleStatusChange(newStatus) {
    try {
      const updates = { status: newStatus };
      // When marking as RETURNED, set actual_return_date
      if (newStatus === 'RETURNED') {
        updates.actual_return_date = new Date().toISOString().split('T')[0];
      }
      const { error } = await supabase
        .from('bubatrent_booking_bookings')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, ...updates }));
      toast.success(`Status updated to ${newStatus}`);

      // If returned, add deposit back as credit
      if (newStatus === 'RETURNED' && booking.deposit_amount > 0) {
        const profileData = await supabase
          .from('bubatrent_booking_profiles')
          .select('deposit_credit')
          .eq('id', booking.user_id)
          .single();
        const currentCredit = Number(profileData.data?.deposit_credit || 0);
        await supabase.from('bubatrent_booking_profiles')
          .update({ deposit_credit: currentCredit + Number(booking.deposit_amount) })
          .eq('id', booking.user_id);
        await supabase.from('bubatrent_booking_credit_transactions').insert({
          user_id: booking.user_id,
          booking_id: id,
          amount: Number(booking.deposit_amount),
          type: 'deposit_return',
          description: `Deposit returned from booking`,
          admin_id: user.id,
        });
      }
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleVerify(docId) {
    try {
      await verifyDocument(docId, user.id);
      const docsData = await getBookingDocuments(id, user.id);
      setDocuments(docsData);
      const logsData = await getAuditLogs(id);
      setAuditLogs(logsData);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleSaveDates() {
    setSavingDates(true);
    try {
      const { error } = await supabase
        .from('bubatrent_booking_bookings')
        .update({ pickup_date: editPickup, return_date: editReturn })
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, pickup_date: editPickup, return_date: editReturn }));
      setEditingDates(false);
      toast.success('Dates updated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingDates(false);
    }
  }

  async function handleVerifyDeposit() {
    try {
      const { error } = await supabase
        .from('bubatrent_booking_bookings')
        .update({ deposit_status: 'verified' })
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, deposit_status: 'verified' }));
      toast.success('Deposit receipt verified!');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleRejectDeposit() {
    try {
      const { error } = await supabase
        .from('bubatrent_booking_bookings')
        .update({ deposit_status: 'rejected' })
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, deposit_status: 'rejected' }));
      toast.success('Deposit receipt rejected.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleVerifyFullPayment() {
    try {
      const { error } = await supabase
        .from('bubatrent_booking_bookings')
        .update({ full_payment_status: 'verified' })
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, full_payment_status: 'verified' }));
      toast.success('Full payment verified!');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleUploadFullPayment() {
    if (!fullPaymentFile) { toast.error('Select a receipt file first.'); return; }
    setUploadingReceipt(true);
    try {
      const ext = fullPaymentFile.name.split('.').pop();
      const path = `receipts/${id}/full_payment_${Date.now()}.${ext}`;
      const { error: upErr } = await uploadFileRobust('customer-documents', path, fullPaymentFile, toast);
      if (upErr) throw upErr;
      const { error } = await supabase.from('bubatrent_booking_bookings')
        .update({ full_payment_receipt_path: path, full_payment_status: 'uploaded' })
        .eq('id', id);
      if (error) throw error;
      setBooking(prev => ({ ...prev, full_payment_receipt_path: path, full_payment_status: 'uploaded' }));
      setFullPaymentFile(null);
      toast.success('Full payment receipt uploaded!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingReceipt(false);
    }
  }

  // Delete booking and all related records
  async function handleDeleteBooking() {
    const confirmMsg = `Are you sure you want to DELETE this booking?\n\nCar: ${booking.bubatrent_booking_cars?.name || 'Unknown'}\nDates: ${booking.pickup_date} → ${booking.return_date}\nStatus: ${booking.status}\n\nThis will permanently delete:\n• The booking record\n• Associated payments\n• Audit logs\n\nThis action CANNOT be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      // Delete related records in dependency order
      await supabase.from('bubatrent_booking_credit_transactions').delete().eq('booking_id', id);
      await supabase.from('bubatrent_booking_payments').delete().eq('booking_id', id);
      await supabase.from('bubatrent_booking_audit_logs').delete().eq('resource_id', id);
      // Delete the booking itself
      const { error } = await supabase.from('bubatrent_booking_bookings').delete().eq('id', id);
      if (error) throw error;

      toast.success('Booking deleted successfully');
      navigate('/admin/bookings');
    } catch (err) {
      toast.error('Failed to delete: ' + err.message);
      setDeleting(false);
    }
  }

  if (loading) return <AdminLayout><LoadingSpinner fullScreen /></AdminLayout>;
  if (notFound || !booking) return (
    <AdminLayout>
      <p className="text-red-400">Booking not found or you don't have access.</p>
      <p className="text-xs text-slate-500 mt-1">ID: {id}</p>
      <Link to="/admin/bookings" className="text-violet-400 text-sm mt-3 inline-block hover:underline">← Back to Bookings</Link>
    </AdminLayout>
  );

  const car = booking.bubatrent_booking_cars;
  const payment = booking.bubatrent_booking_payments?.[0];
  const nextStatuses = STATUS_FLOW[booking.status] || [];

  return (
    <AdminLayout>
      <Link to="/admin/bookings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> All Bookings
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            Booking Detail <BookingStatusBadge status={booking.status} />
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">{booking.id}</p>
        </div>
        <div className="flex gap-2">
          {nextStatuses.map(ns => (
            <button key={ns} onClick={() => {
              if (booking.status === 'EXPIRED') { setShowReactivate(true); return; }
              handleStatusChange(ns);
            }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                ns === 'CANCELLED' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' :
                ns === 'RETURNED' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' :
                'bg-green-500/10 text-green-400 hover:bg-green-500/20'
              }`}>
              {ns === 'DEPOSIT_PAID' ? (booking.status === 'EXPIRED' ? 'Reactivate → Deposit Paid' : 'Mark Deposit Paid') :
               ns === 'CONFIRMED' ? (booking.status === 'EXPIRED' ? 'Reactivate → Confirmed' : 'Confirm') :
               ns === 'PICKUP' ? 'Mark Picked Up' :
               ns === 'RETURNED' ? 'Mark Returned' :
               ns === 'CANCELLED' ? 'Cancel' : ns}
            </button>
          ))}
          <button onClick={handleDeleteBooking} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Reactivation Modal */}
      {showReactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowReactivate(false)}>
          <div className="glass-card w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">Reactivate Expired Booking</h3>
            <p className="text-sm text-slate-400 mb-4">This booking expired. Provide a reason for reactivation:</p>
            <textarea
              value={reactivateReason}
              onChange={e => setReactivateReason(e.target.value)}
              className="input-field mb-4"
              rows={3}
              placeholder="Reason for reactivation (required)..."
            />
            <div className="flex gap-2">
              <button onClick={() => setShowReactivate(false)} className="btn-secondary flex-1">Cancel</button>
              {nextStatuses.filter(s => s !== 'CANCELLED').map(ns => (
                <button
                  key={ns}
                  disabled={!reactivateReason.trim() || reactivating}
                  onClick={async () => {
                    setReactivating(true);
                    try {
                      // Check date overlap
                      const { data: overlapping } = await supabase
                        .from('bubatrent_booking_bookings')
                        .select('id')
                        .eq('car_id', booking.car_id)
                        .in('status', ['HOLD','DEPOSIT_PAID','CONFIRMED','PICKUP'])
                        .lte('pickup_date', booking.return_date)
                        .gte('return_date', booking.pickup_date)
                        .neq('id', booking.id)
                        .limit(1);
                      if (overlapping?.length > 0) {
                        toast.error('Cannot reactivate: date overlap with another booking. Edit dates first.');
                        setReactivating(false);
                        return;
                      }
                      await supabase.from('bubatrent_booking_bookings')
                        .update({
                          status: ns,
                          reactivated_by: user.id,
                          reactivated_at: new Date().toISOString(),
                          reactivation_reason: reactivateReason,
                        })
                        .eq('id', booking.id);
                      await supabase.from('bubatrent_booking_audit_logs').insert({
                        admin_id: user.id,
                        action: 'REACTIVATE_EXPIRED',
                        resource_type: 'booking',
                        resource_id: booking.id,
                        details: { new_status: ns, reason: reactivateReason },
                      });
                      setBooking(prev => ({ ...prev, status: ns }));
                      toast.success(`Booking reactivated → ${ns}`);
                      setShowReactivate(false);
                      setReactivateReason('');
                    } catch (err) {
                      toast.error(err.message);
                    } finally {
                      setReactivating(false);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/20 transition-all disabled:opacity-30"
                >
                  {reactivating ? 'Activating...' : `→ ${ns === 'DEPOSIT_PAID' ? 'Deposit Paid' : 'Confirmed'}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Car & Dates */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Rental Details</h3>
              {!editingDates && ['HOLD','DEPOSIT_PAID','CONFIRMED'].includes(booking.status) && (
                <button onClick={() => setEditingDates(true)} className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Dates
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 mb-4">
              {car?.image_url && (
                <img src={car.image_url} alt={car?.name} className="w-24 h-16 rounded-xl object-cover" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{car?.name}</p>
                  {car?.plate_number && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                      {car.plate_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{car?.brand} {car?.model} · {car?.year}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">Pick-up</p>
                {editingDates ? (
                  <input type="date" value={editPickup} onChange={e => setEditPickup(e.target.value)} className="input-field !py-1.5 text-sm" />
                ) : (
                  <p className="text-white">{formatDate(booking.pickup_date)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Return</p>
                {editingDates ? (
                  <input type="date" value={editReturn} onChange={e => setEditReturn(e.target.value)} className="input-field !py-1.5 text-sm" />
                ) : (
                  <p className="text-white">{formatDate(booking.return_date)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Total</p>
                <p className="text-white font-semibold">{formatMYR(booking.total_price)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Deposit</p>
                <p className="text-green-400 font-semibold">{formatMYR(booking.deposit_amount)}</p>
              </div>
            </div>
            {editingDates && (
              <div className="flex gap-2 mt-4">
                <button onClick={handleSaveDates} disabled={savingDates} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> {savingDates ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setEditingDates(false); setEditPickup(booking.pickup_date); setEditReturn(booking.return_date); }}
                  className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            )}
            {booking.actual_return_date && (
              <p className="text-xs text-emerald-400 mt-3">Actual return: {formatDate(booking.actual_return_date)}</p>
            )}
            {Number(booking.credit_applied || 0) > 0 && (
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Credit applied: {formatMYR(booking.credit_applied)}
              </p>
            )}
          </div>

          {/* Customer Info */}
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Customer</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-violet-400" />
                <span className="text-white">{booking.customer_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-violet-400" />
                <span className="text-slate-300">{booking.customer_email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-violet-400" />
                <span className="text-slate-300">{booking.customer_phone}</span>
              </div>
              {booking.notes && (
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-violet-400 mt-0.5" />
                  <span className="text-slate-300">{booking.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Verification */}
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileCheck className="w-4 h-4" /> Payment Receipts
            </h3>
            <div className="space-y-4">
              {/* Deposit Receipt */}
              <div className="bg-white/[0.02] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-white font-medium">Deposit Receipt</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    booking.deposit_status === 'verified' ? 'bg-green-500/10 text-green-400' :
                    booking.deposit_status === 'uploaded' ? 'bg-yellow-500/10 text-yellow-400' :
                    booking.deposit_status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>{booking.deposit_status || 'pending'}</span>
                </div>
                {booking.deposit_receipt_path && (
                  <a href={supabase.storage.from('customer-documents').getPublicUrl(booking.deposit_receipt_path).data.publicUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 mb-2">
                    <Eye className="w-3 h-3" /> View Receipt
                  </a>
                )}
                {booking.deposit_status === 'uploaded' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleVerifyDeposit} className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                      ✓ Verify
                    </button>
                    <button onClick={handleRejectDeposit} className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                      ✗ Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Full Payment */}
              <div className="bg-white/[0.02] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-white font-medium">Full Payment ({formatMYR(booking.full_payment_amount || booking.total_price)})</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    booking.full_payment_status === 'verified' ? 'bg-green-500/10 text-green-400' :
                    booking.full_payment_status === 'uploaded' ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>{booking.full_payment_status || 'pending'}</span>
                </div>
                {booking.full_payment_receipt_path && (
                  <a href={supabase.storage.from('customer-documents').getPublicUrl(booking.full_payment_receipt_path).data.publicUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 mb-2">
                    <Eye className="w-3 h-3" /> View Receipt
                  </a>
                )}
                {booking.full_payment_status === 'uploaded' && (
                  <button onClick={handleVerifyFullPayment}
                    className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors mt-2">
                    ✓ Verify Full Payment
                  </button>
                )}
                {/* Allow admin to upload full payment receipt on behalf of customer */}
                {['CONFIRMED','PICKUP'].includes(booking.status) && !booking.full_payment_receipt_path && (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <FileImage className="w-3.5 h-3.5" />
                      {fullPaymentFile ? fullPaymentFile.name : 'Upload receipt'}
                      <input type="file" accept="image/*,.pdf" className="hidden"
                        onChange={e => setFullPaymentFile(e.target.files[0])} />
                    </label>
                    {fullPaymentFile && (
                      <button onClick={handleUploadFullPayment} disabled={uploadingReceipt}
                        className="px-3 py-1 rounded-lg text-xs bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
                        {uploadingReceipt ? 'Uploading...' : 'Upload'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Identity Documents
            </h3>
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {documents.map(doc => (
                  <div key={doc.id} className="bg-white/[0.02] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-violet-400" />
                        <span className="text-sm text-white">Driving Licence</span>
                      </div>
                      {doc.verified_at ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <button onClick={() => handleVerify(doc.id)}
                          className="px-3 py-1 rounded-lg text-xs bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors">
                          Verify
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {doc.ic_number && (
                        <div>
                          <p className="text-slate-500">IC No.</p>
                          <p className="text-slate-200">{maskSensitive(doc.ic_number)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-slate-500">Expiry</p>
                        <p className="text-slate-200">{formatDate(doc.licence_expiry)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Payment & Audit */}
        <div className="space-y-6">
          {/* Payment */}
          {payment && (
            <div className="glass-card">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Payment Record</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-300 capitalize">{payment.payment_type || 'deposit'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="text-white">{formatMYR(payment.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Method</span>
                  <span className="text-slate-300 capitalize">{payment.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="text-green-400 capitalize">{payment.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference</span>
                  <span className="text-xs font-mono text-slate-300">{payment.reference_number}</span>
                </div>
              </div>
            </div>
          )}

          {/* Audit Log */}
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Audit Log
            </h3>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No audit entries.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-300">{log.action.replace('_', ' ')}</p>
                      <p className="text-slate-600">
                        {log.bubatrent_booking_profiles?.display_name || 'Admin'} · {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Timeline</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Created</span>
                <span className="text-slate-300">{formatDateTime(booking.created_at)}</span>
              </div>
              {booking.updated_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Updated</span>
                  <span className="text-slate-300">{formatDateTime(booking.updated_at)}</span>
                </div>
              )}
              {booking.actual_return_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Returned</span>
                  <span className="text-emerald-400">{formatDate(booking.actual_return_date)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
