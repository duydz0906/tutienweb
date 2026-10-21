# Vân Thượng Online · Web game tu tiên 3D

Một **vertical slice MMORPG 3D chơi được trên trình duyệt**: tạo nhân vật nam/nữ và rút Linh Căn một lần; khám phá **Tông Môn** (Chính Điện, Nhiệm Vụ Các, Quảng Trường), **Hoang Vực** với quái/thảo dược hồi sinh, 5 nhiệm vụ ngẫu nhiên mỗi ngày, NPC bán đồ/công pháp/đan dược, trang bị đổi mesh, combat server hitbox, tu luyện tầng 1–9 và đột phá đại cảnh giới, lôi kiếp, chat cùng nhiều người chơi và `/devmode` chỉ cho admin đã xác thực cả token lẫn role trong database.

> Đây là nền tảng **một world process**, chưa phải dịch vụ MMO production nhiều shard. Boss/quái/thảo/đồ rơi/instance đang ở bộ nhớ của world server; nhân vật, trang bị, quest và trạng thái `/devmode` ở MongoDB, tọa độ/scene, cooldown và xếp hạng ở Redis trong cấu hình triển khai. Các giới hạn mở rộng nằm ở cuối tài liệu.

## 1. Cấu trúc thư mục — bắt đầu từ Scene 3D

```text
.
├── apps/
│   ├── client/                         # React + Vite + React Three Fiber
│   │   ├── public/human/                # Mesh/morph/skin/tóc/pháp y người thật CC0, tự host
│   │   └── src/
│   │       ├── game/
│   │       │   ├── SceneEngine.ts       # Scene, GLTFLoader, ánh sáng/bóng, WASD Vector3, camera bám
│   │       │   ├── Avatar.tsx           # HumanForge Mixamo rig riêng/người, trang bị và hiệu ứng
│   │       │   ├── humanAppearance.ts   # Male/female mesh, tóc, khuôn mặt, body morph
│   │       │   ├── WorldDecor.tsx       # Núi, kiến trúc, boss, ấn trận, thiên lôi
│   │       │   ├── SectScene.tsx        # NPC/đệ tử HumanForge, Chính Điện, quảng trường an toàn
│   │       │   ├── Wilderness.tsx       # Quái theo cấp, linh thảo, target 3D
│   │       │   ├── CombatEffects.tsx    # Kiếm trail, vòng thi triển, particle, damage billboard
│   │       │   ├── Billboard.tsx        # Tên NPC/quái & text nổi trên thế giới
│   │       │   ├── sound.ts             # Web Audio chém kiếm trên user gesture
│   │       │   ├── BloomEffects.tsx     # Bloom lazy-loaded cho desktop
│   │       │   └── WorldScene.tsx       # Canvas R3F, snapshot, camera
│   │       ├── components/              # Creator, HUD, SectPanels (quest/shop/sect/skills), admin
│   │       ├── lib/                     # REST, Firebase Auth lazy-loaded
│   │       ├── App.tsx                  # Luồng đăng nhập → tạo → vào game; Socket.IO
│   │       └── styles.css
│   └── server/                          # Express + Socket.IO + Firebase Admin
│       └── src/
│           ├── auth.ts                  # verifyIdToken + custom claim + UID pin
│           ├── db/
│           │   ├── models.ts           # Mongoose User, Character, Equipment
│           │   ├── store.ts            # MongoStore / MemoryStore chơi thử
│           │   └── cache.ts            # Redis / cache chơi thử
│           ├── game/
│           │   ├── rules.ts            # RNG, EXP ×5, chỉ số, hitbox, inventory
│           │   ├── sect.ts             # Rút 5 nhiệm vụ/ngày (UTC+7), điểm và NPC proximity
│           │   ├── devMode.ts          # Bật/tắt và backup trạng thái Tiên Đế 9
│           │   ├── World.ts            # Tick server, quest, shop, quái, lôi kiếp, admin
│           │   └── *.test.ts           # Unit + Socket.IO integration tests
│           └── index.ts                # REST, websocket, static build
├── packages/shared/src/index.ts        # Wire types, 10 slot, item, NPC, quest, skill, shop
├── packages/shared/src/level_config.json # 12 cảnh giới, 9 tầng, EXP ×5, thưởng HP/MP
├── scripts/sync-human-assets.mjs       # Đồng bộ subset CC0 từ HumanForge nếu muốn tái tạo asset
├── scripts/prepare-dev.mjs             # Kiểm tra/cài lại dependency dev bị thiếu sau khi pull
├── scripts/grant-admin.mjs             # Gán claim Firebase + role MongoDB
├── compose.yaml                        # MongoDB/Redis chỉ bind localhost
└── .env.example                        # Mẫu biến môi trường, KHÔNG có bí mật
```

