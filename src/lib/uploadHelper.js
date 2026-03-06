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
export async function uploadFileRobust(bucket, path, file, toast = null) {
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
            logUploadStep('uploading', `XHR upload starting: ${kbSize}KB to ${bucket}/${path}`, { ...logMeta, kbSize });
            console.log(`[UploadHelper] Starting upload of ${kbSize}KB to ${bucket}/${path}`);

            const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
            const xhr = new XMLHttpRequest();

            xhr.open('POST', url, true);
            xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
            xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.setRequestHeader('x-upsert', 'false'); // Critical: true causes RLS hangs on insert-only buckets

            xhr.timeout = 90000; // 90s timeout for slower mobile networks

            if (toast) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        if (percent === 50 || percent === 100) {
                            console.log(`[UploadHelper] Progress: ${percent}%`);
                            if (percent === 50) {
                                toast.info(`Uploading: 50%...`);
                                logUploadStep('progress', 'Upload 50%', { ...logMeta, percent });
                            }
                        }
                    }
                };
            }

            xhr.onload = () => {
                console.log(`[UploadHelper] XHR onload triggered! Status: ${xhr.status}`);
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log(`[UploadHelper] Upload success! HTTP ${xhr.status}`);
                    logUploadStep('success', `Upload complete! HTTP ${xhr.status}`, { ...logMeta, httpStatus: xhr.status });
                    resolve({ data: { path }, error: null });
                } else {
                    console.error(`[UploadHelper] Upload error: HTTP ${xhr.status}`, xhr.responseText);
                    let errMsg;
                    try {
                        const errBody = JSON.parse(xhr.responseText);
                        errMsg = `Upload failed (HTTP ${xhr.status}): ${errBody.message || errBody.error}`;
                    } catch {
                        errMsg = `Upload failed (HTTP ${xhr.status}): ${xhr.statusText}`;
                    }
                    logUploadStep('error', errMsg, { ...logMeta, httpStatus: xhr.status, response: xhr.responseText?.substring(0, 500) });
                    resolve({ data: null, error: new Error(errMsg) });
                }
            };

            xhr.onerror = () => {
                console.error('[UploadHelper] XHR onerror triggered!');
                logUploadStep('network_error', 'XHR network error — connection lost or CORS issue', logMeta);
                resolve({ data: null, error: new Error('Network error during upload. Check connection.') });
            };

            xhr.ontimeout = () => {
                console.error('[UploadHelper] XHR ontimeout triggered after 90s!');
                logUploadStep('timeout', 'XHR timed out after 90 seconds', logMeta);
                resolve({ data: null, error: new Error('Upload timed out after 90s. Please check your network connection.') });
            };

            console.log(`[UploadHelper] About to send File object: ${file.name} (${file.size} bytes)`);
            // Send the File object directly — XHR streams it from disk without
            // loading the entire file into JS heap memory.  This is the key fix
            // for Android browsers where FileReader.readAsArrayBuffer() + Uint8Array
            // copy would double RAM usage and freeze the JS thread.
            xhr.send(file);
            console.log(`[UploadHelper] xhr.send() called`);

        } catch (err) {
            console.error('[UploadHelper] Unexpected error:', err);
            logUploadStep('error', `Unexpected error: ${err.message}`, { ...logMeta, stack: err.stack?.substring(0, 500) });
            resolve({ data: null, error: err });
        }
    });
}
