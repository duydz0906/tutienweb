import { ArrowRight, BadgeCheck, BookOpen, Crown, Feather, Gem, MapPin, Package, ScrollText, Sparkles, Swords } from 'lucide-react';
import { CONSUMABLES, DAILY_QUESTS, HOTBAR_SLOTS, ITEMS, NPCS, REALMS, RECIPES, SECT_RANK_LABEL, SHOP_STOCK, SKILLS, skillRealm,
  type DailyQuestId, type NpcId, type OwnCharacter } from '@van-thuong/shared';

const resourceNames = { stones: 'Linh Thạch', herbs: 'Dược thảo', ore: 'Linh thiết', ink: 'Phù mực' } as const;
const resourceIcons = { stones: '◈', herbs: '✿', ore: '⬡', ink: '✧' } as const;

const format = (n: number) => n.toLocaleString('vi-VN');
const balance = (c: OwnCharacter, amount: number) => c.devMode ? '∞' : format(amount);
const npcAt = (c: OwnCharacter, id: NpcId) => c.scene === ((NPCS[id] as { scene?: string }).scene ?? 'overworld') &&
  Math.hypot(c.position.x - NPCS[id].position.x, c.position.z - NPCS[id].position.z) <= 4.2;
const actionButton = 'rounded border border-amberlight/40 bg-amberlight/90 px-4 py-2 text-[11px] font-bold text-night transition hover:bg-parchment disabled:opacity-40';

export function QuestPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atElder = npcAt(c, 'quest');
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-jade/30 bg-jade/10 p-4">
      <div className="flex items-center gap-2 text-jade"><ScrollText size={20} /><strong className="text-sm">Nhiệm Vụ Các · {c.dailyDay || 'Đang tải'}</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Mỗi ngày ngẫu nhiên 5 nhiệm vụ, làm mới lúc 00:00 giờ Việt Nam. Gặp Trưởng Lão Chấp Sự để lĩnh thưởng.</p>
      <div className="mt-3 flex items-center gap-2 text-xs"><Gem size={15} className="text-amberlight" /> Cống hiến hiện có: <b className="text-amberlight">{balance(c, c.contribution)}</b></div>
      {!atElder && <p className="mt-2 text-[11px] text-amberlight"><MapPin size={12} className="inline" /> Đến Nhiệm Vụ Các tại X -17, Z 18.5 để nhận thưởng.</p>}
    </div>
    {c.dailyQuests.map((progress) => {
      const definition = DAILY_QUESTS[progress.id];
      if (!definition) return null;
      const percent = Math.min(100, progress.progress / definition.target * 100);
      return <article key={progress.id} className="rounded border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-2"><div><span className="text-[9px] font-bold tracking-widest text-jade">NHIỆM VỤ HẰNG NGÀY</span><h3 className="mt-1 text-base font-semibold text-parchment">{definition.title}</h3></div>
          {progress.claimed ? <BadgeCheck className="text-jade" size={20} /> : <span className="text-xs text-amberlight">{progress.progress}/{definition.target}</span>}</div>
        <p className="my-2 text-xs leading-5 text-slate-300">{definition.description}</p>
        <div className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full rounded bg-jade transition-all" style={{ width: `${percent}%` }} /></div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-300">
          <span>+{definition.reward.contribution} cống hiến · +{definition.reward.exp} EXP · +{definition.reward.stones} đá</span>
          <button className={actionButton} disabled={!connected || !atElder || progress.claimed || progress.progress < definition.target}
            onClick={() => onAction('quest:claim', { questId: progress.id })}>{progress.claimed ? 'Đã nhận' : 'Lĩnh thưởng'}</button>
        </div>
        {(progress.id === 'courier_master' || progress.id === 'courier_shop') && !progress.claimed && progress.progress === 0 && <button
          className="mt-3 rounded border border-jade/40 bg-jade/10 px-3 py-2 text-xs text-jade disabled:opacity-40"
          disabled={!connected || !npcAt(c, progress.id === 'courier_master' ? 'master' : 'shop')}
          onClick={() => onAction('quest:deliver', { npcId: progress.id === 'courier_master' ? 'master' : 'shop' })}>
          Chuyển thư cho {progress.id === 'courier_master' ? 'Chưởng Môn (X 0, Z 29)' : 'Trưởng Lão Hậu Cần (X 17, Z 18.5)'}
        </button>}
      </article>;
    })}
    {!c.dailyQuests.length && <div className="p-5 text-center text-sm text-slate-300">Đang nhận danh sách nhiệm vụ từ máy chủ...</div>}
  </div>;
}