**File tạo Scene đầu tiên**: [`apps/client/src/game/SceneEngine.ts`](apps/client/src/game/SceneEngine.ts). `SceneEngine` nhận Scene/Camera/Canvas từ R3F, khởi tạo HemisphereLight/DirectionalLight và shadow map, tải `.glb`/`.gltf` bằng `GLTFLoader`, chuẩn hóa vector WASD, chạy camera bám và xoay/zoom bằng chuột. Camera và prediction chỉ để hiển thị: tọa độ hợp lệ luôn được tính lại ở server. `Avatar.tsx` dùng HumanForge/MakeHuman (CC0) để dựng mesh **người thật có xương Mixamo và morph khuôn mặt/vóc dáng**, riêng biệt theo giới tính, từ bộ asset tự host; mỗi người có skeleton/mesh riêng, tóc và trang phục theo lựa chọn, trang bị gắn vào xương tay/đầu. NPC và đệ tử cũng dùng mesh HumanForge với diện mạo/giới tính riêng, không dùng mô hình người ghép hình khối. `SceneEngine.loadGLTF()` vẫn hỗ trợ tải thêm GLTF/GLB cho môi trường hoặc vật phẩm.

## 2. Chạy ngay — bản chơi thử không cần cloud

Yêu cầu **Node.js >= 20**, npm. Từ thư mục gốc:

```bash
npm install
npm run dev
```

Sau khi `git pull`/đổi nhánh, thư mục `node_modules` cũ có thể **chưa có `tailwindcss`/`postcss`**, dù chúng đã được khai báo trong `apps/client/package.json` và `package-lock.json`. `npm run dev` nay kiểm tra và tự chạy `npm install --include=dev` **trước khi khởi động Vite** nếu thiếu dependency; bạn cũng có thể cài lại thủ công (Windows CMD/PowerShell đều chạy được):

```bash
npm ci --include=dev
npm run dev
```

Nếu npm không có Internet hoặc quá trình cài thất bại, sửa lỗi npm được in ở bước cài rồi chạy lại hai lệnh trên. Không cần cài Tailwind global, không cần sửa PostCSS config, và không xóa source hoặc `.git`.

Mở **http://localhost:5173** (trong Arena dùng live preview cổng **5173**). Vite proxy `/api` và `/socket.io` về Express cổng **3001**, trình duyệt chỉ dùng đường dẫn tương đối, không gọi `localhost` để tới backend. Khi không có `.env` và không phải `NODE_ENV=production`, server tự mở demo; hoặc `cp .env.example .env` và giữ `DEMO_MODE=true`. Bấm **Bước vào chơi thử**, chọn nam/nữ, 7 kiểu tóc, 8 màu tóc, 4 khuôn mặt, sắc da, chiều cao/vóc dáng rồi rút Linh Căn. Nút **Xem cận khuôn mặt** cho phép xem thay đổi trực tiếp. Nhấn **Bước vào Vân Thượng** và đợi kết nối world; có nút thử lại khi mất kết nối. Dữ liệu demo nằm trong RAM và **mất khi restart**; phiên demo **không bao giờ có quyền admin**. Trong demo có thể đặt tên `Daniel965` để chơi, nhưng đó chỉ là tên hiển thị, hoàn toàn không cấp quyền admin; ở production tên này chỉ dành cho UID đã được xác thực.

