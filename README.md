# Vân Thượng Online · Web game tu tiên 3D

Một **vertical slice MMORPG 3D chơi được trên trình duyệt**: tạo nhân vật và rút Linh Căn một lần, cùng xuất hiện trong một thế giới Socket.IO, di chuyển WASD/camera góc nhìn thứ ba, đánh World Boss bằng combat do server tính, tu luyện AFK, né chín đạo lôi để đột phá, chọn đạo, chế tạo/trang bị, Trận Pháp, chat, bảng xếp hạng và dashboard quản trị xác thực.

> Đây là nền tảng **một world process**, chưa phải dịch vụ MMO production nhiều shard. Boss/đồ rơi/instance đang ở bộ nhớ của world server; nhân vật và trang bị ở MongoDB, tọa độ/scene, cooldown và xếp hạng ở Redis trong cấu hình triển khai. Các giới hạn mở rộng nằm ở cuối tài liệu.

## 1. Cấu trúc thư mục — bắt đầu từ Scene 3D

```text
.
├── apps/
│   ├── client/                         # React + Vite + React Three Fiber
│   │   ├── public/models/cultivator.glb # GLB có skeletal skin + khớp xương thật
│   │   └── src/
│   │       ├── game/
│   │       │   ├── SceneEngine.ts       # Scene, GLTFLoader, ánh sáng/bóng, WASD Vector3, camera bám
│   │       │   ├── Avatar.tsx           # Clone Skeleton, gắn vũ khí/bảo vật/thú, shader aura
│   │       │   ├── WorldDecor.tsx       # Núi, chùa, boss, ấn trận, thiên lôi, hạt 3D
│   │       │   ├── BloomEffects.tsx     # Bloom lazy-loaded cho desktop
│   │       │   └── WorldScene.tsx       # Canvas R3F, snapshot, camera
│   │       ├── components/              # UI HTML đè lên Canvas; dashboard admin
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
│           │   ├── rules.ts            # RNG, tu vi, hitbox, inventory, ranh giới
│           │   ├── World.ts            # Tick server, combat, boss, lôi kiếp, admin
│           │   └── *.test.ts           # Unit + Socket.IO integration tests
│           └── index.ts                # REST, websocket, static build
├── packages/shared/src/index.ts        # Wire types, 10 slot, item, skill, recipe
├── scripts/generate-avatar.mjs         # Tạo GLB ~97 KB tại chỗ, không tải asset ngoài
├── scripts/grant-admin.mjs             # Gán claim qua Firebase Admin SDK
├── compose.yaml                        # MongoDB/Redis chỉ bind localhost
└── .env.example                        # Mẫu biến môi trường, KHÔNG có bí mật
```

**File tạo Scene đầu tiên**: [`apps/client/src/game/SceneEngine.ts`](apps/client/src/game/SceneEngine.ts). `SceneEngine` nhận Scene/Camera/Canvas từ R3F, khởi tạo HemisphereLight/DirectionalLight và shadow map, tải `.glb`/`.gltf` bằng `GLTFLoader`, chuẩn hóa vector WASD, chạy camera bám và xoay/zoom bằng chuột. Camera và prediction chỉ để hiển thị: tọa độ hợp lệ luôn được tính lại ở server. `Avatar.tsx` tải GLB mặc định qua `useLoader(GLTFLoader, ...)`; dùng `SkeletonUtils.clone` để mỗi người chơi có bone riêng, swap material áo/tóc và gắn kiếm vào `RightHand`, mũ vào `Head`, giáp vào `LeftArm`/`RightArm`.

## 2. Chạy ngay — bản chơi thử không cần cloud

Yêu cầu **Node.js >= 20**, npm. Từ thư mục gốc:

```bash
npm install
npm run dev
```

Mở **http://localhost:5173** (trong Arena dùng live preview cổng **5173**). Vite proxy `/api` và `/socket.io` về Express cổng **3001**, trình duyệt chỉ dùng đường dẫn tương đối, không gọi `localhost` để tới backend. Khi không có `.env` và không phải `NODE_ENV=production`, server tự mở demo; hoặc `cp .env.example .env` và giữ `DEMO_MODE=true`. Bấm **Bước vào chơi thử**, tạo nhân vật, rút Linh Căn rồi vào game. Dữ liệu demo nằm trong RAM và **mất khi restart**; phiên demo **không bao giờ có quyền admin**.

```bash
npm test           # 11 test, gồm RNG 60/30/9/1, Socket.IO, anti-spoof, cooldown
npm run typecheck  # TypeScript cho client và server
npm run build      # Kiểm tra kiểu + đóng gói client
```

### Hướng dẫn nhanh trong game

