import { supabase } from './supabase';

/**
 * Robust mobile-friendly upload function.
 * 1. Reads file into RAM as ArrayBuffer to bypass Android File streaming bugs.
 * 2. Uses XMLHttpRequest for maximum compatibility and progress tracking.
 * 3. Sends raw Uint8Array bytes to prevent browser chunking errors.
 * 4. Explicitly uses x-upsert: false to avoid RLS deadlocks.
 */
export async function uploadFileRobust(bucket, path, file, toast = null) {
    return new Promise(async (resolve) => {
        try {
            if (toast) toast.info('Step 1: Preparing file...');

            // 0. Pre-flight checks
            if (file.name.match(/\.(heic|heif)$/i) || file.type.match(/heic|heif/i)) {
                return resolve({ data: null, error: new Error('HEIC format not supported. Please change camera settings to JPEG or use a different file.') });
            }
            if (file.size > 10 * 1024 * 1024) {
                return resolve({ data: null, error: new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed size is 10MB.`) });
            }

            const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr || !session) {
                return resolve({ data: null, error: new Error('Not authenticated. Please log in again.') });
            }

            if (toast) toast.info('Step 2: Reading image into memory...');

            // Read file into ArrayBuffer to bypass Android File streaming bugs
            const arrayBuffer = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = () => rej(new Error('Browser failed to read file from disk.'));
                reader.readAsArrayBuffer(file);
            });

            const kbSize = Math.round(arrayBuffer.byteLength / 1024);
            if (toast) toast.info(`Step 3: Uploading ${kbSize}KB...`);
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
                            // Only toast at 50% so we don't spam the UI
                            if (percent === 50) toast.info(`Uploading: 50%...`);
                        }
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log(`[UploadHelper] Upload success! HTTP ${xhr.status}`);
                    resolve({ data: { path }, error: null });
                } else {
                    console.error(`[UploadHelper] Upload error: HTTP ${xhr.status}`, xhr.responseText);
                    try {
                        const errBody = JSON.parse(xhr.responseText);
                        resolve({ data: null, error: new Error(`Upload failed (HTTP ${xhr.status}): ${errBody.message || errBody.error}`) });
                    } catch {
                        resolve({ data: null, error: new Error(`Upload failed (HTTP ${xhr.status}): ${xhr.statusText}`) });
                    }
                }
            };

            xhr.onerror = () => {
                console.error('[UploadHelper] XHR network error.');
                resolve({ data: null, error: new Error('Network error during upload. Check connection.') });
            };

            xhr.ontimeout = () => {
                console.error('[UploadHelper] XHR timeout after 90s.');
                resolve({ data: null, error: new Error('Upload timed out after 90s. Please check your network connection.') });
            };

            // Send raw bytes, NOT the File object!
            xhr.send(new Uint8Array(arrayBuffer));

        } catch (err) {
            console.error('[UploadHelper] Unexpected error:', err);
            resolve({ data: null, error: err });
        }
    });
}
