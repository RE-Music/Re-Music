import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, X, Info } from 'lucide-react';

export const UpdateNotifier = () => {
    const [update, setUpdate] = useState<any>(null);
    const [status, setStatus] = useState<'idle' | 'checking' | 'downloading' | 'ready'>('idle');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function checkUpdate() {
            try {
                setStatus('checking');
                const update = await check();
                if (update) {
                    setUpdate(update);
                }
                setStatus('idle');
            } catch (e) {
                console.error('[Updater] Check failed:', e);
                setStatus('idle');
            }
        }

        // Check on mount and every 4 hours
        checkUpdate();
        const interval = setInterval(checkUpdate, 1000 * 60 * 60 * 4);
        return () => clearInterval(interval);
    }, []);

    const handleUpdate = async () => {
        if (!update) return;
        try {
            setStatus('downloading');
            let downloaded = 0;
            let contentLength: number | undefined;

            await update.downloadAndInstall((event: any) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength;
                        console.log(`[Updater] Started downloading ${contentLength} bytes`);
                        break;
                    case 'Progress':
                        downloaded += event.data.chunkLength;
                        // console.log(`[Updater] Downloaded ${downloaded} from ${contentLength}`);
                        break;
                    case 'Finished':
                        console.log('[Updater] Download finished');
                        break;
                }
            });

            setStatus('ready');
            // Give it a moment before relaunching
            setTimeout(async () => {
                await relaunch();
            }, 1000);
        } catch (e: any) {
            console.error('[Updater] Download failed:', e);
            setError(e.toString());
            setStatus('idle');
        }
    };

    if (!update || status === 'ready') return null;

    return (
        <div className="update-notifier-overlay glass-panel">
            <div className="update-card anime-fade-in">
                <div className="update-header">
                    <div className="update-icon">
                        <Download size={24} />
                    </div>
                    <div className="update-title">
                        <h3>Доступно обновление!</h3>
                        <p>Версия {update.version} уже готова к установке.</p>
                    </div>
                    <button className="close-btn" onClick={() => setUpdate(null)}>
                        <X size={18} />
                    </button>
                </div>

                {update.body && (
                    <div className="update-notes">
                        <div className="notes-label"><Info size={14} /> Что нового:</div>
                        <div className="notes-content">{update.body}</div>
                    </div>
                )}

                {error && <div className="update-error">{error}</div>}

                <div className="update-actions">
                    <button 
                        className="btn-later" 
                        onClick={() => setUpdate(null)}
                        disabled={status === 'downloading'}
                    >
                        Напомнить позже
                    </button>
                    <button 
                        className={`btn-update ${status === 'downloading' ? 'loading' : ''}`} 
                        onClick={handleUpdate}
                        disabled={status === 'downloading'}
                    >
                        {status === 'downloading' ? 'Скачивание...' : 'Обновить сейчас'}
                    </button>
                </div>
            </div>

            <style>{`
                .update-notifier-overlay {
                    position: fixed;
                    bottom: 100px;
                    right: 30px;
                    z-index: 999999;
                    width: 380px;
                    padding: 24px;
                    background: rgba(15, 15, 15, 0.8) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }

                .update-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 20px;
                    position: relative;
                }

                .update-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(0, 242, 255, 0.1);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #00f2ff;
                }

                .update-title h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                }

                .update-title p {
                    margin: 4px 0 0 0;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .close-btn {
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.4);
                    cursor: pointer;
                    padding: 8px;
                }

                .close-btn:hover {
                    color: #fff;
                }

                .update-notes {
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    padding: 12px;
                    margin-bottom: 20px;
                    max-height: 120px;
                    overflow-y: auto;
                }

                .notes-label {
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #00f2ff;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 8px;
                }

                .notes-content {
                    font-size: 13px;
                    line-height: 1.5;
                    color: rgba(255, 255, 255, 0.8);
                    white-space: pre-line;
                }

                .update-error {
                    color: #ff4d4d;
                    font-size: 12px;
                    margin-bottom: 15px;
                    background: rgba(255, 77, 77, 0.1);
                    padding: 8px;
                    border-radius: 8px;
                }

                .update-actions {
                    display: flex;
                    gap: 12px;
                }

                .btn-later {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #fff;
                    padding: 12px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-later:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .btn-update {
                    flex: 2;
                    background: #fff;
                    color: #000;
                    border: none;
                    padding: 12px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-update:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(255, 255, 255, 0.2);
                }

                .btn-update.loading {
                    opacity: 0.7;
                    cursor: default;
                }
            `}</style>
        </div>
    );
};
