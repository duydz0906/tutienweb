# Vân Thượng Online · Web game tu tiên 3D

Một **vertical slice MMORPG 3D chơi được trên trình duyệt**: tạo nhân vật nam/nữ, chỉnh chân thân và rút Linh Căn **trước khi nhập môn**; khám phá **Tông Môn mở rộng trên đỉnh núi** với Chính Điện, Nhiệm Vụ Các, Tàng Bảo Các, **Ngự Thú Viện, Phòng Luyện Đan** và **nhà/kho riêng từng đệ tử**; qua cổng tới **Hoang Vực** săn quái, xuống **sơn đạo tới làng Vân Cốc** dưới chân núi. Có **80 quái thuộc 20 sinh cảnh, cấp 1–16** (4 quái mỗi bãi), 5 nhiệm vụ ngẫu nhiên mỗi ngày, **5 đạo tu** (Kiếm, Pháp, Thể, Ngự Thú, Ma), kỹ năng theo cảnh giới, linh thú thuần hóa và luyện đan; trang bị đổi mesh, combat server hitbox, tu luyện 9 tầng/đại cảnh giới, lôi kiếp và chat nhiều người. Từ Trúc Cơ có hào quang riêng theo đại cảnh giới, dựng bằng model GLB CC0 miễn phí. Đạt Tiên Đế tầng 9 để mở **Mật Thất Tái Sinh**, chọn tái sinh một lần rồi tới **Thượng Giới** farm yêu thú và pháp bảo cao cấp. `/devmode` thật vẫn chỉ dành cho admin đã xác thực cả token lẫn role trong database.

> Đây là nền tảng **một world process**, chưa phải dịch vụ MMO production nhiều shard. Boss/quái/thảo/đồ rơi/instance thuộc từng vùng và đang ở bộ nhớ của world server; nhân vật, trang bị, quest và trạng thái `/devmode` ở MongoDB, tọa độ/scene, cooldown và xếp hạng ở Redis trong cấu hình triển khai. Các giới hạn mở rộng nằm ở cuối tài liệu.

## 1. Cấu trúc thư mục — bắt đầu từ Scene 3D

```text
.
├── apps/
│   ├── client/                         # React + Vite + React Three Fiber
│   │   ├── public/human/                # Mesh/morph/skin/tóc/pháp y người thật CC0, tự host
│   │   ├── public/aura/                 # Model hào quang Kenney Nature Kit CC0 + nguồn/license
│   │   └── src/
│   │       ├── game/
│   │       │   ├── SceneEngine.ts       # Scene, GLTFLoader, ánh sáng/bóng, WASD Vector3, camera bám
│   │       │   ├── Avatar.tsx           # HumanForge Mixamo rig riêng/người, trang bị và hiệu ứng
│   │       │   ├── humanAppearance.ts   # Male/female mesh, tóc, khuôn mặt, body morph
│   │       │   ├── WorldDecor.tsx       # Địa hình ba vùng, boss, ấn trận, thiên lôi
│   │       │   ├── VillageScene.tsx     # Làng Vân Cốc: nhà, chợ, giếng, ruộng, NPC, cổng về sơn môn
│   │       │   ├── MountainLandscape.tsx# Đỉnh núi, rừng cây, sông, hồ AFK và thác nước
│   │       │   ├── SectWayfinding.tsx   # Lối vào nhà riêng và mật thất
│   │       │   ├── PrivateScenes.tsx    # Nội thất đệ tử xá, rương và Tái Sinh Đài
│   │       │   ├── SectArchitecture.tsx # Nhà lớn: cửa mở, phòng NPC, mái ẩn khi vào trong
│   │       │   ├── PortalGate.tsx       # Cổng dịch chuyển ở Tông Môn, Hoang Vực và Thượng Giới
│   │       │   ├── SectScene.tsx        # NPC/đệ tử HumanForge và quảng trường an toàn
│   │       │   ├── Wilderness.tsx       # Bản đồ riêng: bãi quái theo cấp, thảo, cổng về
│   │       │   ├── HabitatDecor.tsx    # 20 sinh cảnh, cọc mốc cấp và môi trường sống
│   │       │   ├── RealmAura.tsx       # Model GLB Kenney CC0 đổi màu từ Trúc Cơ
│   │       │   ├── SkyAtmosphere.tsx   # Bầu trời 3D để camera ngước nhìn
│   │       │   ├── CombatEffects.tsx    # Kiếm trail, vòng thi triển, particle, damage billboard
│   │       │   ├── Billboard.tsx        # Tên NPC/quái & text nổi trên thế giới
│   │       │   ├── sound.ts             # Web Audio chém kiếm trên user gesture
│   │       │   ├── BloomEffects.tsx     # Bloom lazy-loaded cho desktop
│   │       │   └── WorldScene.tsx       # Canvas R3F, snapshot, camera
│   │       ├── components/              # Creator, HUD, Menu/Cài đặt, SectPanels (quest/shop/sect/skills), admin
│   │       ├── lib/uiPrefs.ts          # Tùy chọn HUD (chat, bảng tu luyện, minimap, nhãn skill) trong localStorage
│   │       ├── lib/                     # REST, Firebase Auth lazy-loaded
│   │       ├── App.tsx                  # Luồng đăng nhập → tạo → vào game; Socket.IO
│   │       └── styles.css
│   └── server/                          # Express + Socket.IO + Firebase Admin
│       └── src/
│           ├── auth.ts                  # verifyIdToken + custom claim + UID pin
│           ├── localDev.ts              # Phiên demo dev có chữ ký, không cấp role Firebase
│           ├── db/
│           │   ├── models.ts           # Mongoose User, Character, Equipment
│           │   ├── store.ts            # MongoStore / MemoryStore chơi thử
│           │   ├── fileStore.ts        # Lưu JSON nguyên tử theo từng UID trong local dev
│           │   └── cache.ts            # Redis / cache chơi thử
│           ├── game/
│           │   ├── localDevCharacter.ts # Tìm hoặc tạo Daniel965 một lần; giữ nguyên save
│           │   ├── rules.ts            # RNG, EXP ×5, thưởng theo vị trí, kho, tái sinh
│           │   ├── sect.ts             # Rút 5 nhiệm vụ/ngày (UTC+7), điểm và NPC proximity
│           │   ├── sectGeometry.ts     # Hitbox tường server, lối vào nhà/ba điện đi được
│           │   ├── devMode.ts          # Bật/tắt và backup trạng thái Tiên Đế 9
│           │   ├── World.ts            # Tick server, quest, shop, quái, lôi kiếp, admin
│           │   └── *.test.ts           # Unit + Socket.IO integration tests
│           └── index.ts                # REST, websocket, static build
├── packages/shared/src/index.ts        # Wire types, cổng/nhà/chuyển vùng, NPC, quest, skill, shop
├── packages/shared/src/level_config.json # 12 cảnh giới, 9 tầng, EXP ×5, thưởng HP/MP
├── scripts/sync-human-assets.mjs       # Đồng bộ subset CC0 từ HumanForge nếu muốn tái tạo asset
├── scripts/prepare-dev.mjs             # Kiểm tra/cài lại dependency dev bị thiếu sau khi pull
├── scripts/grant-admin.mjs             # Gán claim Firebase + role MongoDB
├── scripts/verify-human-assets.ts      # Deno kiểm tra manifest/mesh/skin/normal map tại chỗ
├── deno.ysl                            # Cấu hình cho bước kiểm tra Deno (không phải workflow)
├── .github/workflows/deno.yml          # Workflow GitHub Actions thực thi kiểm tra + test/build
├── compose.yaml                        # MongoDB/Redis chỉ bind localhost
├── .local-data/                        # Bị Git ignore: session key và players/<tài khoản>/character.json
└── .env.example                        # Mẫu biến môi trường, KHÔNG có bí mật
```

