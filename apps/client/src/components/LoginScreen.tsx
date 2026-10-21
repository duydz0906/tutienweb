import { useState } from 'react';
import { ArrowRight, Compass, Crown, MailCheck, MousePointer2, ShieldCheck, Sparkles, Swords } from 'lucide-react';

type AuthMode = 'login' | 'register';

export function LoginScreen({ demoAvailable, firebaseAvailable, busy, error, notice, onDemo, onGoogle, onPassword, onRegister, onReset }: {
  demoAvailable: boolean; firebaseAvailable: boolean; busy: boolean; error: string | null; notice?: string | null;
  onDemo: () => void; onGoogle: () => void;
  onPassword: (email: string, password: string) => void;
  onRegister: (email: string, password: string, name: string) => void;
  onReset: (email: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const mismatch = mode === 'register' && confirm.length > 0 && confirm !== password;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (mode === 'register' && password !== confirm) { setLocalError('Hai mật khẩu chưa khớp nhau.'); return; }
    if (mode === 'register') onRegister(email.trim(), password, name.trim());
    else onPassword(email.trim(), password);
  };
  return <div className="splash-layout">
    <div className="splash-left">
      <div className="brand-lockup"><div className="brand-seal">雲</div><span>VÂN THƯỢNG <small>ONLINE</small></span></div>
      <div className="splash-copy">
        <span className="eyebrow"><span className="eyebrow-line" /> MỘT THẾ GIỚI, VẠN CON ĐƯỜNG</span>
        <h1>Nhất niệm<br /><em>nhập tiên.</em></h1>
        <p>Giữa mây ngàn và thiên kiếp, vận mệnh của bạn được viết lại từ một Linh Căn. Bước vào thế giới tu tiên 3D — nơi mỗi lựa chọn đều có linh hồn.</p>
        <div className="splash-features">
          <span><Compass size={17} /> Thế giới 3D</span><span><Swords size={17} /> Đánh boss cùng đạo hữu</span><span><Sparkles size={17} /> Linh căn định mệnh</span>
        </div>
      </div>
      <div className="splash-footnote"><MousePointer2 size={15} /> Kéo chuột để xoay góc nhìn · Cuộn để phóng to</div>
    </div>
    <div className="splash-right">
      <div className="entrance-card">
        <div className="entrance-ornament">✦ <span>THIÊN MỆNH CHỜ NGƯỜI</span> ✦</div>
        <div className="entrance-icon"><Crown size={32} strokeWidth={1.3} /></div>
        <h2>{mode === 'register' ? 'Khai mở đạo tịch' : 'Khởi hành tu đạo'}</h2>
        <p>{mode === 'register'
          ? 'Tạo tài khoản để giữ nhân vật, kho đồ và tiến độ tu luyện trên mọi thiết bị.'
          : 'Đăng nhập để tiếp tục hành trình hoặc bước vào cõi tiên bằng phiên chơi thử.'}</p>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {localError && <div className="inline-error" role="alert">{localError}</div>}
        {notice && <div className="inline-notice" role="status"><MailCheck size={15} /> {notice}</div>}
        {firebaseAvailable && <div className="auth-tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
          {(['login', 'register'] as const).map((value) => <button key={value} type="button" role="tab"
            aria-selected={mode === value} className={mode === value ? 'active' : ''}
            onClick={() => { setMode(value); setLocalError(null); setShowPassword(true); }}>
            {value === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>)}
        </div>}
        {firebaseAvailable && <button className="btn btn-light btn-full" disabled={busy} onClick={onGoogle}>
          <span className="google-g">G</span> Tiếp tục với Google <ArrowRight size={16} />
        </button>}
        {firebaseAvailable && <>
          <button className="link-button account-toggle" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? 'Ẩn biểu mẫu email' : mode === 'register' ? 'Đăng ký bằng email' : 'Đăng nhập bằng email và mật khẩu'}
          </button>
          {showPassword && <form className="email-form" onSubmit={submit}>
            {mode === 'register' && <input type="text" placeholder="Đạo hiệu (tuỳ chọn)" autoComplete="nickname" maxLength={40}
              value={name} onChange={(e) => setName(e.target.value)} />}
            <input type="email" placeholder="Email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Mật khẩu" required minLength={6} value={password}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'register' && <input type="password" placeholder="Nhập lại mật khẩu" required minLength={6} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            {mismatch && <div className="form-hint warn">Hai mật khẩu chưa khớp nhau.</div>}
            <button className="btn btn-gold btn-full" disabled={busy || mismatch} type="submit">
              {busy ? 'Đang xử lý...' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'} <ArrowRight size={16} />
            </button>
            <div className="email-form-foot">
              <button type="button" className="link-button" disabled={busy || !email.trim()} onClick={() => { setLocalError(null); onReset(email.trim()); }}>
                Quên mật khẩu?
              </button>
              {mode === 'register' && <span>Mật khẩu tối thiểu 6 ký tự.</span>}
            </div>
          </form>}
        </>}
        {demoAvailable && <button className="btn btn-gold btn-full" disabled={busy} onClick={onDemo}>
          {busy ? 'Đang mở cánh cổng...' : 'Bước vào chơi thử'} <ArrowRight size={17} />
        </button>}
        {!demoAvailable && !firebaseAvailable && <div className="login-unavailable">Đang chờ cấu hình đăng nhập. Xem README để chạy chế độ chơi thử.</div>}
        <div className="entrance-divider"><span /></div>
        <div className="entrance-security"><ShieldCheck size={17} /> Combat và tài khoản được xác thực phía máy chủ.</div>
      </div>
      <span className="entrance-bottom">VÂN THƯỢNG ONLINE · WEB 3D MMORPG</span>
    </div>
  </div>;
}
