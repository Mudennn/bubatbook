const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    const c = new Client('postgresql://postgres:Ssy%40rief.1234@db.blqsgijvdvzwnqeltoje.supabase.co:5432/postgres');
    await c.connect();

    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'fix_fleet_groups_update_policy.sql'), 'utf8');

    try {
        await c.query(sql);
        console.log('✓ Fleet groups UPDATE policy migration completed');
    } catch (err) {
        console.error('✗ Migration failed:', err.message);
    }

    // Verify
    try {
        const { rows } = await c.query("SELECT id, name, is_super_group, status FROM bubatrent_booking_fleet_groups");
        console.log('\nFleet groups:', rows);

        const { rows: cols } = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bubatrent_booking_change_requests' ORDER BY ordinal_position");
        console.log('Change requests columns:', cols.map(c => c.column_name));
    } catch (err) {
        console.error('Verify failed:', err.message);
    }

    await c.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
