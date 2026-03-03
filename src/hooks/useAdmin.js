import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Fleet-scoped helper ───
// Applies fleet_group_id filter unless null (super admin "All Fleets" view)
function scopeToFleet(query, fleetId) {
    if (fleetId) return query.eq('fleet_group_id', fleetId);
    return query;
}

export function useAdminStats(fleetId) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                // Total bookings: exclude EXPIRED and CANCELLED
                let bQuery = supabase.from('bubatrent_booking_bookings').select('*', { count: 'exact', head: true })
                    .in('status', ['HOLD', 'DEPOSIT_PAID', 'CONFIRMED', 'PICKUP', 'RETURNED']);
                let bActiveQuery = supabase.from('bubatrent_booking_bookings').select('*', { count: 'exact', head: true }).in('status', ['HOLD', 'DEPOSIT_PAID', 'CONFIRMED', 'PICKUP']);
                let bExpiredQuery = supabase.from('bubatrent_booking_bookings').select('*', { count: 'exact', head: true }).in('status', ['EXPIRED', 'CANCELLED']);
                let cQuery = supabase.from('bubatrent_booking_cars').select('*', { count: 'exact', head: true });
                let pendQuery = supabase.from('bubatrent_booking_bookings').select('*', { count: 'exact', head: true }).eq('status', 'DEPOSIT_PAID');
                let pQuery = supabase.from('bubatrent_booking_payments').select('amount').eq('status', 'completed');

                // Scope to fleet
                bQuery = scopeToFleet(bQuery, fleetId);
                bActiveQuery = scopeToFleet(bActiveQuery, fleetId);
                bExpiredQuery = scopeToFleet(bExpiredQuery, fleetId);
                cQuery = scopeToFleet(cQuery, fleetId);
                pendQuery = scopeToFleet(pendQuery, fleetId);
                pQuery = scopeToFleet(pQuery, fleetId);

                const [
                    { count: totalBookings },
                    { count: activeBookings },
                    { count: expiredBookings },
                    { count: totalCars },
                    { count: pendingVerifications },
                    { count: totalCustomers },
                ] = await Promise.all([
                    bQuery,
                    bActiveQuery,
                    bExpiredQuery,
                    cQuery,
                    pendQuery,
                    supabase.from('bubatrent_booking_profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
                ]);

                const { data: payments } = await pQuery;
                const totalRevenue = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

                setStats({
                    totalBookings: totalBookings || 0,
                    activeBookings: activeBookings || 0,
                    expiredBookings: expiredBookings || 0,
                    totalCars: totalCars || 0,
                    pendingVerifications: pendingVerifications || 0,
                    totalRevenue,
                    totalCustomers: totalCustomers || 0,
                });
            } catch (err) {
                console.error('Error fetching admin stats:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, [fleetId]);

    return { stats, loading };
}

export function useAdminBookings(filters = {}) {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchBookings = useCallback(async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('bubatrent_booking_bookings')
                .select('*, bubatrent_booking_cars(name, brand, model, image_url)')
                .order('created_at', { ascending: false });

            // Fleet scope
            query = scopeToFleet(query, filters.fleetId);

            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.carId) {
                query = query.eq('car_id', filters.carId);
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            setBookings(data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters.status, filters.carId, filters.fleetId]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    return { bookings, loading, error, refetch: fetchBookings };
}

export function useAdminCars(fleetId) {
    const [cars, setCars] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCars = useCallback(async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('bubatrent_booking_cars')
                .select('*')
                .order('created_at', { ascending: false });

            query = scopeToFleet(query, fleetId);

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            setCars(data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [fleetId]);

    useEffect(() => {
        fetchCars();
    }, [fetchCars]);

    return { cars, loading, error, refetch: fetchCars };
}

export async function createCar(carData) {
    const { data, error } = await supabase
        .from('bubatrent_booking_cars')
        .insert(carData)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCar(carId, carData) {
    const { data, error } = await supabase
        .from('bubatrent_booking_cars')
        .update({ ...carData, updated_at: new Date().toISOString() })
        .eq('id', carId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCar(carId) {
    const { error } = await supabase
        .from('bubatrent_booking_cars')
        .delete()
        .eq('id', carId);

    if (error) throw error;
}

export async function updateBookingStatus(bookingId, status) {
    const { data, error } = await supabase
        .from('bubatrent_booking_bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getBookingDocuments(bookingId, adminId) {
    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'VIEW_DOCUMENTS',
        resource_type: 'booking',
        resource_id: bookingId,
        details: { timestamp: new Date().toISOString() },
    });

    const { data, error } = await supabase
        .from('bubatrent_booking_customer_documents')
        .select('*')
        .eq('booking_id', bookingId);

    if (error) throw error;
    return data || [];
}

export async function verifyDocument(documentId, adminId) {
    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'VERIFY_DOCUMENT',
        resource_type: 'document',
        resource_id: documentId,
        details: { timestamp: new Date().toISOString() },
    });

    const { data, error } = await supabase
        .from('bubatrent_booking_customer_documents')
        .update({ verified_by: adminId, verified_at: new Date().toISOString() })
        .eq('id', documentId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getAuditLogs(bookingId) {
    const { data, error } = await supabase
        .from('bubatrent_booking_audit_logs')
        .select('*, bubatrent_booking_profiles(display_name, username)')
        .eq('resource_id', bookingId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

// ─── Customer Management ───

/**
 * Fetches customer list.
 * - Default (role='ALL'): only shows customers (excludes admin/super_admin)
 * - Specific role filter: shows that role
 * - Verification filter: 'verified', 'not_verified', 'pending'
 * - Booking counts scoped to fleet when fleetId provided
 */
export function useAdminCustomers(filters = {}) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCustomers = useCallback(async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('bubatrent_booking_profiles')
                .select('*')
                .order('created_at', { ascending: false });

            // Role filter — 'ALL' shows everyone including admins
            if (filters.role && filters.role !== 'ALL') {
                query = query.eq('role', filters.role.toLowerCase());
            }
            // When 'ALL', no role filter is applied — shows all users

            // Search filter
            if (filters.search) {
                const safe = filters.search.replace(/[.,%()]/g, '').trim();
                if (safe) {
                    query = query.or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%,phone.ilike.%${safe}%`);
                }
            }

            // Verification filter
            if (filters.verification === 'verified') {
                query = query.eq('is_verified', true);
            } else if (filters.verification === 'not_verified') {
                query = query.eq('is_verified', false).is('ic_number', null);
            } else if (filters.verification === 'pending') {
                query = query.eq('is_verified', false).not('ic_number', 'is', null);
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;

            // Filter out expired-licence "verified" customers if needed
            let filtered = data || [];
            if (filters.verification === 'verified') {
                filtered = filtered.filter(c =>
                    !c.licence_expiry || new Date(c.licence_expiry) >= new Date()
                );
            }

            // Get booking counts — fleet-scoped
            const customerIds = filtered.map(c => c.id);
            let bookingCounts = {};
            if (customerIds.length > 0) {
                let bQuery = supabase
                    .from('bubatrent_booking_bookings')
                    .select('user_id, id')
                    .in('user_id', customerIds);
                bQuery = scopeToFleet(bQuery, filters.fleetId);
                const { data: bookings } = await bQuery;
                (bookings || []).forEach(b => {
                    bookingCounts[b.user_id] = (bookingCounts[b.user_id] || 0) + 1;
                });
            }

            // Get fleet-scoped credit for each customer
            let creditByUser = {};
            if (customerIds.length > 0 && filters.fleetId) {
                const { data: txns } = await supabase
                    .from('bubatrent_booking_credit_transactions')
                    .select('user_id, amount')
                    .in('user_id', customerIds)
                    .eq('fleet_group_id', filters.fleetId);
                (txns || []).forEach(t => {
                    creditByUser[t.user_id] = (creditByUser[t.user_id] || 0) + Number(t.amount);
                });
            }

            const enriched = filtered.map(c => ({
                ...c,
                booking_count: bookingCounts[c.id] || 0,
                fleet_credit: creditByUser[c.id] || 0,
            }));

            setCustomers(enriched);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters.role, filters.search, filters.fleetId, filters.verification]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    return { customers, loading, error, refetch: fetchCustomers };
}

export async function updateUserRole(userId, newRole, adminId) {
    console.log('[updateUserRole] userId:', userId, 'newRole:', newRole, 'by:', adminId);

    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'CHANGE_ROLE',
        resource_type: 'profile',
        resource_id: userId,
        details: { new_role: newRole, timestamp: new Date().toISOString() },
    });

    const { error } = await supabase
        .from('bubatrent_booking_profiles')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) {
        console.error('[updateUserRole] Update failed:', error);
        throw error;
    }
    console.log('[updateUserRole] Success');
    return { ok: true };
}

export async function getCustomerBookings(userId, fleetId) {
    let query = supabase
        .from('bubatrent_booking_bookings')
        .select('*, bubatrent_booking_cars(name, brand, model, image_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    query = scopeToFleet(query, fleetId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function verifyCustomer(userId, adminId) {
    console.log('[verifyCustomer] userId:', userId, 'by:', adminId);

    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'VERIFY_CUSTOMER',
        resource_type: 'profile',
        resource_id: userId,
        details: { timestamp: new Date().toISOString() },
    });

    const { error } = await supabase
        .from('bubatrent_booking_profiles')
        .update({
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: adminId,
        })
        .eq('id', userId);

    if (error) {
        console.error('[verifyCustomer] Failed:', error);
        throw error;
    }
    console.log('[verifyCustomer] Success');
    return { ok: true };
}

export async function unverifyCustomer(userId, adminId) {
    console.log('[unverifyCustomer] userId:', userId, 'by:', adminId);

    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'UNVERIFY_CUSTOMER',
        resource_type: 'profile',
        resource_id: userId,
        details: { timestamp: new Date().toISOString() },
    });

    const { error } = await supabase
        .from('bubatrent_booking_profiles')
        .update({
            is_verified: false,
            verified_at: null,
            verified_by: null,
        })
        .eq('id', userId);

    if (error) {
        console.error('[unverifyCustomer] Failed:', error);
        throw error;
    }
    console.log('[unverifyCustomer] Success');
    return { ok: true };
}

/**
 * Reject a pending verification — clears all docs and IC fields,
 * forcing the customer to re-submit from scratch.
 */
export async function rejectVerification(userId, adminId, reason = '') {
    console.log('[rejectVerification] userId:', userId, 'by:', adminId, 'reason:', reason);

    await supabase.from('bubatrent_booking_audit_logs').insert({
        admin_id: adminId,
        action: 'REJECT_VERIFICATION',
        resource_type: 'profile',
        resource_id: userId,
        details: { reason, timestamp: new Date().toISOString() },
    });

    const { error } = await supabase
        .from('bubatrent_booking_profiles')
        .update({
            ic_number: null,
            ic_file_path: null,
            licence_file_path: null,
            licence_expiry: null,
            is_verified: false,
            verified_at: null,
            verified_by: null,
        })
        .eq('id', userId);

    if (error) {
        console.error('[rejectVerification] Failed:', error);
        throw error;
    }
    console.log('[rejectVerification] Success');
    return { ok: true };
}
