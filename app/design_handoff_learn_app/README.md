# Handoff: Learn — app desktop học với Claude

## Tổng quan
Learn là app desktop gom **đọc bài học** (markdown trong `notes/`) và **học với Claude** (thay Claude Code ở terminal) vào một cửa sổ, thay cho combo terminal + Obsidian. Bố cục 3 cột:

```
┌──────────────┬──────────────────────────────┬───────────────────┐
│ Danh sách bài │        Bài học (đọc)          │   Trò chuyện      │
│  248px · ⌘B   │        flex: 1                │   400px · ⌘J      │
└──────────────┴──────────────────────────────┴───────────────────┘
```

## Về file thiết kế
File `Learn App Mockups.dc.html` là **bản tham chiếu thiết kế dựng bằng HTML**: nó cho thấy giao diện và hành vi mong muốn, không phải code production để copy. Việc cần làm là **dựng lại giao diện này trong môi trường của codebase** (framework, thư viện, pattern sẵn có). Nếu chưa có codebase, đề xuất: **Tauri hoặc Electron + React + TypeScript**, render markdown bằng `remark/rehype` + KaTeX + Mermaid + Shiki, và dùng **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) để chạy agent loop, stream, xin quyền tool và resume session.

Mở file bằng trình duyệt để xem. Có 5 artboard, id `1a`–`1e`.

## Độ trung thực
**Hi-fi.** Màu, font, cỡ chữ, khoảng cách và bo góc là giá trị cuối. Làm theo đúng pixel. Mockup là ảnh tĩnh: hành vi được mô tả bên dưới.

---

## Khung chung (mọi màn hình)

### Cửa sổ
- Kích thước tham chiếu 1280×800. Min đề xuất 960×600.
- Title bar 38px, nền `#ebe7de`, viền dưới `1px #ddd6c8`. Tiêu đề ở giữa, 12px, `#7a7468`, dạng `Learn — <tên bài>`. Trên macOS dùng traffic lights native.

### Cột trái — Danh sách bài (`⌘B`)
- Rộng 248px, nền `#f3f0e9`, viền phải `1px #e4dfd5`, padding `14px 10px`, gap 12px.
- Header: "Bài học" 13px/600, bên phải là kbd `⌘B`.
- **Kbd** (dùng chung): JetBrains Mono 10.5px/500, `#8a8478`, viền `1px #ddd6c8`, radius 4, padding `1px 5px`.
- **Ô tìm**: cao 32, nền `#fff`, viền `1px #e0dacd`, radius 7, padding ngang 10, 12.5px. Placeholder "Tìm bài học" màu `#9a9488`. Khi focus: viền `1.5px #b2552f`. Khi có query: hiện nút `×` để xoá.
- **Item bài**: padding `8px 10px`, radius 7, gap 2.
  - Tên: 13px/500 `#1f1d1a`.
  - Thời gian: 11.5px `#8a8478` (ví dụ "vừa xong", "hôm qua", "3 ngày trước", "1 tuần trước").
  - Item đang mở: nền `#e6e0d4`, tên 600.
  - Item đang ghi: chấm đỏ 7px `#d6403a` ngay sau tên.
  - Khi lọc: ký tự khớp được bọc `<mark>` nền `#f3d9c9`, radius 2.
- Hover (đề xuất): nền `#ebe6dc`.

### Cột giữa — Bài học
- Nền `#faf8f4`.
- Thanh trên: cao 50px, padding ngang 28, viền dưới `1px #ece7dd`.
  - Trái: đường dẫn file, JetBrains Mono 11.5px `#8a8478`.
  - Phải: badge **Đang ghi** (chỉ khi đang ghi log): 11.5px/600, chữ `#b8322c`, nền `#fbe9e6`, padding `4px 9px`, radius 5, chấm 6px `#d6403a` nhấp nháy.