**File tạo Scene đầu tiên**: [`apps/client/src/game/SceneEngine.ts`](apps/client/src/game/SceneEngine.ts). `SceneEngine` nhận Scene/Camera/Canvas từ R3F, khởi tạo HemisphereLight/DirectionalLight và shadow map, tải `.glb`/`.gltf` bằng `GLTFLoader`, chuẩn hóa vector WASD; trục camera bám được đặt theo vùng và tránh cửa chắn tầm nhìn trong nhà, xoay/zoom bằng chuột. Camera và prediction chỉ để hiển thị: tọa độ hợp lệ luôn được tính lại ở server. `Avatar.tsx` dùng HumanForge/MakeHuman (CC0) để dựng mesh **người thật ~19 nghìn đỉnh, có xương Mixamo và morph khuôn mặt/vóc dáng**, riêng biệt theo giới tính, skin WebP 2K khi ở gần, normal map vải/giày, từ bộ asset tự host; mỗi người có skeleton/mesh riêng, tóc và pháp y theo lựa chọn, trang bị gắn vào xương tay/đầu. NPC và đệ tử cũng dùng mesh HumanForge với diện mạo/giới tính riêng, không dùng mô hình người ghép hình khối. `SceneEngine.loadGLTF()` vẫn hỗ trợ tải thêm GLTF/GLB cho môi trường hoặc vật phẩm.

## 2. Chạy ngay — bản chơi thử không cần cloud

Yêu cầu **Node.js >= 20**, npm. Từ thư mục gốc:

```bash
npm run dev
```

Sau khi `git pull`/đổi nhánh, thư mục `node_modules` cũ có thể **chưa có `tailwindcss`/`postcss`**, dù chúng đã được khai báo trong `apps/client/package.json`. `npm run dev` kiểm tra và tự chạy `npm install --include=dev --package-lock=false` **trước khi khởi động Vite** nếu thiếu dependency; bạn cũng có thể cài lại thủ công (Windows CMD/PowerShell đều chạy được):

```bash
npm install --include=dev --package-lock=false
npm run dev
```

Nếu npm không có Internet hoặc quá trình cài thất bại, sửa lỗi npm được in ở bước cài rồi chạy lại hai lệnh trên. Không cần cài Tailwind global, không cần sửa PostCSS config, và không xóa source hoặc `.git`.

Mở **http://localhost:5173** (trong Arena dùng live preview cổng **5173**). Vite proxy `/api` và `/socket.io` về Express cổng **3001**, trình duyệt chỉ dùng đường dẫn tương đối, không gọi `localhost` để tới backend. Khi không có `.env` và không phải `NODE_ENV=production`, server tự bật demo; hoặc `cp .env.example .env` và giữ `DEMO_MODE=true`.

