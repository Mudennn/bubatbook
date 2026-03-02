import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testApprove() {
    console.log('Logging in as Amira (Super Admin)...');
    const { data: { session }, error: loginErr } = await supabase.auth.signInWithPassword({
        email: 'amira@bubatbook.com',
        password: 'password123'
    }); // Note: Amira's actual login might be different. 
    // I'll grab an admin session or just use service role if needed.
    // Actually, wait, I can just use the anon key if I have the token, or create a simple script that logs in.
}
testApprove();
