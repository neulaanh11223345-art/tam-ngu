# Hán Lộ 汉路

*Học tiếng Trung & tiếng Anh song ngữ* (tên cũ: Tam Ngữ 三语).

App web học từ vựng **HSK 3–5** (chuẩn HSK 2.0, 2.194 từ) theo ba thứ tiếng: chữ Hán và pinyin, nghĩa **tiếng Anh**, nghĩa **tiếng Việt**, kèm **âm Hán Việt**, câu ví dụ có dịch và **bài khóa hội thoại theo bài** cho HSK 4–5. Chữ Hán, nghĩa tiếng Anh và câu tiếng Anh đều **nghe được**.

Giao diện đỏ son trên nền giấy kem, chữ có chân, tranh thủy mặc (núi, chùa, cành mai) tự vẽ bằng SVG; có chế độ tối.

Chạy hoàn toàn trên trình duyệt, không cần máy chủ riêng, cài được lên màn hình điện thoại như một app và dùng được khi không có mạng.

## Tính năng

| Phần | Nội dung |
| --- | --- |
| Điều hướng | Hôm nay · Lộ trình (các bài theo cấp HSK) · Luyện tập (ôn thẻ, kiểm tra, luyện viết) · Thư viện (bài khóa, hội thoại của bạn, sổ từ) · Tôi (thống kê, cài đặt). |
| Bài học | 211 bài theo chủ đề (HSK 3: 33 bài, HSK 4: 58 bài, HSK 5: 120 bài), tối đa 12 từ mỗi bài. Tìm từ bằng chữ Hán, pinyin có hoặc không dấu (gõ `lvshi` ra 律师), nghĩa Việt hoặc Anh. |
| Một bài | Tab **Bài học** (bài khóa A/B có loa từng câu, chủ đề bài), **Từ vựng** (thẻ từ có loa Trung và loa Anh, lọc Tất cả / Tiếng Trung / Tiếng Anh, lưu sao), **Luyện tập** (học thẻ, kiểm tra, luyện viết, nhập vai, điền từ). |
| Chi tiết từ | Pinyin tô màu theo thanh, Hán Việt, nghĩa Anh và Việt, câu ví dụ 4 lớp (chữ Hán, pinyin, Anh, Việt), bộ thủ và số nét từng chữ, nghe phát âm thường và chậm, nghe nghĩa tiếng Anh, lưu vào sổ từ. |
| Phát âm | Giọng đọc có sẵn của máy (Web Speech API): tiếng Trung, tiếng Anh (Anh-Mỹ hoặc Anh-Anh, tốc độ riêng) và tiếng Việt nếu máy có giọng. Tùy chọn tự đọc nghĩa tiếng Anh khi lật thẻ. |
| Ôn tập | Thẻ lật 3D, ôn lặp lại ngắt quãng (kiểu SM-2: Quên / Khó / Nhớ / Dễ), vuốt phải là nhớ, vuốt trái là quên, hoàn tác thẻ vừa chấm, chọn lớp hiện sẵn ở mặt trước. |
| Bài khóa | Mỗi bài HSK 4–5 có một hội thoại soạn riêng dùng chính các từ của bài. Bảng **Tùy chọn hiển thị** bật/tắt Trung, Pinyin, Việt, Anh hoặc chọn kiểu có sẵn (Đầy đủ, Trung – Việt, Trung – Anh, Chỉ tiếng Trung…). Đọc cả bài, xem **từng câu** (Câu 1, Câu 2… có loa riêng cho từng lớp), nghe cả bài bằng tiếng Trung, tiếng Anh hoặc Trung rồi Anh, bấm từ để tra nghĩa, nhập vai, điền từ. |
| Hội thoại của bạn | Dán hội thoại trong sách bạn đang học (mỗi câu một dòng, có thể ghi tên người nói và bản dịch). App tự thêm pinyin, đọc to, xem từng câu, cho nhập vai; chữ HSK 3–6 được gạch chân để tra nghĩa. Chỉ lưu cho riêng bạn. |
| Kiểm tra | 5 dạng câu: chọn nghĩa, chọn chữ Hán, chọn pinyin đúng thanh, nghe chọn từ, điền từ vào câu. Ôn lại ngay các từ làm sai. |
| Luyện viết | Ô 田字格, xem thứ tự nét (nét bộ thủ tô màu riêng), tô theo mẫu, tự viết từ trí nhớ, chấm từng nét, gợi ý, chấm sao. Viết bằng ngón tay hoặc chuột. |
| Thống kê | Chuỗi ngày học, số từ đã thuộc, tỉ lệ trả lời đúng, biểu đồ thời gian học theo tuần/tháng, từ hay quên, chữ hay viết sai. |
| Khác | Giao diện sáng/tối, chuyển cảnh mượt (View Transitions), tôn trọng chế độ giảm chuyển động, xuất/nhập tệp sao lưu tiến độ. |

