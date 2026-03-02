import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useCar } from '../hooks/useCars';
import { useAuth } from '../hooks/useAuth';
import { createHoldBooking, updateBookingCustomerInfo, cancelBooking } from '../hooks/useBookings';
import { supabase } from '../lib/supabase';
import { uploadFileRobust } from '../lib/uploadHelper';
import BookingForm from '../components/BookingForm';
import LoadingSpinner from '../components/LoadingSpinner';
import { calculatePrice, formatMYR } from '../utils/pricing';
import { formatDate, formatTimeRemaining } from '../utils/dates';
import {
  ArrowLeft, Clock, CheckCircle, AlertTriangle, Shield,
  ChevronRight, FileCheck, Upload, FileImage, Loader2, Wallet
} from 'lucide-react';
import { useToast } from '../components/Toast';

const STEPS = ['Your Info', 'Review', 'Payment'];

export default function Checkout() {
  const { carId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, isVerified, refreshProfile } = useAuth();
  const toast = useToast();
  const { car, loading: carLoading } = useCar(carId);

  const pickupDate = searchParams.get('pickup');
  const returnDate = searchParams.get('return');

  const [step, setStep] = useState(0);
  const [booking, setBooking] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [holdError, setHoldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const timerRef = useRef(null);
  const holdCreatedRef = useRef(false);

  // 6-month advance booking limit
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  const isTooFarAdvance = returnDate && new Date(returnDate) > sixMonthsFromNow;

  // Deposit credit
  const credit = Number(profile?.deposit_credit || 0);

  // Create hold on mount
  useEffect(() => {
    if (!car || !user || !pickupDate || !returnDate || booking || holdCreatedRef.current) return;
    if (isTooFarAdvance) return;
    holdCreatedRef.current = true;
    async function createHold() {
      try {
        setLoading(true);
        const { days, total, deposit } = calculatePrice(car.price_per_day, pickupDate, returnDate);
        const hold = await createHoldBooking(car.id, user.id, pickupDate, returnDate, total, deposit, car.fleet_group_id);
        setBooking(hold);
      } catch (err) {
        holdCreatedRef.current = false;
        setHoldError(err.message || 'Unable to hold this booking. The dates may no longer be available.');
      } finally {
        setLoading(false);
      }
    }
    createHold();
  }, [car, user, pickupDate, returnDate]);

  // Timer for hold expiry
  useEffect(() => {
    if (!booking?.hold_expires_at) return;
    function tick() {
      const remaining = formatTimeRemaining(booking.hold_expires_at);
      setTimeRemaining(remaining);
      if (remaining === 'Expired') {
        clearInterval(timerRef.current);
        cancelBooking(booking.id).catch(() => {});
      }
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [booking?.hold_expires_at, booking?.id]);

  if (carLoading || (loading && !holdError)) return <LoadingSpinner fullScreen />;

  if (!pickupDate || !returnDate || !car) {
    return (
      <div className="page-container text-center">
        <p className="text-red-400">Invalid checkout. Please select dates first.</p>
        <Link to="/" className="text-violet-400 hover:underline mt-4 inline-block">Back to fleet</Link>
      </div>
    );
  }

  // Block unverified users
  if (!isVerified) {
    return (
      <div className="page-container max-w-lg mx-auto text-center">
        <div className="glass-card">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <FileCheck className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Verification Required</h2>
          <p className="text-sm text-slate-400 mb-6">You need to verify your identity before booking a car.</p>
          <Link to="/verify" className="btn-primary inline-flex items-center gap-2">Verify Now</Link>
        </div>
      </div>
    );
  }

  // Block too-far-advance bookings
  if (isTooFarAdvance) {
    return (
      <div className="page-container max-w-lg mx-auto text-center">
        <div className="glass-card">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Booking Too Far in Advance</h2>
          <p className="text-sm text-slate-400 mb-6">You can only book up to 6 months in advance.</p>
          <Link to={`/cars/${carId}`} className="btn-primary inline-flex items-center gap-2">Change Dates</Link>
        </div>
      </div>
    );
  }

  if (holdError) {
    return (
      <div className="page-container max-w-lg mx-auto text-center">
        <div className="glass-card">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Booking Unavailable</h2>
          <p className="text-sm text-slate-400 mb-6">{holdError}</p>
          <Link to={`/cars/${carId}`} className="btn-primary inline-flex items-center gap-2">Try Different Dates</Link>
        </div>
      </div>
    );
  }

  const { days, total, deposit } = calculatePrice(car.price_per_day, pickupDate, returnDate);
  const creditApplied = Math.min(credit, deposit);
  const amountDue = deposit - creditApplied;
  const isExpired = timeRemaining === 'Expired';

  async function handleInfoSubmit(info) {
    try {
      setLoading(true);
      await updateBookingCustomerInfo(booking.id, info);
      setCustomerInfo(info);
      setStep(1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDepositPayment() {
    if (amountDue > 0 && !receiptFile) {
      toast.error('Please upload your payment receipt.');
      return;
    }
    setUploading(true);
    try {
      let receiptPath = null;

      // Upload receipt if payment is required
      if (receiptFile) {
        const ext = receiptFile.name.split('.').pop();
        const path = `receipts/${booking.id}/deposit_${Date.now()}.${ext}`;
        const { error: upErr } = await uploadFileRobust('customer-documents', path, receiptFile, toast);
        if (upErr) throw upErr;
        receiptPath = path;
      }

      // Update booking with deposit info
      const updateData = {
        status: 'DEPOSIT_PAID',
        deposit_status: amountDue > 0 ? 'uploaded' : 'verified', // Auto-verify if fully covered by credit
        deposit_receipt_path: receiptPath,
        credit_applied: creditApplied,
        hold_expires_at: null,
        full_payment_amount: total,
      };
      const { error: bookErr } = await supabase
        .from('bubatrent_booking_bookings')
        .update(updateData)
        .eq('id', booking.id);
      if (bookErr) throw bookErr;

      // Create payment record
      const { error: payErr } = await supabase
        .from('bubatrent_booking_payments')
        .insert({
          booking_id: booking.id,
          amount: deposit,
          payment_method: 'bank_transfer',
          status: amountDue > 0 ? 'pending' : 'completed',
          simulated: false,
          payment_type: 'deposit',
          receipt_path: receiptPath,
          reference_number: `DEP-${Date.now().toString(36).toUpperCase()}`,
        });
      if (payErr) throw payErr;

      // Deduct credit if applied
      if (creditApplied > 0) {
        // Update profile credit
        const { error: creditErr } = await supabase
          .from('bubatrent_booking_profiles')
          .update({ deposit_credit: credit - creditApplied })
          .eq('id', user.id);
        if (creditErr) throw creditErr;

        // Create credit transaction record
        await supabase.from('bubatrent_booking_credit_transactions').insert({
          user_id: user.id,
          booking_id: booking.id,
          amount: -creditApplied,
          type: 'applied',
          description: `Credit applied to booking deposit`,
        });

        await refreshProfile();
      }

      navigate(`/booking/${booking.id}/confirmation`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page-container max-w-4xl mx-auto">
      <Link to={`/cars/${carId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to car
      </Link>

      {/* Hold Timer */}
      {booking && !isExpired && (
        <div className="glass-card !p-3 flex items-center justify-between mb-6 border-yellow-500/20">
          <div className="flex items-center gap-2 text-sm text-yellow-300">
            <Clock className="w-4 h-4" />
            <span>Booking held for you</span>
          </div>
          <span className="text-sm font-mono font-bold text-yellow-300">{timeRemaining}</span>
        </div>
      )}

      {isExpired && (
        <div className="glass-card !p-4 mb-6 border-red-500/20 text-center">
          <p className="text-red-400 font-medium">Your hold has expired. Please start over.</p>
          <Link to={`/cars/${carId}`} className="text-violet-400 hover:underline text-sm mt-2 inline-block">Go back</Link>
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === step ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' :
              i < step ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-slate-500'
            }`}>
              {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-700" />}
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Current Step */}
        <div className="flex-1 min-w-0">
          {step === 0 && (
            <div className="glass-card animate-fade-in">
              <h2 className="text-lg font-semibold text-white mb-6">Your Information</h2>
              <BookingForm
                onSubmit={handleInfoSubmit}
                loading={loading}
                initialData={{ email: user?.email || '' }}
              />
            </div>
          )}

          {step === 1 && (
            <div className="glass-card animate-fade-in">
              <h2 className="text-lg font-semibold text-white mb-6">Review Your Booking</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="text-sm text-white">{customerInfo?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Email</p>
                    <p className="text-sm text-white">{customerInfo?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Phone</p>
                    <p className="text-sm text-white">{customerInfo?.phone}</p>
                  </div>
                </div>
                {customerInfo?.notes && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Notes</p>
                    <p className="text-sm text-slate-300">{customerInfo.notes}</p>
                  </div>
                )}
                <div className="border-t border-white/5 pt-4 flex gap-3">
                  <button onClick={() => setStep(0)} className="btn-secondary flex-1">Edit Info</button>
                  <button onClick={() => setStep(2)} className="btn-primary flex-1" disabled={isExpired}>
                    Proceed to Payment
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="glass-card animate-fade-in">
              <h2 className="text-lg font-semibold text-white mb-2">Deposit Payment</h2>
              <p className="text-sm text-slate-400 mb-6">
                Upload your payment receipt to secure this booking. Full rental payment is due at pickup.
              </p>

              {/* Credit applied */}
              {creditApplied > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
                  <Wallet className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm text-green-300 font-medium">Credit Applied: {formatMYR(creditApplied)}</p>
                    <p className="text-xs text-green-400/70">Deducted from your deposit balance</p>
                  </div>
                </div>
              )}

              {/* Payment breakdown */}
              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Deposit Required</span>
                  <span className="text-white">{formatMYR(deposit)}</span>
                </div>
                {creditApplied > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Credit Applied</span>
                    <span>-{formatMYR(creditApplied)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/5 pt-2 font-semibold">
                  <span className="text-white">Amount Due</span>
                  <span className="text-violet-300">{formatMYR(amountDue)}</span>
                </div>
              </div>

              {/* Receipt upload (if payment needed) */}
              {amountDue > 0 ? (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Transfer <span className="text-white font-semibold">{formatMYR(amountDue)}</span> to our bank account, then upload the receipt below.
                  </p>
                  <label className="flex items-center gap-3 px-4 py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/30 cursor-pointer transition-colors mb-6">
                    <FileImage className="w-6 h-6 text-slate-500" />
                    <div>
                      <p className="text-sm text-slate-300">{receiptFile ? receiptFile.name : 'Click to upload payment receipt'}</p>
                      <p className="text-xs text-slate-500">JPG, PNG, WebP or PDF · Max 5MB</p>
                    </div>
                    <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files[0])}
                      className="hidden" disabled={uploading} />
                  </label>
                </>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-6">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <p className="text-sm text-green-300">Deposit fully covered by your credit balance!</p>
                </div>
              )}

              <button
                onClick={handleDepositPayment}
                disabled={uploading || isExpired || (amountDue > 0 && !receiptFile)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  <><Upload className="w-5 h-5" /> {amountDue > 0 ? 'Submit Deposit Payment' : 'Confirm Booking'}</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right: Booking Summary */}
        <div className="lg:w-80 shrink-0">
          <div className="glass-card lg:sticky lg:top-24">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Summary</h3>
            {car.image_url && (
              <img src={car.image_url} alt={car.name} className="w-full h-32 object-cover rounded-xl mb-4" loading="lazy" referrerPolicy="no-referrer" />
            )}
            <h4 className="text-white font-semibold mb-1">{car.name}</h4>
            <p className="text-xs text-slate-500 mb-4">{car.brand} {car.model}</p>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Pick-up</span>
                <span className="text-white">{formatDate(pickupDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Return</span>
                <span className="text-white">{formatDate(returnDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Duration</span>
                <span className="text-white">{days} day{days > 1 ? 's' : ''}</span>
              </div>
              <div className="border-t border-white/5 pt-3 flex justify-between">
                <span className="text-slate-400">Rental Total</span>
                <span className="text-white font-semibold">{formatMYR(total)}</span>
              </div>
              <div className="flex justify-between bg-violet-500/10 rounded-xl px-3 py-2 -mx-1">
                <span className="text-violet-300 text-sm">Deposit (Security)</span>
                <span className="text-violet-300 font-bold">{formatMYR(deposit)}</span>
              </div>
              <p className="text-xs text-slate-600 italic">Full rental payment ({formatMYR(total)}) due at pickup</p>
            </div>

            <div className="flex items-center gap-1.5 mt-4 text-xs text-slate-600">
              <Shield className="w-3.5 h-3.5" />
              <span>Secure checkout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
