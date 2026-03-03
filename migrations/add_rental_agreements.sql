-- Migration: Digital Rental Agreement System
-- Creates the rental_agreements table to store signed agreements

CREATE TABLE IF NOT EXISTS bubatrent_booking_rental_agreements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES bubatrent_booking_bookings(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES auth.users(id) NOT NULL,
  customer_name text,
  customer_ic text,
  customer_phone text,
  car_model text,
  car_plate text,
  pickup_date date,
  return_date date,
  rental_rate numeric,
  total_price numeric,
  deposit_amount numeric,
  signature_data text NOT NULL,
  agreed_at timestamptz DEFAULT now(),
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one agreement per booking
ALTER TABLE bubatrent_booking_rental_agreements
  ADD CONSTRAINT unique_agreement_per_booking UNIQUE (booking_id);

-- Enable RLS
ALTER TABLE bubatrent_booking_rental_agreements ENABLE ROW LEVEL SECURITY;

-- Customers can insert their own agreement
CREATE POLICY "Customers can sign their own agreement"
  ON bubatrent_booking_rental_agreements
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- Customers can view their own agreements
CREATE POLICY "Customers can view their own agreements"
  ON bubatrent_booking_rental_agreements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

-- Admins can view all agreements for bookings in their fleet
CREATE POLICY "Admins can view fleet agreements"
  ON bubatrent_booking_rental_agreements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bubatrent_booking_bookings b
      JOIN bubatrent_booking_cars c ON c.id = b.car_id
      JOIN bubatrent_booking_fleet_memberships fm ON fm.fleet_group_id = c.fleet_group_id
      WHERE b.id = bubatrent_booking_rental_agreements.booking_id
        AND fm.user_id = auth.uid()
        AND fm.role IN ('fleet_admin')
    )
  );