export function ShopPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atShop = npcAt(c, 'shop') || npcAt(c, 'village_shop');
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-amberlight/30 bg-amberlight/10 p-4">
      <div className="flex items-center gap-2 text-amberlight"><Package size={20} /><strong className="text-sm">{c.scene === 'village' ? 'Lão Trương · Tạp Hóa Vân Cốc' : 'Trưởng Lão Hậu Cần'}</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Mua cả bốn nguyên liệu, linh thú, pháp y, đan dược, sách công pháp và đủ mọi ô trang bị — kể cả vật phẩm phi hành. Sách bậc cao cần đúng đạo tu và cảnh giới; dev mode có thể giao dịch từ xa, tài nguyên là vô hạn ảo.</p>
      <div className="mt-3 flex gap-4 text-xs"><span>◈ {balance(c, c.resources.stones)} Linh Thạch</span><span>✧ {balance(c, c.contribution)} Cống hiến</span></div>
      {!atShop && !c.devMode && <p className="mt-2 text-[11px] text-amberlight"><MapPin size={12} className="inline" /> Đến Tàng Bảo Các (X 17, Z 18.5) hoặc chợ Vân Cốc gặp Lão Trương để giao dịch.</p>}
    </div>
    {SHOP_STOCK.map((offer) => {
      const equip = offer.itemId ? ITEMS[offer.itemId] : null;
      const pill = offer.itemId && Object.hasOwn(CONSUMABLES, offer.itemId) ? CONSUMABLES[offer.itemId as keyof typeof CONSUMABLES] : null;
      const skill = offer.skillId ? SKILLS[offer.skillId] : null;
      const resource = offer.resource;
      const owned = skill && c.learnedSkills.includes(skill.id);
      const allowed = !skill || c.devMode || c.realm >= skillRealm(skill) && (!skill.path || c.path === skill.path);
      const affordable = c.devMode || c.resources.stones >= offer.stones && c.contribution >= offer.contribution;
      return <article key={offer.id} className="flex gap-3 rounded border border-white/10 bg-white/5 p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded border border-amberlight/20 bg-amberlight/10 text-2xl text-amberlight">{equip?.icon ?? pill?.icon ?? skill?.icon ?? (resource ? resourceIcons[resource] : '✦')}</span>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-parchment">{resource ? `${offer.quantity} ${resourceNames[resource]}` : equip?.name ?? pill?.name ?? skill?.name}</strong>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-jade">{resource ? 'Nguyên liệu' : skill ? 'Sách công pháp' : pill ? 'Đan dược' : 'Trang bị'}</span></div>
          <p className="my-1 text-[11px] leading-5 text-slate-300">{resource ? 'Nguyên liệu dùng cho luyện đan, luyện khí và trận pháp.' : equip?.description ?? pill?.description ?? skill?.description}{skill && ` · Mở từ ${REALMS[skillRealm(skill)]}`}</p>
          {equip?.flight && <p className="mb-1 flex items-center gap-1 text-[10px] text-jade"><Feather size={11} /> Phi hành · {equip.flight.paths ? equip.flight.paths.map((path) => ({ kiem: 'Kiếm Tu', phap: 'Pháp Tu', the: 'Thể Tu', thu: 'Ngự Thú', ma: 'Ma Tu' })[path]).join(' / ') : 'Mọi đạo tu'} · Ma Tu dùng được mọi vật phẩm</p>}
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-amberlight">{offer.stones} linh thạch{offer.contribution ? ` · ${offer.contribution} cống hiến` : ''}</span>
            <button className={actionButton} disabled={!connected || !(atShop || c.devMode && c.scene !== 'tribulation') || !affordable || Boolean(owned) || !allowed}
              onClick={() => onAction('shop:buy', { offerId: offer.id })}>{owned ? 'Đã học' : allowed ? 'Mua' : 'Chưa đủ cảnh giới/khác đạo'} <ArrowRight size={12} className="inline" /></button></div>
        </div>
      </article>;
    })}
  </div>;
}

