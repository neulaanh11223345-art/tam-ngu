# Cài máy chủ tài khoản lớp học cho Hán Lộ (Google Apps Script)

Làm một lần, mất khoảng 10 phút. Bạn chỉ cần một tài khoản Google. Hoàn toàn miễn phí.

Sau khi cài xong:

- Học viên đăng nhập trong app bằng tên đăng nhập và mật khẩu bạn cấp.
- Tiến độ của mỗi người tự đồng bộ giữa các máy.
- Bạn xem tiến độ cả lớp ngay trong Google Sheet.

## 1. Tạo Google Sheet

1. Mở <https://sheets.new> (hoặc Google Drive → **Mới** → **Google Trang tính**).
2. Đặt tên trang tính, ví dụ **Hán Lộ – Lớp học**.

## 2. Dán mã máy chủ

1. Trong Sheet, chọn **Tiện ích mở rộng → Apps Script**. Một thẻ mới mở ra, có sẵn tệp `Code.gs` với vài dòng mẫu.
2. Xóa hết các dòng mẫu.
3. Mở tệp mã: <https://github.com/neulaanh11223345-art/tam-ngu/blob/main/apps-script/Code.gs>. Bấm nút **Copy raw file** (biểu tượng hai tờ giấy ở góc phải trên khung mã), rồi dán vào `Code.gs`.
4. Bấm biểu tượng **Lưu** (đĩa mềm), hoặc nhấn Ctrl + S.
5. Bấm vào chữ **Dự án chưa có tiêu đề** ở góc trên để đặt tên dự án, ví dụ **Hán Lộ**.

## 3. Chạy cài đặt lần đầu và cấp quyền

1. Ở thanh công cụ phía trên, tìm ô chọn hàm (cạnh nút **Gỡ lỗi**) và chọn **setup**. Bấm **Chạy**.
2. Google hỏi quyền: bấm **Xem lại quyền**, rồi chọn tài khoản Google của bạn.
3. Nếu hiện cảnh báo **"Google chưa xác minh ứng dụng này"**, bấm **Nâng cao**, rồi bấm **Đi tới Hán Lộ (không an toàn)**, rồi **Cho phép**.
   - Cảnh báo này hiện vì đây là mã của chính bạn, chưa gửi Google duyệt.
   - Mã chỉ dùng trang tính này và một thư mục **Hán Lộ – Dữ liệu** trong Drive của bạn.
4. Quay lại thẻ Sheet và tải lại trang. Bạn sẽ thấy:
   - menu **Hán Lộ** trên thanh menu;
   - ba trang mới: **Học viên**, **Tiến độ**, **Cài đặt lớp**.

## 4. Triển khai thành ứng dụng web

1. Trong thẻ Apps Script, bấm **Triển khai → Tùy chọn triển khai mới**.
2. Bấm biểu tượng bánh răng cạnh **Chọn loại** và chọn **Ứng dụng web**.
3. Điền như sau:
   - **Mô tả:** `Hán Lộ`
   - **Thực thi dưới dạng:** **Tôi** (email của bạn)
   - **Người có quyền truy cập:** **Bất kỳ ai**
4. Bấm **Triển khai**. Nếu Google hỏi quyền lần nữa, làm như bước 3.
5. Chép **URL ứng dụng web**. Đó là một đường link dạng `https://script.google.com/macros/s/…/exec`.
6. **Gửi đường link này cho Claude** để gắn vào app. Nếu tự sửa app, hãy dán link vào tệp `js/config.js`.

Vì sao chọn **"Bất kỳ ai"**: chỉ như vậy app mới gọi được máy chủ khi học viên chưa đăng nhập Google. Người không có tên đăng nhập và mật khẩu thì không đọc hay sửa được gì.

## 5. Thêm học viên

Ở trang **Học viên**, mỗi dòng là một người:

