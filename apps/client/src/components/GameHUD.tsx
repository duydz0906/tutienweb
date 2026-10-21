import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Backpack, BookOpen, ChevronRight, CircleHelp, Compass, Crown, Flame,
  FlaskConical, Gem, MapPin, MessageCircle, Radio, ScanFace, ScrollText, Send, Shield, Sparkles, Store, Swords, Trophy, Wifi, WifiOff, Zap } from 'lucide-react';
import { ELEMENT_COLOR, ELEMENT_LABEL, expForStage, ITEMS, LEVEL_CONFIG, majorBreakthroughCost, NPCS, PORTALS, REALMS, ROOT_LABEL, SECT_RANK_LABEL, SKILLS,
  type ChatMessage, type NpcId, type OwnCharacter, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import type { ActivePanel } from './Panels';

const format = (value: number) => value.toLocaleString('vi-VN');

export function GameHUD({ character, world, trial, connected, cooldowns, messages, panel, selectedTarget, onPanel, onAction, onSkill, onAttack, onChat, onOpenPath, onPickup, now }: {
  character: OwnCharacter; world: WorldSnapshot | null; trial: TribulationState | null;
  connected: boolean; cooldowns: Record<string, number>; messages: ChatMessage[]; panel: ActivePanel; selectedTarget: string | null;
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
  const pending = Math.floor(Math.min(8 * 3600 * 1000, Math.max(0, now - character.lastCultivatedAt)) / 1000 * 2 * character.root.multiplier);
  const inTrial = character.scene === 'tribulation';
  const inSect = character.scene === 'overworld';
  const activeWorld = world?.scene === character.scene ? world : null;
  const livePosition = activeWorld?.players.find((p) => p.id === character.id)?.position ?? character.position;
  const gate = character.scene === 'tribulation' ? null : PORTALS[character.scene];
  const nearPortal = gate && Math.hypot(livePosition.x - gate.position.x,
    livePosition.z - gate.position.z) <= gate.radius;
  const hasFoundationPill = character.inventory.some((item) => item.itemId === 'foundation_pill');
  const nearNpc = inSect && (Object.keys(NPCS) as NpcId[]).find((id) => Math.hypot(livePosition.x - NPCS[id].position.x,
    livePosition.z - NPCS[id].position.z) <= 4.2);
  const npcPanel = nearNpc === 'master' ? 'sect' : nearNpc === 'quest' ? 'quests' : 'shop';
  const boss = activeWorld?.boss;
  const focusedMonster = activeWorld?.monsters.find((m) => m.hp > 0 && m.id === selectedTarget);
  const nearestDrop = activeWorld?.drops.find((drop) => Math.hypot(drop.position.x - livePosition.x, drop.position.z - livePosition.z) < 3.5);
  const mapX = (x: number) => `${50 + x / 90 * 100}%`;
  const mapZ = (z: number) => `${50 - z / 90 * 100}%`;
  const available = (amount: number) => character.devMode ? '∞' : format(amount);

  return <div className="hud" aria-label="Giao diện trò chơi">
    <header className="hud-top glass-panel">
      <div className="hud-brand"><div className="brand-seal small">雲</div><div><strong>VÂN THƯỢNG</strong><small>ONLINE · THIÊN ĐỊA VÔ TẬN</small></div></div>
      <div className="hud-divider" />
      <div className="hud-location"><MapPin size={16} /><div><small>VỊ TRÍ HIỆN TẠI</small><strong>{inTrial ? 'Cửu Thiên Lôi Đài' : inSect ? 'Tông Môn Vân Thượng' : 'Hoang Vực · Bãi Quái'}</strong></div></div>
      <div className="hud-top-right">
        <div className="resource-chip"><Gem size={16} /><strong>{available(character.resources.stones)}</strong><span>Linh thạch</span></div>
        <div className="resource-chip herbs-chip"><span>✿</span><strong>{available(character.resources.herbs)}</strong><span>Dược thảo</span></div>
        <div className="resource-chip contribution-chip"><ScrollText size={14} /><strong>{available(character.contribution)}</strong><span>Cống hiến</span></div>
        <span className={`connection-chip ${connected ? '' : 'offline'}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? 'Đã kết nối' : 'Đang kết nối'}</span>
        <button className="top-help icon-button" title="Hướng dẫn" aria-label="Hướng dẫn" onClick={() => onPanel(panel === 'help' ? null : 'help')}><CircleHelp size={19} /></button>
      </div>
    </header>

    <div className="hud-left">
      <section className="hero-card glass-panel">
        <div className="hero-card-top"><div className="hero-portrait"><span>{character.name.charAt(0).toUpperCase()}</span><div className="portrait-ring" /></div><div className="hero-name-block"><div className="hero-eyebrow">{character.isAdmin ? '✦ THIÊN ĐẠO CHỦ' : character.devMode ? '✦ DEV SANDBOX' : 'ĐỆ TỬ VÂN THƯỢNG'}</div><h2>{character.name}</h2><div className="hero-realm"><span className="realm-diamond" />{REALMS[character.realm]}{character.realm ? ` · Tầng ${character.minorStage}` : ''} <span>·</span> {SECT_RANK_LABEL[character.sectRank]}</div></div></div>
        <div className="vital-row"><div className="vital-label"><span><Activity size={14} /> Sinh lực</span><b>{available(character.hp)} / {available(character.maxHp)}</b></div><div className="vital-track"><span className="vital-fill health" style={{ width: `${Math.max(0, character.hp / character.maxHp * 100)}%` }} /></div></div>
        <div className="vital-row"><div className="vital-label"><span><Sparkles size={14} /> Chân khí</span><b>{available(character.mp)} / {available(character.maxMp)}</b></div><div className="vital-track"><span className="vital-fill mana" style={{ width: `${Math.max(0, character.mp / character.maxMp * 100)}%` }} /></div></div>
        <div className="root-banner" style={{ '--root-accent': rootColor } as React.CSSProperties}><span className="root-glyph">✥</span><div><small>BẢN MỆNH LINH CĂN</small><strong>{ROOT_LABEL[character.root.tier]}</strong><span>{character.root.elements.map((element) => ELEMENT_LABEL[element]).join(' · ')} · ×{character.root.multiplier.toFixed(1)} hấp thu</span></div></div>
        <button className="appearance-open" disabled={inTrial} onClick={() => onPanel('appearance')}><ScanFace size={14} /> Đổi dung mạo <span>✧</span></button>
      </section>

      <section className="cultivate-card glass-panel">
        <div className="card-eyebrow"><Sparkles size={14} /> TU LUYỆN <span>AFK / IDLE</span></div>
        <div className="cultivate-title"><strong>{cost ? minorAdvance ? `${REALMS[character.realm]} · Tầng ${character.minorStage + 1}` : `Đột phá ${REALMS[character.realm + 1]}` : 'Tiên Đế Đỉnh Phong'}</strong><span>{cost ? `${format(character.cultivation)} / ${format(cost)} EXP` : 'Viên mãn'}</span></div>
        <div className="cultivate-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="cultivate-info"><span><span className="pulse-dot" /> Tích lũy: <b>+{format(pending)}</b> tu vi</span><small>{(2 * character.root.multiplier).toFixed(1)}/giây · tối đa 8 giờ</small></div>
        <div className="cultivate-actions"><button className="btn btn-teal" disabled={!connected || inTrial || pending < 1} onClick={() => onAction('cultivate')}><Sparkles size={15} /> Thu linh khí</button><button className="btn btn-outline-gold" disabled={!connected || inTrial || !cost || character.cultivation < cost}
          onClick={() => onAction(minorAdvance ? 'advance-stage' : 'breakthrough', minorAdvance ? {} : { usePill: usePill && hasFoundationPill })}><Zap size={15} /> {minorAdvance ? 'Thăng tầng' : 'Độ kiếp'}</button></div>
        {cost > 0 && !minorAdvance && !inTrial && <label className="foundation-option"><input type="checkbox" disabled={!hasFoundationPill} checked={hasFoundationPill && usePill} onChange={(e) => setUsePill(e.target.checked)} />
          {hasFoundationPill ? 'Dùng Trúc Cơ Đan · +20% cơ hội thành công' : 'Không có Trúc Cơ Đan · tỉ lệ thành công 75%'}</label>}
      </section>
      {character.realm >= 2 && !character.path && <button className="path-prompt" onClick={onOpenPath}><span className="path-prompt-icon"><Swords size={22} /></span><span><strong>Đã đạt Trúc Cơ!</strong><small>Chọn con đường tu luyện của bạn</small></span><ArrowRight size={17} /></button>}
      {nearestDrop && !inTrial && <button className="loot-prompt" onClick={() => onPickup(nearestDrop.id)}><Sparkles size={17} /> Nhặt {ITEMS[nearestDrop.itemId]?.name ?? 'vật phẩm'} <span>↵</span></button>}
    </div>

    <div className="hud-right">
      <section className="minimap-card glass-panel">
        <div className="map-top"><span><Compass size={15} /> BẢN ĐỒ KHU VỰC</span><span>{inTrial ? 'LÔI ĐÀI' : inSect ? 'TÔNG MÔN' : 'HOANG VỰC'}</span></div>
        <div className={`minimap ${inSect ? '' : 'wilderness'}`}>
          <span className="map-compass">BẮC ↑</span><div className="map-path" />
          {inSect && <div className="map-temple" title="Chính Điện">⌂</div>}
          {inSect && (Object.keys(NPCS) as NpcId[]).map((id) => <span key={id} className="map-npc"
            title={`${NPCS[id].name} · ${NPCS[id].role}`} style={{ left: mapX(NPCS[id].position.x), top: mapZ(NPCS[id].position.z) }}>✶</span>)}
          {gate && <span className="map-portal" title={`${gate.name} · X ${gate.position.x}, Z ${gate.position.z}`}
            style={{ left: mapX(gate.position.x), top: mapZ(gate.position.z) }}>◈</span>}
          {!inSect && !inTrial && boss && boss.hp > 0 && <span className="map-boss" title="Huyền Thiên Cổ Long"
            style={{ left: mapX(boss.position.x), top: mapZ(boss.position.z) }}>✦</span>}
          {activeWorld?.players.filter((p) => p.id !== character.id).map((p) => <span key={p.id} className="map-ally" title={p.name}
            style={{ left: mapX(p.position.x), top: mapZ(p.position.z) }} />)}
          <span className="map-me" title={character.name} style={{ left: mapX(livePosition.x), top: mapZ(livePosition.z) }} />
        </div>
        <div className="map-footer"><span><span className="legend-dot player" /> Bạn</span>
          <span className="portal-legend">◈ Cổng dịch chuyển</span>
          {!inSect && !inTrial && <span><span className="legend-dot boss" /> Boss</span>}</div>
      </section>
      {inSect ? <section className="zone-card glass-panel">
        <div className="zone-card-heading"><span className="zone-emblem">◈</span><div><small>ĐƯỜNG ĐẾN BÃI QUÁI</small><strong>Cổng Hoang Vực</strong></div></div>
        <p>Tông Môn là khu an toàn. Đi đến <b>X 0, Z 2</b> rồi nhấn <kbd>E</kbd> hoặc chạm cổng để săn quái, hái thảo.</p>
        <button className="zone-card-button" disabled={!connected || !nearPortal || character.hp <= 0} onClick={() => onAction('portal:travel')}>
          {nearPortal ? 'Dịch chuyển đến Hoang Vực' : 'Hãy đến gần cổng · X 0, Z 2'} <ArrowRight size={14} />
        </button>
      </section> : !inTrial ? <section className="boss-card glass-panel"><div className="boss-card-header"><div className="boss-emblem"><Flame size={22} /></div><div><small>{focusedMonster ? 'MỤC TIÊU · HOANG VỰC' : 'THẾ GIỚI BOSS · NGOẠI GIỚI'}</small><strong>{focusedMonster?.name ?? 'Huyền Thiên Cổ Long'}</strong></div><span className="boss-level">LV. {focusedMonster?.level ?? 88}</span></div>
        {focusedMonster ? <><div className="boss-health-heading"><span>SINH LỰC YÊU THÚ</span><b>{format(focusedMonster.hp)} / {format(focusedMonster.maxHp)}</b></div><div className="vital-track boss-health"><span className="vital-fill" style={{ width: `${focusedMonster.hp / focusedMonster.maxHp * 100}%` }} /></div><div className="boss-tip"><Swords size={14} /> Phím J / Space: chém thường · 1–4: công pháp</div></> : boss && boss.hp > 0 ? <><div className="boss-health-heading"><span>SINH LỰC CỔ LONG</span><b>{format(boss.hp)} / {format(boss.maxHp)}</b></div><div className="vital-track boss-health"><span className="vital-fill" style={{ width: `${boss.hp / boss.maxHp * 100}%` }} /></div><div className="boss-tip"><Swords size={14} /> Đi theo lối đá đến Long Vực và xuất chiêu</div></> : <div className="boss-defeated"><Sparkles size={15} /> Đã bị đánh bại · Hồi sinh sau {Math.max(0, Math.ceil(((boss?.respawnAt ?? now) - now) / 1000))}s</div>}
      </section> : <section className="trial-card glass-panel"><div className="trial-card-head"><Zap size={20} /> CỬU THIÊN LÔI KIẾP</div><div className="trial-wave">Đạo lôi <strong>{Math.min((trial?.wave ?? 0) + 1, 9)} / 9</strong></div><div className="trial-pips">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < (trial?.wave ?? 0) ? 'done' : i === (trial?.wave ?? 0) ? 'current' : ''} />)}</div><p>{trial?.phase === 'warning' ? '⚠ VÙNG ĐỎ! Di chuyển khỏi tâm lôi ngay!' : trial?.phase === 'strike' ? 'Thiên lôi vừa giáng xuống!' : 'Chuẩn bị... Quan sát mặt đất và né tránh.'}</p>
        <button className="btn btn-outline-gold btn-full guard-button" disabled={!connected || !character.equipment.artifact || character.mp < 18 || trial?.guarding || (cooldowns.trial_guard ?? 0) > now} onClick={() => onAction('guard')}>
          <Shield size={14} /> {trial?.guarding ? 'Pháp bảo đang hộ thể' : (cooldowns.trial_guard ?? 0) > now ? `Hồi pháp bảo ${Math.ceil((cooldowns.trial_guard - now) / 1000)}s` : 'Xuất Pháp Bảo · F'}
        </button>
        {!character.equipment.artifact && <small className="guard-hint">Chế tạo và trang bị Bản Mệnh Châu để đỡ lôi.</small>}
      </section>}
      <section className="quest-card glass-panel"><div className="card-eyebrow"><BookOpen size={14} /> TÔNG MÔN <span>{SECT_RANK_LABEL[character.sectRank].toUpperCase()}</span></div>
        <div className="quest-title">{character.storyStep < 3 ? `Cốt truyện · Chương ${character.storyStep}/3` : 'Đạo tâm đã thành'}</div>
        <p>{character.storyStep === 0 ? 'Gặp Chưởng Môn trong Chính Điện (X 0, Z 29) để bắt đầu hành trình.' : character.storyStep === 1 ? `Qua Cổng Hoang Vực · Hạ ${Math.min(character.storyKills, 3)}/3 yêu thú.` : character.storyStep === 2 ? 'Đến Long Vực ở Hoang Vực để đánh bại Huyền Thiên Cổ Long.' : 'Hoàn thành 5 nhiệm vụ hằng ngày để tích lũy cống hiến.'}</p>
        {!inSect && !inTrial && <div className="quest-route">◈ Trở về: Cổng Hồi Tông ở X 0, Z 34</div>}
        <div className="quest-status"><span className="quest-status-circle">✓</span>{character.dailyQuests.filter((q) => q.claimed).length}/5 nhiệm vụ đã lĩnh thưởng <ChevronRight size={15} /></div>
        <div className="sect-menu"><button onClick={() => onPanel('sect')}>Chính Điện</button><button onClick={() => onPanel('quests')}>Nhiệm vụ</button><button onClick={() => onPanel('shop')}>Cửa hàng</button></div>
      </section>
    </div>

    {nearNpc && <div className="nearby-interaction glass-panel">
      <span className="text-[9px] font-bold tracking-widest text-jade">NPC GẦN BẠN · {NPCS[nearNpc].name}</span>
      <button onClick={() => onPanel(npcPanel)}>{NPCS[nearNpc].role} <ArrowRight size={13} /></button>
    </div>}
    {nearPortal && gate && <div className="nearby-interaction portal-interaction glass-panel">
      <span className="portal-overline">◈ {gate.name.toUpperCase()} · X {gate.position.x}, Z {gate.position.z}</span>
      <button disabled={!connected || character.hp <= 0} onClick={() => onAction('portal:travel')}>
        {inSect ? 'Đến bãi quái Hoang Vực' : 'Trở về Tông Môn'} <kbd>E</kbd> <ArrowRight size={13} />
      </button>
    </div>}

    <div className="hud-bottom">
      <section className="chat-card glass-panel"><div className="chat-heading"><span><MessageCircle size={15} /> TRUYỀN ÂM <span className="chat-world-tag">THẾ GIỚI</span></span><Radio size={15} /></div>
        <div className="chat-messages">{messages.length === 0 && <div className="chat-empty">Giang hồ rộng lớn. Hãy gửi lời chào đầu tiên!</div>}{messages.slice(-40).map((msg) => <div className={`chat-message ${msg.system ? 'system' : ''}`} key={msg.id}><span>{msg.system ? 'Thiên đạo' : msg.name}</span> {msg.text}</div>)}<div ref={chatEnd} /></div>
        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { onChat(draft.trim()); setDraft(''); } }}><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nói điều gì đó với đạo hữu..." maxLength={160} aria-label="Nội dung chat" /><button type="submit" aria-label="Gửi tin nhắn" disabled={!connected}><Send size={16} /></button></form>
      </section>

      <section className="hotbar"><div className="hotbar-caption"><span /> PHÁP QUYẾT & THẦN THÔNG <span /></div><div className="hotbar-slots">
        <button className="skill-slot basic-slot" disabled={!connected || character.scene !== 'wilderness' || character.hp <= 0} onClick={onAttack} title="Đòn đánh thường (J / Space) · chỉ dùng ở Hoang Vực">
          <kbd>J</kbd><span className="skill-symbol"><Swords size={26} /></span><span className="skill-name">Chém thường</span><span className="skill-mana">0 MP</span>
        </button>
        {[0, 1, 2, 3].map((index) => {
          const id = character.hotbar[index];
          const skill = id && Object.hasOwn(SKILLS, id) ? SKILLS[id] : null;
          const remaining = skill && !character.devMode ? Math.max(0, Math.ceil(((cooldowns[skill.id] ?? 0) - now) / 1000)) : 0;
          return <button key={index} className={`skill-slot ${!skill ? 'locked' : ''} ${skill?.ultimate ? 'ultimate' : ''}`} disabled={!skill || !connected || inTrial || (inSect && skill.id !== 'healing_bloom') || character.hp <= 0 || Boolean(remaining)} onClick={() => skill && onSkill(skill.id)} title={skill ? `${skill.name} — ${skill.description} (${skill.mana} MP)` : 'Mở Công Pháp để gán phím'}>
            <kbd>{index + 1}</kbd><span className="skill-symbol" style={{ color: skill?.color }}>{skill?.icon ?? '⊘'}</span><span className="skill-name">{skill?.name ?? 'Chưa gán'}</span>
            {Boolean(remaining) && <span className="skill-cooldown">{remaining}</span>}{skill && <span className="skill-mana">{skill.mana} MP</span>}
          </button>;
        })}
        <div className="hotbar-divider" /><button className={`utility-slot ${panel === 'inventory' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'inventory' ? null : 'inventory')} title="Túi đồ (I)"><Backpack size={20} /><span>Túi đồ</span><kbd>I</kbd></button>
        <button className={`utility-slot ${panel === 'skills' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'skills' ? null : 'skills')} title="Công pháp (K)"><BookOpen size={20} /><span>Công pháp</span></button>
        <button className={`utility-slot ${panel === 'quests' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'quests' ? null : 'quests')} title="Nhiệm vụ (Q)"><ScrollText size={20} /><span>Nhiệm vụ</span></button>
        <button className={`utility-slot ${panel === 'shop' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'shop' ? null : 'shop')} title="Cửa hàng (gần NPC)"><Store size={20} /><span>Cửa hàng</span></button>
        <button className={`utility-slot auxiliary-slot ${panel === 'craft' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'craft' ? null : 'craft')} title="Chế tạo"><FlaskConical size={20} /><span>Chế tạo</span></button>
        <button className={`utility-slot auxiliary-slot ${panel === 'leaderboard' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'leaderboard' ? null : 'leaderboard')} title="Xếp hạng"><Trophy size={20} /><span>Xếp hạng</span></button>
        <button className={`utility-slot ${panel === 'help' ? 'selected' : ''}`} onClick={() => onPanel(panel === 'help' ? null : 'help')} title="Menu đầy đủ: chế tạo, xếp hạng và hướng dẫn"><CircleHelp size={20} /><span>Menu</span></button>
      </div></section>
      <div className="hud-corner"><div className="corner-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Di chuyển <span>·</span> Kéo chuột: xoay</div>{character.isAdmin && <button className="admin-shortcut" onClick={() => onPanel(panel === 'admin' ? null : 'admin')}><Crown size={14} /> THIÊN ĐẠO <kbd>Ctrl Shift F12</kbd></button>}</div>
    </div>
  </div>;
}
