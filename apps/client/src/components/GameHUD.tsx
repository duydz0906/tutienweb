import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Backpack, BookOpen, Camera, ChevronDown, ChevronRight, ChevronUp, CircleHelp, Compass, Crown, Feather, Flame,
  FlaskConical, Gem, House, MapPin, Menu, MessageCircle, Radio, RotateCcw, ScrollText, Send, Shield, Sparkles, Swords, Trophy, Waves, Wifi, WifiOff, Zap } from 'lucide-react';
import { ASCENDANT_GATE, ELEMENT_COLOR, ELEMENT_LABEL, expForStage, HABITATS, HOME_CHEST, HOME_EXIT, HOME_GATE, HOTBAR_SLOTS, ITEMS, LEVEL_CONFIG, majorBreakthroughCost, MAX_REALM, NPCS, PORTALS, REALMS, REBIRTH_ALTAR, ROOT_LABEL, SANCTUM_EXIT, SECRET_GATE, SECT_NPCS, SECT_RANK_LABEL, SKILLS, SPIRIT_LAKE, TAMEABLE_BEASTS, VILLAGE_GATE, VILLAGE_NPCS, VILLAGE_RADIUS, WORLD_RADIUS, absorptionMultiplier, canRideMount, houseAbsorptionBonus, houseLevel, inSpiritLake, isWorldZone, skillRealm,
  type ChatMessage, type NpcId, type OwnCharacter, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import type { ActivePanel } from './Panels';
import type { HudPrefs } from '../lib/uiPrefs';

const format = (value: number) => value.toLocaleString('vi-VN');

export function GameHUD({ character, world, trial, connected, cooldowns, messages, panel, selectedTarget, hudPrefs, lastCast,
  onHudPrefs, onPanel, onAction, onSkill, onAttack, onChat, onOpenPath, onPickup, now }: {
  character: OwnCharacter; world: WorldSnapshot | null; trial: TribulationState | null;
  connected: boolean; cooldowns: Record<string, number>; messages: ChatMessage[]; panel: ActivePanel; selectedTarget: string | null;
  hudPrefs: HudPrefs; lastCast: { id: number; name: string } | null; onHudPrefs: (patch: Partial<HudPrefs>) => void;
  onPanel: (panel: ActivePanel) => void; onAction: (event: string, payload?: object) => void;
  onSkill: (id: string) => void; onAttack: () => void; onChat: (text: string) => void; onOpenPath: () => void;
  onPickup: (id: string) => void; now: number;
}) {
  const [draft, setDraft] = useState('');
  const [usePill, setUsePill] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);
  const rootColor = ELEMENT_COLOR[character.root.elements[0]];
  const minorAdvance = character.realm > 0 && character.minorStage < LEVEL_CONFIG.minorStages;
  const cost = minorAdvance ? expForStage(character.minorStage) : majorBreakthroughCost(character.realm, character.minorStage) ?? 0;
  const progress = cost ? Math.min(100, character.cultivation / cost * 100) : 100;
  const inTrial = character.scene === 'tribulation';
  const inSect = character.scene === 'overworld';
  const inHome = character.scene === 'residence';
  const inSanctum = character.scene === 'sanctum';
  const inVillage = character.scene === 'village';
  const inAscendant = character.scene === 'ascendant';
  const inBattle = character.scene === 'wilderness' || inAscendant;
  const activeWorld = world?.scene === character.scene ? world : null;
  const livePosition = activeWorld?.players.find((p) => p.id === character.id)?.position ?? character.position;
  const multiplier = absorptionMultiplier({ ...character, position: livePosition });
  const rate = 2 * character.root.multiplier * multiplier;
  const pending = character.cultivationBank + Math.floor(Math.min(8 * 3600 * 1000, Math.max(0, now - character.lastCultivatedAt)) / 1000 * rate);
  const tier = houseLevel(character.devMode ? MAX_REALM : character.highestRealm);
  const atLake = inSpiritLake(character.scene, livePosition);
  const canOpenSanctum = character.rebirths > 0 || character.realm === MAX_REALM && character.minorStage === LEVEL_CONFIG.minorStages;
  const gate = isWorldZone(character.scene) ? PORTALS[character.scene] : null;
  const nearby = (target: { position: { x: number; z: number }; radius: number }) =>
    Math.hypot(livePosition.x - target.position.x, livePosition.z - target.position.z) <= target.radius;
  const nearPortal = gate && nearby(gate);
  const nearHomeGate = inSect && nearby(HOME_GATE);
  const nearSecretGate = inSect && canOpenSanctum && nearby(SECRET_GATE);
  const nearVillageGate = inSect && nearby(VILLAGE_GATE);
  const nearChest = inHome && nearby(HOME_CHEST);
  const nearHomeExit = inHome && nearby(HOME_EXIT);
  const nearSanctumExit = inSanctum && nearby(SANCTUM_EXIT);
  const nearAltar = inSanctum && !character.rebirths && nearby(REBIRTH_ALTAR);
  const nearAscendantGate = inSanctum && character.rebirths > 0 && nearby(ASCENDANT_GATE);
  const hasFoundationPill = character.inventory.some((item) => item.itemId === 'foundation_pill');
  const sceneNpcs: readonly NpcId[] = inSect ? SECT_NPCS : inVillage ? VILLAGE_NPCS : [];
  const nearNpc = sceneNpcs.find((id) => Math.hypot(livePosition.x - NPCS[id].position.x,
    livePosition.z - NPCS[id].position.z) <= 4.2);
  const npcPanel: ActivePanel = nearNpc === 'master' ? 'sect' : nearNpc === 'quest' ? 'quests' : nearNpc === 'alchemist' ? 'alchemy'
    : nearNpc === 'beast' ? 'beast' : nearNpc === 'village_elder' ? 'help' : 'shop';
  // Equipped flight gear decides whether the sky button can even be pressed.
  const mountInstance = character.inventory.find((owned) => owned.instanceId === character.equipment.mount);
  const mountItem = mountInstance ? ITEMS[mountInstance.itemId] : null;
  const canFly = Boolean(mountItem?.flight && canRideMount(character.path, mountItem, character.realm, character.devMode));
  const flying = Boolean(character.flying) && isWorldZone(character.scene);
  const boss = activeWorld?.boss;
  const focusedMonster = activeWorld?.monsters.find((m) => m.hp > 0 && m.id === selectedTarget) ??
    (inAscendant ? activeWorld?.monsters.find((m) => m.hp > 0) : undefined);
  const tameable = focusedMonster && selectedTarget === focusedMonster.id && Object.hasOwn(TAMEABLE_BEASTS, focusedMonster.kind) &&
    (character.path === 'thu' || character.devMode) && character.realm >= 2 && (character.devMode || focusedMonster.level <= character.realm + 2) &&
    focusedMonster.hp <= focusedMonster.maxHp * .35 &&
    Math.hypot(focusedMonster.position.x - livePosition.x, focusedMonster.position.z - livePosition.z) <= 3.5;
  const nearestDrop = activeWorld?.drops.find((drop) => Math.hypot(drop.position.x - livePosition.x, drop.position.z - livePosition.z) < 3.5);
  const mapRadius = inVillage ? VILLAGE_RADIUS : WORLD_RADIUS;
  const mapX = (x: number) => `${50 + x / mapRadius * 50}%`;
  const mapZ = (z: number) => `${50 - z / mapRadius * 50}%`;
  const available = (amount: number) => character.devMode ? '∞' : format(amount);
  const location = inTrial ? 'Cửu Thiên Lôi Đài' : inSect ? 'Tông Môn Vân Thượng' : inHome ? `Nhà riêng · Cấp ${tier}`
    : inSanctum ? 'Mật Thất Tái Sinh' : inAscendant ? 'Thượng Giới · Tiên Vực' : inVillage ? 'Vân Cốc · Làng dưới chân núi' : 'Hoang Vực · Bãi Quái';

  return <div className="hud" aria-label="Giao diện trò chơi">
    <header className="hud-top glass-panel">
      <div className="hud-brand"><div className="brand-seal small">雲</div><div><strong>VÂN THƯỢNG</strong><small>ONLINE · THIÊN ĐỊA VÔ TẬN</small></div></div>
      <div className="hud-divider" />
      <div className="hud-location"><MapPin size={16} /><div><small>VỊ TRÍ HIỆN TẠI</small><strong>{location}</strong></div></div>
      <div className="hud-top-right">
        <div className="resource-chip"><Gem size={16} /><strong>{available(character.resources.stones)}</strong><span>Linh thạch</span></div>
        <div className="resource-chip herbs-chip"><span>✿</span><strong>{available(character.resources.herbs)}</strong><span>Dược thảo</span></div>
        <div className="resource-chip contribution-chip"><ScrollText size={14} /><strong>{available(character.contribution)}</strong><span>Cống hiến</span></div>
        <span className={`connection-chip ${connected ? '' : 'offline'}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? 'Đã kết nối' : 'Đang kết nối'}</span>
        <button className="top-help icon-button" title="Menu & tính năng (M)" aria-label="Menu và tính năng" onClick={() => onPanel(panel === 'menu' ? null : 'menu')}><Menu size={19} /></button>
        <button className="top-help icon-button" title="Hướng dẫn" aria-label="Hướng dẫn" onClick={() => onPanel(panel === 'help' ? null : 'help')}><CircleHelp size={19} /></button>
      </div>
    </header>

    <div className="hud-left">
      <section className={`hero-card glass-panel ${hudPrefs.heroOpen ? '' : 'collapsed'}`}>
        <button className="hero-collapse" title={hudPrefs.heroOpen ? 'Thu gọn bảng nhân vật' : 'Mở rộng bảng nhân vật'}
          aria-label={hudPrefs.heroOpen ? 'Thu gọn bảng nhân vật' : 'Mở rộng bảng nhân vật'} aria-expanded={hudPrefs.heroOpen}
          onClick={() => onHudPrefs({ heroOpen: !hudPrefs.heroOpen })}>
          {hudPrefs.heroOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="hero-card-top"><div className="hero-portrait"><span>{character.name.charAt(0).toUpperCase()}</span><div className="portrait-ring" /></div><div className="hero-name-block"><div className="hero-eyebrow">{character.isAdmin ? '✦ THIÊN ĐẠO CHỦ' : character.devMode ? '✦ DEV SANDBOX' : 'ĐỆ TỬ VÂN THƯỢNG'}</div><h2>{character.name}</h2><div className="hero-realm"><span className="realm-diamond" />{REALMS[character.realm]}{character.realm ? ` · Tầng ${character.minorStage}` : ''} <span>·</span> {SECT_RANK_LABEL[character.sectRank]}</div></div></div>
        <div className="vital-row"><div className="vital-label"><span><Activity size={14} /> Sinh lực</span><b>{available(character.hp)} / {available(character.maxHp)}</b></div><div className="vital-track"><span className="vital-fill health" style={{ width: `${Math.max(0, character.hp / character.maxHp * 100)}%` }} /></div></div>
        <div className="vital-row"><div className="vital-label"><span><Sparkles size={14} /> Chân khí</span><b>{available(character.mp)} / {available(character.maxMp)}</b></div><div className="vital-track"><span className="vital-fill mana" style={{ width: `${Math.max(0, character.mp / character.maxMp * 100)}%` }} /></div></div>
        {hudPrefs.heroOpen && <>
          <div className="root-banner" style={{ '--root-accent': rootColor } as React.CSSProperties}><span className="root-glyph">✥</span><div><small>BẢN MỆNH LINH CĂN</small><strong>{ROOT_LABEL[character.root.tier]}</strong><span>{character.root.elements.map((element) => ELEMENT_LABEL[element]).join(' · ')} · ×{character.root.multiplier.toFixed(1)} hấp thu</span></div></div>
          <button className="appearance-open" onClick={() => onPanel('home')}><House size={14} /> Nhà cấp {tier} · +{Math.round(houseAbsorptionBonus(tier - 1) * 100)}% hấp thụ <span>✧</span></button>
          {character.devMode && <button className="appearance-open dev-open" onClick={() => onPanel('dev')}><Sparkles size={14} /> Dev mode · teleport & đổi nhân vật <span>✦</span></button>}
          <button className="appearance-open" onClick={() => onPanel('menu')}><Menu size={14} /> Menu tính năng · nhà, công pháp, nhiệm vụ, cửa hàng <span>⌘</span></button>
        </>}
        {!hudPrefs.heroOpen && <button className="hero-preview" title="Mở Menu tính năng (M)" onClick={() => onPanel('menu')}>
          <Menu size={13} /> Menu <kbd>M</kbd></button>}
      </section>

      <section className={`cultivate-card glass-panel ${hudPrefs.cultivateOpen ? '' : 'collapsed'}`}>
        <div className="card-eyebrow"><Sparkles size={14} /> TU LUYỆN <span>AFK / IDLE</span>
          <button className="card-collapse" title={hudPrefs.cultivateOpen ? 'Rút gọn bảng tu luyện (T)' : 'Mở rộng bảng tu luyện (T)'}
            aria-label={hudPrefs.cultivateOpen ? 'Rút gọn bảng tu luyện' : 'Mở rộng bảng tu luyện'}
            onClick={() => onHudPrefs({ cultivateOpen: !hudPrefs.cultivateOpen })}>
            {hudPrefs.cultivateOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        <div className="cultivate-title"><strong>{cost ? minorAdvance ? `${REALMS[character.realm]} · Tầng ${character.minorStage + 1}` : `Đột phá ${REALMS[character.realm + 1]}` : 'Tiên Đế Đỉnh Phong'}</strong><span>{cost ? `${format(character.cultivation)} / ${format(cost)} EXP` : 'Viên mãn'}</span></div>
        <div className="cultivate-progress"><span style={{ width: `${progress}%` }} /></div>
        {hudPrefs.cultivateOpen && <>
          <div className="cultivate-info"><span><span className="pulse-dot" /> Tích lũy: <b>+{format(pending)}</b> tu vi</span><small>{rate.toFixed(1)}/giây · +{Math.round((multiplier - 1) * 100)}% · 8 giờ</small></div>
          {atLake && <div className="lake-bonus"><Waves size={14} /> Đang AFK tại Hồ Tụ Linh · +15% linh khí</div>}
          {Boolean(character.rebirths) && <div className="rebirth-bonus"><RotateCcw size={14} /> Đã tái sinh · +50% vĩnh viễn{inAscendant ? ' · Thượng Giới +35%' : ''}</div>}
          <div className="cultivate-actions"><button className="btn btn-teal" disabled={!connected || inTrial || pending < 1} onClick={() => onAction('cultivate')}><Sparkles size={15} /> Thu linh khí</button><button className="btn btn-outline-gold" disabled={!connected || inTrial || !cost || character.cultivation < cost}
            onClick={() => onAction(minorAdvance ? 'advance-stage' : 'breakthrough', minorAdvance ? {} : { usePill: usePill && hasFoundationPill })}><Zap size={15} /> {minorAdvance ? 'Thăng tầng' : 'Độ kiếp'}</button></div>
          {cost > 0 && !minorAdvance && !inTrial && <label className="foundation-option"><input type="checkbox" disabled={!hasFoundationPill} checked={hasFoundationPill && usePill} onChange={(e) => setUsePill(e.target.checked)} />
            {hasFoundationPill ? 'Dùng Trúc Cơ Đan · +20% cơ hội thành công' : 'Không có Trúc Cơ Đan · tỉ lệ thành công 75%'}</label>}
        </>}
      </section>

      <button className={`flight-toggle glass-panel ${flying ? 'active' : ''}`} disabled={!connected || !canFly || inTrial || character.hp <= 0}
        title={mountItem ? `${mountItem.name} · nhấn R để bay hoặc hạ xuống` : 'Trang bị vật phẩm phi hành trong ô Phi hành'}
        onClick={() => onAction('flight:toggle')}>
        <span className="flight-icon"><Feather size={18} /></span>
        <span className="flight-text"><strong>{flying ? 'Đang phi hành' : 'Phi hành'}</strong>
          <small>{!mountItem ? 'Chưa có vật phẩm phi hành' : !canRideMount(character.path, mountItem, character.realm, character.devMode) ? `${mountItem.name} · không hợp đạo tu` : mountItem.name}</small></span>
        <kbd>R</kbd>
      </button>

      {character.realm >= 2 && !character.path && <button className="path-prompt" onClick={onOpenPath}><span className="path-prompt-icon"><Swords size={22} /></span><span><strong>Đã đạt Trúc Cơ!</strong><small>Chọn con đường tu luyện của bạn</small></span><ArrowRight size={17} /></button>}
      {nearestDrop && !inTrial && <button className="loot-prompt" onClick={() => onPickup(nearestDrop.id)}><Sparkles size={17} /> Nhặt {ITEMS[nearestDrop.itemId]?.name ?? 'vật phẩm'} <span>↵</span></button>}
      {tameable && focusedMonster && <button className="loot-prompt tame-prompt" disabled={!connected || character.inventory.length >= 80} onClick={() => onAction('beast:tame', { targetId: focusedMonster.id })}><Sparkles size={17} /> Thuần hóa {focusedMonster.name} · 3 thảo + 5 đá <span>↵</span></button>}
    </div>

    <div className="hud-right">
      {hudPrefs.minimap && <section className="minimap-card glass-panel">
        <div className="map-top"><span><Compass size={15} /> BẢN ĐỒ KHU VỰC</span><span>{inTrial ? 'LÔI ĐÀI' : inSect ? 'TÔNG MÔN' : inHome ? 'NHÀ RIÊNG' : inSanctum ? 'MẬT THẤT' : inAscendant ? 'THƯỢNG GIỚI' : inVillage ? 'VÂN CỐC' : 'HOANG VỰC'}</span></div>
        <div className={`minimap ${inSect || inVillage ? '' : 'wilderness'}`}>
          <span className="map-compass">BẮC ↑</span><div className="map-path" />
          {inSect && <><div className="map-temple" title="Chính Điện" style={{ left: mapX(0), top: mapZ(30) }}>⌂</div>
            <span className="map-npc" title="Đệ Tử Xá · Nhà riêng" style={{ left: mapX(HOME_GATE.position.x), top: mapZ(HOME_GATE.position.z) }}>⌂</span>
            <span className="map-npc" title="Hồ Tụ Linh +15%" style={{ left: mapX(SPIRIT_LAKE.position.x), top: mapZ(SPIRIT_LAKE.position.z) }}>≈</span>
            <span className="map-npc" title="Sơn đạo xuống Vân Cốc" style={{ left: mapX(VILLAGE_GATE.position.x), top: mapZ(VILLAGE_GATE.position.z) }}>⛰</span>
            {canOpenSanctum && <span className="map-portal" title="Mật Thất Tái Sinh" style={{ left: mapX(SECRET_GATE.position.x), top: mapZ(SECRET_GATE.position.z) }}>✧</span>}</>}
          {sceneNpcs.map((id) => <span key={id} className="map-npc"
            title={`${NPCS[id].name} · ${NPCS[id].role}`} style={{ left: mapX(NPCS[id].position.x), top: mapZ(NPCS[id].position.z) }}>✶</span>)}
          {inBattle && HABITATS.filter((habitat) => habitat.scene === character.scene).map((habitat) =>
            <span key={habitat.id} className="map-habitat" title={`${habitat.name} · Cấp ${habitat.level}`}
              style={{ left: mapX(habitat.center.x), top: mapZ(habitat.center.z), '--habitat-color': habitat.color } as React.CSSProperties}>{habitat.level}</span>)}
          {gate && <span className="map-portal" title={`${gate.name} · X ${gate.position.x}, Z ${gate.position.z}`}
            style={{ left: mapX(gate.position.x), top: mapZ(gate.position.z) }}>◈</span>}
          {!inSect && !inVillage && !inTrial && boss && boss.hp > 0 && <span className="map-boss" title="Huyền Thiên Cổ Long"
            style={{ left: mapX(boss.position.x), top: mapZ(boss.position.z) }}>✦</span>}
          {activeWorld?.players.filter((p) => p.id !== character.id).map((p) => <span key={p.id} className="map-ally" title={p.name}
            style={{ left: mapX(p.position.x), top: mapZ(p.position.z) }} />)}
          <span className="map-me" title={character.name} style={{ left: mapX(livePosition.x), top: mapZ(livePosition.z) }} />
        </div>
        <div className="map-footer"><span><span className="legend-dot player" /> Bạn</span>
          {isWorldZone(character.scene) && <span className="portal-legend">◈ Cổng dịch chuyển</span>}
          {inBattle && <span>① Bãi quái (cấp)</span>}
          {character.scene === 'wilderness' && <span><span className="legend-dot boss" /> Boss</span>}</div>
      </section>}
      {inSect ? <section className="zone-card glass-panel">
        <div className="zone-card-heading"><span className="zone-emblem">◈</span><div><small>ĐƯỜNG ĐẾN BÃI QUÁI</small><strong>Cổng Hoang Vực</strong></div></div>
        <p>Tông Môn trên đỉnh núi là khu an toàn. Hồ Tụ Linh ở <b>X −10, Z −24</b> tăng 15% khi AFK. Nhà riêng tại <b>X −33, Z 12</b>. Bãi quái ở <b>X 0, Z 2</b>.</p>
        <button className="zone-card-button" disabled={!connected || !nearPortal || character.hp <= 0} onClick={() => onAction('portal:travel')}>
          {nearPortal ? 'Dịch chuyển đến Hoang Vực' : 'Hãy đến gần cổng · X 0, Z 2'} <ArrowRight size={14} />
        </button>
        <button className="zone-card-button housing-entry" disabled={!connected || !nearHomeGate || character.hp <= 0} onClick={() => onAction('home:enter')}>
          {nearHomeGate ? 'Bước vào Đệ Tử Xá' : 'Đệ Tử Xá · X −33, Z 12 (đến gần để vào)'} <House size={14} />
        </button>
        <button className="zone-card-button village-entry" disabled={!connected || !nearVillageGate || character.hp <= 0} onClick={() => onAction('village:enter')}>
          {nearVillageGate ? 'Xuống núi tới Vân Cốc' : 'Sơn đạo xuống làng · X 0, Z −50'} <span aria-hidden="true">⛰</span> <ArrowRight size={14} />
        </button>
      </section> : inVillage ? <section className="zone-card glass-panel village-card">
        <div className="zone-card-heading"><span className="zone-emblem">⌂</span><div><small>LÀNG VÂN CỐC · DƯỚI CHÂN NÚI</small><strong>Chợ làng & Lý trưởng</strong></div></div>
        <p>Khu làng an toàn, không có yêu thú. <b>Lão Trương</b> bán trang bị còn thiếu và mọi vật phẩm phi hành; <b>Lý trưởng</b> chỉ đường về sơn môn. Cổng về Tông Môn ở <b>X 0, Z −24</b>.</p>
        <button className="zone-card-button" disabled={!connected || character.scene === 'tribulation'} onClick={() => onPanel('shop')}>Mở cửa hàng Vân Cốc <ArrowRight size={14} /></button>
        <button className="zone-card-button housing-entry" disabled={!connected || !nearPortal || character.hp <= 0} onClick={() => onAction('portal:travel')}>
          {nearPortal ? 'Trở về sơn đạo Tông Môn' : 'Đến Cổng Về Tông Môn · X 0, Z −24'} <ArrowRight size={14} />
        </button>
      </section> : inHome || inSanctum ? <section className="zone-card glass-panel">
        <div className="zone-card-heading"><span className="zone-emblem">{inHome ? '⌂' : '✧'}</span><div><small>{inHome ? 'KHÔNG GIAN RIÊNG · CHỈ MỘT CHỦ NHÂN' : 'TIÊN ĐẾ TẦNG 9 · MẬT THẤT'}</small><strong>{inHome ? `Rương đồ · Nhà cấp ${tier}` : 'Tái Sinh Đài'}</strong></div></div>
        <p>{inHome ? `Đến gần rương (X 4, Z −2) để cất đồ. Hấp thụ từ nhà +${Math.round(houseAbsorptionBonus(tier - 1) * 100)}%.` : character.rebirths ? 'Bạn đã tái sinh. Cổng Thượng Giới ở X 5, Z −3 đã mở.' : 'Đến Tái Sinh Đài ở X 0, Z −3 để chọn tái sinh một lần.'}</p>
        <button className="zone-card-button" onClick={() => onPanel(inHome ? 'home' : 'rebirth')}>
          {inHome ? 'Xem rương cá nhân' : 'Xem lựa chọn tái sinh'} <ArrowRight size={14} />
        </button>
      </section> : !inTrial ? <section className="boss-card glass-panel"><div className="boss-card-header"><div className="boss-emblem"><Flame size={22} /></div><div><small>{inAscendant ? 'YÊU THÚ · THƯỢNG GIỚI' : focusedMonster ? 'MỤC TIÊU · HOANG VỰC' : 'THẾ GIỚI BOSS · NGOẠI GIỚI'}</small><strong>{focusedMonster?.name ?? (inAscendant ? 'Linh thú đang tái sinh' : 'Huyền Thiên Cổ Long')}</strong></div><span className="boss-level">LV. {focusedMonster?.level ?? 88}</span></div>
        {focusedMonster ? <><div className="boss-health-heading"><span>SINH LỰC YÊU THÚ</span><b>{format(focusedMonster.hp)} / {format(focusedMonster.maxHp)}</b></div><div className="vital-track boss-health"><span className="vital-fill" style={{ width: `${focusedMonster.hp / focusedMonster.maxHp * 100}%` }} /></div><div className="boss-tip"><Swords size={14} /> Chuột trái / J: chém thường · Space: nhảy · 1–9: công pháp</div></> : boss && boss.hp > 0 ? <><div className="boss-health-heading"><span>SINH LỰC CỔ LONG</span><b>{format(boss.hp)} / {format(boss.maxHp)}</b></div><div className="vital-track boss-health"><span className="vital-fill" style={{ width: `${boss.hp / boss.maxHp * 100}%` }} /></div><div className="boss-tip"><Swords size={14} /> Đi theo lối đá đến Long Vực và xuất chiêu</div></> : <div className="boss-defeated"><Sparkles size={15} /> {inAscendant ? 'Tiên thú đang hồi sinh. Hãy hái tiên thảo hoặc tĩnh tọa (+35%).' : `Đã bị đánh bại · Hồi sinh sau ${Math.max(0, Math.ceil(((boss?.respawnAt ?? now) - now) / 1000))}s`}</div>}
      </section> : <section className="trial-card glass-panel"><div className="trial-card-head"><Zap size={20} /> CỬU THIÊN LÔI KIẾP</div><div className="trial-wave">Đạo lôi <strong>{Math.min((trial?.wave ?? 0) + 1, 9)} / 9</strong></div><div className="trial-pips">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < (trial?.wave ?? 0) ? 'done' : i === (trial?.wave ?? 0) ? 'current' : ''} />)}</div><p>{trial?.phase === 'warning' ? '⚠ VÙNG ĐỎ! Di chuyển khỏi tâm lôi ngay!' : trial?.phase === 'strike' ? 'Thiên lôi vừa giáng xuống!' : 'Chuẩn bị... Quan sát mặt đất và né tránh.'}</p>
        <button className="btn btn-outline-gold btn-full guard-button" disabled={!connected || !character.equipment.artifact || character.mp < 18 || trial?.guarding || (cooldowns.trial_guard ?? 0) > now} onClick={() => onAction('guard')}>
          <Shield size={14} /> {trial?.guarding ? 'Pháp bảo đang hộ thể' : (cooldowns.trial_guard ?? 0) > now ? `Hồi pháp bảo ${Math.ceil((cooldowns.trial_guard - now) / 1000)}s` : 'Xuất Pháp Bảo · F'}
        </button>
        {!character.equipment.artifact && <small className="guard-hint">Chế tạo và trang bị Bản Mệnh Châu để đỡ lôi.</small>}
      </section>}
      {/* The old "Tông Môn" card in image-2 is hidden by default; Menu now owns those shortcuts. */}
      {hudPrefs.questCard && <section className="quest-card glass-panel"><div className="card-eyebrow"><BookOpen size={14} /> TÔNG MÔN <span>{SECT_RANK_LABEL[character.sectRank].toUpperCase()}</span></div>
        <div className="quest-title">{character.storyStep < 3 ? `Cốt truyện · Chương ${character.storyStep}/3` : 'Đạo tâm đã thành'}</div>
        <p>{character.storyStep === 0 ? 'Gặp Chưởng Môn trong Chính Điện (X 0, Z 29) để bắt đầu hành trình.' : character.storyStep === 1 ? `Qua Cổng Hoang Vực · Hạ ${Math.min(character.storyKills, 3)}/3 yêu thú.` : character.storyStep === 2 ? 'Đến Long Vực ở Hoang Vực để đánh bại Huyền Thiên Cổ Long.' : 'Hoàn thành 5 nhiệm vụ hằng ngày để tích lũy cống hiến.'}</p>
        {inBattle && <div className="quest-route">◈ Trở về: {inAscendant ? 'Cổng Quy Sơn' : 'Cổng Hồi Tông'} · X 0, Z 34</div>}
        <div className="quest-status"><span className="quest-status-circle">✓</span>{character.dailyQuests.filter((q) => q.claimed).length}/5 nhiệm vụ đã lĩnh thưởng <ChevronRight size={15} /></div>
        <button className="quest-open-menu" onClick={() => onPanel('menu')}>Mở menu tính năng <ArrowRight size={13} /></button>
      </section>}
    </div>

    {nearNpc && <div className="nearby-interaction glass-panel">
      <span className="text-[9px] font-bold tracking-widest text-jade">NPC GẦN BẠN · {NPCS[nearNpc].name}</span>
      <button onClick={() => onPanel(npcPanel)}>{NPCS[nearNpc].role} <ArrowRight size={13} /></button>
    </div>}
    {nearPortal && gate && <div className="nearby-interaction portal-interaction glass-panel">
      <span className="portal-overline">◈ {gate.name.toUpperCase()} · X {gate.position.x}, Z {gate.position.z}</span>
      <button disabled={!connected || character.hp <= 0} onClick={() => onAction('portal:travel')}>
        {inSect ? 'Đến bãi quái Hoang Vực' : inVillage ? 'Trở về Tông Môn' : 'Trở về Tông Môn'} <kbd>E</kbd> <ArrowRight size={13} />
      </button>
    </div>}
    {nearVillageGate && <div className="nearby-interaction portal-interaction glass-panel">
      <span className="portal-overline">⛰ SƠN ĐẠO · X 0, Z −50</span>
      <button disabled={!connected || character.hp <= 0} onClick={() => onAction('village:enter')}>Xuống núi tới Vân Cốc <kbd>E</kbd> <ArrowRight size={13} /></button>
    </div>}

    {(nearHomeGate || nearSecretGate || nearChest || nearHomeExit || nearSanctumExit || nearAltar || nearAscendantGate) &&
      <div className="nearby-interaction portal-interaction glass-panel">
        <span className="portal-overline">{nearHomeGate ? '⌂ ĐỆ TỬ XÁ' : nearSecretGate ? '✧ MẬT THẤT TÁI SINH' : nearChest ? '⌂ RƯƠNG CÁ NHÂN' : nearAltar ? '✧ TÁI SINH ĐÀI' : nearAscendantGate ? '◈ CỔNG THƯỢNG GIỚI' : '◈ CỬA PHÒNG'}</span>
        <button disabled={!connected || character.hp <= 0} onClick={() => {
          if (nearHomeGate) onAction('home:enter');
          else if (nearSecretGate) onAction('sanctum:enter');
          else if (nearChest) onPanel('home');
          else if (nearAltar) onPanel('rebirth');
          else if (nearAscendantGate) onAction('sanctum:ascend');
          else if (nearHomeExit) onAction('home:exit');
          else if (nearSanctumExit) onAction('sanctum:exit');
        }}>{nearHomeGate ? 'Bước vào nhà riêng' : nearSecretGate ? 'Mở mật thất' : nearChest ? 'Xem kho riêng' : nearAltar ? 'Lựa chọn tái sinh' : nearAscendantGate ? 'Đến Thượng Giới' : 'Trở về Tông Môn'} <kbd>E</kbd> <ArrowRight size={13} /></button>
      </div>}

    <div className="hud-bottom">
      <section className={`chat-card glass-panel ${hudPrefs.chatOpen ? '' : 'collapsed'}`}>
        <div className="chat-heading"><span><MessageCircle size={15} /> TRUYỀN ÂM <span className="chat-world-tag">THẾ GIỚI</span></span>
          <span className="chat-heading-actions"><Radio size={15} />
            <button className="chat-toggle" title={hudPrefs.chatOpen ? 'Ẩn chat (C)' : 'Hiện chat (C)'} aria-label={hudPrefs.chatOpen ? 'Ẩn chat' : 'Hiện chat'}
              onClick={() => onHudPrefs({ chatOpen: !hudPrefs.chatOpen })}>{hudPrefs.chatOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
          </span>
        </div>
        {hudPrefs.chatOpen ? <>
          <div className="chat-messages">{messages.length === 0 && <div className="chat-empty">Giang hồ rộng lớn. Hãy gửi lời chào đầu tiên!</div>}{messages.slice(-40).map((msg) => <div className={`chat-message ${msg.system ? 'system' : ''}`} key={msg.id}><span>{msg.system ? 'Thiên đạo' : msg.name}</span> {msg.text}</div>)}<div ref={chatEnd} /></div>
          <form className="chat-input" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { onChat(draft.trim()); setDraft(''); } }}><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nói điều gì đó với đạo hữu..." maxLength={160} aria-label="Nội dung chat" /><button type="submit" aria-label="Gửi tin nhắn" disabled={!connected}><Send size={16} /></button></form>
        </> : messages.length > 0 && <div className="chat-last">{messages.at(-1)?.text}</div>}
      </section>

      <section className="hotbar">
        <div className="hotbar-caption"><span /> PHÁP QUYẾT & THẦN THÔNG <span /></div>
        {lastCast && <div className="cast-flash" role="status">{lastCast.name}</div>}
        <div className="hotbar-slots">
          <button className="skill-slot basic-slot" disabled={!connected || !inBattle || character.hp <= 0} onClick={onAttack} title="Đòn đánh thường · chuột trái trên bản đồ hoặc phím J · Hoang Vực và Thượng Giới">
            <kbd>J</kbd><span className="skill-symbol"><Swords size={26} /></span>{hudPrefs.skillLabels && <span className="skill-name">Chém thường</span>}<span className="skill-mana">0 MP</span>
          </button>
          {Array.from({ length: HOTBAR_SLOTS }, (_, index) => {
            const id = character.hotbar[index];
            const skill = id && Object.hasOwn(SKILLS, id) ? SKILLS[id] : null;
            const remaining = skill && !character.devMode ? Math.max(0, Math.ceil(((cooldowns[skill.id] ?? 0) - now) / 1000)) : 0;
            return <button key={index} className={`skill-slot ${!skill || skill && (character.realm < skillRealm(skill) || skill.path && skill.path !== character.path) ? 'locked' : ''} ${skill?.ultimate ? 'ultimate' : ''}`}
              disabled={!skill || !connected || character.realm < skillRealm(skill) || Boolean(skill.path && skill.path !== character.path) || !isWorldZone(character.scene) || ((inSect || inVillage) && skill.id !== 'healing_bloom') || character.hp <= 0 || Boolean(remaining)}
              onClick={() => skill && onSkill(skill.id)} title={skill ? `${skill.name} — ${skill.description} (từ ${REALMS[skillRealm(skill)]}; ${skill.mana} MP)` : 'Mở Menu → Công pháp để gán phím'}>
              <kbd>{index + 1}</kbd><span className="skill-symbol" style={{ color: skill?.color }}>{skill?.icon ?? '⊘'}</span>{hudPrefs.skillLabels && <span className="skill-name">{skill?.name ?? 'Chưa gán'}</span>}
              {/* A cooling skill only shows its remaining seconds inside the slot. */}
              {Boolean(remaining) && <span className="skill-cooldown">{remaining}</span>}{skill && hudPrefs.skillLabels && <span className="skill-mana">{skill.mana} MP</span>}
            </button>;
          })}
          <div className="hotbar-divider" />
          <button className={`utility-slot ${panel === 'inventory' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'inventory' ? null : 'inventory')} title="Túi đồ (I)"><Backpack size={20} /><span>Túi đồ</span><kbd>I</kbd></button>
          <button className={`utility-slot flight-slot ${flying ? 'selected' : ''}`} disabled={!canFly} onClick={() => onAction('flight:toggle')} title={canFly ? `${mountItem?.name} · phi hành (R)` : 'Trang bị vật phẩm phi hành để bay'}>
            <Feather size={20} /><span>Phi hành</span><kbd>R</kbd>
          </button>
          <button className={`utility-slot camera-slot ${hudPrefs.cameraLock ? 'selected' : ''}`} onClick={() => onHudPrefs({ cameraLock: !hudPrefs.cameraLock })}
            aria-pressed={hudPrefs.cameraLock} title={hudPrefs.cameraLock ? 'Đang khóa góc nhìn TPP · nhấn Y để xoay tự do' : 'Khóa góc nhìn thứ 3 bám sau lưng (Y)'}>
            <Camera size={20} /><span>{hudPrefs.cameraLock ? 'TPP khóa' : 'TPP'}</span><kbd>Y</kbd>
          </button>
          <button className={`utility-slot ${panel === 'menu' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'menu' ? null : 'menu')} title="Menu: nhà riêng, công pháp, nhiệm vụ, cửa hàng, cài đặt (M)"><Menu size={20} /><span>Menu</span><kbd>M</kbd></button>
        </div>
      </section>
      <div className="hud-corner"><div className="corner-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Di chuyển <span>·</span> Chuột trái: chém <span>·</span> Kéo chuột phải: xoay <span>·</span> <kbd>Y</kbd> khóa TPP <span>·</span> <kbd>Space</kbd> nhảy</div>{character.isAdmin && <button className="admin-shortcut" onClick={() => onPanel(panel === 'admin' ? null : 'admin')}><Crown size={14} /> THIÊN ĐẠO <kbd>Ctrl Shift F12</kbd></button>}</div>
    </div>
  </div>;
}