**Riêng `npm run dev` ở chế độ demo:** trình duyệt tự vào **Daniel965**, không phải đăng nhập hay tạo/rút Linh Căn lại. Server dùng UID sandbox cố định, tìm nhân vật đã lưu trước, chỉ tạo nếu chưa có; ID, Linh Căn gốc, trang bị, ngoại hình, nhiệm vụ và vị trí được giữ lại. Dev mode tự bật: Tiên Đế tầng 9, HP/MP bất tử, không cooldown; linh thạch, thảo, quặng, phù mực và điểm cống hiến hiển thị **∞**, chế tạo/mua mọi nguyên liệu/thăng đệ tử không trừ số dư; tốc độ đi bộ vẫn là **6 đơn vị/giây** như mọi người. Nút **Đổi đạo · nhân vật · công pháp** trong HUD mở bảng dev: chọn lại 5 đạo, gán kỹ năng đã cấp theo cảnh giới và đổi giới tính/dung mạo; shop và đan lô hoạt động từ xa cho dev. Tất cả đều được kiểm tra trên server; nhân vật sandbox không chiếm bảng xếp hạng, **không ghi số dư ảo 999.999.999 vào save**. Nhân vật lưu trong **`.local-data/players/Daniel965/character.json`**; mỗi khách demo khác có thư mục riêng `players/user-<hash UID>/character.json`. Lưu sau hành động, khi rời game và định kỳ; dữ liệu còn sau khi dừng/chạy lại `npm run dev`. Tệp ký phiên nằm trong `.local-data/.session-key`; **toàn bộ `.local-data/` bị Git ignore và Vite từ chối đọc qua `/@fs/`**. Đừng xóa thư mục này nếu muốn giữ nhân vật. Bản demo RAM từ các phiên cũ trước thay đổi này đã mất khi tiến trình cũ tắt thì không thể khôi phục.

Sau khi chọn **Rời khỏi thế giới**, nút **Bước vào chơi thử** cho phép dùng nhân vật khách riêng (nếu đã có trong trình duyệt) hoặc tạo mới: chọn nam/nữ, 7 kiểu tóc, 8 màu tóc, 4 khuôn mặt, sắc da, chiều cao/vóc dáng rồi rút Linh Căn một lần. **Dung mạo được chốt khi nhập môn** đối với người chơi thường: server từ chối sự kiện sửa ngoại hình từ client cũ; **chỉ nhân vật có dev mode được server xác thực** mới có thể mở bảng Đổi Nhân Vật và sửa dung mạo/giới tính. Phiên khách được ký và nhớ trên thiết bị tối đa 30 ngày để vào lại sau khi khởi động server; làm mới trang trong `npm run dev` sẽ mặc định quay về Daniel965, muốn vào khách hãy rời thế giới và bấm nút chơi thử. Một khách đặt tên `Daniel965` vẫn **không** có quyền dev/admin: quyền dựa trên UID/phiên đã xác thực, không dựa trên tên.

**Không dùng bản dev cho người lạ hoặc dữ liệu production:** auto-login là sandbox demo riêng biệt, ai truy cập được dev server có thể dùng cùng nhân vật dev. Không đọc/ghi Firebase UID thật hay MongoDB, không cấp dashboard/admin commands hoặc quyền `/devmode` cho khách. Khi cấu hình `DEMO_MODE=false` và Firebase/MongoDB/Redis, kể cả chạy `npm run dev`, vẫn đăng nhập tài khoản admin qua màn hình thông thường và phải có claim + UID pin + role database; `/api/dev/session` trả 404. `npm run start -w @van-thuong/server` với `DEMO_MODE=true` vẫn dùng demo RAM tạm thời như trước. Production cấm `DEMO_MODE=true` và không có auto-login.

Khi chơi thử với tài khoản khách, nhấn **Bước vào Vân Thượng** sau khi rút Linh Căn và đợi kết nối world; có nút thử lại khi mất kết nối.

```bash
npm test           # Unit + Socket.IO integration: nhà/kho, tái sinh, scene riêng, combat, admin
npm run typecheck  # TypeScript cho client và server
npm run build      # Kiểm tra kiểu + đóng gói client
```

**Đồ họa mô hình:** nhân vật, NPC, linh thú, thú bay, quái rừng và trang bị đều là **tượng thủ tục** dựng bằng spline có bán kính biến thiên + lathe xếp ly, không dùng file mesh ngoài: da, tóc, mắt, mũi, môi, tay và hia đều được điêu khắc trong `apps/client/src/game/sculpt/cultivator.ts`; trang bị trong `gear.ts`; linh thú/thú bay/quái trong `beasts.ts`; lụa, kim loại và ngọc dùng texture canvas sinh tại chỗ (`materials.ts`). Mỗi kiểu ngoại hình chỉ dựng một lần rồi nhân bản (`cache.ts`) để giữ 60 FPS, chất lượng chi tiết tự hạ cho người chơi khác và mô hình vẫn khớp mọi lựa chọn dung mạo trong bảng tạo nhân vật (kiểu tóc, màu tóc, sắc da, pháp y, chiều cao, vóc dáng). Cây cối, đá, cổng và kiến trúc cũng được tăng phân đoạn để bề mặt mượt hơn.

**GitHub Actions & `deno.ysl`:** GitHub chỉ chạy workflow trong `.github/workflows/*.yml`/`*.yaml`, **không chạy trực tiếp `.ysl`**. File [`deno.ysl`](deno.ysl) đúng theo tên yêu cầu là cấu hình asset của [`scripts/verify-human-assets.ts`](scripts/verify-human-assets.ts). Workflow thực thi thật tại [`.github/workflows/deno.yml`](.github/workflows/deno.yml): checkout, Node 22 + Deno 2, `npm install --package-lock=false` (repo chủ ý không có lockfile nên không dùng `npm ci`/npm cache), Deno kiểm tra mesh/skin/normal map CC0 tự host, rồi `npm run typecheck`, `npm test`, `npm run build`; không cần Firebase/Mongo/Redis hay secrets. Để kiểm tra riêng trên máy có Deno 2:

