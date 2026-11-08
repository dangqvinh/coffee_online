# Quán Cà Phê Nhà Mình

Monorepo TypeScript cho game co-op 3D, gồm:

- `client/`: Vite + Three.js (scene 3D sẽ được thêm ở M2).
- `worker/`: Cloudflare Worker và Durable Object `GameRoom`.
- `shared/`: kiểu dữ liệu giao tiếp dùng chung giữa client/server.

## M1: chạy local

Yêu cầu Node.js 20+ và npm.

```powershell
npm install
npm run dev
```

Mở <http://localhost:5173>, nhập tên và mã phòng (chữ thường không dấu, số, dấu gạch ngang). Mỗi tab trình duyệt là một người; bộ đếm được phát qua WebSocket. Worker local chạy ở `http://localhost:8787`.

## Đăng nhập và deploy Cloudflare

```powershell
npx wrangler login
npm run build:client
npm run deploy:pages
npm run deploy:worker
```

Nếu Worker và Pages dùng hai hostname khác nhau, build Pages với URL Worker:

```powershell
$env:VITE_WORKER_URL="https://api.example.com"
npm run build:client
npm run deploy:pages
```

Nếu Worker được route cùng hostname với Pages, có thể bỏ qua biến này.

Lần đầu deploy Pages, tạo project với tên và production branch đúng:

```powershell
npx wrangler pages project create coffee-online --production-branch main
```

The existing `coffee-online` project should have its **Production branch**
changed to `main` in Cloudflare Dashboard:
**Workers & Pages → coffee-online → Settings → Build & deployments →
Production branch**. Wrangler 3 does not provide a CLI update command for this
setting. The deploy script explicitly uses `--branch main`.

Sau khi deploy, cấu hình custom domain trong Cloudflare Dashboard cho Pages project và Worker route/domain. Xem log Worker bằng:

```powershell
npx wrangler tail coffee-online
```

WebSocket M1 dùng đường dẫn `/room/<ma-phong>/ws`. Client dev đã proxy đường dẫn này sang Worker local.

## M5: admin và pha đồ uống

Khi vào phòng lần đầu, nhập một PIN admin để trở thành chủ quán. PIN được
lưu dưới dạng hash trong Durable Object; không gửi qua broadcast. Những lần
sau dùng cùng PIN để lấy lại quyền admin.

Admin có thể cấp hoặc thu quyền pha chế trong bảng **Phân công pha chế**.
Người được cấp quyền chọn nguyên liệu tự do, đặt tên món và ghi chú. Coins và
menu đồ uống được lưu trong Durable Object.
