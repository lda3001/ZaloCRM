# ZaloCRM Desktop

Ứng dụng desktop (Electron) đóng gói ZaloCRM hiện có: khởi chạy backend Fastify
dưới dạng tiến trình con, sau đó mở một cửa sổ Electron hiển thị giao diện do
backend phục vụ (production) hoặc do Vite dev server phục vụ (development).

## Kiến trúc hoạt động

```
┌─────────────────────────────────────────────────────────┐
│ Electron (main.js)                                      │
│   1. Đọc desktop/.env                                   │
│   2. spawn "node backend/dist/app.js"  (tiến trình con)  │
│   3. Chờ backend sẵn sàng: poll GET /health              │
│      (fallback: kiểm tra cổng TCP 127.0.0.1:3000)        │
│   4. Mở BrowserWindow:                                   │
│        - production → http://127.0.0.1:3000 (Fastify)    │
│        - dev        → http://localhost:5173 (Vite)       │
│   5. Khi thoát: SIGTERM → (3s) → SIGKILL cho backend     │
└─────────────────────────────────────────────────────────┘
```

Dùng `preload.js` tối thiểu, chỉ expose thao tác khôi phục cửa sổ khi người dùng
nhấp thông báo desktop. API backend vẫn được gọi trực tiếp cùng origin.

## Yêu cầu (prerequisites)

- **Node.js 20+** (đã kiểm tra với Node 22) — cần nằm trong `PATH` để Electron
  spawn được tiến trình backend bằng lệnh `node`.
- **PostgreSQL 16** chạy local hoặc qua Docker, đã tạo database `zalocrm`
  (xem `DATABASE_URL` bên dưới).
- **Backend đã build**: chạy `npm run build` trong thư mục `backend/`
  (tạo `backend/dist/app.js`).
- **Frontend đã build**: chạy `npm run build` trong thư mục `frontend-react/`
  (tạo `frontend-react/dist`) — cần cho chế độ production và khi đóng gói installer.
- Đã khởi tạo schema database một lần, ví dụ:
  `cd backend && npx prisma db push` (hoặc `npx prisma migrate deploy`).

> Lưu ý: Electron **không** đọc `backend/.env` khi chạy. Nó chỉ dùng
> `desktop/.env` (hoặc giá trị mặc định nếu file này không tồn tại).

## Cấu hình `desktop/.env`

```bash
cp desktop/.env.example desktop/.env
```

Các biến quan trọng (mặc định trong `.env.example` đã đặt cho localhost):

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `PORT` | `3000` | Cổng backend; Electron tự dùng đúng cổng này để poll health và mở cửa sổ. |
| `NODE_ENV` | `production` | `production` để Fastify phục vụ frontend đã build. |
| `APP_URL` | `http://localhost:3000` | Dùng cho CORS / Socket.IO / sinh link. |
| `JWT_SECRET` | *(trống)* | Bắt buộc điền khi chạy production: `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | *(trống)* | Bắt buộc điền: `openssl rand -hex 16`. |
| `DATABASE_URL` | `postgresql://crmuser:ZaloCrm2026!@localhost:5432/zalocrm` | Chuỗi kết nối PostgreSQL. |
| `UPLOAD_DIR` | *(trống)* | Để trống → tự dùng `<userData>/uploads` của Electron. |

`userData` trên Windows là `%APPDATA%\ZaloCRM` (do `app.setName('ZaloCRM')`),
nên khi để trống `UPLOAD_DIR`, file upload sẽ nằm ở
`%APPDATA%\ZaloCRM\uploads`.

## Chạy

### Development (`npm run dev`)

```bash
# 1) Backend build (chỉ cần 1 lần hoặc sau mỗi lần sửa code backend)
cd backend && npm run build

# 2) Frontend dev server (terminal riêng)
cd frontend && npm run dev        # Vite tại http://localhost:5173

# 3) Cài deps desktop (lần đầu) và chạy
cd desktop && npm install
npm run dev
```

Ở chế độ này cửa sổ Electron mở `http://localhost:5173` (Vite, có hot reload),
trong khi backend vẫn được spawn như bình thường ở cổng 3000; Vite proxy `/api`
và `/socket.io` sang backend.

### Production (`npm run start`)

```bash
# Đảm bảo đã build backend + frontend
cd backend && npm run build
cd ../frontend && npm run build

cd desktop && npm run start
```

Cửa sổ Electron mở `http://127.0.0.1:3000` — Fastify phục vụ frontend đã build
từ thư mục `backend/static` (xem mục layout bên dưới).

## Đóng gói installer (Windows NSIS x64)

```bash
# Build đầy đủ: backend + frontend + installer
cd desktop && npm run build:win
```

Hoặc dùng script gộp ở thư mục gốc:

```bash
npm run build:all    # = build backend + frontend + desktop installer
```

Kết quả installer nằm ở `desktop/dist/` (ví dụ `ZaloCRM Setup 1.0.0.exe`).

## Bố cục khi đóng gói (extraResources)

`electron-builder` đọc cấu hình `build.extraResources` trong `desktop/package.json`
và copy các tài nguyên vào `resources/` của app đóng gói:

| `from` (repo) | `to` (trong resources) | Mục đích |
| --- | --- | --- |
| `../backend/dist` | `backend/dist` | Mã backend đã biên dịch (`app.js`). |
| `../backend/node_modules` | `backend/node_modules` | Dependencies runtime của backend (gồm Prisma client đã generate). |
| `../backend/prisma` | `backend/prisma` | Schema Prisma. |
| `../backend/package.json` | `backend/package.json` | Metadata backend (type module, scripts…). |
| `../frontend-react/dist` | `backend/static` | Frontend đã build — Fastify đọc từ đây. |

Kết quả trong `resources/`:

```
resources/
├─ app.asar                 # main.js + package.json của Electron
└─ backend/
   ├─ dist/                 # backend/dist  → __dirname của app.js
   ├─ node_modules/
   ├─ prisma/
   ├─ package.json
   └─ static/               # frontend-react/dist
```

Lý do frontend được đặt tại `backend/static` (chứ không phải thư mục khác): backend
phục vụ static theo `path.join(__dirname, '../static')` (xem `backend/src/app.ts`),
với `__dirname` = `backend/dist`, nên `../static` phải trỏ đến `backend/static`.
Điều này khớp với layout trong `docker/Dockerfile` (frontend → `/app/static`).

Tại runtime, `main.js` xác định thư mục backend:

- Dev: `desktop/../backend` (sibling của thư mục `desktop/`).
- Đã đóng gói: `process.resourcesPath/backend`.

Sau đó spawn `node <backendDir>/dist/app.js` với `cwd = backendDir`.

## Gỡ lỗi

- Nếu backend không khởi động được, cửa sổ sẽ hiển thị trang lỗi kèm nội dung
  stderr của backend; đồng thời log được in ra console (`[backend]`, `[desktop]`).
- Kiểm tra backend đã build chưa: `backend/dist/app.js` phải tồn tại.
- Kiểm tra PostgreSQL và `DATABASE_URL`.
- Đặt biến môi trường `ZALOCRM_NODE_BIN` nếu cần chỉ định đường dẫn node khác.
