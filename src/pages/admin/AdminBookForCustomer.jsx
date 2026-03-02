import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useFleet } from '../../hooks/useFleet';
import { supabase } from '../../lib/supabase';
import { uploadFileRobust } from '../../lib/uploadHelper';
import { useToast } from '../../components/Toast';
import { normalizePhone } from '../../utils/phoneUtils';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  Search, User, Car, CalendarDays, Wallet, FileImage, Loader2, ArrowLeft, Shield, Check
} from 'lucide-react';

export default function AdminBookForCustomer() {
  const { user, isSuperAdmin } = useAuth();
  const { activeFleetId, activeFleet } = useFleet();
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1); // 1=customer, 2=car, 3=dates, 4=confirm

  // Step 1: Customer
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState([]);
  const [selectedCust, setSelectedCust] = useState(null);
  const [searching, setSearching] = useState(false);

  // Step 2: Car
  const [cars, setCars] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [carsLoading, setCarsLoading] = useState(false);

  // Step 3: Dates
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [dateError, setDateError] = useState('');

  // Step 4: Config
  const [depositAmount, setDepositAmount] = useState(100);
  const [initialStatus, setInitialStatus] = useState('CONFIRMED');
  const [depositReceipt, setDepositReceipt] = useState(null);
  const [creating, setCreating] = useState(false);

  // Search customers
  async function handleCustSearch(q) {
    setCustSearch(q);
    if (q.length < 2) { setCustResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('bubatrent_booking_profiles')
      .select('id, display_name, username, email, phone, ic_number, is_verified')
      .eq('role', 'customer')
      .or(`display_name.ilike.%${q}%,phone.ilike.%${q}%,ic_number.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setCustResults(data || []);
    setSearching(false);
  }

  // Fetch cars when step 2
  useEffect(() => {
    if (step === 2 && activeFleetId) {
      setCarsLoading(true);
      supabase
        .from('bubatrent_booking_cars')
        .select('*')
        .eq('fleet_group_id', activeFleetId)
        .eq('available', true)
        .order('name')
        .then(({ data }) => { setCars(data || []); setCarsLoading(false); });
    }
  }, [step, activeFleetId]);

  // Validate dates
  function validateDates() {
    if (!pickupDate || !returnDate) { setDateError('Dates are required'); return false; }
    const pickup = new Date(pickupDate);
    const ret = new Date(returnDate);
    if (ret <= pickup) { setDateError('Return must be after pickup'); return false; }
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    if (pickup > sixMonths) { setDateError('Pickup must be within 6 months'); return false; }
    setDateError('');
    return true;
  }

  // Calculate price
  function calcTotal() {
    if (!pickupDate || !returnDate || !selectedCar) return 0;
    const days = Math.ceil((new Date(returnDate) - new Date(pickupDate)) / (1000 * 60 * 60 * 24));
    return days * (selectedCar.price_per_day || 0);
  }

  async function handleCreate() {
    if (!validateDates()) return;
    if (depositAmount < 100) { toast.error('Minimum deposit is RM100'); return; }
    setCreating(true);

    try {
      // Overlap check
      const { data: overlapping } = await supabase
        .from('bubatrent_booking_bookings')
        .select('id')
        .eq('car_id', selectedCar.id)
        .in('status', ['HOLD', 'DEPOSIT_PAID', 'CONFIRMED', 'PICKUP'])
        .lte('pickup_date', returnDate)
        .gte('return_date', pickupDate)
        .limit(1);
      if (overlapping?.length > 0) {
        toast.error('Date overlap with existing booking');
        setCreating(false);
        return;
      }

      const totalPrice = calcTotal();

      // Upload deposit receipt if provided
      let receiptUrl = null;
      if (depositReceipt) {
        const rPath = `receipts/admin_${Date.now()}.${depositReceipt.name.split('.').pop()}`;
        const { error: upErr } = await uploadFileRobust('customer-documents', rPath, depositReceipt, toast);
        if (upErr) throw upErr;
        receiptUrl = rPath;
      }

      // Create booking
      const { data: booking, error } = await supabase
        .from('bubatrent_booking_bookings')
        .insert({
          car_id: selectedCar.id,
          user_id: selectedCust.id,
          pickup_date: pickupDate,
          return_date: returnDate,
          total_price: totalPrice,
          deposit_amount: depositAmount,
          status: initialStatus,
          fleet_group_id: activeFleetId,
          created_by_admin: user.id,
          customer_name: selectedCust.display_name || '',
          customer_email: selectedCust.email || '',
          customer_phone: selectedCust.phone || '',
        })
        .select()
        .single();
      if (error) throw error;

      // If receipt uploaded and status = DEPOSIT_PAID or CONFIRMED, create payment record
      if (receiptUrl && (initialStatus === 'DEPOSIT_PAID' || initialStatus === 'CONFIRMED')) {
        await supabase.from('bubatrent_booking_payments').insert({
          booking_id: booking.id,
          amount: depositAmount,
          type: 'deposit',
          status: 'completed',
          receipt_url: receiptUrl,
          fleet_group_id: activeFleetId,
          verified_by: user.id,
        });
      }

      // Audit log
      await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: user.id,
        action: 'ADMIN_CREATE_BOOKING',
        resource_type: 'booking',
        resource_id: booking.id,
        details: {
          customer_id: selectedCust.id,
          car_id: selectedCar.id,
          dates: `${pickupDate} → ${returnDate}`,
          status: initialStatus,
          total: totalPrice,
          deposit: depositAmount,
        },
      });

      toast.success('Booking created successfully');
      navigate(`/admin/bookings/${booking.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminLayout title="Book for Customer">
      <button onClick={() => navigate('/admin/bookings')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Bookings
      </button>

      {/* Step indicators */}
      <div className="flex gap-2 mb-6">
        {['Customer', 'Car', 'Dates & Deposit', 'Confirm'].map((s, i) => (
          <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            step === i + 1 ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' :
            step > i + 1 ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-slate-500'
          }`}>
            {step > i + 1 ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
            {s}
          </div>
        ))}
      </div>

      {/* Step 1: Select Customer */}
      {step === 1 && (
        <div className="glass-card max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-3">Select Customer</h3>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={custSearch} onChange={e => handleCustSearch(e.target.value)}
              className="input-field !pl-10" placeholder="Search by name, phone, IC, or email..." autoFocus />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
          </div>
          {selectedCust ? (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-violet-400" />
                <div>
                  <p className="text-sm text-white font-medium">{selectedCust.display_name || selectedCust.ic_number}</p>
                  <p className="text-[10px] text-slate-500">{selectedCust.phone} {selectedCust.email ? `• ${selectedCust.email}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCust(null)} className="text-slate-500 text-xs hover:text-white">Change</button>
            </div>
          ) : custResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {custResults.map(c => (
                <button key={c.id} onClick={() => { setSelectedCust(c); setCustResults([]); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-left transition-all">
                  <User className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm text-white">{c.display_name || c.ic_number || 'Unknown'}</p>
                    <p className="text-[10px] text-slate-500">{c.phone} {c.email ? `• ${c.email}` : ''} {c.is_verified ? '✓ Verified' : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => step === 1 && selectedCust && setStep(2)}
            disabled={!selectedCust}
            className="btn-primary w-full mt-4 disabled:opacity-30">Next → Select Car</button>
        </div>
      )}

      {/* Step 2: Select Car */}
      {step === 2 && (
        <div className="glass-card max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-3">Select Car — {activeFleet?.name}</h3>
          {carsLoading ? <LoadingSpinner /> : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cars.map(c => (
                <button key={c.id} onClick={() => setSelectedCar(c)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                    selectedCar?.id === c.id ? 'bg-violet-500/10 border-violet-500/30' : 'bg-white/5 border-transparent hover:bg-white/10'
                  }`}>
                  {c.image_url && <img src={c.image_url} className="w-14 h-10 rounded-lg object-cover" alt="" />}
                  <div>
                    <p className="text-sm text-white font-medium">{c.name || `${c.brand} ${c.model}`}</p>
                    <p className="text-[10px] text-slate-500">RM{c.price_per_day}/day • {c.plate_number}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
            <button onClick={() => selectedCar && setStep(3)} disabled={!selectedCar}
              className="btn-primary flex-1 disabled:opacity-30">Next → Dates</button>
          </div>
        </div>
      )}

      {/* Step 3: Dates & Deposit */}
      {step === 3 && (
        <div className="glass-card max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-3">Dates & Deposit</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="input-label">Pickup Date *</label>
              <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} className="input-field" />
            </div>
            <div>
              <label className="input-label">Return Date *</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                min={pickupDate || new Date().toISOString().split('T')[0]} className="input-field" />
            </div>
          </div>
          {dateError && <p className="text-xs text-red-400 mb-2">{dateError}</p>}
          {pickupDate && returnDate && selectedCar && (
            <div className="bg-white/5 rounded-xl p-3 mb-3">
              <p className="text-sm text-white">Total: <strong>RM {calcTotal().toFixed(2)}</strong> ({Math.ceil((new Date(returnDate) - new Date(pickupDate)) / 86400000)} days × RM{selectedCar.price_per_day})</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="input-label">Deposit (min RM100) *</label>
              <input type="number" value={depositAmount} onChange={e => setDepositAmount(Number(e.target.value))}
                min={100} className="input-field" />
            </div>
            <div>
              <label className="input-label">Initial Status</label>
              <select value={initialStatus} onChange={e => setInitialStatus(e.target.value)} className="input-field">
                <option value="DEPOSIT_PAID">Deposit Paid</option>
                <option value="CONFIRMED">Confirmed</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="input-label">Deposit Receipt (optional)</label>
            <label className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs cursor-pointer border ${depositReceipt ? 'bg-green-500/5 border-green-500/20 text-green-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
              <FileImage className="w-4 h-4" />
              <span className="truncate">{depositReceipt?.name || 'Upload deposit receipt...'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setDepositReceipt(e.target.files[0])} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
            <button onClick={() => { if (validateDates()) setStep(4); }}
              className="btn-primary flex-1">Review & Confirm</button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <div className="glass-card max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-4">Review Booking</h3>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Customer:</span><span className="text-white">{selectedCust?.display_name || selectedCust?.ic_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Car:</span><span className="text-white">{selectedCar?.name || `${selectedCar?.brand} ${selectedCar?.model}`}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Dates:</span><span className="text-white">{pickupDate} → {returnDate}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Total:</span><span className="text-white font-semibold">RM {calcTotal().toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Deposit:</span><span className="text-white">RM {depositAmount}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Status:</span><span className="text-green-400">{initialStatus}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Fleet:</span><span className="text-white">{activeFleet?.name}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="btn-secondary flex-1">Back</button>
            <button onClick={handleCreate} disabled={creating}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {creating ? 'Creating...' : 'Create Booking'}
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
