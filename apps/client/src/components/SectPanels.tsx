import { ArrowRight, BadgeCheck, BookOpen, Crown, Gem, MapPin, Package, ScrollText, Sparkles, Swords } from 'lucide-react';
import { CONSUMABLES, DAILY_QUESTS, ITEMS, NPCS, REALMS, SECT_RANK_LABEL, SHOP_STOCK, SKILLS,
  type DailyQuestId, type NpcId, type OwnCharacter } from '@van-thuong/shared';

const format = (n: number) => n.toLocaleString('vi-VN');
const near = (c: OwnCharacter, id: NpcId) => c.scene === 'overworld' &&
  Math.hypot(c.position.x - NPCS[id].position.x, c.position.z - NPCS[id].position.z) <= 4.2;
const actionButton = 'rounded border border-amberlight/40 bg-amberlight/90 px-4 py-2 text-[11px] font-bold text-night transition hover:bg-parchment disabled:opacity-40';

export function QuestPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atElder = near(c, 'quest');
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-jade/30 bg-jade/10 p-4">
      <div className="flex items-center gap-2 text-jade"><ScrollText size={20} /><strong className="text-sm">Nhiệm Vụ Các · {c.dailyDay || 'Đang tải'}</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Mỗi ngày ngẫu nhiên 5 nhiệm vụ, làm mới lúc 00:00 giờ Việt Nam. Gặp Trưởng Lão Chấp Sự để lĩnh thưởng.</p>
      <div className="mt-3 flex items-center gap-2 text-xs"><Gem size={15} className="text-amberlight" /> Cống hiến hiện có: <b className="text-amberlight">{format(c.contribution)}</b></div>
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
          disabled={!connected || !near(c, progress.id === 'courier_master' ? 'master' : 'shop')}
          onClick={() => onAction('quest:deliver', { npcId: progress.id === 'courier_master' ? 'master' : 'shop' })}>
          Chuyển thư cho {progress.id === 'courier_master' ? 'Chưởng Môn (X 0, Z 29)' : 'Trưởng Lão Hậu Cần (X 17, Z 18.5)'}
        </button>}
      </article>;
    })}
    {!c.dailyQuests.length && <div className="p-5 text-center text-sm text-slate-300">Đang nhận danh sách nhiệm vụ từ máy chủ...</div>}
  </div>;
}

export function ShopPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atShop = near(c, 'shop');
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-amberlight/30 bg-amberlight/10 p-4">
      <div className="flex items-center gap-2 text-amberlight"><Package size={20} /><strong className="text-sm">Trưởng Lão Hậu Cần</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Pháp y và vũ khí đổi vật liệu 3D khi trang bị. Mua sách công pháp để học và gán vào phím 1–4. Đan dược được lưu trong Túi đồ.</p>
      <div className="mt-3 flex gap-4 text-xs"><span>◈ {format(c.resources.stones)} Linh Thạch</span><span>✧ {format(c.contribution)} Cống hiến</span></div>
      {!atShop && <p className="mt-2 text-[11px] text-amberlight"><MapPin size={12} className="inline" /> Đến Tàng Bảo Các tại X 17, Z 18.5 để giao dịch.</p>}
    </div>
    {SHOP_STOCK.map((offer) => {
      const equip = offer.itemId ? ITEMS[offer.itemId] : null;
      const pill = offer.itemId && Object.hasOwn(CONSUMABLES, offer.itemId) ? CONSUMABLES[offer.itemId as keyof typeof CONSUMABLES] : null;
      const skill = offer.skillId ? SKILLS[offer.skillId] : null;
      const owned = skill && c.learnedSkills.includes(skill.id);
      const allowed = !skill?.path || c.realm >= 2 && c.path === skill.path;
      const affordable = c.resources.stones >= offer.stones && c.contribution >= offer.contribution;
      return <article key={offer.id} className="flex gap-3 rounded border border-white/10 bg-white/5 p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded border border-amberlight/20 bg-amberlight/10 text-2xl text-amberlight">{equip?.icon ?? pill?.icon ?? skill?.icon}</span>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-parchment">{equip?.name ?? pill?.name ?? skill?.name}</strong>
          <span className="shrink-0 text-[9px] uppercase tracking-wider text-jade">{skill ? 'Sách công pháp' : pill ? 'Đan dược' : 'Trang bị'}</span></div>
          <p className="my-1 text-[11px] leading-5 text-slate-300">{equip?.description ?? pill?.description ?? skill?.description}</p>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-amberlight">{offer.stones} linh thạch{offer.contribution ? ` · ${offer.contribution} cống hiến` : ''}</span>
            <button className={actionButton} disabled={!connected || !atShop || !affordable || Boolean(owned) || !allowed}
              onClick={() => onAction('shop:buy', { offerId: offer.id })}>{owned ? 'Đã học' : allowed ? 'Mua' : 'Khác đạo'} <ArrowRight size={12} className="inline" /></button></div>
        </div>
      </article>;
    })}
  </div>;
}