- **Article**: max-width 600px (660px ở chế độ toàn màn hình), căn giữa, padding ngang 32, padding trên 36. Font **Literata** 16.5px/1.7 (17.5px/1.75 khi toàn màn hình), màu `#2a2722`, các block cách nhau 16–18px.
  - H1: 32px/600, line-height 1.2, letter-spacing -0.01em (38px khi toàn màn hình).
  - H2: 21px/600, margin-top 10.
  - Inline code: JetBrains Mono 14px, nền `#efe9de`, padding `1px 5px`, radius 4.
  - Code block: JetBrains Mono 13.5px/1.65, nền `#f1ece2`, radius 8, padding `14px 18px`. Keyword `#b2552f`.
  - Công thức display: căn giữa, Literata italic 20px. Production render bằng KaTeX.
  - Wiki-link `[[ten-bai]]`: màu `#b2552f`, không gạch chân, `border-bottom 1px #e3c2b0`. Click thì mở bài trong app. Link web mở bằng trình duyệt ngoài.
  - **Khối câu hỏi/đáp án**: thẻ nền `#fff`, viền `1px #e4dfd5`, radius 10, padding `16px 18px`, font UI 13.5px.
    - Nhãn "CÂU HỎI": 11px/700, tracking .06em, `#8a8478`.
    - Đáp án đúng: `#2f6b3a`.
    - Giải thích: `#5d584e`.
  - **Khối hội thoại bạn/Claude**: `border-left 2px #d8cfbf`, padding-left 16, 15px.
    - Nhãn "BẠN" `#8a8478`, nhãn "CLAUDE" `#b2552f`, cả hai font UI 12px/600.
  - **Sơ đồ** (Mermaid hoặc ảnh): trong mockup, sơ đồ tầng TCP/IP là các hàng radius 6, padding `10px 14px`, nền nhạt dần `#f1e4da` → `#e1e3dd`. Hàng đang học có viền trong `1.5px #b2552f` và nhãn "đang học".
- **Pill "nội dung mới"** (xem UC6): absolute, cách đáy 22px, căn giữa, cao 34, radius 17, nền `#1f1d1a`, chữ trắng 12.5px/500, shadow `0 8px 24px rgba(0,0,0,.18)`. Text: "↓ Nội dung mới · đã tạm ngừng tự cuộn".
- **Empty state** (`1a`): căn giữa.
  - "Chưa mở bài nào": Literata 22px `#5d584e`.
  - Dòng phụ: 13px `#8a8478`, max-width 300.
  - Gợi ý phím tắt ⌘B / ⌘J.

### Cột phải — Trò chuyện (`⌘J`)
- Rộng mặc định 400px. Kéo mép trái để đổi độ rộng (đề xuất min 320, max 640). Lưu độ rộng (localStorage/config). Tay nắm: 5×36px, radius 3, `#d3cbbb`, nằm giữa mép trái.
- Nền `#fdfcf9`, viền trái `1px #e4dfd5`.
- **Header** cao 50, padding ngang 14, viền dưới `1px #ece7dd`, gap 8. Gồm 3 phần:
  - "Trò chuyện" 13px/600.
  - **Nút Ghi log**, 2 trạng thái:
    - Chưa ghi: cao 28, padding ngang 11, radius 14, viền `1px #ddd6c8`, 12px/500 `#5d584e`, chấm 7px `#d6403a`, text "Ghi log". Khi popover mở: nền `#f3eee4`, viền `#c9bfae`.
    - Đang ghi: nền `#d6403a`, chữ trắng 12px/600, chấm trắng nhấp nháy, text là tên file (ví dụ `tcp-ip.md`). Click thì dừng ghi.
  - **Nút ＋** (Session mới): 28×28, radius 7, glyph 16px `#5d584e`.