```bash
npm test           # 18 test: RNG, 12 cảnh giới, quests UTC+7, shop, hotbar, anti-spoof, /devmode
npm run typecheck  # TypeScript cho client và server
npm run build      # Kiểm tra kiểu + đóng gói client
```

### Hướng dẫn nhanh trong game

- **WASD / phím mũi tên**: di chuyển; **kéo chuột**: xoay camera; **cuộn**: zoom. **J/Space** chém thường, **1–4** dùng công pháp trong hotbar, **I** túi đồ, **Q** nhiệm vụ, **K** công pháp. Có thể nhấp quái để chọn mục tiêu, nhấp thảo dược để hái. Nút **Đổi dung mạo** vẫn chỉnh trực tiếp nam/nữ, tóc/mặt/vóc dáng; trong lôi kiếp không đổi được. Mobile có cần điều khiển ảo và nút chạm đánh/skill.
- **Tông Môn** là khu an toàn: từ cổng (Z 2) đi tới **Chính Điện** (Chưởng Môn X 0, Z 29) để nhận truyện diệt quái/Boss và xin thăng **Ngoại môn → Nội môn → Chân truyền**; **Nhiệm Vụ Các** (Trưởng Lão Chấp Sự X −8, Z 14) lĩnh thưởng; **Tàng Bảo Các** (Trưởng Lão Hậu Cần X 8, Z 14) mua đồ, sách, đan. Quảng Trường có đệ tử đi tuần/tọa thiền và vòng linh khí. NPC phải ở trong bán kính 4,2m mới cho thao tác; mở bảng từ HUD ở xa chỉ để xem.
- **Nhiệm vụ ngày**: máy chủ rút đúng **5 nhiệm vụ không trùng** mỗi ngày, reset **00:00 Việt Nam (UTC+7)**, ví dụ hái 10 thảo, giết 20 Linh Lang, chuyển thư tới NPC; lĩnh tại Nhiệm Vụ Các để nhận EXP, linh thạch và **điểm cống hiến**. Điểm mua đồ hiếm hoặc thăng bậc đệ tử. Shop có pháp y thay màu/material trên nhân vật, kiếm, sách công pháp học/gán hotbar, đan hồi HP/MP, **Trúc Cơ Đan** dùng lúc bắt đầu độ kiếp để tăng 20 điểm phần trăm thành công.
- **Tiến cấp**: Phàm Nhân cần 35 EXP để nhập Luyện Khí tầng 1. Mỗi đại cảnh giới từ Luyện Khí tới Tiên Đế có **9 tầng**; tầng 1→2 cần 100 EXP, rồi **500 → 2.500 → 12.500 → 62.500 → 312.500 → 1.562.500 → 7.812.500**, tầng 9 đột phá đại cảnh giới cần **39.062.500 EXP**. Chuỗi 100×5^(tầng−1) bắt đầu lại ở cảnh giới mới. Thăng tiểu tầng nhận +10 Max HP/+20 Max MP; qua đại cảnh giới sau **9 đạo lôi** và roll thành công (75%, có Trúc Cơ Đan tối đa 95%) nhận **vĩnh viễn +100 Max HP/+200 Max MP**. Thu linh khí AFK tối đa 8 giờ. Trang bị **Bản Mệnh Châu**, nhấn **F** để chắn một tia sét.
- **Hoang Vực** ở phía nam cổng (Z < 2): bãi Linh Lang/Thiết Giáp Trư/U Ảnh theo cấp, linh thảo và quái tự hồi sinh; hitbox, vị trí/HP quái, crit và chiến lợi phẩm tính trên server. Kiếm trail + âm thanh chém, vòng thi triển/pháp trận, sét/particle và text damage nổi là hiệu ứng 3D. Boss đánh trả theo chu kỳ; chiến thắng nhận EXP/nguyên liệu/trang bị rơi. **Chế tạo** Luyện Đan, Luyện Khí, Trận Pháp; Tứ Tượng Trận buff đồng đội 60 giây.
- Mở hai tab trình duyệt, tạo hai phiên chơi thử để thấy nhân vật, máu quái, đòn đánh và chat đồng bộ qua Socket.IO.

