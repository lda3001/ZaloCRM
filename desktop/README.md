# ZaloCRM Desktop

Desktop là Electron shell độc lập, chỉ hiển thị ứng dụng web do backend phục vụ.
Nó không chứa, không khởi động và không dừng backend.

## Kiến trúc

```text
PostgreSQL ← Backend Fastify :3001 ← Desktop Electron
                                ↑
                          Trình duyệt web
```

- Backend giữ phiên Zalo, API, Socket.IO, database và frontend production.
- Desktop chỉ kiểm tra `/health`, sau đó mở `BACKEND_URL`.
- Tắt desktop không làm backend hoặc listener Zalo dừng theo.
- Một backend có thể phục vụ nhiều máy desktop nếu dùng URL mạng nội bộ/HTTPS.

## Cấu hình desktop

Tạo `desktop/.env` khi phát triển:

```env
BACKEND_URL=http://127.0.0.1:3001
FRONTEND_URL=http://127.0.0.1:5173
```

Với bản đã cài, có thể đặt `.env` cạnh `ZaloCRM.exe` hoặc tại:

```text
%APPDATA%\ZaloCRM\.env
```

Chỉ `BACKEND_URL` thuộc cấu hình desktop. `DATABASE_URL`, `JWT_SECRET`, phiên
Zalo và thư mục upload phải nằm trong cấu hình của backend.

## Build và chạy backend riêng

Tại thư mục gốc:

```powershell
npm run build:server
npm run start:backend
```

`build:server` thực hiện ba việc: build TypeScript backend, build React và chép
frontend production vào `backend/static`.

Backend cần `.env` riêng trong `backend/` và phải chạy trước desktop.

## Chạy desktop development

Mở ba terminal:

```powershell
npm run dev:backend
```

```powershell
npm -C frontend-react run dev
```

```powershell
npm -C desktop run dev
```

Vite proxy `/api` và `/socket.io` tới `VITE_BACKEND_URL`, mặc định là
`http://127.0.0.1:3001`.

## Build desktop

```powershell
npm run build:desktop
```

Installer nằm trong `desktop/dist`. Gói desktop chỉ chứa Electron `main.js`,
`preload.cjs` và metadata; không còn `backend`, Prisma, `node_modules` backend
hay frontend build trong `resources`.

Muốn build cả server và desktop:

```powershell
npm run build:all
```

## Xử lý lỗi kết nối

Nếu backend chưa chạy, desktop hiển thị địa chỉ đang kết nối. Khởi động backend
rồi bấm **Kết nối lại**. Với backend trên máy khác, đảm bảo firewall cho phép
truy cập và đặt `BACKEND_URL` thành URL HTTPS hoặc IP LAN tương ứng.