- **WASD / phím mũi tên**: di chuyển; **kéo chuột**: xoay camera; **cuộn**: zoom; **1–3**: kỹ năng; **I**: túi đồ. Trên màn hình cảm ứng dùng cần điều khiển ảo và chạm ô kỹ năng; bloom/độ phân giải bóng được giảm trên màn hình nhỏ.
- **Thu linh khí** để nhận tu vi tích lũy (kể cả offline, tối đa 8 giờ). Đủ tu vi chọn **Độ kiếp**, né **9** vùng đỏ bằng WASD. Có thể chế tạo/trang bị **Bản Mệnh Châu** rồi nhấn **F** hoặc nút “Xuất Pháp Bảo” để chắn một đạo lôi (server kiểm tra mana/cooldown). Đạt **Trúc Cơ** mới được chọn Kiếm Tu / Pháp Tu / Thể Tu.
- Tiến gần, hướng mặt về **Huyền Thiên Cổ Long**, nhấn **1**. Mana, thời gian hồi, hitbox và sát thương là kết quả server. Boss đánh trả theo chu kỳ; chiến thắng nhận nguyên liệu và một món rơi trên đất. Nhấp hoặc đứng gần và nhấn **Nhặt**.
- **Chế tạo**: Luyện Đan, Luyện Khí, Trận Pháp. Tứ Tượng Trận dựng bốn trụ 3D trong 60 giây, buff đồng đội trong bán kính 5m. **Túi Càn Khôn** có đúng 10 slot; Pháp Bảo bay quanh người, Linh Thú theo sau, Tiên Khí có ánh sáng đỏ.
- Mở hai tab trình duyệt, tạo hai phiên chơi thử để thấy nhân vật và chat đồng bộ qua Socket.IO.

## 3. Kiến trúc và dữ liệu

| Thành phần | Trách nhiệm |
|---|---|
| Client Three.js / R3F | GLB skeletal avatar, môi trường isometric/third-person, directional shadows, instanced foliage/fire/swords, particle shader, bloom, lôi kiếp/meteor VFX; React HTML/CSS cho HUD. Giới hạn DPR ở `1..1.65`. |
| Express REST | `/api/health`, `/api/demo/session` (chỉ dev), `/api/me`, `POST /api/characters` (idempotent), `/api/leaderboard`. JSON tối đa 16 KB; token bắt buộc ở endpoint tài khoản. |
| Socket.IO world | Tick 20 Hz, snapshot 10 Hz; validate input, ranh giới map, World Boss, hình học line/sphere/cone, mana, cooldown Redis, AFK, 9 sóng lôi kiếp, craft/equip, item drop và lệnh admin. |
| MongoDB/Mongoose | `User` (Firebase UID unique, provider, role *đồng bộ từ claim*, last login); `Character` (UID unique, giới tính, ngoại hình, Linh Căn, đạo, cảnh giới, tu vi, HP/MP, `position:{x,y,z}`, `rotation`, scene, resources, 10 slot, inventory); `Equipment` (instance ID unique, owner, character, slot, rarity, stats, equipped). Character.inventory là nguồn sở hữu; Equipment là view có index để truy vấn. |
| Redis | Sorted set `rank:cultivation`, hash tên/cảnh giới, tọa độ + scene TTL 30s ở `scene:<characterId>`, cooldown skill atomic `SET NX PX` để reconnect không reset thời gian hồi. |
| Firebase Auth | Đăng nhập Google OAuth hoặc Email/Password cùng một giao diện; Admin SDK **xác minh ID token, kiểm tra revoked**, mới suy ra quyền từ custom claim + UID pinned. Mật khẩu không qua game server. |

**Linh Căn** dùng `crypto.randomInt(10_000)` bên server: `[0,5999]` Tạp (60%); `[6000,8999]` Chân (30%); `[9000,9899]` Thiên (9%); `[9900,9999]` Biến Dị (1%, Băng/Phong/Lôi/Ám/Quang). Unique index một nhân vật/Firebase UID và POST lặp trả nhân vật cũ, không cho rút lại. `claim` dùng timestamp server, giữ phần dư sub-second, giới hạn offline 8 giờ.

**Combat**: Client chỉ gửi `input:{x,z,rotation}` (vector đã được server normalize) và `cast:{skillId,targetId}`. Client gửi `position`, `damage`, `role`, `isAdmin`, `success` đều bị bỏ qua; server xác định tâm AoE từ trạng thái boss/chính người chơi, kiểm tra khoảng cách hitbox trên mặt phẳng `x,z` vì `y` bị khóa về 0, tính phòng thủ, chí mạng và máu boss. Cooldown áp dụng atomic ở Redis. Đột phá **chỉ được ghi sau khi server giải quyết đủ 9 tia sét**; ngắt kết nối hủy instance chứ không cấp cảnh giới.