export function SectPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atMaster = npcAt(c, 'master');
  const promotion = c.sectRank === 'outer' ? { realm: 2, cost: 50, rank: 'Nội môn' } : c.sectRank === 'inner' ? { realm: 3, cost: 150, rank: 'Chân truyền' } : null;
  const story = ['Gặp Chưởng Môn để nhận nhiệm vụ mở đầu.', `Hạ 3 yêu thú ở Hoang Vực qua cổng dịch chuyển (${Math.min(c.storyKills, 3)}/3).`,
    `Hợp sức hạ Huyền Thiên Cổ Long (${Math.min(c.bossKills, 1)}/1).`, 'Cốt truyện hiện tại đã hoàn thành.'][Math.min(3, c.storyStep)];
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-amberlight/30 bg-amberlight/10 p-4">
      <div className="flex items-center gap-2 text-amberlight"><Crown size={20} /><strong className="text-base">Chính Điện Vân Thượng</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Chưởng Môn ở X 0, Z 29 truyền thừa cốt truyện và quyết định phẩm cấp đệ tử.</p>
      <div className="mt-3 flex gap-3 text-xs"><span>{SECT_RANK_LABEL[c.sectRank]}</span><span className="text-amberlight">{balance(c, c.contribution)} điểm cống hiến</span></div>
    </div>
    <article className="rounded border border-jade/30 bg-jade/5 p-4"><span className="text-[10px] font-bold tracking-widest text-jade">CỐT TRUYỆN · CHƯƠNG {Math.min(3, c.storyStep)}/3</span>
      <h3 className="my-2 font-serif text-xl">Đạo tâm nhập môn</h3><p className="text-xs leading-6 text-slate-300">{story}</p>
      <button className={`mt-4 ${actionButton}`} disabled={!connected || !atMaster} onClick={() => onAction('sect:story')}>Đối thoại với Chưởng Môn <ArrowRight size={12} className="inline" /></button></article>
    <article className="rounded border border-white/10 bg-white/5 p-4"><span className="text-[10px] font-bold tracking-widest text-amberlight">THĂNG CẤP ĐỆ TỬ</span>
      {promotion ? <><h3 className="my-2 font-serif text-xl">Tiến lên {promotion.rank}</h3><p className="text-xs leading-6 text-slate-300">Cần {REALMS[promotion.realm]} và {promotion.cost} điểm cống hiến. Điểm được trừ khi thăng cấp.</p>
        <button className={`mt-3 ${actionButton}`} disabled={!connected || !atMaster || c.realm < promotion.realm || c.contribution < promotion.cost}
          onClick={() => onAction('sect:promote')}>Xin thăng cấp <ArrowRight size={12} className="inline" /></button></> : <p className="mt-3 text-sm text-jade">Bạn đã là đệ tử Chân truyền.</p>}
    </article>
    {c.dailyQuests.some((q) => q.id === 'courier_master' && q.progress === 0) && <button className={actionButton} disabled={!atMaster || !connected}
      onClick={() => onAction('quest:deliver', { npcId: 'master' })}>Chuyển thư nhiệm vụ hôm nay</button>}
    {!atMaster && <p className="text-xs text-amberlight"><MapPin size={12} className="inline" /> Hãy lại gần Chưởng Môn để tương tác.</p>}
  </div>;
}

