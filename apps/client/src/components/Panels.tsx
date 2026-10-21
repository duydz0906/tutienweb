import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Backpack, BookOpen, ChevronRight, Crown, Flame, FlaskConical,
  Gem, Hammer, House, MapPin, RotateCcw, Shield, Sparkles, Swords, Target, Trophy, Users, Warehouse, WandSparkles, X, Zap } from 'lucide-react';
import { CONSUMABLES, EQUIPMENT_SLOTS, HOME_CHEST, ITEMS, MAX_REALM, NPCS, REALMS, REBIRTH_ALTAR, RECIPES, SLOT_LABEL,
  houseAbsorptionBonus, houseLevel, storageCapacity, type Appearance, type ConsumableId, type Gender, type LeaderboardEntry, type OwnCharacter, type Path } from '@van-thuong/shared';
import { AppearanceControls } from './AppearanceControls';
import { AlchemyPanel, BeastPanel, QuestPanel, SectPanel, ShopPanel, SkillsPanel } from './SectPanels';

export type ActivePanel = 'inventory' | 'craft' | 'alchemy' | 'beast' | 'dev' | 'leaderboard' | 'help' | 'home' | 'rebirth' | 'quests' | 'sect' | 'shop' | 'skills' | 'admin' | null;
export type AdminPlayer = { id: string; name: string; position: { x: number; y: number; z: number }; realm: number; scene: string; hp: number };
const rarityLabel: Record<string, string> = { common: 'Phàm phẩm', rare: 'Linh phẩm', epic: 'Thượng phẩm', immortal: 'Tiên Khí' };