## Chạy trên máy

Cần Node.js 18 trở lên (chỉ để chạy máy chủ tĩnh; app không cần bước build).

```bash
npm run serve        # mở http://localhost:8080
```

Có thể dùng bất kỳ máy chủ tĩnh nào khác (ví dụ `python3 -m http.server`). Không mở trực tiếp `index.html` bằng `file://` vì trình duyệt chặn tải dữ liệu.

## Đưa lên mạng bằng GitHub Pages

1. Đưa toàn bộ thư mục này lên một repo GitHub (các tệp nằm ở thư mục gốc của repo).
2. Vào **Settings → Pages**, phần *Build and deployment* chọn *Deploy from a branch*, nhánh `main`, thư mục `/ (root)`.
3. Sau khoảng một phút, app chạy ở `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

Mở link trên điện thoại rồi chọn **Thêm vào Màn hình chính** (iPhone: nút Chia sẻ; Android: menu ⋮) để dùng như app và học không cần mạng.

## Tiến độ học được lưu ở đâu

- Trên web thường: lưu trong trình duyệt (localStorage) của máy đang dùng. Vào **Tôi → Cài đặt → Sao lưu tiến độ** để xuất tệp `.json` và nhập lại trên máy khác. Bản sao lưu từ thời còn tên Tam Ngữ vẫn nhập được.
- Khi mở qua link Claude: tiến độ còn được lưu vào tài khoản Claude của bạn, mở trên máy khác sẽ học tiếp được.

## Kiểm thử

```bash
npm install          # cài Playwright để chạy thử trên trình duyệt
npm test             # kiểm thử lịch ôn, pinyin, câu hỏi, lưu tiến độ, đọc tiếng Anh, dữ liệu 2.194 từ và hội thoại
npm run e2e          # mở app trong Chromium, bấm thử mọi màn hình, viết thử một chữ, giả lập giọng đọc Trung/Anh
SCREENS=1 npm run e2e   # như trên, lưu ảnh chụp vào tests/screens/
```

## Cấu trúc thư mục

```
index.html, manifest.webmanifest, sw.js   trang chính, thông tin app, chạy offline
css/app.css                               toàn bộ giao diện (màu sáng/tối và tranh thủy mặc ở đầu tệp)
js/main.js                                điều hướng, chuyển cảnh
js/srs.js, js/quiz.js, js/pinyin.js       lịch ôn, tạo câu hỏi, xử lý pinyin (không phụ thuộc DOM)
js/speech.js                              đọc tiếng Trung, tiếng Anh, tiếng Việt bằng giọng của máy
js/pygen.js                               tự thêm pinyin cho hội thoại tự nhập
js/store.js, js/host.js                   lưu tiến độ, sao lưu, đồng bộ khi mở qua Claude
js/writer.js, vendor/                     bảng viết chữ Hán (Hanzi Writer)
js/views/                                 từng màn hình
data/words.json, data/strokes/            dữ liệu từ vựng và nét chữ (do tools/build_data.py tạo ra)
data/dialogues.json, data/lexicon.json    hội thoại theo bài, từ điển nhỏ để thêm pinyin
data-src/                                 dữ liệu gốc và phần nghĩa, câu ví dụ soạn tay
tools/                                    dựng dữ liệu, vẽ biểu tượng, máy chủ chạy thử
tests/                                    kiểm thử
```

## Sửa hoặc thêm từ

Nghĩa, chủ đề và câu ví dụ nằm trong `data-src/hsk3.txt`, `data-src/hsk4-*.txt`, `data-src/hsk5-*.txt`, mỗi dòng một từ:

```
chữ Hán|chủ đề|nghĩa Việt|nghĩa Anh|câu ví dụ|dịch Việt|dịch Anh
```

Sau khi sửa, dựng lại dữ liệu (cần Python 3 và `pip install pypinyin`, cùng các gói nguồn ghi trong đầu tệp `tools/build_data.py`):

```bash
python3 tools/build_data.py --hv <hanvietData.js> --mmah <dictionary.txt> --strokes <thư mục hanzi-writer-data>
```

Công cụ tự kiểm tra: câu ví dụ phải chứa từ, mỗi chữ phải có âm Hán Việt, bộ thủ và nét viết.

Hội thoại theo bài nằm trong `data-src/dialogues/*.txt`, mỗi bài một khối:

```
## 4-travel-1
title: 中文标题 | Tiêu đề tiếng Việt | English title
scene: Bối cảnh. | Scene.
cast: 小王, 李阿姨
小王: 中文句子。 | Câu dịch tiếng Việt. | English translation.
```

Hội thoại được soạn mới cho app, không chép từ giáo trình HSK (giáo trình có bản quyền). Muốn học bài khóa trong sách của mình, dùng mục **Thư viện → Hội thoại của bạn**.

## Nguồn dữ liệu và giấy phép

Xem `NOTICE.md`.