export function SkillsPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const learned = c.learnedSkills.filter((id) => Object.hasOwn(SKILLS, id)).map((id) => SKILLS[id])
    .filter((skill) => (!skill.path || skill.path === c.path) && c.realm >= skillRealm(skill));
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-jade/30 bg-jade/10 p-4"><div className="flex items-center gap-2 text-jade"><BookOpen size={20} /><strong>Công Pháp đã lĩnh ngộ</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Mua sách kỹ năng tại Tàng Bảo Các, rồi gán vào một trong {HOTBAR_SLOTS} ô Hotbar (phím 1–{HOTBAR_SLOTS}). Đòn đánh thường dùng chuột trái trên bản đồ hoặc phím J; Space để nhảy.</p></div>
    <div className="grid grid-cols-3 gap-2 rounded border border-white/10 bg-white/5 p-3">
      {Array.from({ length: HOTBAR_SLOTS }, (_, slot) => <div key={slot} className="rounded border border-amberlight/20 p-2 text-center text-[10px]">
        <b className="text-amberlight">PHÍM {slot + 1}</b><div className="mt-1 min-h-[25px] text-parchment">{c.hotbar[slot] && Object.hasOwn(SKILLS, c.hotbar[slot]!) ? SKILLS[c.hotbar[slot]!].name : 'Trống'}</div>
        <button className="mt-2 text-jade disabled:opacity-30" disabled={!connected || !c.hotbar[slot]} onClick={() => onAction('assign-hotbar', { slot, skillId: null })}>Bỏ gán</button></div>)}
    </div>
    {learned.map((skill) => <article key={skill.id} className="rounded border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2"><span className="text-xl" style={{ color: skill.color }}>{skill.icon}</span><strong className="text-sm">{skill.name}</strong></div>
      <p className="my-2 text-xs leading-5 text-slate-300">{skill.description} · {skill.mana} MP · Hồi {skill.cooldown}s</p>
      <div className="flex flex-wrap gap-2">{Array.from({ length: HOTBAR_SLOTS }, (_, slot) => <button key={slot}
        className="rounded border border-jade/30 bg-jade/10 px-3 py-1.5 text-[10px] text-jade hover:border-jade disabled:opacity-40"
        disabled={!connected || c.hotbar[slot] === skill.id || c.hotbar.some((id, i) => i !== slot && id === skill.id)}
        onClick={() => onAction('assign-hotbar', { slot, skillId: skill.id })}>Gán phím {slot + 1}</button>)}</div>
    </article>)}
    {learned.length <= 1 && <div className="flex items-center gap-2 text-xs text-slate-300"><Swords size={16} /> Đạt Trúc Cơ để chọn đạo, sau đó mua sách kỹ năng ở Cửa hàng.</div>}
  </div>;
}