```bash
deno run --allow-read=deno.ysl,apps/client/public/human scripts/verify-human-assets.ts
```

### Hướng dẫn nhanh trong game

- **WASD / phím mũi tên**: di chuyển; **chuột trái**: chém thường (chỉ một cú nhấp, kéo rê thì thành xoay camera); **kéo chuột (trái hoặc phải)**: xoay camera/ngước nhìn **bầu trời**; **chuột phải** không mở menu ngữ cảnh; **cuộn**: zoom. **Y** khóa **góc nhìn thứ 3**: camera tự bám sau lưng theo hướng nhân vật, không xoay tay, nhấn Y lần nữa để mở khóa. **Space** nhảy tại chỗ (chỉ hiển thị). **E** tương tác ở gần: cổng, nhà, rương, mật thất, Tái Sinh Đài (hoặc nhấp/chạm đối tượng). **J** là phím chém dự phòng ở Hoang Vực/Thượng Giới, **1–9** dùng công pháp (9 ô, gán lại trong Menu → Công pháp), **R** bật/tắt phi hành, **I** túi đồ, **Q** nhiệm vụ, **K** công pháp, **M** menu tính năng, **C** ẩn/hiện chat, **T** thu gọn/mở bảng tu luyện. Có thể nhấp quái để chọn mục tiêu, nhấp thảo dược để hái. Người chơi thường **không đổi dung mạo sau khi nhập môn**; dev mode là ngoại lệ có kiểm tra quyền. Mobile có cần điều khiển ảo và nút chạm đánh/skill. Thông báo tối đa **2 tin đồng thời, 2 dòng mỗi tin** để không che tầm nhìn.
- **Tông Môn** là bản đồ an toàn **mở rộng trên đỉnh núi**, sân rộng ít cây, rừng thông/trúc ở rìa, sông chảy ra thác và Hồ Tụ Linh: từ quảng trường (X 0, Z 10), đi thẳng vào **Chính Điện** qua cửa rộng phía trước (Chưởng Môn X 0, Z 29) để nhận truyện và xin thăng **Ngoại môn → Nội môn → Chân truyền**. Đi vào **Nhiệm Vụ Các** (Trưởng Lão Chấp Sự X −17, Z 18,5) để lĩnh thưởng, **Tàng Bảo Các** (Trưởng Lão Hậu Cần X 17, Z 18,5) để mua đồ, **Ngự Thú Viện (−17, −4)** và **Phòng Luyện Đan (17, −8)** để tìm hướng dẫn và đan lô. Tường có hitbox thật, lối cửa không bị chặn; mái điện ẩn khi bạn ở trong để nhìn thấy NPC. NPC phải ở trong bán kính 4,2 m và **cùng vùng** mới cho thao tác; mở bảng từ HUD ở xa chỉ để xem. **Menu (M)** gộp nhà riêng, công pháp, nhiệm vụ, cửa hàng, luyện đan, ngự thú, bảng xếp hạng, hướng dẫn và cài đặt; thẻ nhiệm vụ "Tông Môn" cũ mặc định ẩn và có thể bật lại trong Menu → Giao diện.
- **Nhà và kho riêng**: đến **Đệ Tử Xá (X −33, Z 12)**, nhấn **E** để vào **instance chỉ có nhân vật của mình**; đứng sát **rương (X 4, Z −2)** để cất/lấy vật phẩm riêng theo instance ID (phải tháo đồ đang mặc trước khi cất). Nhà tăng theo **đại cảnh giới cao nhất từng đạt**, từ cấp 1 (12 ô, **+5% hấp thụ EXP/linh khí**) tới cấp 12 (78 ô, **+20%**); mỗi cấp thêm 6 ô. Khi tái sinh không tụt cấp nhà và không mất kho. **Hồ Tụ Linh (X −10, Z −24)** tăng **+15%** tốc độ hấp thụ khi AFK ngay trong hồ; di chuyển ra khỏi hồ thì hết thưởng. Server tự tính và chốt EXP theo scene/tọa độ thật lúc qua ranh giới, không tin bonus do trình duyệt gửi.
- **Mật Thất Tái Sinh & Thượng Giới**: chỉ hiện ở **X 32, Z 20** khi đạt **Tiên Đế tầng 9**. Vào mật thất, đến **Tái Sinh Đài (X 0, Z −3)** và xác nhận lựa chọn **một lần/nhân vật**: về Phàm Nhân với chỉ số/EXP khởi đầu, giữ Linh Căn, đạo tu, công pháp, trang bị, túi/kho, nhà cao nhất và tổng tu vi đã tích lũy; nhận **+50% hấp thụ vĩnh viễn**. Cổng phía đông phòng mở tới **Thượng Giới**: quái cấp 9–16 ở 6 sinh cảnh, thảo dược ×2, thưởng quái lớn hơn, thêm **+35%** hấp thụ và tỉ lệ pháp bảo **55%** mỗi lần hạ quái (so với 5% ở Hoang Vực gốc và 20% ở Hoang Vực sau tái sinh). Cổng Quy Sơn đưa người đã tái sinh về Tông Môn.
- **Nhiệm vụ ngày**: máy chủ rút đúng **5 nhiệm vụ không trùng** mỗi ngày, reset **00:00 Việt Nam (UTC+7)**, ví dụ hái 10 thảo, giết 20 Linh Lang, chuyển thư tới NPC; lĩnh tại Nhiệm Vụ Các để nhận EXP, linh thạch và **điểm cống hiến**. Điểm mua đồ hiếm hoặc thăng bậc đệ tử. Shop bán **đủ trang bị cho 11 ô** (vũ khí, pháp y, mũ, giáp vai, giày, nhẫn, dây chuyền, pháp bảo, linh thú, phi hành, bùa), sách công pháp học/gán hotbar, đan hồi HP/MP, **Trúc Cơ Đan** dùng lúc bắt đầu độ kiếp để tăng 20 điểm phần trăm thành công.
- **Tiến cấp**: Phàm Nhân cần 35 EXP để nhập Luyện Khí tầng 1. Mỗi đại cảnh giới từ Luyện Khí tới Tiên Đế có **9 tầng**; tầng 1→2 cần 100 EXP, rồi **500 → 2.500 → 12.500 → 62.500 → 312.500 → 1.562.500 → 7.812.500**, tầng 9 đột phá đại cảnh giới cần **39.062.500 EXP**. Chuỗi 100×5^(tầng−1) bắt đầu lại ở cảnh giới mới. Thăng tiểu tầng nhận +10 Max HP/+20 Max MP; qua đại cảnh giới sau **9 đạo lôi** và roll thành công (75%, có Trúc Cơ Đan tối đa 95%) nhận **vĩnh viễn +100 Max HP/+200 Max MP**. Thu linh khí AFK tối đa 8 giờ. Trang bị **Bản Mệnh Châu**, nhấn **F** để chắn một tia sét.
- **Hoang Vực** là **bản đồ khác**, không phải cứ đi bộ qua ranh giới: tại Tông Môn đến **Cổng Hoang Vực X 0, Z 2** (đứng trong 4,2 m), nhấn **E**/nút HUD/chạm cổng để tới bãi quái (X 0, Z 23, tách xa cổng trở về để camera không bị cổng che). Đi theo lối đá về phía nam tới **14 bãi cấp 1–8** tách nhau ít nhất 18 đơn vị: rừng sói, mỏ lợn rừng, đầm bóng ma, bụi rậm linh xà, phế tích thạch khôi, cùng Lôi Vũ Điêu và Bia Mộ Thạch Khôi. **Long Vực/Boss tại X 0, Z −54**; hái linh thảo và săn quái tự hồi sinh. **14 bãi Hoang Vực cấp 1–8** (2 bãi mỗi cấp, có thêm Lôi Vũ Điêu cấp 7 và Bia Mộ Thạch Khôi cấp 8) với 4 quái/bãi. Mini-map đánh số cấp từng bãi và cọc mốc dựng tại sinh cảnh. **Thượng Giới có 6 bãi cấp 9–16**, gồm linh lộc, vân hạc, u ảnh, hư không mãng và tinh thần hộ vệ, có biển chỉ cấp và sinh cảnh riêng. Đến **Cổng Hồi Tông X 0, Z 34** để trở về quảng trường (X 0, Z 10). Server quyết định vùng và điểm xuất hiện, không nhận tọa độ/đích từ client; chỉ thấy người chơi, đồ rơi, trận pháp/quái trong cùng vùng. Tấn công/hái thảo chỉ ở Hoang Vực hoặc Thượng Giới; đánh qua vùng hoặc nhặt đồ ở cùng tọa độ nhưng khác vùng đều bị từ chối. Boss đánh trả theo chu kỳ; chiến thắng nhận EXP/nguyên liệu/trang bị rơi. **Chế tạo** Luyện Đan, Luyện Khí, Trận Pháp; Tứ Tượng Trận buff đồng đội cùng vùng 60 giây.
- **Ngự thú & luyện đan**: từ Trúc Cơ chọn **Ngự Thú đạo**, đánh quái có thể thuần xuống ≤35% HP, đứng trong **3,5 m**, nhấn **Thuần hóa** trên HUD (tốn 3 dược thảo + 5 linh thạch; không nhận thưởng hạ quái). Linh thú thành vật phẩm có ID riêng chỉ chủ nhân trang bị/đổi trong bảng Ngự Thú Viện; thú đồng hành tăng sát thương Ngự Thú đạo **22%**. Gặp **Đan Sư ở (17, −8)** để luyện Hồi Huyết Đan, Hồi Linh Đan, Trúc Cơ Đan: máy chủ kiểm tra vị trí và nguyên liệu, túi đầy thì từ chối. Cửa hàng bán đủ **linh thạch, dược thảo, linh thiết, phù mực** và sách cao cấp. Có **5 con đường** Kiếm/Pháp/Thể/Ngự Thú/Ma Tu; kỹ năng đúng đạo, mở từ Trúc Cơ/Hóa Thần/Chân Tiên sau khi học sách. Từ **Trúc Cơ** hào quang model 3D đổi sắc theo cảnh giới ([model Kenney CC0, nguồn và giấy phép](apps/client/public/aura/README.md)).
- **Làng Vân Cốc**: từ Tông Môn đi tới **sơn đạo phía nam (X 0, Z −50)** và nhấn **E** để xuống làng; đây là bản đồ công khai an toàn riêng, không quái, không hái thảo, không niệm chú. **Lão Trương · Tạp Hóa (X −8, Z −6)** bán đủ trang bị còn thiếu và mọi vật phẩm phi hành; **Lý trưởng (X 8, Z −2)** chỉ đường về sơn môn. Cổng **VỀ TÔNG MÔN (X 0, Z −24)** đưa bạn lại sơn đạo (X 0, Z −43). Server kiểm tra bán kính, vùng và tọa độ; snapshot của làng không lẫn người chơi/quái của vùng khác.
- **Phi hành**: trang bị vật phẩm ở ô thứ 10 **Phi hành** (Ngự Kiếm cho Kiếm Tu, Vân Đĩa cho Pháp Tu, Phong Hỏa Luân cho Thể Tu, Vân Hạc/Ngọc Lộc cho Ngự Thú, Huyết Vân Xa cho Ma Tu, Đằng Vân Tọa cho mọi đạo) rồi nhấn **R**. Cần **Trúc Cơ** (hoặc dev mode), đúng đạo, còn ≥10 chân khí; Tà tu dùng được mọi loại. Khi bay tốc độ **10,5** thay vì 6, tiêu hao **1 chân khí/giây**, cạn thì tự hạ cánh; vào nhà/mật thất/lôi kiếp hoặc hồi sinh đều tự hạ. Độ cao chỉ là hiển thị, server vẫn giữ tọa độ mặt đất và kiểm tra va chạm như cũ. Linh thú bay (Lôi Vũ Điêu) thuần hóa được thành tọa kỵ và vẫn tính là linh thú đồng hành cho Ngự Thú đạo.
- **Dev**: xác thực admin rồi bật `/devmode` để thấy **Menu → Dev** với teleport nhanh (Chính Điện, Nhiệm Vụ Các, Tàng Bảo Các, Phòng Luyện Đan, Ngự Thú Viện, Hồ Tụ Linh, cổng Hoang Vực, sơn đạo, chợ Vân Cốc, Long Vực, Thượng Giới) và nhận sẵn mọi vật phẩm phi hành để thử. Server chỉ nhận ID trong danh sách whitelist và vẫn kiểm tra quyền dev.
- Mở hai tab trình duyệt, tạo hai phiên chơi thử để thấy nhân vật, máu quái, đòn đánh và chat đồng bộ qua Socket.IO.

