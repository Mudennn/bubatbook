import AdminLayout from '../../components/AdminLayout';
import { BookOpen, Car, CalendarDays, Users, DollarSign, Wallet, AlertTriangle, MessageCircle } from 'lucide-react';

export default function UserManual() {
  return (
    <AdminLayout title="User Manual & Documentation">
      <div className="space-y-8 max-w-4xl">
        
        {/* Welcome Block */}
        <div className="glass-card bg-gradient-to-br from-violet-500/10 to-indigo-600/10 border-violet-500/20">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Welcome to Rent2Go Admin Panel</h2>
              <p className="text-sm text-slate-400">Your comprehensive guide to managing your car rental operations.</p>
            </div>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            This dashboard allows you to manage everything from fleet inventory to customer verifications, bookings, and financial performance. 
            Below are detailed instructions on the core workflows of the system.
          </p>
        </div>

        {/* 1. Managing Vehicles */}
        <section className="glass-card">
          <div className="flex items-center gap-3 mb-4 text-white font-semibold text-lg border-b border-white/10 pb-3">
            <Car className="w-5 h-5 text-blue-400" />
            <h3>1. Managing Vehicles (Fleet)</h3>
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            <p><strong>Adding a Car:</strong> Navigate to the <span className="text-white font-medium">Cars</span> tab and click "Add Car". Fill in the model, brand, transmission, seats, daily price, and security deposit. Upload an attractive image.</p>
            <p><strong>Status Meanings:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="text-emerald-400 font-medium">Available</span>: Ready to be booked by customers.</li>
              <li><span className="text-yellow-400 font-medium">Maintenance</span>: Hidden from public catalog, currently being serviced.</li>
              <li><span className="text-rose-400 font-medium">Inactive</span>: Temporarily removed from catalog.</li>
            </ul>
          </div>
        </section>

        {/* 2. Customer Verification */}
        <section className="glass-card">
          <div className="flex items-center gap-3 mb-4 text-white font-semibold text-lg border-b border-white/10 pb-3">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3>2. Customer Verification & Manual Customers</h3>
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            <p>Before a customer can book a car, their identity must be verified for security purposes.</p>
            <h4 className="text-white font-medium mt-2">Verifying a Registered Customer:</h4>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Go to the <span className="text-white font-medium">Customers</span> tab. Customers awaiting verification will have an <span className="text-orange-400">Unverified</span> badge.</li>
              <li>Click their name to view their profile. You will see their uploaded Identity Card (IC) and Driving License.</li>
              <li>Toggle "IC Verified" and "License Verified" if the documents are valid. The customer is now cleared to book.</li>
            </ol>
            <h4 className="text-white font-medium mt-4">Creating a Manual Customer (Walk-in):</h4>
            <p>If a customer walks in without an account, click <span className="text-white font-medium">Create Customer</span>. Fill in their details and directly upload their documents to instantly create and verify their profile in the system.</p>
          </div>
        </section>

        {/* 3. Booking Lifecycle */}
        <section className="glass-card">
          <div className="flex items-center gap-3 mb-4 text-white font-semibold text-lg border-b border-white/10 pb-3">
            <CalendarDays className="w-5 h-5 text-violet-400" />
            <h3>3. Managing Bookings & Payments</h3>
          </div>
          <div className="space-y-4 text-sm text-slate-300">
            <p>The system prevents booking overlaps automatically. A booking goes through several specific stages:</p>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <h5 className="text-yellow-400 font-bold mb-1">1. HOLD</h5>
                <p className="text-xs">When a user selects dates and proceeds to checkout, the car is "held" for 10 minutes. If they don't upload a deposit receipt, it expires.</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <h5 className="text-orange-400 font-bold mb-1">2. DEPOSIT_PAID</h5>
                <p className="text-xs">Customer uploaded a receipt. You must review the receipt in the Booking Details. If valid, click <span className="text-white font-medium">Confirm Deposit</span>.</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <h5 className="text-green-400 font-bold mb-1">3. CONFIRMED</h5>
                <p className="text-xs">The booking is fully secured. The customer will arrive on the pickup date.</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-emerald-500/20">
                <h5 className="text-emerald-400 font-bold mb-1">4. PICKUP</h5>
                <p className="text-xs">Customer arrived. <strong>Important:</strong> You cannot mark a car as Picked Up until the <em>Total Rental Payment</em> is fully paid in the system.</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <h5 className="text-slate-400 font-bold mb-1">5. COMPLETED</h5>
                <p className="text-xs">Customer returned the car safely. Booking is finalized.</p>
              </div>
            </div>
            
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl mt-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-xs text-red-200">
                <strong className="block text-red-300 mb-1">Expired Bookings:</strong>
                If a HOLD expires, you can manually "Reactivate" it in the Booking Details page—but only if those dates haven't been taken by someone else!
              </p>
            </div>
          </div>
        </section>

        {/* 4. Credit Balance */}
        <section className="glass-card">
          <div className="flex items-center gap-3 mb-4 text-white font-semibold text-lg border-b border-white/10 pb-3">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h3>4. Customer Credit Balances</h3>
          </div>
          <div className="space-y-3 text-sm text-slate-300">
            <p>Every customer is required to pay a <strong>Security Deposit</strong> when booking. After the rental is completed, you have two choices for this deposit:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Refund it physically:</strong> Transfer the money back to them. No system action required.</li>
              <li><strong>Add to Wallet (Credit):</strong> You can retain the deposit by explicitly adding it to the customer's wallet in the Booking Details page.</li>
            </ul>
            <p>
              Customers with Credit Balances will automatically have those credits applied towards the deposit of their <strong>next booking</strong>. If they have enough credit to completely cover the deposit, their booking skips the receipt upload step entirely and becomes instantly verified.
            </p>
          </div>
        </section>

        {/* 5. Sales & Expenses */}
        <section className="glass-card">
          <div className="flex items-center gap-3 mb-4 text-white font-semibold text-lg border-b border-white/10 pb-3">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <h3>5. Financials (Sales & Expenses)</h3>
          </div>
          <div className="space-y-3 text-sm text-slate-300">
            <p><strong>Sales:</strong> The <span className="text-white font-medium">Sales</span> dashboard aggregates all finalized payments (confirmed deposits and full payments). It only counts hard revenue, not pending holds.</p>
            <p><strong>Expenses:</strong> If you spend money on fleet maintenance (e.g., fuel, washing, repairs, insurance), log it in the <span className="text-white font-medium">Expenses</span> tab. This will accurately calculate your Net Profit in the main dashboard.</p>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 mt-8 mb-4">
          <p>Rent2Go Management System Documentation</p>
        </div>

      </div>
    </AdminLayout>
  );
}