## 3. Kiến trúc và dữ liệu

| Thành phần | Trách nhiệm |
|---|---|
| Client Three.js / R3F + React/Tailwind | HumanForge/MakeHuman CC0 rigged mesh cho người chơi **và NPC/đệ tử**, nam/nữ có hình thể/da/pháp y riêng, morph khuôn mặt và vóc dáng; Tông Môn/Hoang Vực, bóng đổ, bloom, kiếm trail, magic circle, damage billboard/crit. React HUD/panels dùng Tailwind utilities (không reset CSS game). DPR giới hạn `1..1.65`. |
| Express REST | `/api/health`, `/api/demo/session` (chỉ dev), `/api/me`, `POST /api/characters` (idempotent), **`GET /api/quests/daily`** (token bắt buộc, chỉ nhân vật của UID đã xác thực), `/api/leaderboard`. JSON tối đa 16 KB. |
| Socket.IO world | Tick 20 Hz, snapshot 10 Hz (vị trí/HP **quái** và thảo, người chơi, Boss); server hitbox line/sphere/cone, safe zone, quest/shop/NPC, hotbar, mana/cooldown Redis, AFK, 9 sóng lôi kiếp, đồ rơi, `/devmode` và hành động admin. |
| MongoDB/Mongoose | `User` (Firebase UID unique, provider, **role cấp riêng bằng script sau khi xác minh Firebase**, đăng nhập lại không tái cấp role bị thu hồi); `Character` (UID unique, giới tính, ngoại hình, Linh Căn, **realm + minorStage**, HP/MP/Max HP/Max MP, `position:{x,y,z}`, scene, EXP, điểm cống hiến, cấp đệ tử, cốt truyện, ngày + tiến trình 5 quest, skills/hotbar, inventory/equipment và bản sao trạng thái trước dev mode); `Equipment` là view được index cho trang bị thuộc sở hữu. |
| Redis | Sorted set `rank:cultivation`, hash tên/cảnh giới, tọa độ + scene TTL 30s ở `scene:<characterId>`, cooldown skill atomic `SET NX PX` để reconnect không reset thời gian hồi. |
| Firebase Auth | Đăng nhập Google OAuth hoặc Email/Password cùng một giao diện; Admin SDK **xác minh ID token, kiểm tra revoked**, mới suy ra quyền từ custom claim + UID pinned. Mật khẩu không qua game server. |

**Linh Căn** dùng `crypto.randomInt(10_000)` bên server: `[0,5999]` Tạp (60%); `[6000,8999]` Chân (30%); `[9000,9899]` Thiên (9%); `[9900,9999]` Biến Dị (1%, Băng/Phong/Lôi/Ám/Quang). Unique index một nhân vật/Firebase UID và POST lặp trả nhân vật cũ, không cho rút lại. `claim` dùng timestamp server, giữ phần dư sub-second, giới hạn offline 8 giờ.

**Combat**: Client chỉ gửi `input:{x,z,rotation}`, `basic-attack` hoặc `cast:{skillId,targetId}`. Client gửi `position`, `damage`, `role`, `isAdmin`, `success` đều bị bỏ qua; server xác định tâm AoE từ tọa độ thật/quái, kiểm tra hitbox trên mặt phẳng `x,z`, safe zone, phòng thủ, chí mạng và HP Boss/quái. Cooldown áp dụng atomic ở Redis. Vượt đại cảnh giới **chỉ ghi sau khi server giải quyết đủ 9 tia sét và roll thành công**; ngắt kết nối hủy instance chứ không cấp cảnh giới. `packages/shared/src/level_config.json` là nguồn cấu hình EXP/chỉ số; mã server và UI dùng cùng quy tắc.

