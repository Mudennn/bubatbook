import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { uploadFileRobust } from '../lib/uploadHelper';
import { useToast } from '../components/Toast';
import {
  FileCheck, Shield, Upload, FileImage, Loader2,
  CheckCircle, AlertCircle, Phone, CreditCard, Clock, MapPin
} from 'lucide-react';

export default function VerifyAccount() {
  const { user, profile, isVerified, refreshProfile } = useAuth();
  const toast = useToast();

  const licenceExpired = profile?.is_verified && profile?.licence_expiry && new Date(profile.licence_expiry) < new Date();
  const hasSubmittedDocs = profile?.ic_number && profile?.ic_file_path && !profile?.is_verified;

  const [icNumber, setIcNumber] = useState(profile?.ic_number || '');
  const [licenceExpiry, setLicenceExpiry] = useState(profile?.licence_expiry || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [addressLine1, setAddressLine1] = useState(profile?.address_line1 || '');
  const [addressLine2, setAddressLine2] = useState(profile?.address_line2 || '');
  const [city, setCity] = useState(profile?.city || '');
  const [state, setState] = useState(profile?.state || '');
  const [postcode, setPostcode] = useState(profile?.postcode || '');
  const [icFile, setIcFile] = useState(null);
  const [licenceFile, setLicenceFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  function validateFile(file, label) {
    if (!file) return `${label} image is required`;
    if (file.size > MAX_FILE_SIZE) return `${label} file exceeds 5MB limit`;
    if (!ALLOWED_TYPES.includes(file.type)) return `${label}: only JPG, PNG, WebP, or PDF allowed`;
    return null;
  }

  async function uploadFile(file, folder) {
    const ext = file.name.split('.').pop().replace(/[^a-zA-Z0-9]/g, '');
    const filePath = `profiles/${user.id}/${folder}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await uploadFileRobust('customer-documents', filePath, file, toast);
    if (uploadErr) throw uploadErr;
    return filePath;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!icNumber.trim()) { setError('IC / MyKad number is required.'); return; }
    if (!licenceExpiry) { setError('Driving licence expiry date is required.'); return; }
    if (new Date(licenceExpiry) < new Date()) { setError('Your driving licence has expired. Please enter a valid expiry date.'); return; }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 9) { setError('Please enter a valid phone number.'); return; }
    if (!addressLine1.trim()) { setError('Address line 1 is required.'); return; }
    if (!city.trim()) { setError('City is required.'); return; }
    if (!state.trim()) { setError('State is required.'); return; }
    if (!postcode.trim()) { setError('Postcode is required.'); return; }

    // For first-time verification, files are required
    const isUpdate = profile?.is_verified || hasSubmittedDocs;
    if (!isUpdate) {
      const icErr = validateFile(icFile, 'IC / MyKad');
      if (icErr) { setError(icErr); return; }
      const licErr = validateFile(licenceFile, 'Driving Licence');
      if (licErr) { setError(licErr); return; }
    }

    setUploading(true);
    try {
      let icPath = profile?.ic_file_path || null;
      let licencePath = profile?.licence_file_path || null;

      if (icFile) icPath = await uploadFile(icFile, 'ic');
      if (licenceFile) licencePath = await uploadFile(licenceFile, 'licence');

      if (isUpdate) {
        // Submit as pending verification update (old stays valid)
        const { error: insertErr } = await supabase
          .from('bubatrent_booking_verification_updates')
          .insert({
            user_id: user.id,
            ic_number: icNumber.trim(),
            licence_expiry: licenceExpiry,
            ic_file_path: icPath,
            licence_file_path: licencePath,
            phone: phone.trim(),
            address_line1: addressLine1.trim(),
            address_line2: addressLine2.trim(),
            city: city.trim(),
            state: state.trim(),
            postcode: postcode.trim(),
          });
        if (insertErr) throw insertErr;
      } else {
        // First-time: update profile directly (still needs admin approval)
        const { error: updateErr } = await supabase
          .from('bubatrent_booking_profiles')
          .update({
            ic_number: icNumber.trim(),
            licence_expiry: licenceExpiry,
            ic_file_path: icPath,
            licence_file_path: licencePath,
            phone: phone.trim(),
            address_line1: addressLine1.trim(),
            address_line2: addressLine2.trim(),
            city: city.trim(),
            state: state.trim(),
            postcode: postcode.trim(),
          })
          .eq('id', user.id);
        if (updateErr) throw updateErr;
      }

      await refreshProfile();
      setSubmitted(true);
      toast.success(isUpdate ? 'Verification update submitted!' : 'Documents submitted for verification!');
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  // Already verified (and licence not expired)
  if (isVerified && !licenceExpired) {
    return (
      <div className="page-container max-w-xl mx-auto">
        <div className="glass-card text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account Verified</h1>
          <p className="text-sm text-slate-400 mb-6">Your identity has been verified. You can now book cars.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/" className="btn-primary inline-flex items-center gap-2">Browse Fleet</Link>
            <Link to="/profile" className="btn-secondary inline-flex items-center gap-2">View Profile</Link>
          </div>
        </div>
      </div>
    );
  }

  // Licence expired — must update
  if (licenceExpired) {
    return (
      <div className="page-container max-w-xl mx-auto">
        <div className="glass-card text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Licence Expired</h1>
          <p className="text-sm text-slate-400 mb-4">Your driving licence has expired. Please update your licence to continue booking.</p>
          <p className="text-xs text-slate-500 mb-6">Upload a new licence with a valid expiry date below.</p>
        </div>
        {renderForm()}
      </div>
    );
  }

  // Pending verification (docs submitted, waiting for admin)
  if (hasSubmittedDocs || submitted) {
    return (
      <div className="page-container max-w-xl mx-auto">
        <div className="glass-card text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Verification Pending</h1>
          <p className="text-sm text-slate-400 mb-2">Your documents have been submitted and are being reviewed.</p>
          <p className="text-xs text-slate-500 mb-6">This usually takes less than 24 hours. You'll be able to book once verified.</p>
          <Link to="/" className="btn-secondary inline-flex items-center gap-2">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
          <FileCheck className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Verify Your Account</h1>
        <p className="text-sm text-slate-400">Submit your IC and driving licence to start booking</p>
      </div>
      {renderForm()}
    </div>
  );

  function renderForm() {
    return (
      <>
        <div className="glass-card !p-4 flex items-start gap-3 mb-6">
          <Shield className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 leading-relaxed">
            <p className="text-green-300 font-medium mb-1">Your documents are secure</p>
            <p>Files are stored in private encrypted storage, accessible only by our admin team.</p>
          </div>
        </div>

        <div className="glass-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Phone */}
            <div>
              <label className="input-label flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-violet-400" />
                Phone Number *
              </label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="input-field" placeholder="+60 12-345 6789" maxLength={20} disabled={uploading} />
            </div>

            {/* IC Section */}
            <div className="border-t border-white/5 pt-5">
              <p className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-violet-400" />
                IC / MyKad
              </p>
              <div className="space-y-4">
                <div>
                  <label className="input-label">IC Number (MyKad) *</label>
                  <input type="text" value={icNumber} onChange={(e) => setIcNumber(e.target.value)}
                    className="input-field" placeholder="e.g. 990101-14-1234" maxLength={30} disabled={uploading} />
                </div>
                <div>
                  <label className="input-label">Driving Licence Expiry Date *</label>
                  <input type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)}
                    className="input-field" disabled={uploading} />
                </div>
                <div>
                  <label className="input-label">IC / MyKad Image *</label>
                  <label className="flex items-center gap-3 px-4 py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/30 cursor-pointer transition-colors">
                    <FileImage className="w-6 h-6 text-slate-500" />
                    <div>
                      <p className="text-sm text-slate-300">{icFile ? icFile.name : 'Click to upload IC photo'}</p>
                      <p className="text-xs text-slate-500">JPG, PNG, WebP or PDF · Max 5MB</p>
                    </div>
                    <input type="file" accept="image/*,.pdf" onChange={(e) => setIcFile(e.target.files[0])}
                      className="hidden" disabled={uploading} />
                  </label>
                </div>
                <div>
                  <label className="input-label">Driving Licence Image *</label>
                  <label className="flex items-center gap-3 px-4 py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/30 cursor-pointer transition-colors">
                    <FileImage className="w-6 h-6 text-slate-500" />
                    <div>
                      <p className="text-sm text-slate-300">{licenceFile ? licenceFile.name : 'Click to upload licence photo'}</p>
                      <p className="text-xs text-slate-500">JPG, PNG, WebP or PDF · Max 5MB</p>
                    </div>
                    <input type="file" accept="image/*,.pdf" onChange={(e) => setLicenceFile(e.target.files[0])}
                      className="hidden" disabled={uploading} />
                  </label>
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="border-t border-white/5 pt-5">
              <p className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-violet-400" />
                Address
              </p>
              <div className="space-y-4">
                <div>
                  <label className="input-label">Address Line 1 *</label>
                  <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)}
                    className="input-field" placeholder="Street address" disabled={uploading} />
                </div>
                <div>
                  <label className="input-label">Address Line 2</label>
                  <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)}
                    className="input-field" placeholder="Apartment, unit, etc. (optional)" disabled={uploading} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">City *</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                      className="input-field" placeholder="City" disabled={uploading} />
                  </div>
                  <div>
                    <label className="input-label">State *</label>
                    <select value={state} onChange={(e) => setState(e.target.value)}
                      className="input-field" disabled={uploading}>
                      <option value="">Select state</option>
                      {['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang','Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu','W.P. Kuala Lumpur','W.P. Labuan','W.P. Putrajaya'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="w-1/2">
                  <label className="input-label">Postcode *</label>
                  <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)}
                    className="input-field" placeholder="e.g. 50000" maxLength={10} disabled={uploading} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={uploading} className="btn-primary w-full flex items-center justify-center gap-2">
              {uploading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-5 h-5" /> Submit for Verification</>
              )}
            </button>
          </form>
        </div>
      </>
    );
  }
}
