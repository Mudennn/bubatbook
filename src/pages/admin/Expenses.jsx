import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { useFleet } from '../../hooks/useFleet';
import { supabase } from '../../lib/supabase';
import { uploadFileRobust } from '../../lib/uploadHelper';
import { useToast } from '../../components/Toast';
import { formatMYR } from '../../utils/pricing';
import { formatDate } from '../../utils/dates';
import {
  Receipt, Plus, Upload, CheckCircle, Clock, Car, FileImage,
  Loader2, X, ChevronDown, ChevronUp, Filter, Trash2
} from 'lucide-react';

export default function AdminExpenses() {
  const { user } = useAuth();
  const { activeFleetId } = useFleet();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [cars, setCars] = useState([]);
  const [tab, setTab] = useState('pending');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [carFilter, setCarFilter] = useState('all');

  // Form state
  const [formCarId, setFormCarId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFiles, setFormFiles] = useState([]);

  // Payment receipt state
  const [receiptFile, setReceiptFile] = useState(null);
  const [completingId, setCompletingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { fetchData(); }, [activeFleetId]);

  async function fetchData() {
    setLoading(true);
    let claimsQ = supabase.from('bubatrent_booking_expense_claims')
      .select('*, bubatrent_booking_cars(name), bubatrent_booking_expense_images(*)')
      .order('created_at', { ascending: false });
    let carsQ = supabase.from('bubatrent_booking_cars').select('id, name');
    if (activeFleetId) {
      claimsQ = claimsQ.eq('fleet_group_id', activeFleetId);
      carsQ = carsQ.eq('fleet_group_id', activeFleetId);
    }
    const [{ data: claimsData }, { data: carsData }] = await Promise.all([claimsQ, carsQ]);
    setClaims(claimsData || []);
    setCars(carsData || []);
    setLoading(false);
  }

  async function handleSubmitClaim(e) {
    e.preventDefault();
    if (!formCarId || !formDate || !formDesc.trim() || formFiles.length === 0) {
      toast.error('Please fill all fields and upload at least 1 invoice image.');
      return;
    }
    setSubmitting(true);
    try {
      // Create claim
      const { data: claim, error: claimErr } = await supabase
        .from('bubatrent_booking_expense_claims')
        .insert({
          car_id: formCarId === 'others' ? null : formCarId,
          submitted_by: user.id,
          expense_date: formDate,
          description: formDesc.trim(),
          total_amount: formAmount ? parseFloat(formAmount) : null,
          fleet_group_id: activeFleetId,
        })
        .select().single();
      if (claimErr) throw claimErr;

      // Upload images
      for (const file of formFiles) {
        const ext = file.name.split('.').pop();
        const path = `expenses/${claim.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await uploadFileRobust('customer-documents', path, file, toast);
        if (upErr) throw upErr;
        const { error: imgErr } = await supabase.from('bubatrent_booking_expense_images')
          .insert({ claim_id: claim.id, file_path: path });
        if (imgErr) throw imgErr;
      }

      toast.success('Claim submitted!');
      setShowForm(false);
      setFormCarId(''); setFormDesc(''); setFormAmount(''); setFormFiles([]);
      await fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteClaim(claimId) {
    if (!receiptFile) { toast.error('Upload your payment receipt first.'); return; }
    setCompletingId(claimId);
    try {
      const ext = receiptFile.name.split('.').pop();
      const path = `expenses/${claimId}/receipt_${Date.now()}.${ext}`;
      const { error: upErr } = await uploadFileRobust('customer-documents', path, receiptFile, toast);
      if (upErr) throw upErr;

      const { error } = await supabase.from('bubatrent_booking_expense_claims').update({
        status: 'completed',
        payment_receipt_path: path,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
      }).eq('id', claimId);
      if (error) throw error;

      toast.success('Claim marked as completed!');
      setReceiptFile(null);
      await fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDeleteClaim(claim) {
    if (!window.confirm(`Delete claim "${claim.description}"? This cannot be undone.`)) return;
    setDeletingId(claim.id);
    try {
      // Clean up storage files (invoice images + receipt)
      const paths = (claim.bubatrent_booking_expense_images || []).map(img => img.file_path);
      if (claim.payment_receipt_path) paths.push(claim.payment_receipt_path);
      if (paths.length > 0) {
        await supabase.storage.from('customer-documents').remove(paths);
      }
      // Delete the claim (images cascade-delete)
      const { error } = await supabase.from('bubatrent_booking_expense_claims')
        .delete().eq('id', claim.id);
      if (error) throw error;
      toast.success('Claim deleted.');
      setExpanded(null);
      await fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const filteredClaims = claims.filter(c => {
    if (tab === 'pending' && c.status !== 'pending') return false;
    if (tab === 'completed' && c.status !== 'completed') return false;
    if (carFilter === 'others' && c.car_id !== null) return false;
    if (carFilter !== 'all' && carFilter !== 'others' && c.car_id !== carFilter) return false;
    return true;
  });

  const totalExpenses = claims.filter(c => c.status === 'completed')
    .reduce((s, c) => s + Number(c.total_amount || 0), 0);

  if (loading) return <AdminLayout title="Expenses"><LoadingSpinner /></AdminLayout>;

  return (
    <AdminLayout title="Expenses & Claims">
      {/* Summary */}
      <div className="glass-card mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <p className="text-xs text-slate-500">Total Expenses (Completed)</p>
          <p className="text-xl font-bold text-white">{formatMYR(totalExpenses)}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="ml-auto btn-primary !px-4 !py-2 text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Submit Claim
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="glass-card mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold text-white mb-4">New Expense Claim</h3>
          <form onSubmit={handleSubmitClaim} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="input-label">Car *</label>
                <select value={formCarId} onChange={e => setFormCarId(e.target.value)} className="input-field">
                  <option value="">Select car</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="others">Others (General)</option>
                </select>
              </div>
              <div>
                <label className="input-label">Expense Date *</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="input-label">Amount (RM)</label>
                <input type="number" step="0.01" min="0" value={formAmount}
                  onChange={e => setFormAmount(e.target.value)} className="input-field" placeholder="e.g. 50" />
              </div>
            </div>
            <div>
              <label className="input-label">Description *</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                className="input-field" rows={2} placeholder="e.g. Car wash + interior cleaning" />
            </div>
            <div>
              <label className="input-label">Invoice Images * (multiple allowed)</label>
              <input type="file" accept="image/*,.pdf" multiple
                onChange={e => setFormFiles(Array.from(e.target.files))}
                className="text-sm text-slate-400" />
              {formFiles.length > 0 && <p className="text-xs text-slate-500 mt-1">{formFiles.length} file(s) selected</p>}
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-primary !py-2 text-sm flex items-center gap-1.5">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Upload className="w-4 h-4" /> Submit Claim</>}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary !py-2 text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs + Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {[['pending','Pending'],['completed','Completed'],['all','All']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === val ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            {label}
          </button>
        ))}
        <select value={carFilter} onChange={e => setCarFilter(e.target.value)}
          className="ml-auto input-field !py-1.5 !px-3 text-xs w-40">
          <option value="all">All Cars</option>
          {cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="others">Others (General)</option>
        </select>
      </div>

      {/* Claims List */}
      {filteredClaims.length === 0 ? (
        <div className="glass-card text-center text-sm text-slate-500 italic py-8">No claims found</div>
      ) : (
        <div className="space-y-3">
          {filteredClaims.map(claim => (
            <div key={claim.id} className="glass-card !p-4">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(expanded === claim.id ? null : claim.id)}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${claim.status === 'completed' ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                  {claim.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-yellow-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{claim.description}</p>
                  <p className="text-xs text-slate-500">
                    {claim.bubatrent_booking_cars?.name || 'Others (General)'} · {formatDate(claim.expense_date)}
                    {claim.total_amount && ` · ${formatMYR(claim.total_amount)}`}
                  </p>
                </div>
                {expanded === claim.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>

              {expanded === claim.id && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-fade-in">
                  {/* Invoice images */}
                  {claim.bubatrent_booking_expense_images?.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Invoice Images:</p>
                      <div className="flex gap-2 flex-wrap">
                        {claim.bubatrent_booking_expense_images.map(img => (
                          <a key={img.id} href={supabase.storage.from('customer-documents').getPublicUrl(img.file_path).data.publicUrl}
                            target="_blank" rel="noopener noreferrer"
                            className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                            <FileImage className="w-6 h-6 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Complete claim */}
                  {claim.status === 'pending' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{receiptFile ? receiptFile.name : 'Upload payment receipt'}</span>
                          <input type="file" accept="image/*,.pdf" className="hidden"
                            onChange={e => setReceiptFile(e.target.files[0])} />
                        </label>
                        <button onClick={() => handleCompleteClaim(claim.id)}
                          disabled={completingId === claim.id}
                          className="btn-primary !px-3 !py-1.5 text-xs flex items-center gap-1">
                          {completingId === claim.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Mark Complete
                        </button>
                      </div>
                      <button onClick={() => handleDeleteClaim(claim)}
                        disabled={deletingId === claim.id}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
                        {deletingId === claim.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Delete Claim
                      </button>
                    </div>
                  )}

                  {claim.status === 'completed' && claim.completed_at && (
                    <p className="text-xs text-green-400">Completed on {formatDate(claim.completed_at)}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