## 3. Kiến trúc và dữ liệu

| Thành phần | Trách nhiệm |
|---|---|
| Client Three.js / R3F + React/Tailwind | HumanForge/MakeHuman CC0 rigged mesh cho người chơi **và NPC/đệ tử**, nam/nữ có hình thể/da/pháp y riêng, morph khuôn mặt và vóc dáng, skin 1K/2K và normal map vải; đỉnh núi Tông Môn/rừng/sông/hồ, nội thất nhà/mật thất, Hoang Vực/Thượng Giới, bóng đổ, bloom, kiếm trail, magic circle, damage billboard/crit. HUD/panels hiển thị thưởng từ state server. DPR giới hạn `1..1.65`. |
| Express REST | `/api/health`, `/api/demo/session` (demo), **`/api/dev/session` chỉ `npm run dev` + demo** (tự lấy/tạo Daniel965 trong kho local), `/api/me`, `POST /api/characters` (idempotent), **`GET /api/quests/daily`** (token bắt buộc, chỉ nhân vật của UID đã xác thực), `/api/leaderboard`. JSON tối đa 16 KB. |
| Socket.IO world | Tick 20 Hz, snapshot 10 Hz **riêng theo scene** (Tông Môn, Vân Cốc, Hoang Vực, Thượng Giới, lôi kiếp); nhà/mật thất là **instance riêng từng UID**, không gửi snapshot của người khác dù cùng tọa độ. Cổng kiểm tra bán kính và đổi scene server-side, tường nhà hitbox quét; đánh/nhặt/hái/rơi chỉ trong cùng vùng. Server sở hữu bonus theo vị trí, kho/tái sinh, hitbox line/sphere/cone, quest/shop/NPC, hotbar, mana/cooldown Redis, AFK, 9 sóng lôi kiếp, `/devmode`, phi hành và hành động admin. |
| MongoDB/Mongoose | Chỉ tài khoản Firebase thật: `User` (UID unique, provider, **role cấp riêng bằng script sau khi xác minh Firebase**, đăng nhập lại không tái cấp role bị thu hồi); `Character` (UID unique, giới tính, ngoại hình, Linh Căn, **realm + minorStage**, HP/MP/Max HP/Max MP, `position:{x,y,z}`, scene + `worldVersion` (migrate save cũ một lần), EXP và `cultivationBank` theo vùng, cảnh giới cao nhất, lần tái sinh, kho cá nhân, điểm cống hiến, cấp đệ tử, cốt truyện, ngày + tiến trình 5 quest, skills/hotbar, inventory/equipment và bản sao trạng thái trước dev mode); `Equipment` là view được index cho vật phẩm túi + kho thuộc sở hữu. |
| Local dev `FileStore` | Thay MongoDB **chỉ khi** chạy `npm run dev` + demo. Một JSON nhân vật/tài khoản trong `.local-data/players`, ghi file tạm rồi đổi tên nguyên tử; key ký phiên được lưu cục bộ để người chơi demo còn phiên hợp lệ có thể kết nối lại sau restart. ID và tiến trình không bị reset. |
| Redis | Sorted set `rank:cultivation`, hash tên/cảnh giới, tọa độ + scene TTL 30s ở `scene:<characterId>`, cooldown skill atomic `SET NX PX` để reconnect không reset thời gian hồi. |
| Firebase Auth | Đăng nhập Google OAuth, Email/Password **hoặc tự đăng ký tài khoản mới** (gửi email xác thực, đặt lại mật khẩu ngay trên màn hình) cùng một giao diện; Admin SDK **xác minh ID token, kiểm tra revoked**, mới suy ra quyền từ custom claim + UID pinned. Mật khẩu không qua game server. |