Socket events client: `input`, `basic-attack`, `cast`, `cultivate`, `advance-stage`, `breakthrough:{usePill}`, `guard`, `choose-path`, `gather:{nodeId}`, `quest:deliver`, `quest:claim`, `sect:story`, `sect:promote`, `shop:buy`, `use-item`, `assign-hotbar`, `craft`, `place-array`, `equip`, `appearance:update`, `pickup`, `chat`, `admin:action`. Server phát `world` (bao gồm `monsters`, `herbs`, `boss`, `players`), `character`, `tribulation`, `combat`, `cooldowns`, `notice`, `chat`; riêng admin còn nhận `admin:players`. Admin actions hỗ trợ `teleport-to`, `summon`, `lightning`, `spawn-item` (ID whitelist), `spawn-boss` (ID `world-boss`).

## 4. Firebase + MongoDB + Redis, tài khoản quản trị

**Không** lưu mật khẩu admin vào mã nguồn, giao diện đăng nhập, seed, `.env` hay database game. Mật khẩu đã chia sẻ qua hội thoại nên **hãy đổi mật khẩu trước khi dùng môi trường thật**. Tài khoản `daniel965` đăng nhập **cùng giao diện** với mọi người, không có nút Admin trên trang đăng nhập:

1. Tạo Firebase project; bật **Google** và, nếu muốn dùng mật khẩu, **Email/Password** trong Firebase Authentication. Tạo/liên kết một Firebase user cho `daniel965` bằng email của riêng bạn; xác minh email. Đặt mật khẩu trong **Firebase Console** hoặc luồng quản trị riêng, **không** đưa vào repo. Firebase email/password yêu cầu **email**, không đăng nhập bằng tên hiển thị; server tự dùng tên nhân vật `daniel965` cho UID admin.
2. Dùng `cp .env.example .env`, đặt `DEMO_MODE=false`, `FIREBASE_PROJECT_ID`, `ADMIN_FIREBASE_UID` bằng **UID thật** lấy từ Firebase Console, `MONGO_URI`, `REDIS_URL`. Cung cấp Firebase Admin ADC, ví dụ `GOOGLE_APPLICATION_CREDENTIALS=/đường/dẫn/bên/ngoài/repo/service-account.json`. Trong Firebase web app lấy các biến `VITE_FIREBASE_*` ở `.env`. Với Google popup trên một domain khác, thêm domain đó vào **Authorized domains** trong Firebase Console.
3. Cấp **đồng thời custom claim và role trong MongoDB** từ máy quản trị có quyền Admin SDK và kết nối `MONGO_URI` (lệnh idempotent; chỉ UID đã pin):

   ```bash
   CONFIRM_ADMIN_GRANT=daniel965 node scripts/grant-admin.mjs
   ```

   Script từ chối UID chưa xác minh email/bị vô hiệu, gán `admin:true` cho **UID đã pin** và cấp `User.role='admin'` trong MongoDB. Đăng xuất/đăng nhập lại để refresh ID token. Backend chỉ nhận diện admin nếu **claim + UID khớp + email đã xác minh + role database**; đăng nhập không tự phục hồi role đã bị thu hồi. Không dùng tên hiển thị hay dữ liệu client để cấp quyền; tên `Daniel965` trong demo chỉ là tên nhân vật thường.
