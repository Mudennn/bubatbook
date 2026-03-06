import { supabase } from './supabase';

/**
 * Log an upload step to the database for remote debugging.
 * Fire-and-forget — never blocks the upload flow.
 */
async function logUploadStep(step, message, metadata = {}) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await supabase.from('bubatrent_booking_upload_logs').insert({
            user_id: session.user.id,
            booking_id: metadata.booking_id || null,
            step,
            message,
            metadata: {
                ...metadata,
                browser: navigator.userAgent,
                timestamp: new Date().toISOString(),
            },
        });
    } catch {
        // Never let logging break the upload
    }
}

/**
 * Robust mobile-friendly upload function.
 * 1. Sends the File object directly via XHR — no FileReader or ArrayBuffer copy,
 *    so Android browsers don't freeze from doubled memory usage.
 * 2. Uses XMLHttpRequest for maximum compatibility and progress tracking.
 * 3. Explicitly uses x-upsert: false to avoid RLS deadlocks.
 * 4. Logs each step to bubatrent_booking_upload_logs for remote debugging.
 * 5. Warns users when files exceed 5MB (still allows up to 10MB max).
 */
export async function uploadFileRobust(bucket, path, file, toast = null, onDebugLog = null) {
    // Extract booking_id from path if possible (e.g. receipts/{bookingId}/...)
    const bookingIdMatch = path.match(/(?:receipts|documents|uploads)\/([a-f0-9-]+)\//i);
    const booking_id = bookingIdMatch ? bookingIdMatch[1] : null;
    const logMeta = { bucket, path, booking_id, file_name: file.name, file_type: file.type, file_size: file.size };

    return new Promise(async (resolve) => {
        try {
            if (toast) toast.info('Step 1: Preparing file...');
            logUploadStep('preflight', `Starting upload: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`, logMeta);

            // 0. Pre-flight checks
            if (file.name.match(/\.(heic|heif)$/i) || file.type.match(/heic|heif/i)) {
                logUploadStep('error', 'HEIC format rejected', logMeta);
                return resolve({ data: null, error: new Error('HEIC format not supported. Please change camera settings to JPEG or use a different file.') });
            }
            if (file.size > 10 * 1024 * 1024) {
                logUploadStep('error', `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`, logMeta);
                return resolve({ data: null, error: new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed size is 10MB.`) });
            }

            const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr || !session) {
                logUploadStep('error', 'Not authenticated', { ...logMeta, sessionErr: sessionErr?.message });
                return resolve({ data: null, error: new Error('Not authenticated. Please log in again.') });
            }

            // Warn user about large files (> 5MB) — they still upload but may be slow on mobile
            if (file.size > 5 * 1024 * 1024 && toast) {
                toast.warn(`Large file (${(file.size / 1024 / 1024).toFixed(1)}MB) — upload may take a moment on mobile.`);
            }

            const kbSize = Math.round(file.size / 1024);
            if (toast) toast.info(`Step 2: Uploading ${kbSize}KB...`);
            logUploadStep('uploading', `Fetch upload starting: ${kbSize}KB to ${bucket}/${path}`, { ...logMeta, kbSize });
            console.log(`[UploadHelper] Starting fetch upload of ${kbSize}KB to ${bucket}/${path}`);

            const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

            // Use fetch with timeout instead of XHR (better Android compatibility)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[UploadHelper] Fetch timeout after 90s');
                controller.abort();
            }, 90000);

            console.log(`[UploadHelper] About to fetch with POST to ${url}`);

            try {
                if (onDebugLog) onDebugLog(`Fetch URL: ${url}`);
                if (onDebugLog) onDebugLog(`Auth token: ${!!session.access_token ? 'YES' : 'NO'}`);
                if (onDebugLog) onDebugLog(`API key: ${!!import.meta.env.VITE_SUPABASE_ANON_KEY ? 'YES' : 'NO'}`);
                if (onDebugLog) onDebugLog(`Sending POST request...`);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                        'x-upsert': 'false',
                    },
                    body: file,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);
                if (onDebugLog) onDebugLog(`Response received! HTTP ${response.status}`);
                console.log(`[UploadHelper] Fetch response received: HTTP ${response.status}`);

                if (response.status >= 200 && response.status < 300) {
                    if (onDebugLog) onDebugLog(`✅ Upload success!`);
                    console.log(`[UploadHelper] Upload success! HTTP ${response.status}`);
                    logUploadStep('success', `Upload complete! HTTP ${response.status}`, { ...logMeta, httpStatus: response.status });
                    resolve({ data: { path }, error: null });
                } else {
                    const errText = await response.text();
                    let errMsg;
                    try {
                        const errBody = JSON.parse(errText);
                        errMsg = `Upload failed (HTTP ${response.status}): ${errBody.message || errBody.error}`;
                    } catch {
                        errMsg = `Upload failed (HTTP ${response.status}): ${errText}`;
                    }
                    if (onDebugLog) onDebugLog(`❌ ${errMsg}`);
                    console.error(`[UploadHelper] Upload error: HTTP ${response.status}`);
                    logUploadStep('error', errMsg, { ...logMeta, httpStatus: response.status });
                    resolve({ data: null, error: new Error(errMsg) });
                }
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                console.error('[UploadHelper] Fetch error:', fetchErr.message);
                if (fetchErr.name === 'AbortError') {
                    if (onDebugLog) onDebugLog(`⏱️ Upload timed out after 90s`);
                    logUploadStep('timeout', 'Fetch timed out after 90 seconds', logMeta);
                    resolve({ data: null, error: new Error('Upload timed out. Please check your network connection.') });
                } else {
                    if (onDebugLog) onDebugLog(`❌ Fetch error: ${fetchErr.message}`);
                    logUploadStep('fetch_error', `Fetch error: ${fetchErr.message}`, { ...logMeta, errorName: fetchErr.name });
                    resolve({ data: null, error: new Error(`Upload failed: ${fetchErr.message}`) });
                }
            }

        } catch (err) {
            console.error('[UploadHelper] Unexpected error:', err);
            logUploadStep('error', `Unexpected error: ${err.message}`, { ...logMeta, stack: err.stack?.substring(0, 500) });
            resolve({ data: null, error: err });
        }
    });
}
