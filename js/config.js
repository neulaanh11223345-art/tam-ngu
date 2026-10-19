// Link ứng dụng web Google Apps Script của lớp (cách tạo: apps-script/HUONG-DAN.md).
// Để trống thì app không có phần đăng nhập: ai cũng học như khách, tiến độ lưu trên máy.
// Trang có thể đặt window.HANLO_ACCOUNT_URL trước khi chạy app để thay link này (để trống là tắt).
export const ACCOUNT_URL = globalThis.HANLO_ACCOUNT_URL ?? 'https://script.google.com/macros/s/AKfycbzbTym78kUR00rpWhQyDxno9yQZhEJujegn1OKYvp7Svt80JO7OcmbLIN-roN51rmQF/exec';

// đổi mỗi lần cập nhật app, hiện ở Tôi → Cài đặt → Giới thiệu để biết máy đang chạy bản nào
export const APP_VERSION = '2026.10.19-2';
