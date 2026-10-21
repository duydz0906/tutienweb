import { ArrowLeft, ArrowRight, Check, CircleHelp, Sparkles, WandSparkles } from 'lucide-react';
import { ELEMENT_COLOR, ELEMENT_LABEL, ROOT_LABEL, type OwnCharacter } from '@van-thuong/shared';
import type { PreviewOptions } from '../game/WorldScene';

const rootChances = [
  ['Tạp Linh Căn', '60%', '#aabbb4'], ['Chân Linh Căn', '30%', '#79d3b8'],
  ['Thiên Linh Căn', '9%', '#edcd8f'], ['Biến Dị Linh Căn', '1%', '#ccadff'],
] as const;

export function CharacterCreation({ preview, onChange, onCreate, busy, error, onBack, revealed, onEnter }: {
  preview: PreviewOptions; onChange: (value: PreviewOptions) => void;
  onCreate: () => void; busy: boolean; error: string | null;
  onBack: () => void; revealed?: OwnCharacter | null; onEnter: () => void;
}) {
  return <div className="creation-layout">
    <header className="creation-header"><div className="brand-lockup"><div className="brand-seal">雲</div><span>VÂN THƯỢNG <small>ONLINE</small></span></div><div className="creation-step">{revealed ? '02 / 02' : '01 / 02'} <span>{revealed ? 'THIÊN MỆNH' : 'TẠO NHÂN VẬT'}</span></div></header>
    <div className="creation-side">
      {!revealed ? <>
        <span className="eyebrow"><span className="eyebrow-line" /> KHỞI NGUYÊN</span>
        <h1>Vẽ nên<br /><em>tiên duyên.</em></h1>
        <p className="creation-intro">Tên gọi, diện mạo, và một bước chân đầu tiên. Còn Linh Căn — hãy để thiên mệnh quyết định.</p>
        <div className="creation-form glass-panel">
          <label className="form-label" htmlFor="hero-name">DANH XƯNG</label>
          <input id="hero-name" type="text" className="text-input" maxLength={20} placeholder="Đặt tên cho đạo hữu..." value={preview.name} onChange={(e) => onChange({ ...preview, name: e.target.value })} />
          <div className="form-label margin-top">GIỚI TÍNH</div>
          <div className="choice-row"><button className={`choice-pill ${preview.gender === 'nam' ? 'selected' : ''}`} onClick={() => onChange({ ...preview, gender: 'nam' })}>Nam tu <span>♂</span></button><button className={`choice-pill ${preview.gender === 'nu' ? 'selected' : ''}`} onClick={() => onChange({ ...preview, gender: 'nu' })}>Nữ tu <span>♀</span></button></div>
          <div className="form-label margin-top">KIỂU TÓC</div>
          <div className="choice-row"><button className={`choice-pill ${preview.appearance.hair === 'long' ? 'selected' : ''}`} onClick={() => onChange({ ...preview, appearance: { ...preview.appearance, hair: 'long' } })}>Tóc dài</button><button className={`choice-pill ${preview.appearance.hair === 'tied' ? 'selected' : ''}`} onClick={() => onChange({ ...preview, appearance: { ...preview.appearance, hair: 'tied' } })}>Tóc búi</button></div>
          <div className="form-label margin-top">MÀU TÓC · Y PHỤC</div>
          <div className="swatch-row">
            {(['ink', 'silver'] as const).map((color) => <button key={color} className={`color-swatch ${preview.appearance.hairColor === color ? 'selected' : ''}`} title={color === 'ink' ? 'Mặc' : 'Bạch ngân'} style={{ '--swatch': color === 'ink' ? '#283640' : '#dae8e3' } as React.CSSProperties} onClick={() => onChange({ ...preview, appearance: { ...preview.appearance, hairColor: color } })} />)}
            <span className="swatch-separator" />
            {(['ivory', 'jade', 'ember'] as const).map((color) => <button key={color} className={`color-swatch ${preview.appearance.robeColor === color ? 'selected' : ''}`} title={color === 'ivory' ? 'Ngà' : color === 'jade' ? 'Ngọc' : 'Chu sa'} style={{ '--swatch': { ivory: '#e3decf', jade: '#4f9790', ember: '#a36763' }[color] } as React.CSSProperties} onClick={() => onChange({ ...preview, appearance: { ...preview.appearance, robeColor: color } })} />)}
          </div>
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
          <p>Đạo hữu <strong>{revealed.name}</strong>, từ giờ mỗi bước tu hành đều do chính ngươi quyết định. Linh căn đã được lưu vĩnh viễn.</p>
          <button className="btn btn-gold btn-full" onClick={onEnter}>Bước vào Vân Thượng <ArrowRight size={18} /></button>
        </div>
      </>}
    </div>
    <div className="creation-preview-note"><div className="preview-label"><span className="preview-label-dot" /> NHÂN VẬT 3D CỦA BẠN</div><span>Kéo chuột để xoay camera · Trang bị gắn vào khớp xương</span></div>
    <div className="creation-probability glass-panel">
      <div className="probability-heading"><CircleHelp size={15} /> TỶ LỆ LINH CĂN <span>SERVER RNG</span></div>
      {rootChances.map(([name, chance, color]) => <div className="probability-row" key={name}><span className="probability-dot" style={{ background: color }} />{name}<strong>{chance}</strong></div>)}
      <div className="probability-foot"><Check size={13} /> Một nhân vật · Một lần rút · Không đổi kết quả</div>
    </div>
  </div>;
}
