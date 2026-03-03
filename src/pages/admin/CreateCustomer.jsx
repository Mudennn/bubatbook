import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useFleet } from '../../hooks/useFleet';
import { supabase } from '../../lib/supabase';
import { uploadFileRobust } from '../../lib/uploadHelper';
import { useToast } from '../../components/Toast';
import { normalizePhone, isValidMYPhone } from '../../utils/phoneUtils';
import {
  User, Phone, MapPin, FileImage, Calendar, Shield, Loader2, ArrowLeft, CreditCard
} from 'lucide-react';

const STATES = ['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang','Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu','W.P. Kuala Lumpur','W.P. Labuan','W.P. Putrajaya'];
const GDL_OPTIONS = [
  { value: 'NONE', label: 'Standard License' },
  { value: 'GDL', label: 'GDL (Graduated Driver License)' },
  { value: 'CDL', label: 'CDL (Competent Driver License)' },
];

export default function CreateCustomer() {
  const { user } = useAuth();
  const { activeFleetId } = useFleet();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    display_name: '',
    ic_number: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postcode: '',
    licence_expiry: '',
    gdl_license: 'NONE',
  });
  const [icFile, setIcFile] = useState(null);
  const [licenceFile, setLicenceFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.ic_number.trim()) e.ic_number = 'IC number is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    else {
      const normalized = normalizePhone(form.phone);
      if (!isValidMYPhone(normalized)) e.phone = 'Invalid Malaysian phone number';
    }
    if (!form.address_line1.trim()) e.address_line1 = 'Address is required';
    if (!form.licence_expiry) e.licence_expiry = 'Licence expiry date is required';
    if (!icFile) e.ic = 'IC image upload is required';
    if (!licenceFile) e.licence = 'Licence image upload is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    try {
      const normalizedPhone = normalizePhone(form.phone);
      const profileId = crypto.randomUUID();

      // Upload IC image
      const icPath = `verification/${profileId}/ic_${Date.now()}.${icFile.name.split('.').pop()}`;
      const { error: icUpErr } = await uploadFileRobust('customer-documents', icPath, icFile, toast);
      if (icUpErr) throw new Error('IC upload failed: ' + icUpErr.message);

      // Upload licence image
      const licPath = `verification/${profileId}/licence_${Date.now()}.${licenceFile.name.split('.').pop()}`;
      const { error: licUpErr } = await uploadFileRobust('customer-documents', licPath, licenceFile, toast);
      if (licUpErr) throw new Error('Licence upload failed: ' + licUpErr.message);

      // Create profile
      const { error: profileErr } = await supabase
        .from('bubatrent_booking_profiles')
        .insert({
          id: profileId,
          display_name: form.display_name || null,
          ic_number: form.ic_number,
          phone: normalizedPhone,
          email: form.email || null,
          address_line1: form.address_line1,
          address_line2: form.address_line2 || null,
          city: form.city || null,
          state: form.state || null,
          postcode: form.postcode || null,
          licence_expiry: form.licence_expiry,
          gdl_license: form.gdl_license,
          ic_image_url: icPath,
          licence_image_url: licPath,
          ic_verified: true,
          licence_verified: true,
          is_verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          role: 'customer',
          credit_balance: 0,
        });
      if (profileErr) throw profileErr;

      // Audit log
      await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: user.id,
        action: 'CREATE_MANUAL_CUSTOMER',
        resource_type: 'profile',
        resource_id: profileId,
        details: { phone: normalizedPhone, ic: form.ic_number, fleet_group_id: activeFleetId },
      });

      toast.success('Customer created and auto-verified');
      navigate('/admin/customers');
    } catch (err) {
      toast.error(err.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <AdminLayout title="Create Customer">
      <button onClick={() => navigate('/admin/customers')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      <div className="glass-card max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-green-400" />
          <p className="text-xs text-green-400">Customer will be auto-verified — admin has validated documents.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name + IC */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-violet-400" /> Full Name</label>
              <input value={form.display_name} onChange={set('display_name')} className="input-field" placeholder="Customer name (optional)" />
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-violet-400" /> IC Number *</label>
              <input value={form.ic_number} onChange={set('ic_number')} className="input-field" placeholder="901234-14-5678" />
              {errors.ic_number && <p className="text-[10px] text-red-400 mt-1">{errors.ic_number}</p>}
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-violet-400" /> Phone Number *</label>
              <input value={form.phone} onChange={set('phone')} className="input-field" placeholder="0194961568" />
              {errors.phone && <p className="text-[10px] text-red-400 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5">Email (optional)</label>
              <input type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="customer@email.com" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="input-label flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-violet-400" /> Address *</label>
            <input value={form.address_line1} onChange={set('address_line1')} className="input-field mb-2" placeholder="Address Line 1" />
            {errors.address_line1 && <p className="text-[10px] text-red-400 mt-1">{errors.address_line1}</p>}
            <input value={form.address_line2} onChange={set('address_line2')} className="input-field mb-2" placeholder="Address Line 2 (optional)" />
            <div className="grid grid-cols-3 gap-2">
              <input value={form.city} onChange={set('city')} className="input-field" placeholder="City" />
              <select value={form.state} onChange={set('state')} className="input-field">
                <option value="">State</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={form.postcode} onChange={set('postcode')} className="input-field" placeholder="Postcode" />
            </div>
          </div>

          {/* Licence Expiry + GDL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-violet-400" /> Licence Expiry *</label>
              <input type="date" value={form.licence_expiry} onChange={set('licence_expiry')} className="input-field" />
              {errors.licence_expiry && <p className="text-[10px] text-red-400 mt-1">{errors.licence_expiry}</p>}
            </div>
            <div>
              <label className="input-label">License Type</label>
              <select value={form.gdl_license} onChange={set('gdl_license')} className="input-field">
                {GDL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Document Uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label flex items-center gap-1.5"><FileImage className="w-3.5 h-3.5 text-violet-400" /> IC Image *</label>
              <label className={`flex items-center gap-2 px-3 py-3 rounded-xl text-xs cursor-pointer transition-colors border ${icFile ? 'bg-green-500/5 border-green-500/20 text-green-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                <FileImage className="w-4 h-4" />
                <span className="truncate">{icFile?.name || 'Choose IC image...'}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setIcFile(e.target.files[0])} />
              </label>
              {errors.ic && <p className="text-[10px] text-red-400 mt-1">{errors.ic}</p>}
            </div>
            <div>
              <label className="input-label flex items-center gap-1.5"><FileImage className="w-3.5 h-3.5 text-violet-400" /> Driving Licence Image *</label>
              <label className={`flex items-center gap-2 px-3 py-3 rounded-xl text-xs cursor-pointer transition-colors border ${licenceFile ? 'bg-green-500/5 border-green-500/20 text-green-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                <FileImage className="w-4 h-4" />
                <span className="truncate">{licenceFile?.name || 'Choose licence image...'}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setLicenceFile(e.target.files[0])} />
              </label>
              {errors.licence && <p className="text-[10px] text-red-400 mt-1">{errors.licence}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {saving ? 'Creating...' : 'Create & Auto-Verify Customer'}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