4. Admin đăng nhập qua **màn hình bình thường**, ban đầu vẫn có chỉ số thường. Gõ **`/devmode` trong chat**: server kiểm tra **cả danh tính admin đã xác thực và `User.role === 'admin'` từ database**, rồi lưu tức thì nhân vật thành **Tiên Đế tầng 9, Hỗn Độn Linh Căn, HP/MP 999.999.999, bất tử, không cooldown**, one-hit Boss **khi hitbox thực sự trúng**, aura 3D. Trạng thái gốc được backup trong Character; khi role bị thu hồi, server khôi phục ở thao tác tiếp theo hoặc tối đa ~3 giây / reconnect (không thể lợi dụng dev flag trong DB làm vé admin). Dashboard mở bằng **Ctrl + Shift + F12**/nút Thiên Đạo: dịch chuyển/triệu hồi/Thiên Phạt, spawn item/Boss; mỗi lệnh đều kiểm tra role database và ghi audit, không tin frontend.

Chạy MongoDB/Redis cục bộ tùy chọn: `docker compose up -d`. `compose.yaml` chỉ bind `127.0.0.1`; production nên dùng dịch vụ có authentication/TLS. Để chạy bản build: `npm run build && NODE_ENV=production npm run start -w @van-thuong/server` (trước đó **phải** cấu hình các biến thật và `DEMO_MODE=false`). Express tự phục vụ `apps/client/dist` khi đã build. `DEMO_MODE=true` trong production làm server **dừng khởi động**.

## 5. An toàn & phạm vi triển khai

- Không có credential mặc định, API tạo nhân vật và Socket.IO đều cần token; demo token là chuỗi random 256-bit do server cấp, hết hạn sau 8 giờ và chỉ tồn tại trong RAM. Firebase Admin ID token bị revoke được từ chối. Các ID item/boss/skill/path được whitelist, tên và chat có giới hạn, inventory giới hạn 80 món, one-person/one-socket, world movement do server quyết định.
- Asset người thật lấy từ **[HumanForge](https://github.com/abdulrehman043/humanforge/tree/43b06f4de92d075e0861aa2f363a3e710b2eea2e)** (mesh MakeHuman/MPFB2, tóc/áo CC0-1.0) cùng npm `humanforge@0.8.0` (MIT). Giấy phép asset [tại đây](apps/client/public/human/LICENSE.ASSETS.md), MIT [tại đây](apps/client/public/human/LICENSE.HUMANFORGE.md). `apps/client/public/human` chứa khoảng 5,8 MB subset 7 tóc + 2 pháp y + body/morph; chỉ file cần cho ngoại hình hiện tại được tải sau core. **Trình duyệt không tải từ CDN**; Vite/Express tự phục vụ toàn bộ tài nguyên. Muốn tái tạo asset, dùng sparse checkout từ revision đã ghim (chạy từ thư mục gốc dự án):

  ```bash
  git clone --filter=blob:none --no-checkout --depth=1 https://github.com/abdulrehman043/humanforge.git /tmp/humanforge
  git -C /tmp/humanforge sparse-checkout set --no-cone assets/human/manifest.json LICENSE.ASSETS.md LICENSE
  git -C /tmp/humanforge fetch --depth=1 origin 43b06f4de92d075e0861aa2f363a3e710b2eea2e
  git -C /tmp/humanforge checkout 43b06f4de92d075e0861aa2f363a3e710b2eea2e
  node scripts/sync-human-assets.mjs /tmp/humanforge --list | git -C /tmp/humanforge sparse-checkout set --no-cone --stdin
  node scripts/sync-human-assets.mjs /tmp/humanforge
  ```

  Font WOFF2 phục vụ tại chỗ; Firebase Auth lazy-load khi bật, không tải trong demo.
- Để vận hành MMO quy mô lớn cần thêm **zone/shard owner**, Socket.IO Redis adapter cho broadcast liên instance, transaction/outbox Mongo↔Redis, chống spam theo IP/identity và quan sát/metrics, hệ thống animation/quest và nội dung game mở rộng. Mesh người thật tốn GPU hơn nhân vật hình khối; cần LOD/distance culling hoặc impostor khi số người cùng khu vực rất lớn. **Không** giả vờ world state trong RAM là đã được đồng bộ ngang nhiều máy chủ.