**Linh Căn** dùng `crypto.randomInt(10_000)` bên server: `[0,5999]` Tạp (60%); `[6000,8999]` Chân (30%); `[9000,9899]` Thiên (9%); `[9900,9999]` Biến Dị (1%, Băng/Phong/Lôi/Ám/Quang). Unique index một nhân vật/Firebase UID và POST lặp trả nhân vật cũ, không cho rút lại. Tốc độ EXP AFK = `2 × hệ số Linh Căn × (1 + thưởng nhà 5–20% + hồ 15% khi đứng trong nước + tái sinh 50% + Thượng Giới 35% khi đã tái sinh)`; các phần trăm **cộng trước** hệ số Linh Căn và không nhân chéo nhau. EXP được chốt vào bank khi đổi vùng/ra-vào hồ rồi nhận qua **Thu linh khí**; phần offline giới hạn 8 giờ.

**Combat**: Client chỉ gửi `input:{x,z,rotation}`, `basic-attack` hoặc `cast:{skillId,targetId}`. Client gửi `position`, `damage`, `role`, `isAdmin`, `success` đều bị bỏ qua; server xác định tâm AoE từ tọa độ thật/quái, kiểm tra hitbox trên mặt phẳng `x,z`, scene an toàn của Tông Môn, phòng thủ, chí mạng và HP Boss/quái. Cooldown áp dụng atomic ở Redis. Vượt đại cảnh giới **chỉ ghi sau khi server giải quyết đủ 9 tia sét và roll thành công**; ngắt kết nối hủy instance chứ không cấp cảnh giới. `packages/shared/src/level_config.json` là nguồn cấu hình EXP/chỉ số; mã server và UI dùng cùng quy tắc.