- **Danh sách tin nhắn**: padding 18, gap 14, 14px/1.6, neo đáy, tự cuộn khi có tin mới.
  - Tin của user: căn phải, max-width 80%, nền `#efe9de`, padding `9px 13px`, radius `13 13 4 13`.
  - Tin của Claude: chữ trơn `#3d3a34`, không bubble. Render markdown đầy đủ (toán, code, sơ đồ) và stream theo token.
  - **Dòng hoạt động tool**: 12px `#7a7468`, nền `#f4f0e8`, radius 7, padding `7px 10px`. Gồm spinner 12px viền `#b2552f`, mô tả tóm tắt (ví dụ "Tra cứu RFC 793, vẽ sơ đồ bắt tay"), và số bước bên phải (Mono 11px, ví dụ "3 bước"). Click để mở rộng danh sách bước (đề xuất).
- **Ô nhập**: wrapper padding `12px 14px 14px`. Hộp: viền `1px #ddd6c8`, radius 12, nền `#fff`, padding `12px 12px 8px`.
  - Textarea 13.5px, placeholder "Hỏi Claude…", min-height 36, tự giãn.
  - Hàng chân: tên model (Mono 11px `#9a9488`, ví dụ `claude-sonnet-4.5`), gợi ý "Enter gửi · ⇧Enter xuống dòng" 11px `#a9a397`, và nút gửi 28×28 radius 8. Nút gửi xám `#e7e2d8` khi rỗng, `#1f1d1a` khi có nội dung.
  - Khi Claude đang trả lời, nút gửi đổi thành **■ Dừng**: nền `#1f1d1a`, ô vuông trắng 9px radius 1.5.
  - Khi còn quiz chưa trả lời: nền hộp `#f7f4ee`, viền `#e4dfd5`, placeholder đổi thành "Trả lời quiz ở trên trước nhé ↑" màu `#b2552f`, và chặn gửi.

---

## Các màn hình

### 1a — Mở app, chat trống (UC1, UC8)
- Giữa: empty state.
- Chat: căn giữa theo chiều dọc, padding ngang 28, gap 22.
  - "Hôm nay học gì?": Literata 30px/1.2, tracking -0.01em.
  - 3 gợi ý: padding `11px 14px`, viền `1px #e4dfd5`, radius 9, nền `#fff`, 13px. Click thì gửi luôn nội dung gợi ý.
  - Nút **Nối lại session trước**: nền `#f3eee4`, radius 9, padding `12px 14px`, icon ↺ `#b2552f`. Tiêu đề 13px/600, dòng phụ 11.5px `#7a7468` (tên bài · thời gian), mũi tên → ở bên phải. Chỉ hiện khi có session trước.
- Gợi ý mặc định: "Dạy tôi TCP/IP hoạt động thế nào", "Giải thích quy hoạch động bằng ví dụ", "Ôn lại Đại số tuyến tính bằng quiz".

### 1b — Popover Ghi log (UC5, UC8)
- Neo dưới nút Ghi log, lệch sang trái (chiều ngang tràn qua mép cột giữa khoảng 56px). Nền `#fff`, viền `1px #ddd6c8`, radius 12, padding 16, gap 14, shadow `0 18px 50px rgba(40,30,10,.18)`.
- Nội dung:
  - Tiêu đề "Ghi buổi học ra file" 13px/600.
  - Input cao 38, radius 8. Khi focus: viền `1.5px #b2552f` và ring `0 0 0 3px rgba(178,85,47,.12)`.
  - Preview đường dẫn ngay dưới input: Mono 11.5px `#7a7468`, dạng `→ notes/<slug>.md`, cập nhật theo từng phím gõ.
  - Ghi chú "Ghi cả phần đã trò chuyện trước khi bấm ghi." 12px `#7a7468`.
  - Nút "Huỷ" (ghost) và nút **"Bắt đầu ghi ↵"**: nền `#1f1d1a`, chữ trắng 13px/600, cao 32, radius 8.
  - Divider, rồi nhãn "HOẶC GHI TIẾP VÀO BÀI CÓ SẴN" 11.5px/600 uppercase tracking .06em `#8a8478`.
  - Danh sách bài: tên 13px, tên file Mono 11px `#9a9488`. Hover/active: nền `#f6f2ea`.
