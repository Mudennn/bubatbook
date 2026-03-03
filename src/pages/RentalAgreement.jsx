import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { formatMYR } from '../utils/pricing';
import { formatDate } from '../utils/dates';
import SignatureCanvas from '../components/SignatureCanvas';
import LoadingSpinner from '../components/LoadingSpinner';
import { useToast } from '../components/Toast';
import { CheckCircle, FileText, AlertTriangle } from 'lucide-react';

// Damage liability table by engine CC (from Bubat Resources paper form)
const LIABILITY_TABLE = [
  { cc: '999cc dan ke bawah', workshop7: 'RM2,000', workshopMore: 'RM3,500', minor: 'RM600' },
  { cc: '1000cc - 1299cc', workshop7: 'RM3,000', workshopMore: 'RM4,000', minor: 'RM800' },
  { cc: '1300cc - 1499cc', workshop7: 'RM3,500', workshopMore: 'RM4,500', minor: 'RM1,000' },
  { cc: '1500cc - 1699cc', workshop7: 'RM5,000', workshopMore: 'RM5,000', minor: 'RM1,200' },
  { cc: '1700cc dan keatas', workshop7: 'RM6,000', workshopMore: 'RM6,000', minor: 'RM1,500' },
];

export default function RentalAgreement() {
  const { id } = useParams(); // booking id
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    async function fetchBooking() {
      try {
        // Fetch booking with car info
        const { data: bookingData, error: bErr } = await supabase
          .from('bubatrent_booking_bookings')
          .select('*, bubatrent_booking_cars(*)')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (bErr) throw bErr;
        if (!bookingData) {
          toast.error('Booking not found or access denied.');
          navigate('/my-bookings');
          return;
        }
        setBooking(bookingData);

        // Check if already signed
        const { data: agreement } = await supabase
          .from('bubatrent_booking_rental_agreements')
          .select('id, agreed_at')
          .eq('booking_id', id)
          .maybeSingle();

        if (agreement) setAlreadySigned(true);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load booking.');
      } finally {
        setLoading(false);
      }
    }
    fetchBooking();
  }, [id, user.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!signatureData) { toast.error('Please draw your signature.'); return; }
    if (!agreedToTerms) { toast.error('Please agree to the terms and conditions.'); return; }

    setSubmitting(true);
    try {
      const car = booking.bubatrent_booking_cars;
      const { error } = await supabase
        .from('bubatrent_booking_rental_agreements')
        .insert({
          booking_id: booking.id,
          customer_id: user.id,
          customer_name: profile?.full_name || user.email,
          customer_ic: profile?.ic_number || '',
          customer_phone: profile?.phone || '',
          car_model: `${car?.brand || ''} ${car?.model || ''}`.trim(),
          car_plate: car?.plate_number || '',
          pickup_date: booking.pickup_date,
          return_date: booking.return_date,
          rental_rate: car?.price_per_day || 0,
          total_price: booking.total_price,
          deposit_amount: booking.deposit_amount,
          signature_data: signatureData,
        });

      if (error) throw error;

      toast.success('Agreement signed successfully!');
      setAlreadySigned(true);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to submit agreement.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (!booking) return null;

  const car = booking.bubatrent_booking_cars;

  // Already signed — show confirmation
  if (alreadySigned) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Agreement Signed!</h1>
          <p className="text-slate-400 text-sm mb-6">
            Your rental agreement for <span className="text-white font-medium">{car?.brand} {car?.model}</span> has been signed and recorded.
          </p>
          <button onClick={() => navigate('/my-bookings')} className="btn-primary w-full">
            Back to My Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="glass-card mb-6 text-center">
          <h1 className="text-2xl font-bold text-white mb-1">PERJANJIAN SEWAAN KENDERAAN</h1>
          <p className="text-slate-400 text-sm">Rental Agreement / Surat Perjanjian Sewa Kereta</p>
        </div>

        {/* Auto-filled Booking Details */}
        <div className="glass-card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-400" />
            BUTIRAN PENYEWA (Renter Details)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Nama / Name</p>
              <p className="text-white font-medium">{profile?.full_name || user.email}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">No. K/P / IC Number</p>
              <p className="text-white font-medium">{profile?.ic_number || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">No. Telefon / Phone</p>
              <p className="text-white font-medium">{profile?.phone || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Email</p>
              <p className="text-white font-medium">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Vehicle & Booking Info */}
        <div className="glass-card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">BUTIRAN KENDERAAN (Vehicle Details)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Model Kenderaan / Vehicle</p>
              <p className="text-white font-medium">{car?.brand} {car?.model}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">No. Pendaftaran / Plate</p>
              <p className="text-white font-medium">{car?.plate_number || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Tarikh Mula / Pickup Date</p>
              <p className="text-white font-medium">{formatDate(booking.pickup_date)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Tarikh Tamat / Return Date</p>
              <p className="text-white font-medium">{formatDate(booking.return_date)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Kadar Sewa / Daily Rate</p>
              <p className="text-white font-medium">{formatMYR(car?.price_per_day || 0)}/hari</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Jumlah Sewa / Total</p>
              <p className="text-white font-medium text-lg">{formatMYR(booking.total_price)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-0.5">Deposit</p>
              <p className="text-white font-medium">{formatMYR(booking.deposit_amount)}</p>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="glass-card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">TERMA & SYARAT (Terms & Conditions)</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p className="text-xs text-slate-500 italic mb-4">
              Penyewa yang mengikat kontrak sewa kenderaan bulanan, jika berlaku kerosakan sewaktu tempoh sewa yang disebabkan oleh kenderaan itu sendiri, syarikat akan menggantikan kenderaan tersebut dengan yang lain. Jika ada, jika tiada kenderaan lain, syarikat akan beri sewa percuma mengikut hari yang terlibat.
            </p>

            <ol className="list-decimal pl-5 space-y-2">
              <li>Penyewa bersetuju untuk menyewa dan memulangkan kenderaan pada <strong className="text-white">tarikh dan masa yang telah ditetapkan</strong>.</li>
              <li>Penyewa mestilah mempunyai <strong className="text-white">lesen memandu Malaysia Kelas D</strong> dan GDL Kelas D yang sah.</li>
              <li>Penyewa mestilah memaklumkan kepada syarikat sekiranya berlaku sebarang perkara yang tidak diingini. Contoh: <strong className="text-white">kemalangan, kehilangan dan sebagainya</strong>.</li>
              <li>Kenderaan mestilah digunakan untuk perkara yang <strong className="text-white">mematuhi undang-undang sahaja</strong>. Segala perkara yang melanggar undang-undang seperti pengedaran dadah, perlumbaan, perjudian dan sebagainya adalah <strong className="text-red-400">DILARANG</strong>.</li>
              <li>Penyewa adalah <strong className="text-white">bertanggungjawab</strong> dengan segala bentuk saman yang dikenakan, bayaran parking, minyak kenderaan, kerosakan atau kegagalan kenderaan yang berpunca dari penyewa sepanjang tempoh sewaan.</li>
              <li>Untuk sebarang <strong className="text-white">kelewatan pengembalian</strong> kenderaan, penyewa akan dikenakan caj sebanyak <strong className="text-yellow-400">RM10.00 / RM15.00 / RM20.00 sejam</strong>. Penyewa bertanggungjawab untuk memulangkan kenderaan dalam keadaan bersih. Jika tidak, deposit akan ditolak sebanyak <strong className="text-yellow-400">RM20</strong>.</li>
            </ol>
          </div>
        </div>

        {/* Insurance / Mutual Agreement */}
        <div className="glass-card mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">INSURAN / PERSETUJUAN BERSAMA</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <ol className="list-decimal pl-5 space-y-3">
              <li>Penyewa bersetuju untuk <strong className="text-white">bertanggungjawab sepenuhnya</strong> diatas segala kehilangan atau kerosakan pada kenderaan atau segala peralatan sepanjang tempoh sewaan mengikut terma dan syarat penyewaan kenderaan walaupun berpunca dari perlanggaraan, kebakaran, banjir, vandalisme, kecurian atau apapunpunca kecuali atas kerosakan atau kecacatan kenderaan itu sendiri.</li>
              <li>Penyewa <strong className="text-white">wajib membayar gantirugi</strong> kemalangan atau kerosakan kepada syarikat serta merta. Ganti rugi kemalangan yang dibayar oleh penyewa sama sekali tidak melibatkan tuntutan insuran kenderaan walaupun tuntutan insuran dibuat oleh syarikat.</li>
            </ol>

            {/* Liability Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400">
                    <th className="border border-white/10 p-2 text-left bg-white/5">CC Kenderaan</th>
                    <th className="border border-white/10 p-2 text-center bg-white/5">Bengkel &lt; 7 Hari</th>
                    <th className="border border-white/10 p-2 text-center bg-white/5">Bengkel &gt; 7 Hari</th>
                    <th className="border border-white/10 p-2 text-center bg-white/5">Kerosakan Kecil</th>
                  </tr>
                </thead>
                <tbody>
                  {LIABILITY_TABLE.map((row, i) => (
                    <tr key={i} className="text-white">
                      <td className="border border-white/10 p-2 text-slate-300">{row.cc}</td>
                      <td className="border border-white/10 p-2 text-center font-medium text-yellow-400">{row.workshop7}</td>
                      <td className="border border-white/10 p-2 text-center font-medium text-orange-400">{row.workshopMore}</td>
                      <td className="border border-white/10 p-2 text-center font-medium text-emerald-400">{row.minor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ol className="list-decimal pl-5 space-y-2" start={3}>
              <li>Deposit akan <strong className="text-white">dikembalikan semula</strong> kepada penyewa diantara <strong className="text-white">7 hari bekerja</strong>. Sekiranya tidak berlaku sebarang perkara yang tidak diingini mengikut terma & syarat perjanjian penyewaan.</li>
              <li>Penalti sebanyak <strong className="text-yellow-400">25%</strong> dari jumlah bayaran keseluruhan tempoh sewaan akan dikenakan sekiranya penyewa <strong className="text-white">membatalkan atau memendekkan</strong> perjanjian tempoh sewaan.</li>
            </ol>
          </div>
        </div>

        {/* Warning */}
        <div className="flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            Dengan menandatangani perjanjian ini, anda bersetuju untuk mematuhi semua terma dan syarat yang dinyatakan di atas. Pelanggaran mana-mana syarat boleh menyebabkan tindakan undang-undang.
          </p>
        </div>

        {/* Signature Section */}
        <form onSubmit={handleSubmit}>
          <div className="glass-card mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">TANDATANGAN PENYEWA (Customer Signature)</h2>
            <SignatureCanvas onSignatureChange={setSignatureData} />
          </div>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500 cursor-pointer"
            />
            <span className="text-sm text-slate-300">
              Saya telah membaca dan <strong className="text-white">bersetuju</strong> dengan semua terma dan syarat perjanjian sewaan kenderaan di atas. / I have read and agree to all terms and conditions stated above.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !signatureData || !agreedToTerms}
            className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
          >
            {submitting ? 'Menghantar...' : '✍️ Tandatangan & Setuju (Sign & Agree)'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6 mb-8">
          Terima kasih dan selamat memandu. · Thank you and drive safely.
        </p>
      </div>
    </div>
  );
}
