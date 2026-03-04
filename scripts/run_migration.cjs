const { createClient } = require('@supabase/supabase-js');
const s = createClient(
    'https://blqsgijvdvzwnqeltoje.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJscXNnaWp2ZHZ6d25xZWx0b2plIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcxOTkxNCwiZXhwIjoyMDg3Mjk1OTE0fQ.WEJVfkUv7DoZXu-peSG0gAUarQ-HfvJNKaUHwgxgcIA'
);

(async () => {
    const { data, error } = await s
        .from('bubatrent_booking_upload_logs')
        .select('step, message, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(11);

    if (error) {
        console.log('ERROR:', error);
        return;
    }

    console.log('=== Upload Logs Test Results ===');
    console.log('Total entries found:', data.length);
    console.log('');

    data.forEach((l, i) => {
        const m = l.metadata || {};
        const device = /mobile|iphone|android/i.test(m.browser || '') ? 'MOBILE' : 'DESKTOP';
        console.log(`${i + 1}. [${l.step.toUpperCase().padEnd(14)}] ${l.message}`);
        console.log(`   File: ${m.file_name || 'n/a'} | Size: ${m.file_size ? Math.round(m.file_size / 1024) + 'KB' : 'n/a'} | Device: ${device}`);
        console.log('');
    });

    // Count by step
    const steps = {};
    data.forEach(l => { steps[l.step] = (steps[l.step] || 0) + 1; });
    console.log('Summary by step:', steps);
})();