Các Socket event client: `input`, `cast`, `cultivate`, `breakthrough`, `guard`, `choose-path`, `craft`, `place-array`, `equip`, `pickup`, `chat`, `admin:action`. Server phát `world`, `character`, `tribulation`, `combat`, `cooldowns`, `notice`, `chat`; riêng admin còn nhận `admin:players`. Admin actions hỗ trợ `teleport-to`, `summon`, `lightning`, `spawn-item` (ID thuộc danh mục), `spawn-boss` (ID `world-boss`).

## 4. Firebase + MongoDB + Redis, tài khoản quản trị

**Không** lưu mật khẩu admin vào mã nguồn, giao diện đăng nhập, seed, `.env` hay database game. Mật khẩu đã chia sẻ qua hội thoại nên **hãy đổi mật khẩu trước khi dùng môi trường thật**. Tài khoản `daniel965` đăng nhập **cùng giao diện** với mọi người, không có nút Admin trên trang đăng nhập:

1. Tạo Firebase project; bật **Google** và, nếu muốn dùng mật khẩu, **Email/Password** trong Firebase Authentication. Tạo/liên kết một Firebase user cho `daniel965` bằng email của riêng bạn; xác minh email. Đặt mật khẩu trong **Firebase Console** hoặc luồng quản trị riêng, **không** đưa vào repo. Firebase email/password yêu cầu **email**, không đăng nhập bằng tên hiển thị; server tự dùng tên nhân vật `daniel965` cho UID admin.
2. Dùng `cp .env.example .env`, đặt `DEMO_MODE=false`, `FIREBASE_PROJECT_ID`, `ADMIN_FIREBASE_UID` bằng **UID thật** lấy từ Firebase Console, `MONGO_URI`, `REDIS_URL`. Cung cấp Firebase Admin ADC, ví dụ `GOOGLE_APPLICATION_CREDENTIALS=/đường/dẫn/bên/ngoài/repo/service-account.json`. Trong Firebase web app lấy các biến `VITE_FIREBASE_*` ở `.env`. Với Google popup trên một domain khác, thêm domain đó vào **Authorized domains** trong Firebase Console.
3. Gán custom claim **một lần** từ môi trường có quyền Admin SDK:

   ```bash
   CONFIRM_ADMIN_GRANT=daniel965 node scripts/grant-admin.mjs
   ```

   Script từ chối UID chưa xác minh email/bị vô hiệu, chỉ gán claim cho `ADMIN_FIREBASE_UID`. Đăng xuất/đăng nhập lại để refresh ID token. Backend chỉ bật `isAdmin` nếu **claim `admin:true` + UID khớp + email đã xác minh**, không dựa vào tên hiển thị hay dữ liệu client.
4. Admin sau khi đăng nhập thường có HP/MP hiển thị **999.999.999**, bất tử, one-hit boss **nếu đòn thực sự trúng**, tốc độ ×5, model lớn hơn 20%, magic circle/fire trail/bầu trời hoàng hôn. Bật dashboard bằng **Ctrl + Shift + F12** (hoặc nút Thiên Đạo trong HUD). Nhìn vị trí online `x,y,z`, dịch chuyển/triệu hồi/Thiên Phạt, spawn item/Boss. Server kiểm tra quyền trước **mỗi** lệnh và in audit log, không tin thao tác frontend.

Chạy MongoDB/Redis cục bộ tùy chọn: `docker compose up -d`. `compose.yaml` chỉ bind `127.0.0.1`; production nên dùng dịch vụ có authentication/TLS. Để chạy bản build: `npm run build && NODE_ENV=production npm run start -w @van-thuong/server` (trước đó **phải** cấu hình các biến thật và `DEMO_MODE=false`). Express tự phục vụ `apps/client/dist` khi đã build. `DEMO_MODE=true` trong production làm server **dừng khởi động**.

## 5. An toàn & phạm vi triển khai

- Không có credential mặc định, API tạo nhân vật và Socket.IO đều cần token; demo token là chuỗi random 256-bit do server cấp, hết hạn sau 8 giờ và chỉ tồn tại trong RAM. Firebase Admin ID token bị revoke được từ chối. Các ID item/boss/skill/path được whitelist, tên và chat có giới hạn, inventory giới hạn 80 món, one-person/one-socket, world movement do server quyết định.
- Hình ảnh GLB được tạo bởi `node scripts/generate-avatar.mjs`, không tải asset từ CDN. `SceneEngine` dùng GLTFLoader hỗ trợ thay model thật sau này. Font WOFF2 phục vụ tại chỗ; Firebase Auth lazy-load khi bật, không tải trong demo.
- Để vận hành MMO quy mô lớn cần thêm **zone/shard owner**, Socket.IO Redis adapter cho broadcast liên instance, transaction/outbox Mongo↔Redis, chống spam theo IP/identity và quan sát/metrics, hệ thống animation/quest, animation GLTF nghệ thuật và nội dung game mở rộng. **Không** giả vờ world state trong RAM là đã được đồng bộ ngang nhiều máy chủ.