export function BeastPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  // Flying spirit beasts live in the mount slot but still count as linh thú for Ngự Thú.
  const pets = c.inventory.filter((owned) => ITEMS[owned.itemId]?.slot === 'pet');
  const wingedBeasts = c.inventory.filter((owned) => ITEMS[owned.itemId]?.slot === 'mount' && ITEMS[owned.itemId]?.flight?.beast);
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-jade/30 bg-jade/10 p-4"><div className="flex items-center gap-2 text-jade"><Sparkles size={20} /><strong>Ngự Thú Viện · Khế ước linh thú</strong></div>
      <p className="mt-2 text-xs leading-6 text-slate-300">Ngự Thú Sư ở X −17, Z −4. Từ Trúc Cơ, người theo Ngự Thú đạo có thể săn quái và kết khế ước: làm quái còn tối đa 35% HP, đứng cách dưới 3,5 m rồi nhấn “Thuần hóa” trên HUD. Mỗi lần tốn 3 thảo + 5 đá; thú được trang bị ngay. Đạo Ngự Thú gây thêm 22% sát thương khi mang thú.</p>
      <p className="mt-2 text-xs text-amberlight">Linh thú cao cấp cần cảnh giới không thấp hơn cấp quái trừ 2. Quái sẽ hồi sinh sau khi thuần hóa; không nhận thưởng hạ quái.</p></div>
    <div className="drawer-section-heading"><Sparkles size={16} /> LINH THÚ CỦA BẠN <span>{pets.length}</span></div>
    {pets.map((owned) => <article key={owned.instanceId} className="flex items-center gap-3 rounded border border-white/10 bg-white/5 p-3">
      <span className="text-xl text-jade">{ITEMS[owned.itemId].icon}</span><div className="min-w-0 flex-1"><strong className="text-sm">{ITEMS[owned.itemId].name}</strong><p className="text-[11px] text-slate-300">Công +{ITEMS[owned.itemId].attack} · Thủ +{ITEMS[owned.itemId].defense}</p></div>
      <button className={actionButton} disabled={!connected || c.equipment.pet === owned.instanceId || c.scene === 'tribulation'} onClick={() => onAction('equip', { instanceId: owned.instanceId })}>{c.equipment.pet === owned.instanceId ? 'Đang theo' : 'Gọi theo'}</button>
    </article>)}
    {!pets.length && <p className="text-xs leading-6 text-slate-300">Bạn chưa có thú. Có thể mua Linh Hồ ở Tàng Bảo Các hoặc thuần hóa thú ngoài bãi quái.</p>}
    <div className="drawer-section-heading"><Feather size={16} /> LINH THÚ PHI HÀNH <span>{wingedBeasts.length}</span></div>
    <p className="text-xs leading-6 text-slate-300">Thuần hóa Lôi Vũ Điêu ở Hoang Vực để nhận tọa kỵ bay; trang bị ở ô Phi hành rồi nhấn R. Linh thú bay cũng tăng 22% sát thương cho Ngự Thú và có thể ra trận cùng bạn.</p>
    {wingedBeasts.map((owned) => <article key={owned.instanceId} className="flex items-center gap-3 rounded border border-white/10 bg-white/5 p-3">
      <span className="text-xl text-jade">{ITEMS[owned.itemId].icon}</span><div className="min-w-0 flex-1"><strong className="text-sm">{ITEMS[owned.itemId].name}</strong><p className="text-[11px] text-slate-300">Phi hành · Công +{ITEMS[owned.itemId].attack} · Thủ +{ITEMS[owned.itemId].defense}</p></div>
      <button className={actionButton} disabled={!connected || c.equipment.mount === owned.instanceId || c.scene === 'tribulation'} onClick={() => onAction('equip', { instanceId: owned.instanceId })}>{c.equipment.mount === owned.instanceId ? 'Đang cưỡi' : 'Cưỡi'}</button>
    </article>)}
  </div>;
}

export function AlchemyPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atFurnace = npcAt(c, 'alchemist');
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-amberlight/30 bg-amberlight/10 p-4"><div className="flex items-center gap-2 text-amberlight"><Sparkles size={20} /><strong>Phòng Luyện Đan · Đan lô Tụ Linh</strong></div>
      <p className="mt-2 text-xs leading-6 text-slate-300">Gặp Đan Sư trong phòng phía đông nam Tông Môn (X 17, Z −8). Đan dược luyện xong vào Túi Càn Khôn và chỉ trừ nguyên liệu sau khi server kiểm tra khoảng cách, số dư và chỗ trống.</p>
      {!atFurnace && !c.devMode && <p className="mt-2 text-xs text-amberlight">Đến gần Đan Sư để vận hành đan lô.</p>}</div>
    {Object.values(RECIPES).filter((recipe) => recipe.station === 'alchemy').map((recipe) => {
      const item = recipe.itemId ? CONSUMABLES[recipe.itemId as keyof typeof CONSUMABLES] : null;
      const canMake = c.devMode || Object.entries(recipe.cost).every(([key, amount]) => c.resources[key as keyof typeof c.resources] >= amount);
      return <article key={recipe.id} className="rounded border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><span className="text-2xl text-amberlight">{item?.icon}</span><strong className="text-sm">{recipe.name}</strong></div>
        <p className="my-2 text-xs leading-5 text-slate-300">{recipe.description}</p>
        <p className="text-[11px] text-amberlight">{Object.entries(recipe.cost).map(([key, amount]) => `${amount} ${resourceNames[key as keyof typeof resourceNames]}`).join(' · ')}</p>
        <button className={`mt-3 ${actionButton}`} disabled={!connected || !canMake || !atFurnace && !c.devMode || c.inventory.length >= 80 || c.scene === 'tribulation'} onClick={() => onAction('craft', { recipeId: recipe.id })}>Luyện đan <ArrowRight size={12} className="inline" /></button>
      </article>;
    })}
  </div>;
}