**Nâng cấp save cũ:** bản đồ một đảo trước đây dùng `scene=overworld, Z < 2` cho Hoang Vực. Khi nhân vật `worldVersion < 2` vào game, server đổi sang scene `wilderness` và giữ nguyên tọa độ/trang bị/tiến trình; lưu version 2 ngay. Những nhân vật version 2 đang đứng phía nam cổng trong Tông Môn không bao giờ bị tự động chuyển vùng khi đăng nhập lại. Nhân vật ngắt kết nối giữa lôi kiếp được trả về quảng trường, không nhận thưởng miễn phí. Save dev cũ thiếu bản backup đạo tu/ngoại hình/túi đồ được bổ sung trước khi cấp kỹ năng mới, để thu hồi role vẫn hoàn nguyên được dữ liệu trước khi tùy chỉnh.

Socket events client: `input`, `portal:travel` (không có đích/tọa độ do client chọn), `village:enter`, `village:exit`, `flight:toggle`, `dev:teleport:{id}`, `home:enter`, `home:exit`, `home:transfer:{direction,instanceId}`, `sanctum:enter`, `sanctum:exit`, `rebirth:choose`, `sanctum:ascend`, `basic-attack`, `cast`, `cultivate`, `advance-stage`, `breakthrough:{usePill}`, `guard`, `choose-path`, `gather:{nodeId}`, `quest:deliver`, `quest:claim`, `sect:story`, `sect:promote`, `shop:buy`, `beast:tame:{targetId}`, `use-item`, `assign-hotbar`, `craft`, `place-array`, `equip`, `pickup`, `chat`, `admin:action`. `appearance:update:{gender,appearance}` **chỉ được chấp nhận khi server xác nhận dev mode**; client cũ/người chơi thường bị từ chối sau nhập môn. `choose-path:{path}` cho 5 đạo chỉ chọn một lần, ngoại trừ dev mode xác thực có thể đổi. `craft:{recipeId}` với công thức đan lô yêu cầu ở gần Đan Sư (trừ dev). `flight:toggle` kiểm tra ô Phi hành, đạo tu, cảnh giới và chân khí; `village:enter`/`village:exit` kiểm tra bán kính cổng; `dev:teleport`, `dev:advance-realm` (+1 cảnh giới) và `dev:set-path` (đổi đạo tu tức thì) chỉ cho dev đã xác thực; teleport chỉ nhận ID whitelist, đổi đạo chỉ nhận 5 đạo hợp lệ. Server phát `world` kèm `scene` (chỉ có `monsters`, `herbs`, `boss`, `players` của vùng tương ứng; phòng riêng chỉ có chính mình), `character`, `tribulation`, `combat`, `cooldowns`, `notice`, `chat`; riêng admin còn nhận `admin:players`. Admin actions hỗ trợ `teleport-to`, `summon`, `lightning`, `spawn-item` (ID whitelist), `spawn-boss` (ID `world-boss`).

## 4. Firebase + MongoDB + Redis, tài khoản quản trị

**Không** lưu mật khẩu admin vào mã nguồn, giao diện đăng nhập, seed, `.env` hay database game. Mật khẩu đã chia sẻ qua hội thoại nên **hãy đổi mật khẩu trước khi dùng môi trường thật**. Tài khoản `daniel965` đăng nhập **cùng giao diện** với mọi người, không có nút Admin trên trang đăng nhập:

