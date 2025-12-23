import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { IonIcon } from '@ionic/react';
import { flashlight } from 'ionicons/icons';
import { Haptics } from '@capacitor/haptics';

interface ScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  disabled?: boolean;
  throttleMs?: number;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onClose, disabled = false, throttleMs = 2000 }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef<boolean>(false);
  const lastScanRef = useRef<number>(0);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    const startScanner = async () => {
        try {
            // "qr-reader" must exist in the DOM
            const html5QrCode = new Html5Qrcode("qr-reader");
            scannerRef.current = html5QrCode;

            // Use a square aspect ratio and a size relative to viewport width, maxed at 300px
            // Since we are forcing zoom:1, window.innerWidth should be the device width
            const size = Math.min(window.innerWidth * 0.8, 300);

            const config = { 
                fps: 8, 
                qrbox: { width: size, height: size },
                aspectRatio: 1.0,
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
            };
            
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                async (decodedText) => {
                    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
                    const now = Date.now();
                    if (disabled) return; // temporarily block scan while verifying
                    if (now - lastScanRef.current < throttleMs) return;
                    lastScanRef.current = now;
                    try { 
                      const el = document.getElementById('qr-beep') as HTMLAudioElement | null;
                      if (el) { el.currentTime = 0; el.play().catch(()=>{}); }
                      else { new Audio('assets/sounds/QR Code Scan Beep.mp3').play().catch(()=>{}); }
                    } catch {}
                    // 短震 0.5 秒
                    try { if (typeof navigator !== 'undefined' && typeof (navigator as any).vibrate === 'function') { (navigator as any).vibrate(500); } } catch {}
                    try { Haptics.vibrate({ duration: 500 }); } catch {}
                    onScan(decodedText);
                },
                (errorMessage) => {
                    // Ignore parse noise; could add subtle UI feedback
                }
            );
            startedRef.current = true;

        } catch (err) {
        }
    };

    const timer = setTimeout(() => {
        startScanner();
    }, 100);

    return () => {
        clearTimeout(timer);
        try { forceTorchOff(); } catch {}
        try {
          if (scannerRef.current && startedRef.current) {
             const p = scannerRef.current.stop();
             Promise.resolve(p).then(() => {
               try { scannerRef.current?.clear(); } catch {}
             }).catch(() => {});
          }
        } catch (e) {}
    };
  }, [onScan]);

  const toggleTorch = () => {
      if (!scannerRef.current) return;
      const newStatus = !torchOn;
      
      scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: newStatus }] as any
      })
      .then(() => {
          setTorchOn(newStatus);
      })
      .catch(err => {
      });
  };

  const forceTorchOff = () => {
    if (!scannerRef.current) return;
    scannerRef.current.applyVideoConstraints({
      advanced: [{ torch: false }] as any
    }).then(() => {
      setTorchOn(false);
    }).catch(() => {});
  };

  const handleClose = () => {
    forceTorchOff();
    onClose();
  };

  return (
    <div id="scan-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px'
    }}>
      {/* Header / Close Button */}
      <div style={{width:'100%', display:'flex', justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{
            background: 'none', 
            border: 'none', 
            color: '#fff', 
            fontSize: '32px', 
            padding: '10px',
            cursor: 'pointer'
        }}>
            ✕
        </button>
      </div>

      {/* Camera Area - Fixed Square */}
      <div style={{
          width: '100%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          flex: 1
      }}>
          <div id="qr-reader" style={{ 
              width: '100%', 
              maxWidth: '350px', 
              aspectRatio: '1/1',
              background: '#000',
              overflow: 'hidden',
              borderRadius: '12px',
              border: '2px solid rgba(255,255,255,0.3)'
          }}></div>
      </div>

      {/* Footer / Controls */}
      <div style={{
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          paddingBottom: '30px',
          gap: '20px'
      }}>
          <div style={{color: '#fff', fontSize: '18px', fontWeight: 500}}>
              請將乘客 QRCode 對準框內
          </div>
          
          <div style={{display: 'flex', gap: '20px'}}>
            <button onClick={toggleTorch} style={{
                backgroundColor: torchOn ? '#fff' : 'rgba(255,255,255,0.2)', 
                color: torchOn ? '#000' : '#fff', 
                border: '1px solid #fff',
                padding: '10px 24px',
                borderRadius: '30px',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
            }}>
              <IonIcon icon={flashlight} />
              {torchOn ? '關燈' : '開燈'}
            </button>
            
            <button onClick={handleClose} style={{
                backgroundColor: 'transparent', 
                color: '#fff', 
                border: '1px solid #fff',
                padding: '10px 24px',
                borderRadius: '30px',
                fontSize: '16px',
                cursor: 'pointer'
            }}>
                關閉
            </button>
          </div>
      </div>
    </div>
  );
};

export default Scanner;