| Cột | Điền gì |
| --- | --- |
| Tên đăng nhập | 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang. Ví dụ `lan.tran`. App tự đổi sang chữ thường. |
| Họ tên | Tên hiện trong app và trên bảng tiến độ, ví dụ `Trần Lan`. |
| Mật khẩu | Mật khẩu ban đầu, ít nhất 6 ký tự. Gõ xong, ô tự đổi thành `••••••`: mật khẩu đã được mã hóa, kể cả bạn cũng không xem lại được. |
| Cấp HSK | Để trống thì học viên tự chọn cấp. Ghi `4` hoặc `4, 5` thì app của học viên tự chuyển sang cấp đó ở lần đồng bộ sau. |
| Khóa | Tích ô này thì học viên không đăng nhập được nữa, kể cả trên máy đang dùng. Dữ liệu vẫn giữ nguyên. Bỏ tích là dùng lại được. |

Các cột **Ngày tạo** và **Lần học gần nhất** tự điền. Ba cột cuối đã được ẩn, **đừng sửa** vì đó là mật khẩu đã mã hóa, phiên đăng nhập và tệp tiến độ.

Lịch sử phiên bản của Google Sheet có thể còn lưu mật khẩu ban đầu bạn đã gõ. Nên dặn học viên **đổi mật khẩu** ở lần đầu đăng nhập: trong app vào **Tôi → Tài khoản → Đổi mật khẩu**.

## 6. Dùng hằng ngày

- **Xem tiến độ:** mở trang **Tiến độ**. Mỗi dòng một học viên, gồm:
  - số từ đã thuộc theo HSK 3/4/5;
  - chuỗi ngày học, phút học trong 7 ngày, số thẻ đã ôn;
  - tỉ lệ trả lời đúng trong 30 ngày;
  - số bài khóa đã đọc, số chữ đã luyện viết;
  - lần học gần nhất.

  Dòng **tô cam** là học viên đã quá 3 ngày chưa học.
- **Học viên quên mật khẩu:** chọn một ô trên dòng của họ ở trang **Học viên**, rồi vào **Hán Lộ → Đặt lại mật khẩu cho học viên đang chọn**. Các máy đang đăng nhập tài khoản đó sẽ phải đăng nhập lại bằng mật khẩu mới.
- **Cho học viên tự tạo tài khoản:** ở trang **Cài đặt lớp**, tích ô **Cho phép học viên tự tạo tài khoản**. Mặc định là tắt, chỉ bạn tạo.
- **Tên lớp:** sửa ô **Tên lớp** ở trang **Cài đặt lớp**. Tên này hiện trên màn đăng nhập của app.
- **Sao lưu:** vào **Hán Lộ → Sao lưu tất cả tiến độ** để chép tiến độ của mọi học viên sang thư mục **Sao lưu ‹ngày›** trong **Hán Lộ – Dữ liệu**.
- **Bảng tiến độ bị xóa nhầm:** vào **Hán Lộ → Cập nhật bảng tiến độ ngay** để viết lại bảng từ tệp tiến độ.

## 7. Khi có bản mã mới

Dán mã mới vào `Code.gs` và lưu. Sau đó:

1. Vào **Triển khai → Quản lý các lượt triển khai**.
2. Bấm biểu tượng bút chì, ở mục **Phiên bản** chọn **Phiên bản mới**.
3. Bấm **Triển khai**.

Làm như vậy thì đường link giữ nguyên, không phải sửa app. Nếu tạo **lượt triển khai mới**, đường link sẽ đổi.

## Cần biết

- **Mức an toàn:** mật khẩu được mã hóa kèm chuỗi ngẫu nhiên. Sai mật khẩu 5 lần thì phải chờ 10 phút. Mức này đủ cho lớp học, nhưng đây không phải hệ thống bảo mật chuyên nghiệp: hãy dặn học viên đừng dùng lại mật khẩu ngân hàng hay email.
- **Quyền riêng tư:** tiến độ học của học viên nằm trong Google Drive của bạn. Hãy cho học viên biết bạn xem được bảng tiến độ của họ.
- **Giới hạn của Google:** gói miễn phí đủ cho vài chục học viên học mỗi ngày. Mỗi lần đồng bộ mất khoảng 1–3 giây, chạy ngầm nên không làm chậm lúc học.
- **Link Claude** của app có thể không gọi được Apps Script. Học viên nên dùng link GitHub: <https://neulaanh11223345-art.github.io/tam-ngu/>.