export function SectPanel({ character: c, connected, onAction }: { character: OwnCharacter; connected: boolean; onAction: (event: string, payload?: object) => void }) {
  const atMaster = near(c, 'master');
  const promotion = c.sectRank === 'outer' ? { realm: 2, cost: 50, rank: 'Nội môn' } : c.sectRank === 'inner' ? { realm: 3, cost: 150, rank: 'Chân truyền' } : null;
  const story = ['Gặp Chưởng Môn để nhận nhiệm vụ mở đầu.', `Hạ 3 yêu thú ở Hoang Vực qua cổng dịch chuyển (${Math.min(c.storyKills, 3)}/3).`,
    `Hợp sức hạ Huyền Thiên Cổ Long (${Math.min(c.bossKills, 1)}/1).`, 'Cốt truyện hiện tại đã hoàn thành.'][Math.min(3, c.storyStep)];
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-amberlight/30 bg-amberlight/10 p-4">
      <div className="flex items-center gap-2 text-amberlight"><Crown size={20} /><strong className="text-base">Chính Điện Vân Thượng</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Chưởng Môn ở X 0, Z 29 truyền thừa cốt truyện và quyết định phẩm cấp đệ tử.</p>
      <div className="mt-3 flex gap-3 text-xs"><span>{SECT_RANK_LABEL[c.sectRank]}</span><span className="text-amberlight">{format(c.contribution)} điểm cống hiến</span></div>
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
  const learned = c.learnedSkills.filter((id) => Object.hasOwn(SKILLS, id)).map((id) => SKILLS[id]);
  return <div className="drawer-scroll sect-drawer space-y-4 p-1 text-parchment">
    <div className="rounded border border-jade/30 bg-jade/10 p-4"><div className="flex items-center gap-2 text-jade"><BookOpen size={20} /><strong>Công Pháp đã lĩnh ngộ</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-300">Mua sách kỹ năng tại Tàng Bảo Các, rồi gán vào bốn ô Hotbar. Đòn đánh thường dùng phím J hoặc Space.</p></div>
    <div className="grid grid-cols-4 gap-2 rounded border border-white/10 bg-white/5 p-3">
      {Array.from({ length: 4 }, (_, slot) => <div key={slot} className="rounded border border-amberlight/20 p-2 text-center text-[10px]">
        <b className="text-amberlight">PHÍM {slot + 1}</b><div className="mt-1 min-h-[25px] text-parchment">{c.hotbar[slot] && Object.hasOwn(SKILLS, c.hotbar[slot]!) ? SKILLS[c.hotbar[slot]!].name : 'Trống'}</div>
        <button className="mt-2 text-jade disabled:opacity-30" disabled={!connected || !c.hotbar[slot]} onClick={() => onAction('assign-hotbar', { slot, skillId: null })}>Bỏ gán</button></div>)}
    </div>
    {learned.map((skill) => <article key={skill.id} className="rounded border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2"><span className="text-xl" style={{ color: skill.color }}>{skill.icon}</span><strong className="text-sm">{skill.name}</strong></div>
      <p className="my-2 text-xs leading-5 text-slate-300">{skill.description} · {skill.mana} MP · Hồi {skill.cooldown}s</p>
      <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((slot) => <button key={slot}
        className="rounded border border-jade/30 bg-jade/10 px-3 py-1.5 text-[10px] text-jade hover:border-jade disabled:opacity-40"
        disabled={!connected || c.hotbar[slot] === skill.id || c.hotbar.some((id, i) => i !== slot && id === skill.id)}
        onClick={() => onAction('assign-hotbar', { slot, skillId: skill.id })}>Gán phím {slot + 1}</button>)}</div>
    </article>)}
    {learned.length <= 1 && <div className="flex items-center gap-2 text-xs text-slate-300"><Swords size={16} /> Đạt Trúc Cơ để chọn đạo, sau đó mua sách kỹ năng ở Cửa hàng.</div>}
  </div>;
}
