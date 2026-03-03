import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { expireOldHolds } from './useBookings';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Fetch cars via direct REST call to bypass Supabase JS client's
 * Navigator LockManager which can hang in multi-tab browsers.
 */
async function fetchCarsREST() {
    const url = `${SUPABASE_URL}/rest/v1/bubatrent_booking_cars?is_available=eq.true&order=created_at.desc&select=*`;
    const res = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch cars: ${res.status}`);
    }
    return res.json();
}

export function useCars() {
    const [cars, setCars] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCars = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchCarsREST();
            setCars(data || []);
        } catch (err) {
            setError(err.message);
            setCars([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCars();
    }, [fetchCars]);

    return { cars, loading, error, refetch: fetchCars };
}

export function useCar(id) {
    const [car, setCar] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return;
        async function fetchCar() {
            try {
                setLoading(true);
                // Single car fetch also uses direct REST to avoid lock
                const url = `${SUPABASE_URL}/rest/v1/bubatrent_booking_cars?id=eq.${id}&select=*,bubatrent_booking_fleet_groups(support_whatsapp)`;
                const res = await fetch(url, {
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                });
                if (!res.ok) throw new Error(`Failed to fetch car: ${res.status}`);
                const data = await res.json();
                if (!data || data.length === 0) throw new Error('Car not found');
                setCar(data[0]);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchCar();
    }, [id]);

    return { car, loading, error };
}

export async function checkAvailability(carId, pickupDate, returnDate) {
    // Clean up expired holds first
    await expireOldHolds();

    const { data, error } = await supabase
        .from('bubatrent_booking_bookings')
        .select('id')
        .eq('car_id', carId)
        .in('status', ['HOLD', 'DEPOSIT_PAID', 'CONFIRMED', 'PICKUP'])
        .lte('pickup_date', returnDate)
        .gte('return_date', pickupDate);

    if (error) throw error;
    return (data || []).length === 0;
}
