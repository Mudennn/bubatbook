import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DEFAULT_PHONE = '60162569733'; // Default fallback
const DEFAULT_MSG = 'Hi, I want to inquire about car rental at Rent2Go!';

export default function WhatsAppButton() {
  const location = useLocation();
  const [phoneNumber, setPhoneNumber] = useState(DEFAULT_PHONE);
  const [message, setMessage] = useState(DEFAULT_MSG);

  useEffect(() => {
    async function fetchFleetNumber() {
      try {
        // Extract carId from /cars/:id or /checkout/:id
        const match = location.pathname.match(/\/(?:cars|checkout)\/([a-zA-Z0-9-]+)/);
        if (!match) {
          setPhoneNumber(DEFAULT_PHONE);
          setMessage(DEFAULT_MSG);
          return;
        }
        const carId = match[1];

        const { data, error } = await supabase
          .from('bubatrent_booking_cars')
          .select('brand, model, bubatrent_booking_fleet_groups(support_whatsapp, name)')
          .eq('id', carId)
          .single();

        if (error || !data) throw new Error('Car not found');

        const fleetNumber = data.bubatrent_booking_fleet_groups?.support_whatsapp;
        if (fleetNumber) {
          setPhoneNumber(fleetNumber.replace(/\D/g, ''));
          setMessage(`Hi ${data.bubatrent_booking_fleet_groups.name || 'Admin'}, I want to inquire about the ${data.brand} ${data.model} on Rent2Go!`);
        } else {
          setPhoneNumber(DEFAULT_PHONE);
          setMessage(DEFAULT_MSG);
        }
      } catch (err) {
        setPhoneNumber(DEFAULT_PHONE);
        setMessage(DEFAULT_MSG);
      }
    }

    fetchFleetNumber();
  }, [location.pathname]);

  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 group"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="w-7 h-7 text-white" />
      <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-dark-800 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Chat with us
      </span>
    </a>
  );
}