1. Tạo Firebase project; bật **Google** và, nếu muốn dùng mật khẩu, **Email/Password** trong Firebase Authentication. Tạo/liên kết một Firebase user cho `daniel965` bằng email của riêng bạn; xác minh email. Đặt mật khẩu trong **Firebase Console** hoặc luồng quản trị riêng, **không** đưa vào repo. Firebase email/password yêu cầu **email**, không đăng nhập bằng tên hiển thị; server tự dùng tên nhân vật `daniel965` cho UID admin.
2. Dùng `cp .env.example .env`, đặt `DEMO_MODE=false`, `FIREBASE_PROJECT_ID`, `ADMIN_FIREBASE_UID` bằng **UID thật** lấy từ Firebase Console, `MONGO_URI`, `REDIS_URL`. Cung cấp Firebase Admin ADC, ví dụ `GOOGLE_APPLICATION_CREDENTIALS=/đường/dẫn/bên/ngoài/repo/service-account.json`. Trong Firebase web app lấy các biến `VITE_FIREBASE_*` ở `.env`. Với Google popup trên một domain khác, thêm domain đó vào **Authorized domains** trong Firebase Console.
3. Cấp **đồng thời custom claim và role trong MongoDB** từ máy quản trị có quyền Admin SDK và kết nối `MONGO_URI` (lệnh idempotent; chỉ UID đã pin):

   ```bash
   CONFIRM_ADMIN_GRANT=daniel965 node scripts/grant-admin.mjs
   ```

   Script từ chối UID chưa xác minh email/bị vô hiệu, gán `admin:true` cho **UID đã pin** và cấp `User.role='admin'` trong MongoDB. Đăng xuất/đăng nhập lại để refresh ID token. Backend chỉ nhận diện admin nếu **claim + UID khớp + email đã xác minh + role database**; đăng nhập không tự phục hồi role đã bị thu hồi. Không dùng tên hiển thị hay dữ liệu client để cấp quyền; khách demo đặt tên `Daniel965` vẫn chỉ là người chơi thường, khác UID sandbox dev do server cấp khi chạy `npm run dev`.
4. Admin đăng nhập qua **màn hình bình thường**, ban đầu vẫn có chỉ số thường. Gõ **`/devmode` trong chat**: server kiểm tra **cả danh tính admin đã xác thực và `User.role === 'admin'` từ database**, rồi lưu tức thì nhân vật thành **Tiên Đế tầng 9, Hỗn Độn Linh Căn, HP/MP bất tử, tài nguyên + cống hiến không trừ, không cooldown**, one-hit Boss **khi hitbox thực sự trúng**, aura 3D. Dev đi **cùng tốc độ** người chơi thường (6 đơn vị/giây), được mua mọi nguyên liệu từ xa, lĩnh ngộ bộ kỹ năng đúng đạo và đổi đạo/công pháp/ngoại hình trong bảng Đổi Nhân Vật; các quyền này đều do server kiểm tra. Chỉ số gốc và số dư tài nguyên được backup trong Character; khi role bị thu hồi, server khôi phục ở thao tác tiếp theo hoặc tối đa ~3 giây / reconnect (không thể lợi dụng dev flag trong DB làm vé admin). Dashboard mở bằng **Ctrl + Shift + F12**/nút Thiên Đạo: dịch chuyển/triệu hồi/Thiên Phạt, spawn item/Boss; mỗi lệnh đều kiểm tra role database và ghi audit, không tin frontend.

Chạy MongoDB/Redis cục bộ tùy chọn: `docker compose up -d`. `compose.yaml` chỉ bind `127.0.0.1`; production nên dùng dịch vụ có authentication/TLS. Để chạy bản build: `npm run build && NODE_ENV=production npm run start -w @van-thuong/server` (trước đó **phải** cấu hình các biến thật và `DEMO_MODE=false`). Express tự phục vụ `apps/client/dist` khi đã build. `DEMO_MODE=true` trong production làm server **dừng khởi động**.

## 5. An toàn & phạm vi triển khai

- Không có credential Firebase mặc định, API tạo nhân vật và Socket.IO đều cần token. Demo tạm (`npm run start` + `DEMO_MODE=true`) dùng token random 256-bit, 8 giờ và chỉ RAM. **Local dev** (`npm run dev` + demo) dùng token ký HMAC SHA-256 bằng key cục bộ bị Git ignore, tối đa 30 ngày, tách hẳn tài khoản thật; endpoint cấp Daniel965 chỉ mở trong chế độ này. Không nhúng sẵn token, key hay thông tin tài khoản Firebase thật vào mã frontend/source. Firebase Admin ID token bị revoke được từ chối. Các ID item/boss/skill/path được whitelist, tên và chat có giới hạn, inventory giới hạn 80 món, one-person/one-socket, world movement do server quyết định.
- Asset người thật lấy từ **[HumanForge](https://github.com/abdulrehman043/humanforge/tree/43b06f4de92d075e0861aa2f363a3e710b2eea2e)** (mesh MakeHuman/MPFB2, tóc/áo CC0-1.0) cùng npm `humanforge@0.8.0` (MIT). Giấy phép asset [tại đây](apps/client/public/human/LICENSE.ASSETS.md), MIT [tại đây](apps/client/public/human/LICENSE.HUMANFORGE.md). `apps/client/public/human` chứa khoảng 6,7 MB subset 7 tóc + 2 pháp y + body/morph, 6 skin 2K và normal map vải/giày; skin nhẹ hơn cho NPC ở xa, 2K cho nhân vật nhìn gần; chỉ file cần cho ngoại hình hiện tại được tải sau core. **Trình duyệt không tải từ CDN**; Vite/Express tự phục vụ toàn bộ tài nguyên. Muốn tái tạo asset, dùng sparse checkout từ revision đã ghim (chạy từ thư mục gốc dự án):

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
