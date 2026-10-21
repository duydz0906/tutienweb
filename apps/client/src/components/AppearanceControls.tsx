import { useState } from 'react';
import { FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, ROBE_COLORS, SKIN_TONES, type Appearance } from '@van-thuong/shared';
import { HAIR_HEX, ROBE_HEX, SKIN_HEX } from '../game/humanAppearance';

const hairNames: Record<Appearance['hair'], string> = {
  long: 'Dài suôn', tied: 'Buộc cao', bob: 'Tóc bob', braid: 'Tết bím',
  bun: 'Tóc búi', short: 'Ngắn', cropped: 'Tóc tém',
};
const faceNames: Record<Appearance['face'], string> = {
  oval: 'Trái xoan', round: 'Mặt tròn', angular: 'Góc cạnh', heart: 'Trái tim',
};
const hairNamesColor: Record<Appearance['hairColor'], string> = {
  ink: 'Huyền mặc', silver: 'Bạch ngân', chestnut: 'Hạt dẻ', auburn: 'Đồng đỏ',
  gold: 'Kim sa', ash: 'Khói', plum: 'Tử mận', jade: 'Thanh ngọc',
};
const robeNames: Record<Appearance['robeColor'], string> = {
  ivory: 'Ngà', jade: 'Ngọc', ember: 'Chu sa', midnight: 'Lam đêm', lilac: 'Tử đinh hương',
};
const skinNames: Record<Appearance['skinTone'], string> = {
  light: 'Trắng sáng', warm: 'Ấm tự nhiên', bronze: 'Nắng đồng', deep: 'Nâu trầm',
};

function Swatches<T extends string>({ values, value, colors, names, onChange, label }: {
  values: readonly T[]; value: T; colors: Record<T, string>; names: Record<T, string>;
  onChange: (v: T) => void; label: string;
}) {
  return <div className="appearance-swatches" role="group" aria-label={label}>
    {values.map((v) => <button key={v} type="button" className={`color-swatch ${value === v ? 'selected' : ''}`}
      title={names[v]} aria-label={`${label}: ${names[v]}`} aria-pressed={value === v}
      style={{ '--swatch': colors[v] } as React.CSSProperties} onClick={() => onChange(v)} />)}
  </div>;
}

/** Same persistent options in creation and in the in-game appearance drawer. */
export function AppearanceControls({ value, onChange }: { value: Appearance; onChange: (next: Appearance) => void }) {
  const [tab, setTab] = useState<'hair' | 'face'>('hair');
  const change = <K extends keyof Appearance>(key: K, next: Appearance[K]) => onChange({ ...value, [key]: next });
  return <div className="appearance-editor">
    <div className="appearance-tabs" role="tablist" aria-label="Tùy chỉnh ngoại hình">
      <button type="button" role="tab" aria-selected={tab === 'hair'} className={tab === 'hair' ? 'active' : ''} onClick={() => setTab('hair')}>Tóc & y phục</button>
      <button type="button" role="tab" aria-selected={tab === 'face'} className={tab === 'face' ? 'active' : ''} onClick={() => setTab('face')}>Khuôn mặt & vóc dáng</button>
    </div>
    {tab === 'hair' ? <div role="tabpanel">
      <div className="form-label margin-top">KIỂU TÓC · 7 PHONG CÁCH</div>
      <div className="appearance-choice-grid" role="group" aria-label="Kiểu tóc">
        {HAIR_STYLES.map((v) => <button type="button" key={v} className={`appearance-choice ${value.hair === v ? 'selected' : ''}`}
          aria-pressed={value.hair === v} onClick={() => change('hair', v)}>{hairNames[v]}</button>)}
      </div>
      <div className="form-label margin-top">MÀU TÓC · 8 SẮC ĐỘ</div>
      <Swatches values={HAIR_COLORS} value={value.hairColor} colors={HAIR_HEX} names={hairNamesColor} label="Màu tóc" onChange={(v) => change('hairColor', v)} />
      <div className="form-label margin-top">MÀU PHÁP Y</div>
      <Swatches values={ROBE_COLORS} value={value.robeColor} colors={ROBE_HEX} names={robeNames} label="Màu y phục" onChange={(v) => change('robeColor', v)} />
    </div> : <div role="tabpanel">
      <div className="form-label margin-top">ĐƯỜNG NÉT KHUÔN MẶT</div>
      <div className="appearance-choice-grid face-grid" role="group" aria-label="Dáng khuôn mặt">
        {FACE_SHAPES.map((v) => <button type="button" key={v} className={`appearance-choice ${value.face === v ? 'selected' : ''}`}
          aria-pressed={value.face === v} onClick={() => change('face', v)}>{faceNames[v]}</button>)}
      </div>
      <div className="form-label margin-top">SẮC DA</div>
      <Swatches values={SKIN_TONES} value={value.skinTone} colors={SKIN_HEX} names={skinNames} label="Sắc da" onChange={(v) => change('skinTone', v)} />
      <div className="appearance-slider"><label htmlFor="avatar-height">CHIỀU CAO <strong>{Math.round(value.height * 100)}%</strong></label>
        <input id="avatar-height" type="range" min="0" max="100" value={Math.round(value.height * 100)} onChange={(e) => change('height', Number(e.target.value) / 100)} />
        <div className="slider-labels"><span>Nhỏ nhắn</span><span>Cao ráo</span></div></div>
      <div className="appearance-slider"><label htmlFor="avatar-build">VÓC DÁNG <strong>{Math.round(value.build * 100)}%</strong></label>
        <input id="avatar-build" type="range" min="0" max="100" value={Math.round(value.build * 100)} onChange={(e) => change('build', Number(e.target.value) / 100)} />
        <div className="slider-labels"><span>Mảnh mai</span><span>Rắn rỏi</span></div></div>
    </div>}
  </div>;
}