- **Slug**: bỏ dấu tiếng Việt (NFD + xoá combining marks, `đ`→`d`), lowercase, `&` và ký tự đặc biệt → `-`, gộp các `-` liên tiếp, trim. Ví dụ "Cấu trúc dữ liệu & giải thuật" → `cau-truc-du-lieu-giai-thuat`. Nếu trùng tên file thì thêm `-2`.
- Phím: Enter = Bắt đầu ghi, Esc = đóng.

### 1c — Đang ghi, Claude giảng, thẻ quiz (UC2, UC3, UC6)
- Trái: bài đang ghi có chấm đỏ và đang active.
- Giữa: badge Đang ghi. Article stream dần và tự cuộn theo nội dung mới.
- Chat: nút Ghi log ở trạng thái đỏ, có dòng hoạt động tool, và **thẻ quiz**:
  - Viền `1.5px #b2552f`, radius 12, nền `#fff`, padding 14, gap 10, shadow `0 4px 16px rgba(178,85,47,.10)`.
  - Nhãn "QUIZ" 11px/700 `#b2552f`, kèm tag "chọn nhiều" (11px `#7a7468`, viền `1px #ddd6c8`, radius 4) nếu là câu nhiều lựa chọn.
  - Câu hỏi 14px/500.
  - Mỗi đáp án: padding `8px 10px`, viền `1px #e4dfd5`, radius 8, 13.5px. Bên trái là checkbox 16px (radio nếu chọn một), bên phải là số phím tắt (Mono 11px `#9a9488`). Khi được chọn: viền `#b2552f`, nền `#fbf1ea`, checkbox đặc `#b2552f` có ✓ trắng.
  - "Tôi không biết" luôn là lựa chọn cuối, viền dashed `#d8cfbf`, chữ `#7a7468`.
  - Input "Hoặc tự gõ câu trả lời…" cao 34.
  - Nút "Bỏ qua" (ghost) và "Gửi" (nền `#b2552f`, chữ trắng 13px/600, cao 30, radius 8). Gửi bị disable khi chưa chọn gì và chưa gõ gì.
- Ô nhập ở trạng thái khoá (đang chờ trả lời quiz).

### 1d — Chấm quiz, xin quyền, ngừng tự cuộn (UC3, UC4, UC6, UC7, UC9)
- Trái: ô tìm có query "t" và đang lọc (UC7).
- Giữa: user đã cuộn lên nên app ngừng tự cuộn và hiện pill "↓ Nội dung mới". Click pill thì cuộn xuống đáy và bật lại tự cuộn.
- Chat:
  - **Quiz đã chấm**: thẻ viền `1px #e4dfd5` (không còn viền nhấn), nhãn "QUIZ · ĐÃ CHẤM". Mỗi đáp án có ✓ `#2f7d3e` hoặc ✗ (đề xuất `#c0392b`), kèm đáp án đúng và giải thích.
  - **Thẻ xin quyền**:
    - Khung: viền `1.5px #e2b54a`, nền `#fdf5e1`, radius 12, padding 14, gap 10.
    - Header: icon "!" (tròn 18px nền `#e2b54a`), tiêu đề "Claude muốn chạy lệnh" (hoặc "Claude muốn sửa file") 13px/600 `#5b3f00`, tên tool ở bên phải (Mono 11px `#8a6a1e`).
    - Khối lệnh: Mono 12.5px/1.5, nền `#fffbf0`, viền `1px #efd99a`, radius 7, padding `9px 11px`.
    - Dòng tác động: "Ghi file mới: …" 12px `#6b5420`.
    - 3 nút cao 30, radius 7, 12.5px: **Cho phép** (nền `#1f1d1a`, chữ trắng, 600), **Luôn cho phép <Tool>** (nền `#fff`, viền `1px #e2cf9a`), **Từ chối** (ghost `#6b5420`).
  - Nút gửi ở trạng thái ■ Dừng.

