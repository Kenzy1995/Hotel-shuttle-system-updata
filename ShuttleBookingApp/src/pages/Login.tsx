import React, { useState } from 'react';
import { IonPage, IonContent, IonToast } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { Haptics } from '@capacitor/haptics';
import { APP_VERSION } from '../version';

const Login: React.FC = () => {
  const history = useHistory();
  const [user, setUser] = useState('Admin');
  const [pass, setPass] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  const handleLogin = async () => {
    const ok = (user === 'Admin' && pass === 'ft0000');
    try { await Haptics.vibrate({ duration: 30 }); } catch {}
    if (ok) {
      localStorage.setItem('auth_ok', '1');
      setToastColor('success');
      setToastMsg('登入成功');
      setTimeout(() => history.replace('/home'), 300);
    } else {
      setToastColor('danger');
      setToastMsg('帳號或密碼錯誤');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f5f7fb', padding:'20px'}}>
          <img src="assets/logo.png" alt="" style={{width:84, height:84, objectFit:'contain', marginBottom:16}} />
          <div style={{fontSize:24, fontWeight:800, color:'#333'}}>汐止福泰_接駁車預約系統 2.0</div>
          <div style={{fontSize:12, color:'#777', marginTop:6}}>請輸入帳號與密碼以進入系統</div>
          <div style={{display:'flex', flexDirection:'column', gap:12, marginTop:18, width:'100%', maxWidth:380}}>
            <input value={user} onChange={e=>setUser(e.target.value)} onKeyDown={onKeyDown} placeholder="帳號" style={{padding:'12px', border:'1px solid #ddd', borderRadius:'10px', fontSize:'16px', background:'#fff'}} />
            <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKeyDown} placeholder="密碼" type="password" style={{padding:'12px', border:'1px solid #ddd', borderRadius:'10px', fontSize:'16px', background:'#fff'}} />
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8}}>
              <div style={{fontSize:'14px', fontWeight:600, color:'#333', marginBottom:4}}>使用者身分：</div>
              <div style={{display:'flex', gap:8}}>
                <button 
                  className={`role-btn ${userRole==='desk' ? 'selected' : ''}`} 
                  onClick={() => setUserRole('desk')}
                  style={{
                    flex:1, 
                    padding:'10px', 
                    borderRadius:'8px', 
                    border:`2px solid ${userRole==='desk' ? '#0b63ce' : '#ddd'}`, 
                    background:userRole==='desk' ? '#eef6ff' : '#fff',
                    color:userRole==='desk' ? '#0b63ce' : '#666',
                    fontSize:'14px',
                    fontWeight:600,
                    cursor:'pointer'
                  }}
                >櫃台人員</button>
                <button 
                  className={`role-btn ${userRole==='driverA' ? 'selected' : ''}`} 
                  onClick={() => setUserRole('driverA')}
                  style={{
                    flex:1, 
                    padding:'10px', 
                    borderRadius:'8px', 
                    border:`2px solid ${userRole==='driverA' ? '#0b63ce' : '#ddd'}`, 
                    background:userRole==='driverA' ? '#eef6ff' : '#fff',
                    color:userRole==='driverA' ? '#0b63ce' : '#666',
                    fontSize:'14px',
                    fontWeight:600,
                    cursor:'pointer'
                  }}
                >接駁司機</button>
              </div>
            </div>
            <button className="modal-btn primary" onClick={handleLogin} style={{width:'100%'}}>登入</button>
          </div>
          <div style={{marginTop:12, fontSize:12, color:'#999'}}>版本 {APP_VERSION}</div>
        </div>
        <IonToast isOpen={!!toastMsg} onDidDismiss={() => setToastMsg(null)} message={toastMsg || ''} duration={1500} color={toastColor} position={'bottom'} />
      </IonContent>
    </IonPage>
  );
};

export default Login;
