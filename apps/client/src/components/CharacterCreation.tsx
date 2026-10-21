import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Eye, ScanFace, Sparkles, UserRound, WandSparkles } from 'lucide-react';
import { DEFAULT_APPEARANCE, ELEMENT_COLOR, ELEMENT_LABEL, ROOT_LABEL, type Appearance, type Gender, type OwnCharacter } from '@van-thuong/shared';
import type { PreviewOptions } from '../game/WorldScene';
import { AppearanceControls } from './AppearanceControls';

const malePreset: Appearance = { ...DEFAULT_APPEARANCE, hair: 'short', face: 'angular',
  robeColor: 'midnight', height: 0.6, build: 0.67 };

const rootChances = [
  ['Tạp Linh Căn', '60%', '#aabbb4'], ['Chân Linh Căn', '30%', '#79d3b8'],
  ['Thiên Linh Căn', '9%', '#edcd8f'], ['Biến Dị Linh Căn', '1%', '#ccadff'],
] as const;

export function CharacterCreation({ preview, onChange, onCreate, busy, error, onBack, revealed, onEnter }: {
  preview: PreviewOptions; onChange: (value: PreviewOptions) => void;
  onCreate: () => void; busy: boolean; error: string | null;
  onBack: () => void; revealed?: OwnCharacter | null; onEnter: () => void;
}) {
  const [mobilePreview, setMobilePreview] = useState(false);
  const switchGender = (gender: Gender) => {
    if (gender === preview.gender) return;
    const previousPreset = preview.gender === 'nam' ? malePreset : DEFAULT_APPEARANCE;
    const untouched = (Object.keys(previousPreset) as (keyof Appearance)[])
      .every((key) => preview.appearance[key] === previousPreset[key]);
    onChange({ ...preview, gender, appearance: untouched ? { ...(gender === 'nam' ? malePreset : DEFAULT_APPEARANCE) } : preview.appearance });
  };
  return <div className={`creation-layout ${mobilePreview && !revealed ? 'mobile-preview-active' : ''}`}>
    <header className="creation-header"><div className="brand-lockup"><div className="brand-seal">雲</div><span>VÂN THƯỢNG <small>ONLINE</small></span></div><div className="creation-step">{revealed ? '02 / 02' : '01 / 02'} <span>{revealed ? 'THIÊN MỆNH' : 'TẠO NHÂN VẬT'}</span></div></header>
    {!revealed && !mobilePreview && <button type="button" className="mobile-preview-open" onClick={() => setMobilePreview(true)}><Eye size={15} /> Xem nhân vật 3D</button>}
    <div className="creation-side">
      {!revealed ? <>
        <span className="eyebrow"><span className="eyebrow-line" /> KHỞI NGUYÊN</span>
        <h1>Vẽ nên<br /><em>tiên duyên.</em></h1>
        <p className="creation-intro">Chọn diện mạo thật của bạn: kiểu tóc, sắc tóc, đường nét khuôn mặt và vóc dáng. Linh Căn do thiên mệnh quyết định.</p>
        <div className="creation-form glass-panel">
          <label className="form-label" htmlFor="hero-name">DANH XƯNG</label>
          <input id="hero-name" type="text" className="text-input" maxLength={20} placeholder="Đặt tên cho đạo hữu..." value={preview.name} onChange={(e) => onChange({ ...preview, name: e.target.value })} />
          <div className="form-label margin-top">GIỚI TÍNH · HÌNH THỂ RIÊNG</div>
          <div className="choice-row"><button type="button" className={`choice-pill ${preview.gender === 'nam' ? 'selected' : ''}`} aria-pressed={preview.gender === 'nam'} onClick={() => switchGender('nam')}>Nam tu <span>♂</span></button><button type="button" className={`choice-pill ${preview.gender === 'nu' ? 'selected' : ''}`} aria-pressed={preview.gender === 'nu'} onClick={() => switchGender('nu')}>Nữ tu <span>♀</span></button></div>
          <AppearanceControls value={preview.appearance} onChange={(appearance) => onChange({ ...preview, appearance })} />
          <button type="button" className="preview-toggle" onClick={() => {
            onChange({ ...preview, view: preview.view === 'face' ? 'body' : 'face' });
            if (window.matchMedia('(max-width: 720px)').matches) setMobilePreview(true);
          }}>
            {preview.view === 'face' ? <UserRound size={15} /> : <ScanFace size={15} />}
            {preview.view === 'face' ? 'Xem toàn thân' : 'Xem cận khuôn mặt'}
          </button>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="btn btn-gold btn-full create-button" onClick={onCreate} disabled={busy || preview.name.trim().length < 2}>
            <WandSparkles size={18} /> {busy ? 'Đang gieo linh căn...' : 'Rút Linh Căn · Nhập thế'} <ArrowRight size={17} />
          </button>
        </div>
        <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Quay lại đăng nhập</button>
      </> : <>
        <span className="eyebrow"><span className="eyebrow-line" /> LINH CĂN ĐÃ KHAI MỞ</span>
        <h1>Thiên mệnh<br /><em>đã chọn ngươi.</em></h1>
        <div className="root-reveal glass-panel" style={{ '--root-accent': ELEMENT_COLOR[revealed.root.elements[0]] } as React.CSSProperties}>
          <div className="root-reveal-symbol"><Sparkles size={37} strokeWidth={1.2} /></div>
          <span className="form-label">KẾT QUẢ RÚT LINH CĂN</span>
          <h2>{ROOT_LABEL[revealed.root.tier]}</h2>
          <div className="element-tags">{revealed.root.elements.map((element) => <span key={element} style={{ color: ELEMENT_COLOR[element], borderColor: ELEMENT_COLOR[element] }}>{ELEMENT_LABEL[element]}</span>)}</div>
          <div className="root-reveal-stat"><span>Tốc độ hấp thu linh khí</span><strong>× {revealed.root.multiplier.toFixed(1)}</strong></div>
          <p>Đạo hữu <strong>{revealed.name}</strong>, mỗi bước tu hành từ đây do chính ngươi quyết định. Linh Căn đã lưu vĩnh viễn.</p>
          <button className="btn btn-gold btn-full" onClick={onEnter} disabled={busy}>Bước vào Vân Thượng <ArrowRight size={18} /></button>
        </div>
      </>}
    </div>
    {mobilePreview && !revealed && <div className="mobile-preview-actions glass-panel">
      <span><Eye size={15} /> Xem {preview.view === 'face' ? 'khuôn mặt' : 'toàn thân'} · Kéo để xoay</span>
      <div><button className="btn btn-quiet" onClick={() => onChange({ ...preview, view: preview.view === 'face' ? 'body' : 'face' })}>{preview.view === 'face' ? 'Toàn thân' : 'Cận mặt'}</button>
        <button className="btn btn-gold" onClick={() => setMobilePreview(false)}>Tiếp tục tùy chỉnh <ArrowRight size={15} /></button></div>
    </div>}
    <div className="creation-preview-note"><div className="preview-label"><span className="preview-label-dot" /> NHÂN VẬT 3D CỦA BẠN</div><span>Nhân thể rigged · Kéo chuột xoay camera · Ngoại hình được lưu trên server</span></div>
    <div className="creation-probability glass-panel">
      <div className="probability-heading"><CircleHelp size={15} /> TỶ LỆ LINH CĂN <span>SERVER RNG</span></div>
      {rootChances.map(([name, chance, color]) => <div className="probability-row" key={name}><span className="probability-dot" style={{ background: color }} />{name}<strong>{chance}</strong></div>)}
      <div className="probability-foot"><Check size={13} /> Một nhân vật · Một lần rút · Không đổi kết quả</div>
    </div>
  </div>;
}