### 1e — Đọc toàn màn hình (UC7, UC10)
- Cả hai cột bên đã ẩn. Thanh trên không có viền:
  - Kbd `⌘B` ở trái để hiện lại danh sách.
  - Đường dẫn và thời gian sửa ở giữa.
  - Kbd `⌘J` ở phải để hiện lại chat.
- Article rộng 660.
- Toast "Đã cập nhật từ Obsidian": góc trên phải, nền trắng, viền `1px #e4dfd5`, radius 6, 11.5px, chấm xanh `#5a9a62`. Hiện khi file thay đổi từ bên ngoài, tự ẩn sau khoảng 3 giây.

---

## Tương tác & hành vi

| Use-case | Hành vi |
|---|---|
| UC1 | Gửi chủ đề hoặc gợi ý thì bắt đầu session mới. System prompt của Claude: hỏi quiz chẩn đoán trước, sau đó đưa kế hoạch bài học kèm sơ đồ phụ thuộc (Mermaid), giảng từng phần, xen kẽ quiz. |
| UC2 | Enter gửi, Shift+Enter xuống dòng. Stream token. Các tool call liên tiếp gộp thành **một** dòng hoạt động, hiện tóm tắt và đếm bước. "giảng luôn, đừng hỏi nhiều" thì Claude giảm tần suất quiz (xử lý trong prompt). |
| UC3 | Quiz đến từ một tool tuỳ chỉnh (ví dụ `ask_quiz({questions:[{q, options[], multi}]})`) và render thành thẻ. Phím 1–9 chọn/bỏ chọn đáp án, Enter gửi (chỉ với quiz một câu). Kết quả gửi về Claude dưới dạng tool_result. Claude chấm và trả về ✓/✗ có cấu trúc để render thẻ "đã chấm". "Tôi không biết" là một đáp án hợp lệ. Bỏ qua thì gửi `skipped`. Khi còn quiz chưa trả lời thì khoá ô nhập. |
| UC4 | Dùng `canUseTool` (Agent SDK). Tool chỉ đọc (Read, Grep, Glob, WebSearch, WebFetch) tự cho phép. Bash, Write, Edit hiện thẻ xin quyền. "Luôn cho phép X" thêm X vào allowlist **của session hiện tại**. Từ chối thì trả deny kèm message để Claude tìm cách khác. |
| UC5 | Bắt đầu ghi: serialize **toàn bộ** transcript (cả phần trước khi bấm ghi) ra `notes/<slug>.md`, sau đó append theo từng tin. Mở bài ở cột giữa và thêm chấm đỏ ở sidebar. Click nút đỏ thì dừng ghi (file giữ nguyên). |
| UC6 | Cột giữa tự cuộn khi đang ở đáy (ngưỡng khoảng 40px). Khi user cuộn lên thì tắt tự cuộn và hiện pill. Click pill hoặc tự cuộn về đáy thì bật lại. |
| UC7 | Sidebar liệt kê `notes/*.md`, sắp theo mtime giảm dần, thời gian dạng tương đối tiếng Việt. Lọc fuzzy theo tên bài (bỏ dấu khi so khớp). Watch thư mục bằng chokidar hoặc fs watcher: thay đổi từ bên ngoài thì reload nội dung và hiện toast. |
| UC8 | "Nối lại session trước" resume session ID gần nhất (Agent SDK `resume`). Ghi tiếp vào bài cũ thì append transcript mới vào cuối file đã chọn. |
| UC9 | ■ abort stream hiện tại (AbortController). ＋ tạo session mới, xoá chat và xoá allowlist "luôn cho phép". |
| UC10 | ⌘B bật/tắt sidebar, ⌘J bật/tắt chat. Animate width khoảng 180ms ease-out. Lưu độ rộng chat. Tên model hiện ở chân ô nhập. |

