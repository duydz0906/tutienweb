import { useState } from 'react';
import { ArrowRight, Compass, Crown, MousePointer2, ShieldCheck, Sparkles, Swords } from 'lucide-react';

export function LoginScreen({ demoAvailable, firebaseAvailable, busy, error, onDemo, onGoogle, onPassword }: {
  demoAvailable: boolean; firebaseAvailable: boolean; busy: boolean; error: string | null;
  onDemo: () => void; onGoogle: () => void; onPassword: (email: string, password: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <h2>Khởi hành tu đạo</h2>
        <p>Đăng nhập để tiếp tục hành trình hoặc bước vào cõi tiên bằng phiên chơi thử.</p>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {firebaseAvailable && <button className="btn btn-light btn-full" disabled={busy} onClick={onGoogle}>
          <span className="google-g">G</span> Tiếp tục với Google <ArrowRight size={16} />
        </button>}
        {firebaseAvailable && <>
          <button className="link-button account-toggle" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? 'Ẩn đăng nhập email' : 'Đăng nhập bằng email và mật khẩu'}
          </button>
          {showPassword && <form className="email-form" onSubmit={(event) => { event.preventDefault(); onPassword(email, password); }}>
            <input type="email" placeholder="Email Firebase" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Mật khẩu" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-gold btn-full" disabled={busy} type="submit">Đăng nhập <ArrowRight size={16} /></button>
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