export function Panels({ panel, onClose, onNavigate, onOpenPath, character, leaderboard, roster, onAction, onLogout, connected }: {
  panel: ActivePanel; onClose: () => void; onNavigate: (panel: ActivePanel) => void; onOpenPath: () => void; character: OwnCharacter;
  leaderboard: LeaderboardEntry[]; roster: AdminPlayer[];
  onAction: (event: string, payload?: object) => void; onLogout: () => void;
  connected: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [profession, setProfession] = useState<'dan' | 'khi' | 'tran'>('dan');
  const [targetId, setTargetId] = useState<string>('');
  const [itemId, setItemId] = useState('immortal_sword');
  const [bossId, setBossId] = useState('world-boss');
  const [reincarnationConfirmed, setReincarnationConfirmed] = useState(false);
  const [devAppearance, setDevAppearance] = useState<Appearance>(character.appearance);
  const [devGender, setDevGender] = useState<Gender>(character.gender);
  // An irreversible choice must require a fresh acknowledgement each time the dialog opens.
  useEffect(() => { if (panel !== 'rebirth') setReincarnationConfirmed(false); }, [panel]);
  useEffect(() => {
    if (panel === 'dev') { setDevAppearance(character.appearance); setDevGender(character.gender); }
  }, [panel, character.id]);
  if (!panel || (panel === 'admin' && !character.isAdmin) || (panel === 'dev' && !character.devMode)) return null;
  const available = (amount: number) => character.devMode ? '∞' : amount.toLocaleString('vi-VN');

  const equipped = (slot: string) => {
    const instanceId = character.equipment[slot as keyof typeof character.equipment];
    return character.inventory.find((item) => item.instanceId === instanceId);
  };
  const selection = character.inventory.find((item) => item.instanceId === selectedItem);
  const selectionDefinition = selection && ITEMS[selection.itemId];
  const selectedPill = selection && Object.hasOwn(CONSUMABLES, selection.itemId) ? CONSUMABLES[selection.itemId as ConsumableId] : null;
  const selectedPlayer = roster.find((player) => player.id === targetId);
  const tier = houseLevel(character.devMode ? MAX_REALM : character.highestRealm);
  const capacity = storageCapacity(character.devMode ? MAX_REALM : character.highestRealm);
  const chestNear = character.scene === 'residence' &&
    Math.hypot(character.position.x - HOME_CHEST.position.x, character.position.z - HOME_CHEST.position.z) <= HOME_CHEST.radius;
  const altarNear = character.scene === 'sanctum' &&
    Math.hypot(character.position.x - REBIRTH_ALTAR.position.x, character.position.z - REBIRTH_ALTAR.position.z) <= REBIRTH_ALTAR.radius;
  const title = { inventory: 'Túi Càn Khôn', craft: 'Bách Nghệ Tiên Gia', alchemy: 'Phòng Luyện Đan', beast: 'Ngự Thú Viện', dev: 'Đổi Nhân Vật · Dev Mode', leaderboard: 'Thiên Kiêu Bảng',
    help: 'Thiên Đạo Chỉ Dẫn', home: 'Nhà Riêng & Rương Đồ', rebirth: 'Mật Thất Tái Sinh', quests: 'Nhiệm Vụ Các', sect: 'Chính Điện',
    shop: 'Cửa Hàng Tông Môn', skills: 'Công Pháp & Hotbar', admin: 'Thiên Đạo · God Mode' }[panel];

  return <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`drawer glass-panel ${panel === 'admin' ? 'drawer-wide' : ''}`} role="dialog" aria-label={title} aria-modal="true">
      <div className="drawer-head"><div><span className="eyebrow">VÂN THƯỢNG · {panel === 'admin' ? 'ADMIN' : 'HÀNH TRANG'}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>

      {panel === 'dev' && <div className="drawer-scroll dev-customizer">
        <div className="rounded border border-jade/30 bg-jade/10 p-4 text-xs leading-6 text-slate-300"><strong className="text-jade">Thế giới thử nghiệm</strong><p>Thay đổi đạo tu, hình dáng và nam/nữ ngay trên nhân vật {character.name}. Lưu riêng theo UID; không đổi chủ kho, không cấp quyền quản trị, thoát dev mode sẽ khôi phục nguyên trạng.</p></div>
        <button className="btn btn-gold btn-full" onClick={onOpenPath}><Swords size={16} /> Đổi đạo tu: {character.path ? { kiem: 'Kiếm Tu', phap: 'Pháp Tu', the: 'Thể Tu', thu: 'Ngự Thú', ma: 'Ma Tu' }[character.path] : 'Chưa chọn'} <ArrowRight size={16} /></button>
        <button className="btn btn-quiet btn-full" onClick={() => onNavigate('skills')}><BookOpen size={16} /> Sắp xếp công pháp & Hotbar</button>
        <div className="form-label margin-top">CHỌN CHÂN THÂN · NAM / NỮ</div>
        <div className="appearance-choice-grid" role="group" aria-label="Chọn nhân vật">
          {(['nam', 'nu'] as const).map((gender) => <button type="button" key={gender} className={`appearance-choice ${devGender === gender ? 'selected' : ''}`} aria-pressed={devGender === gender} onClick={() => setDevGender(gender)}>{gender === 'nam' ? 'Nam tu sĩ' : 'Nữ tu sĩ'}</button>)}
        </div>
        <AppearanceControls value={devAppearance} onChange={setDevAppearance} />
        <button className="btn btn-gold btn-full" disabled={!connected || character.scene === 'tribulation'} onClick={() => onAction('appearance:update', { gender: devGender, appearance: devAppearance })}><Sparkles size={16} /> Lưu chân thân</button>
      </div>}
      {panel === 'beast' && <BeastPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'alchemy' && <AlchemyPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'quests' && <QuestPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'sect' && <SectPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'shop' && <ShopPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'skills' && <SkillsPanel character={character} connected={connected} onAction={onAction} />}
      {panel === 'home' && <div className="drawer-scroll housing-panel">
        <div className="housing-banner"><House size={32} /><div><span className="eyebrow">PHÒNG RIÊNG · {character.name.toUpperCase()}</span>
          <h3>Đệ tử xá · Cấp {tier}</h3><p>Nhà nâng theo đại cảnh giới cao nhất, không bị mất khi tái sinh.</p></div></div>
        <div className="housing-stats"><span><Sparkles size={17} /> Hấp thụ linh khí <b>+{Math.round(houseAbsorptionBonus(tier - 1) * 100)}%</b></span>
          <span><Warehouse size={17} /> Sức chứa <b>{character.stash.length}/{capacity}</b></span></div>
        <p className="drawer-description">Rương ở trong nhà riêng tại Đệ Tử Xá (X −33, Z 12). Chỉ chủ nhân thấy vật phẩm trong rương. Cần đứng sát rương mới được cất hoặc lấy đồ; tháo trang bị trước khi cất.</p>
        <div className="drawer-section-heading"><Warehouse size={16} /> TRONG RƯƠNG <span>{character.stash.length}/{capacity}</span></div>
        {character.stash.length ? <div className="storage-list">{character.stash.map((owned) => {
          const item = ITEMS[owned.itemId] ?? CONSUMABLES[owned.itemId as ConsumableId];
          return <div key={owned.instanceId} className="storage-item"><span className="item-visual">{item?.icon ?? '✦'}</span>
            <div><strong>{item?.name ?? owned.itemId}</strong><small>{'rarity' in (item ?? {}) ? rarityLabel[(item as typeof ITEMS[string]).rarity] : 'Đan dược'}</small></div>
            <button disabled={!connected || !chestNear || character.inventory.length >= 80}
              onClick={() => onAction('home:transfer', { direction: 'withdraw', instanceId: owned.instanceId })}>Lấy ra</button></div>;
        })}</div> : <div className="empty-state"><Warehouse size={25} /> Rương đang trống. Mang đồ đến gần rương để cất giữ.</div>}
        <div className="drawer-section-heading section-separator"><Backpack size={16} /> TÚI ĐỒ <span>{character.inventory.length}/80</span></div>
        <div className="storage-list">{character.inventory.map((owned) => {
          const item = ITEMS[owned.itemId] ?? CONSUMABLES[owned.itemId as ConsumableId];
          const equipped = Object.values(character.equipment).includes(owned.instanceId);
          return <div key={owned.instanceId} className="storage-item"><span className="item-visual">{item?.icon ?? '✦'}</span>
            <div><strong>{item?.name ?? owned.itemId}</strong><small>{equipped ? 'Đang trang bị · không thể cất' : 'Có thể cất vào rương'}</small></div>
            <button disabled={!connected || !chestNear || equipped || character.stash.length >= capacity}
              onClick={() => onAction('home:transfer', { direction: 'deposit', instanceId: owned.instanceId })}>Cất đồ</button></div>;
        })}</div>
        {!chestNear && <div className="housing-hint">Đến sát rương trong phòng riêng để mở khóa thao tác cất / lấy vật phẩm.</div>}
      </div>}

      {panel === 'rebirth' && <div className="drawer-scroll rebirth-panel">
        <div className="rebirth-orb"><RotateCcw size={43} /></div>
        <span className="eyebrow">TIÊN ĐẾ TẦNG 9 · MẬT THẤT TRÊN NÚI</span><h3>Một lần tái sinh. Một thiên mệnh mới.</h3>
        <p>Tái sinh đưa cảnh giới, EXP hiện tại và HP/MP cơ bản về Phàm Nhân. Linh Căn, đạo tu, công pháp, trang bị, kho riêng, nhà cấp cao nhất và tổng tu vi vẫn giữ nguyên.</p>
        <div className="housing-stats"><span><Sparkles size={17} /> Hấp thụ vĩnh viễn <b>+50%</b></span>
          <span><Gem size={17} /> Thượng Giới <b>+35% linh khí</b></span></div>
        <p>Sau khi tái sinh, cổng Thượng Giới trong mật thất mở ra: quái cấp cao, EXP lớn hơn và tỉ lệ pháp bảo hiếm tăng mạnh. Chỉ tái sinh <b>một lần</b> trên mỗi nhân vật.</p>
        {character.rebirths ? <div className="housing-hint">Bạn đã tái sinh. Hãy đến Cổng Thượng Giới ở phía đông mật thất.</div> : <>
          <label className="rebirth-confirm"><input type="checkbox" checked={reincarnationConfirmed} onChange={(event) => setReincarnationConfirmed(event.target.checked)} />
            Tôi hiểu cảnh giới, EXP và HP/MP sẽ bắt đầu lại từ Phàm Nhân.</label>
          <button className="btn btn-gold btn-full" disabled={!connected || !altarNear || character.realm !== MAX_REALM || character.minorStage !== 9 || !reincarnationConfirmed}
            onClick={() => { onAction('rebirth:choose'); setReincarnationConfirmed(false); }}>Lựa chọn tái sinh <ArrowRight size={16} /></button>
          {!altarNear && <div className="housing-hint">Đứng trước Tái Sinh Đài trong mật thất để thực hiện.</div>}
        </>}
      </div>}

      {panel === 'inventory' && <div className="drawer-scroll">
        <button className="home-shortcut" onClick={() => onNavigate('home')}><House size={19} /> Nhà riêng · Rương đồ <span>{character.stash.length}/{capacity}</span> <ArrowRight size={16} /></button>
        <div className="drawer-section-heading"><Shield size={15} /> MƯỜI Ô TRANG BỊ <span>{Object.keys(character.equipment).length}/10</span></div>
        <div className="equipment-grid">{EQUIPMENT_SLOTS.map((slot) => {
          const owned = equipped(slot);
          const item = owned && ITEMS[owned.itemId];
          return <div className={`equipment-slot ${item ? `rarity-${item.rarity}` : ''}`} key={slot}>
            <div className="equipment-slot-icon">{item?.icon ?? '·'}</div>
            <div><small>{SLOT_LABEL[slot]}</small><strong>{item?.name ?? 'Trống'}</strong></div>
          </div>;
        })}</div>
        <div className="drawer-section-heading section-separator"><Backpack size={15} /> VẬT PHẨM SỞ HỮU <span>{character.inventory.length}/80</span></div>
        <div className="item-list">{character.inventory.map((owned) => {
          const item = ITEMS[owned.itemId];
          const pill = Object.hasOwn(CONSUMABLES, owned.itemId) ? CONSUMABLES[owned.itemId as ConsumableId] : null;
          if (!item && !pill) return null;
          const inUse = Boolean(item && character.equipment[item.slot] === owned.instanceId);
          return <button className={`item-row rarity-${item?.rarity ?? 'common'} ${selectedItem === owned.instanceId ? 'item-selected' : ''}`} key={owned.instanceId} onClick={() => setSelectedItem(owned.instanceId)}>
            <span className="item-visual">{item?.icon ?? pill?.icon}</span><span className="item-text"><strong>{item?.name ?? pill?.name}</strong><small>{item ? `${rarityLabel[item.rarity]} · ${SLOT_LABEL[item.slot]}` : 'Đan dược · Tiêu hao'}</small></span>{inUse ? <span className="item-worn">ĐANG MẶC</span> : <ChevronRight size={15} />}
          </button>;
        })}</div>
        {(selectionDefinition || selectedPill) && <div className="item-detail">
          <div className="item-detail-name">{selectionDefinition?.icon ?? selectedPill?.icon} {selectionDefinition?.name ?? selectedPill?.name} <span>{selectionDefinition ? rarityLabel[selectionDefinition.rarity] : 'Đan dược'}</span></div>
          <p>{selectionDefinition?.description ?? selectedPill?.description}</p>
          {selectionDefinition && <><div className="item-stats">{selectionDefinition.attack > 0 && <span><Swords size={14} /> Công +{selectionDefinition.attack}</span>}{selectionDefinition.defense > 0 && <span><Shield size={14} /> Thủ +{selectionDefinition.defense}</span>}</div>
            {character.equipment[selectionDefinition.slot] !== selectedItem && <button className="btn btn-gold btn-full" onClick={() => onAction('equip', { instanceId: selectedItem })}>Trang bị vào {SLOT_LABEL[selectionDefinition.slot]} <ArrowRight size={15} /></button>}
          </>}
          {selectedPill && selection?.itemId !== 'foundation_pill' && <button className="btn btn-gold btn-full" disabled={!connected} onClick={() => onAction('use-item', { instanceId: selectedItem })}>Sử dụng đan dược <ArrowRight size={15} /></button>}
          {selection?.itemId === 'foundation_pill' && <p>Đan sẽ được dùng khi bạn chọn “Dùng Trúc Cơ Đan” lúc bắt đầu Độ kiếp tầng 9.</p>}
        </div>}
      </div>}

      {panel === 'craft' && <div className="drawer-scroll">
        <p className="drawer-description">Dùng nguyên liệu từ hành trình và chiến lợi phẩm đánh boss để khai mở bách nghệ.</p>
        <div className="materials-bar"><span><Gem size={15} /> {available(character.resources.stones)} linh thạch</span><span>✿ {available(character.resources.herbs)} dược thảo</span><span>⬡ {available(character.resources.ore)} linh thiết</span><span>✧ {available(character.resources.ink)} phù mực</span></div>
        <div className="craft-tabs"><button className={profession === 'dan' ? 'active' : ''} onClick={() => setProfession('dan')}><FlaskConical size={16} /> Luyện Đan</button><button className={profession === 'khi' ? 'active' : ''} onClick={() => setProfession('khi')}><Hammer size={16} /> Luyện Khí</button><button className={profession === 'tran' ? 'active' : ''} onClick={() => setProfession('tran')}><WandSparkles size={16} /> Trận Pháp</button></div>
        {Object.values(RECIPES).filter((recipe) => recipe.profession === profession).map((recipe) => {
          const canMake = character.devMode || Object.entries(recipe.cost).every(([key, amount]) => character.resources[key as keyof typeof character.resources] >= amount);
          const atFurnace = Math.hypot(character.position.x - NPCS.alchemist.position.x, character.position.z - NPCS.alchemist.position.z) <= 4.2;
          return <div className="recipe-card" key={recipe.id}>
            <div className="recipe-emblem">{recipe.itemId ? ITEMS[recipe.itemId]?.icon ?? CONSUMABLES[recipe.itemId as ConsumableId]?.icon ?? '✺' : '✺'}</div>
            <span className="eyebrow">{profession === 'dan' ? 'ĐAN DƯỢC' : profession === 'khi' ? 'TIÊN KHÍ' : 'PHÁP TRẬN'}</span>
            <h3>{recipe.name}</h3><p>{recipe.description}</p>
            <div className="recipe-cost">{Object.entries(recipe.cost).map(([key, amount]) => <span key={key} className={character.resources[key as keyof typeof character.resources] < amount ? 'missing' : ''}>{key === 'stones' ? '◈' : key === 'herbs' ? '✿' : key === 'ore' ? '⬡' : '✧'} {amount} {({ stones: 'linh thạch', herbs: 'dược thảo', ore: 'linh thiết', ink: 'phù mực' } as Record<string, string>)[key]}</span>)}</div>
            <button className="btn btn-gold btn-full" disabled={!connected || !canMake || recipe.station === 'alchemy' && !(atFurnace && character.scene === 'overworld' || character.devMode) || character.scene === 'tribulation' || Boolean(recipe.itemId && character.inventory.length >= 80)}
              onClick={() => onAction('craft', { recipeId: recipe.id })}>{recipe.station === 'alchemy' && !atFurnace && !character.devMode ? 'Đến Phòng Luyện Đan' : canMake ? 'Bắt đầu chế tạo' : 'Thiếu nguyên liệu'} <ArrowRight size={15} /></button>
          </div>;
        })}
        {profession === 'tran' && <div className="recipe-card formation-recipe">
          <div className="recipe-emblem"><WandSparkles size={31} /></div>
          <span className="eyebrow">TRẬN PHÁP · TRIỆU HỒI 3D</span>
          <h3>Tứ Tượng Trận</h3>
          <p>Bố trí bốn trụ pháp thuật trước mặt. Đạo hữu trong phạm vi 5m tăng 20% sát thương, giảm 20% sát thương nhận và hồi chân khí. Tồn tại 60 giây.</p>
          <div className="recipe-cost"><span>✧ 1 phù mực</span><span>◈ 3 linh thạch</span><span>25 giây hồi</span></div>
          <button className="btn btn-gold btn-full" disabled={character.resources.ink < 1 || character.resources.stones < 3 || character.scene === 'tribulation'} onClick={() => onAction('place-array')}>Bố trí trận trước mặt <ArrowRight size={15} /></button>
        </div>}
      </div>}

      {panel === 'leaderboard' && <div className="drawer-scroll">
        <p className="drawer-description">Bảng xếp hạng tu vi từ Redis · Cập nhật khi đạo hữu tu luyện và đột phá.</p>
        <div className="leaderboard-list">{leaderboard.length ? leaderboard.map((entry, i) => <div className={`leaderboard-row ${entry.id === character.id ? 'me' : ''}`} key={entry.id}>
          <span className="leaderboard-rank">{i < 3 ? <Crown size={20} /> : String(i + 1).padStart(2, '0')}</span>
          <div><strong>{entry.name}</strong><small>{REALMS[entry.realm]}</small></div>
          <b>{entry.score.toLocaleString('vi-VN')}</b>
        </div>) : <div className="empty-state"><Trophy size={27} /> Chưa có đạo hữu nào trên Thiên Kiêu Bảng.</div>}</div>
      </div>}

      {panel === 'help' && <div className="drawer-scroll">
        <p className="drawer-description">Từ một phàm nhân đến con đường đắc đạo. Thiên địa rộng lớn, hãy bắt đầu từ đây.</p>
        <div className="help-group"><div className="drawer-section-heading"><BookOpen size={16} /> ĐIỀU KHIỂN</div>
          <div className="help-row"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển · camera theo sau</span></div>
          <div className="help-row"><kbd>↔</kbd><span>Kéo chuột xoay / ngước lên nhìn bầu trời · cuộn để thu phóng</span></div>
          <div className="help-row"><kbd>E</kbd><span>Đứng gần cổng Tông Môn / Hoang Vực để dịch chuyển qua lại</span></div>
          <div className="help-row"><kbd>J</kbd><span>Chém thường (hoặc Space) · chỉ ở Hoang Vực</span></div>
          <div className="help-row"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd><span>Công pháp gán trên hotbar; cooldown do server quyết định</span></div>
          <div className="help-row"><kbd>I</kbd><kbd>Q</kbd><kbd>K</kbd><span>Túi đồ · Nhiệm vụ · Công pháp</span></div></div>
        <div className="help-group"><div className="drawer-section-heading"><Sparkles size={16} /> TÔNG MÔN & CON ĐƯỜNG TU TIÊN</div>
          <div className="help-tip"><strong>01 / Tĩnh tọa & thăng tầng</strong><p>Thu EXP tích lũy ngay cả lúc rời game (tối đa 8 giờ). Luyện Khí trở lên có 9 tầng, chi phí tăng ×5 mỗi tầng.</p></div>
          <div className="help-tip"><strong>02 / Nhiệm vụ ngày</strong><p>Đi qua cửa Nhiệm Vụ Các tới Trưởng Lão Chấp Sự ở X −17, Z 18.5 để nhận 5 nhiệm vụ mỗi ngày. Thư cần chuyển tại Chưởng Môn hoặc Cửa hàng.</p></div>
          <div className="help-tip"><strong>03 / Độ kiếp & đạo tu</strong><p>Đạt tầng 9 và đủ EXP để vượt 9 đạo lôi. Trúc Cơ Đan tăng 20% cơ hội thành công; từ Trúc Cơ chọn Kiếm, Pháp, Thể, Ngự Thú hoặc Ma Tu. Kỹ năng cấp cao chỉ dùng được khi đạt đúng đại cảnh giới.</p></div>
          <div className="help-tip"><strong>04 / Nhà riêng, hồ và Thượng Giới</strong><p>Nhà riêng Đệ Tử Xá tại X −33, Z 12: rương theo UID, nâng cấp khi thăng đại cảnh giới (+5–20% hấp thụ). Hồ Tụ Linh X −10, Z −24 thêm 15% khi AFK tại hồ. Đạt Tiên Đế tầng 9, tìm mật thất X 32, Z 20 để tái sinh một lần, +50% vĩnh viễn và mở Thượng Giới (+35% linh khí).</p></div>
          <div className="help-tip"><strong>05 / Hoang Vực · 14 sinh cảnh</strong><p>Đến Cổng Hoang Vực (X 0, Z 2), nhấn E hoặc chạm cổng để dịch chuyển. Quái từ cấp 1–8 ở 8 bãi riêng; 6 bãi cấp 9–16 thuộc Thượng Giới. Nhấp quái để chọn mục tiêu, xoay người rồi chém hoặc dùng công pháp.</p></div>
          <div className="help-tip"><strong>06 / Linh thú & luyện đan</strong><p>Ngự Thú Viện (X −17, Z −4) hướng dẫn thuần hóa: làm yếu quái còn dưới 35% HP, đứng gần và nhấn Thuần hóa trên HUD. Phòng Luyện Đan (X 17, Z −8) có ba công thức đan, yêu cầu đứng gần Đan Sư.</p></div>
        </div>
        <div className="help-group"><div className="drawer-section-heading"><BookOpen size={16} /> ĐI ĐẾN</div>
          <div className="help-links">
            <button onClick={() => onNavigate('sect')}><Crown size={16} /> Chính Điện</button>
            <button onClick={() => onNavigate('home')}><House size={16} /> Nhà riêng</button>
            <button onClick={() => onNavigate('quests')}><BookOpen size={16} /> Nhiệm vụ</button>
            <button onClick={() => onNavigate('shop')}><Gem size={16} /> Cửa hàng</button>
            <button onClick={() => onNavigate('craft')}><FlaskConical size={16} /> Chế tạo</button>
            <button onClick={() => onNavigate('alchemy')}><FlaskConical size={16} /> Luyện đan</button>
            <button onClick={() => onNavigate('beast')}><Sparkles size={16} /> Ngự thú</button>
            {character.devMode && <button onClick={() => onNavigate('dev')}><Sparkles size={16} /> Đổi nhân vật (dev)</button>}
            <button onClick={() => onNavigate('leaderboard')}><Trophy size={16} /> Xếp hạng</button>
          </div>
        </div>
        <button className="btn btn-quiet btn-full logout-button" onClick={onLogout}>Rời khỏi thế giới <ArrowRight size={15} /></button>
      </div>}

      {panel === 'admin' && <div className="drawer-scroll admin-layout">
        <div className="admin-status"><Crown size={18} /> QUYỀN NĂNG THIÊN ĐẠO <span>FIREBASE UID + CLAIM + ROLE DATABASE</span></div>
        <div className="admin-columns">
          <div className="admin-column">
            <div className="drawer-section-heading"><Users size={16} /> ĐẠO HỮU TRỰC TUYẾN <span>{roster.length}</span></div>
            <div className="admin-player-list">{roster.map((player) => <button key={player.id} className={`admin-player ${targetId === player.id ? 'selected' : ''}`} onClick={() => setTargetId(player.id)}>
              <div className="admin-avatar">{player.name.charAt(0)}</div><div><strong>{player.name}</strong><small>{REALMS[player.realm]} · {player.scene === 'tribulation' ? 'Lôi kiếp' : 'Ngoại giới'}</small></div><span className="admin-player-hp">{player.hp.toLocaleString('vi-VN')} HP</span>
            </button>)}</div>
          </div>
          <div className="admin-column">
            <div className="drawer-section-heading"><Target size={16} /> QUẢN LÝ NHÂN VẬT</div>
            {selectedPlayer ? <div className="admin-target-card">
              <span className="eyebrow">MỤC TIÊU ĐANG CHỌN</span><h3>{selectedPlayer.name}</h3>
              <div className="admin-coordinates"><MapPin size={17} /> X {selectedPlayer.position.x.toFixed(1)} <span>Y {selectedPlayer.position.y.toFixed(1)}</span> Z {selectedPlayer.position.z.toFixed(1)}</div>
              <div className="admin-actions"><button onClick={() => onAction('admin:action', { type: 'teleport-to', targetId })}><ArrowRight size={15} /> Đến chỗ họ</button><button onClick={() => onAction('admin:action', { type: 'summon', targetId })}><ArrowDownToLine size={15} /> Kéo đến đây</button><button className="danger" onClick={() => onAction('admin:action', { type: 'lightning', targetId })}><Zap size={15} /> Thiên Phạt</button></div>
            </div> : <div className="empty-state"><Users size={26} /> Chọn một người chơi để sử dụng thần quyền.</div>}
            <div className="drawer-section-heading section-separator"><Sparkles size={16} /> TRIỆU HỒI</div>
            <label className="admin-input-label">ID VẬT PHẨM</label>
            <div className="admin-input-row"><input list="admin-item-ids" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="VD: immortal_sword" /><datalist id="admin-item-ids">{Object.keys(ITEMS).map((id) => <option key={id} value={id} />)}</datalist><button onClick={() => onAction('admin:action', { type: 'spawn-item', itemId })}>Thả vật phẩm</button></div>
            <label className="admin-input-label">ID THẾ GIỚI BOSS</label>
            <div className="admin-input-row"><input value={bossId} onChange={(e) => setBossId(e.target.value)} placeholder="world-boss" /><button onClick={() => onAction('admin:action', { type: 'spawn-boss', bossId })}>Gọi Boss</button></div>
            <div className="admin-audit-note"><Flame size={15} /> Mọi lệnh được xác thực, kiểm tra whitelist và ghi nhật ký tại server.</div>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}

export function PathModal({ onSelect, onClose, devMode = false }: { onSelect: (path: Path) => void; onClose: () => void; devMode?: boolean }) {
  const paths = [
    { id: 'kiem' as const, icon: <Swords size={34} strokeWidth={1.4} />, title: 'Kiếm Tu', alias: 'VẠN KIẾM QUY TÔNG', color: '#9ee9d4', description: 'Một kiếm phá vạn pháp. Truy đuổi kẻ địch bằng kiếm khí và hitbox chính xác.', specialty: 'Sát thương vật lý · Phi kiếm' },
    { id: 'phap' as const, icon: <Flame size={34} strokeWidth={1.4} />, title: 'Pháp Tu', alias: 'THIÊN THẠCH GIÁNG THẾ', color: '#ffad81', description: 'Mượn linh khí trời đất, triệu hồi thiên thạch quét sạch chiến trường.', specialty: 'Sát thương phép · Diện rộng' },
    { id: 'the' as const, icon: <Shield size={34} strokeWidth={1.4} />, title: 'Thể Tu', alias: 'KIM CANG HỘ THỂ', color: '#f0ce88', description: 'Thân là pháp bảo. Tạo địa chấn, kiên cường và hút lại sinh lực.', specialty: 'Chống chịu · Hấp huyết' },
    { id: 'thu' as const, icon: <Sparkles size={34} strokeWidth={1.4} />, title: 'Ngự Thú', alias: 'BÁCH THÚ TRIỀU TÔNG', color: '#9ee4af', description: 'Làm quái suy yếu dưới 35% rồi thuần hóa; linh thú cùng ra trận tăng 22% sát thương.', specialty: 'Kết khế ước · Hiệp kích' },
    { id: 'ma' as const, icon: <RotateCcw size={34} strokeWidth={1.4} />, title: 'Ma Tu', alias: 'HUYẾT NGUYỆT ẤN', color: '#e89ab9', description: 'Đạo ma lấy chiến dưỡng chiến: đòn đánh hút lại 8% sát thương thành sinh lực.', specialty: 'Ma khí · Hấp huyết' },
  ];
  return <div className="path-scrim" role="dialog" aria-modal="true" aria-label="Chọn đạo tu luyện">
    <div className="path-dialog glass-panel"><button className="icon-button path-close" onClick={onClose} aria-label="Đóng"><X size={19} /></button>
      <span className="eyebrow">TRÚC CƠ ĐẠO THÀNH · NGÃ RẼ ĐỊNH MỆNH</span><h2>Ngươi sẽ đi theo <em>đạo nào?</em></h2>
      <p>{devMode ? 'Dev mode có thể đổi đạo tu và tự lĩnh ngộ kỹ năng theo cảnh giới.' : 'Đạo tu chỉ chọn một lần. Tiên đạo, ngự thú hoặc ma đạo đều có kỹ năng và lối chiến đấu riêng.'}</p>
      <div className="path-options">{paths.map((path) => <button key={path.id} className="path-option" onClick={() => onSelect(path.id)} style={{ '--path-color': path.color } as React.CSSProperties}>
        <span className="path-icon">{path.icon}</span><span className="path-alias">{path.alias}</span><strong>{path.title}</strong><span className="path-description">{path.description}</span><span className="path-specialty">{path.specialty}</span><span className="path-select">Chọn con đường này <ArrowRight size={16} /></span>
      </button>)}</div>
    </div>
  </div>;
}