**Animation**
- Chấm ghi nhấp nháy: keyframes `opacity 1 → .35 → 1`, 1.4s, lặp vô hạn.
- Spinner tool: xoay 0.8s linear.
- Popover: fade + translateY(4px), 120ms.

## Định dạng file markdown khi ghi log
Đề xuất (để cột giữa render được các khối đặc biệt):
- Phần giảng của Claude ghi thành markdown thường (heading, đoạn văn, code, `$$…$$`, ```` ```mermaid ````).
- Quiz ghi thành callout Obsidian `> [!question]` (câu hỏi và các lựa chọn), tiếp theo là `> [!success]-` (đáp án và giải thích).
- Câu hỏi tự do của user ghi thành callout `> [!chat]`, gồm hai dòng `**Bạn:** …` và `**Claude:** …`.

Định dạng này vẫn đọc tốt trong Obsidian.

## State
- `sidebarOpen`, `chatOpen`, `chatWidth` (lưu lại).
- `notes[]` ({path, title, mtime}), `searchQuery`, `activeNotePath`.
- `session` ({id, model, messages[], streaming, alwaysAllow: Set<tool>}).
- `recording` ({path, slug} | null).
- `pendingQuiz` (block ô nhập khi khác null) và `pendingPermission`.
- `autoScroll` (bool, cho cột giữa).

## Design tokens

**Màu**

| Token | Hex |
|---|---|
| ink | `#1f1d1a` |
| ink-reading | `#2a2722` |
| ink-2 | `#3d3a34` |
| muted | `#5d584e` |
| muted-2 | `#7a7468` |
| muted-3 | `#8a8478` |
| placeholder | `#9a9488` |
| bg-titlebar | `#ebe7de` |
| bg-sidebar | `#f3f0e9` |
| bg-reading | `#faf8f4` |
| bg-chat | `#fdfcf9` |
| surface | `#fff` |
| border | `#e4dfd5` |
| border-strong | `#ddd6c8` |
| divider | `#ece7dd` |
| active-row | `#e6e0d4` |
| user-bubble | `#efe9de` |
| tint | `#f3eee4` |
| accent | `#b2552f` |
| accent-tint | `#fbf1ea` |
| link-underline | `#e3c2b0` |
| rec | `#d6403a` |
| rec-text | `#b8322c` |
| rec-tint | `#fbe9e6` |
| perm-border | `#e2b54a` |
| perm-bg | `#fdf5e1` |
| perm-code-bg | `#fffbf0` |
| perm-code-border | `#efd99a` |
| perm-text | `#5b3f00` |
| ok | `#2f7d3e` |
| synced | `#5a9a62` |

**Quy tắc màu:** đỏ chỉ dùng cho ghi log, vàng chỉ dùng cho xin quyền, đất nung (accent) dùng cho quiz, link và focus.

**Font**
- UI: **Be Vietnam Pro** 400/500/600/700.
- Đọc: **Literata** (opsz 7–72) 400/600, có italic.
- Code: **JetBrains Mono** 400/500.
- Tất cả có trên Google Fonts. Nên bundle local cho app desktop.

**Cỡ chữ UI:** 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14.

**Bo góc:** 4 (kbd, tag) · 5–6 · 7 (row, nút nhỏ) · 8 (input, nút) · 9 · 10 · 12 (card, ô nhập, popover) · 14/17 (pill).

**Shadow**
- Popover: `0 18px 50px rgba(40,30,10,.18)`.
- Quiz: `0 4px 16px rgba(178,85,47,.10)`.
- Pill: `0 8px 24px rgba(0,0,0,.18)`.

## Assets
Không có ảnh hay icon. Icon đang dùng glyph (＋ ↺ → ↑ ✓ ✗ ! ■). Khi implement, thay bằng bộ icon của codebase (đề xuất Lucide: plus, rotate-ccw, arrow-right, arrow-up, check, x, alert, square, search).

## Files
- `Learn App Mockups.dc.html`: 5 artboard `1a`–`1e`. Mở trực tiếp bằng trình duyệt.
