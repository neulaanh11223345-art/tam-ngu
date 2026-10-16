#!/usr/bin/env python3
"""Dựng data/words.json và data/strokes/*.json cho app Tam Ngữ.

Nguồn:
  data-src/hsk-old*.json   danh sách từ HSK 2.0 (complete-hsk-vocabulary, MIT)
  data-src/hsk3.txt, hsk4-*.txt   nghĩa Việt/Anh, chủ đề, câu ví dụ (soạn tay)
  Hán Việt: gói npm hanviet-pinyin-words (MIT), có bảng sửa tay bên dưới
  Bộ thủ: Make Me a Hanzi dictionary.txt (LGPL-3.0)
  Nét chữ: gói npm hanzi-writer-data (Arphic Public License)

Cần: pip install pypinyin
Chạy: python3 tools/build_data.py --hv <hanvietData.js> --mmah <dictionary.txt> --strokes <thư mục hanzi-writer-data>
"""
import argparse
import json
import math
import re
import shutil
import sys
import unicodedata
from pathlib import Path


from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data-src'
OUT = ROOT / 'data'

TOPICS = [
    # mã, tên tiếng Việt, tên tiếng Anh, chữ Hán đại diện
    ('ppl', 'Con người & quan hệ', 'People & relationships', '人'),
    ('feel', 'Cảm xúc & tính cách', 'Feelings & character', '心'),
    ('body', 'Cơ thể & sức khỏe', 'Body & health', '身'),
    ('food', 'Ăn uống', 'Food & drink', '食'),
    ('home', 'Nhà cửa & đồ dùng', 'Home & things', '家'),
    ('shop', 'Mua sắm & tiền bạc', 'Shopping & money', '买'),
    ('study', 'Học tập & ngôn ngữ', 'Study & language', '学'),
    ('work', 'Công việc & xã hội', 'Work & society', '工'),
    ('travel', 'Đi lại & du lịch', 'Travel & transport', '行'),
    ('place', 'Nơi chốn & phương hướng', 'Places & directions', '方'),
    ('time', 'Thời gian', 'Time', '时'),
    ('nature', 'Thiên nhiên & thời tiết', 'Nature & weather', '天'),
    ('fun', 'Giải trí & văn hóa', 'Leisure & culture', '乐'),
    ('talk', 'Giao tiếp & suy nghĩ', 'Communication & thinking', '说'),
    ('act', 'Hành động thường ngày', 'Everyday actions', '做'),
    ('desc', 'Tính chất & trạng thái', 'Qualities & states', '好'),
    ('num', 'Số lượng & lượng từ', 'Numbers & measure words', '数'),
    ('link', 'Từ nối & ngữ pháp', 'Connectors & grammar words', '而'),
]
TOPIC_IDS = [t[0] for t in TOPICS]
LESSON_MAX = 12
# nét chữ gom thành 64 tệp nhỏ (chữ nằm ở tệp mã-Unicode % 64) để ít tệp mà vẫn tải nhẹ
STROKE_BUCKETS = 64

POS_VI = {
    'n': 'danh từ', 'nr': 'danh từ', 'ns': 'danh từ', 'nz': 'danh từ', 'ng': 'danh từ',
    'v': 'động từ', 'vn': 'động từ', 'vd': 'động từ', 'vg': 'động từ',
    'a': 'tính từ', 'ad': 'tính từ', 'an': 'tính từ', 'ag': 'tính từ', 'b': 'tính từ', 'z': 'tính từ',
    'd': 'phó từ', 'dg': 'phó từ',
    'c': 'liên từ', 'p': 'giới từ', 'q': 'lượng từ', 'qv': 'lượng từ', 'qt': 'lượng từ', 'mq': 'số lượng',
    'm': 'số từ', 'r': 'đại từ', 'u': 'trợ từ', 'y': 'trợ từ ngữ khí', 'e': 'thán từ',
    't': 'từ chỉ thời gian', 'tg': 'từ chỉ thời gian', 'f': 'từ chỉ phương vị', 's': 'từ chỉ nơi chốn',
    'i': 'thành ngữ', 'l': 'cụm từ', 'g': 'ngữ tố',
}

# Từ loại cho các từ mà danh sách gốc để trống
POS_FIX = {'而': 'c', '翻译': 'v', '放暑假': 'v', '于是': 'c', '著名': 'a', '做生意': 'v'}

# Âm đọc chọn cho từ có nhiều cách đọc (theo nghĩa dùng trong HSK)
PINYIN_CHOICE = {
    '啊': 'a', '把': 'bǎ', '才': 'cái', '差': 'chà', '地': 'de', '地方': 'dì fang', '分': 'fēn',
    '更': 'gèng', '故事': 'gù shi', '过去': 'guò qù', '关系': 'guān xi', '角': 'jiǎo', '脚': 'jiǎo',
    '教': 'jiāo', '难': 'nán', '胖': 'pàng', '骑': 'qí', '万': 'wàn', '只': 'zhǐ', '种': 'zhǒng',
    '刷': 'shuā', '了解': 'liǎo jiě', '精神': 'jīng shen', '好处': 'hǎo chu', '大夫': 'dài fu',
    '当时': 'dāng shí', '起来': 'qǐ lai', '结果': 'jié guǒ', '重点': 'zhòng diǎn', '场': 'chǎng',
    '汗': 'hàn', '省': 'shěng', '弹': 'tán', '当': 'dāng', '干': 'gàn', '假': 'jiǎ', '过': 'guò',
    '底': 'dǐ', '发': 'fā', '汤': 'tāng', '趟': 'tàng', '行': 'xíng', '页': 'yè', '与': 'yǔ',
    '脏': 'zāng', '赚': 'zhuàn', '俩': 'liǎ', '弄': 'nòng', '受不了': 'shòu bu liǎo',
}

# Hán Việt: sửa chữ mà dữ liệu gốc đọc theo âm Nôm/hiện đại
HV_CHAR_FIX = {
    '箱': 'tương', '爬': 'ba', '啤': 'bi', '笨': 'bổn', '饼': 'bính', '戴': 'đái', '哭': 'khốc',
    '跟': 'căn', '油': 'du', '推': 'thôi', '袜': 'miệt', '冷': 'lãnh', '饺': 'giảo', '允': 'doãn',
    '彩': 'thải', '虑': 'lự', '钥': 'thược',
}
# Hán Việt: chọn một âm khi chữ có nhiều âm
HV_CHAR_PREF = {
    '比': 'tỷ', '单': 'đơn', '担': 'đảm', '当': 'đương', '子': 'tử', '分': 'phân', '更': 'cánh',
    '过': 'quá', '画': 'hoạ', '几': 'cơ', '角': 'giác', '教': 'giáo', '行': 'hành', '句': 'cú',
    '易': 'dị', '使': 'sử', '刷': 'xoát', '司': 'tư', '为': 'vị', '只': 'chỉ', '种': 'chủng',
    '主': 'chủ', '并': 'tịnh', '场': 'trường', '从': 'tòng', '夫': 'phu', '断': 'đoạn', '围': 'vi',
    '访': 'phỏng', '否': 'phủ', '合': 'hợp', '干': 'cán', '处': 'xứ', '累': 'luỹ', '假': 'giả',
    '难': 'nan', '俩': 'lưỡng', '弄': 'lộng', '和': 'hoà', '稍': 'sảo', '省': 'tỉnh', '傅': 'phó',
    '首': 'thủ', '输': 'thâu', '台': 'đài', '汤': 'thang', '趟': 'thảng', '咸': 'hàm', '卡': 'tạp',
    '页': 'hiệt', '与': 'dữ', '读': 'độc', '脏': 'tang', '正': 'chính', '重': 'trọng', '座': 'toạ',
    '啊': 'a', '弹': 'đàn', '发': 'phát', '汗': 'hãn', '暗': 'ám', '底': 'để', '尝': 'thường',
}
HV_WORD = {
    '通过': 'thông qua', '经过': 'kinh qua', '部分': 'bộ phận', '判断': 'phán đoán',
    '大使馆': 'đại sứ quán', '银行': 'ngân hàng', '行李箱': 'hành lý tương', '容易': 'dung dị',
}

# Tên bộ thủ (Hán Việt) theo dạng bộ mà Make Me a Hanzi ghi
RADICAL_VI = {
    '⺀': 'băng', '⺌': 'tiểu', '⺗': 'tâm', '⺮': 'trúc', '⺼': 'nhục', '㔾': 'tiết', '一': 'nhất',
    '丨': 'cổn', '丬': 'tường', '丶': 'chủ', '丷': 'bát', '丿': 'phiệt', '乚': 'ất', '乙': 'ất',
    '亅': 'quyết', '二': 'nhị', '亠': 'đầu', '人': 'nhân', '亻': 'nhân đứng', '儿': 'nhân đi',
    '入': 'nhập', '八': 'bát', '冂': 'quynh', '冖': 'mịch', '冫': 'băng', '几': 'kỷ', '凵': 'khảm',
    '刀': 'đao', '刂': 'đao', '力': 'lực', '勹': 'bao', '匕': 'chủy', '匸': 'hệ', '十': 'thập',
    '卜': 'bốc', '卩': 'tiết', '厂': 'hán', '厶': 'khư', '又': 'hựu', '口': 'khẩu', '囗': 'vi',
    '土': 'thổ', '士': 'sĩ', '夂': 'truy', '夊': 'tuy', '夕': 'tịch', '大': 'đại', '女': 'nữ',
    '子': 'tử', '宀': 'miên', '寸': 'thốn', '小': 'tiểu', '尢': 'uông', '尸': 'thi', '山': 'sơn',
    '工': 'công', '己': 'kỷ', '巾': 'cân', '干': 'can', '幺': 'yêu', '广': 'nghiễm', '廾': 'củng',
    '弋': 'dặc', '弓': 'cung', '彡': 'sam', '彳': 'xích', '心': 'tâm', '忄': 'tâm đứng', '戈': 'qua',
    '户': 'hộ', '手': 'thủ', '扌': 'thủ', '支': 'chi', '攴': 'phộc', '攵': 'phộc', '文': 'văn',
    '斗': 'đẩu', '斤': 'cân', '方': 'phương', '无': 'vô', '旡': 'ký', '日': 'nhật', '曰': 'viết',
    '月': 'nguyệt', '木': 'mộc', '欠': 'khiếm', '止': 'chỉ', '歹': 'đãi', '殳': 'thù', '母': 'mẫu',
    '比': 'tỷ', '毛': 'mao', '民': 'thị', '气': 'khí', '水': 'thủy', '氵': 'thủy', '氺': 'thủy',
    '火': 'hỏa', '灬': 'hỏa', '爪': 'trảo', '爫': 'trảo', '父': 'phụ', '片': 'phiến', '牙': 'nha',
    '牛': 'ngưu', '犭': 'khuyển', '王': 'ngọc', '玉': 'ngọc', '瓦': 'ngõa', '甘': 'cam', '生': 'sinh',
    '用': 'dụng', '田': 'điền', '疋': 'sơ', '疒': 'nạch', '白': 'bạch', '皮': 'bì', '皿': 'mãnh',
    '目': 'mục', '矢': 'thỉ', '石': 'thạch', '示': 'thị', '礻': 'thị', '禸': 'nhựu', '禾': 'hòa',
    '穴': 'huyệt', '立': 'lập', '米': 'mễ', '糸': 'mịch', '纟': 'mịch', '缶': 'phẫu', '网': 'võng',
    '罒': 'võng', '羊': 'dương', '羽': 'vũ', '老': 'lão', '耂': 'lão', '而': 'nhi', '耳': 'nhĩ',
    '自': 'tự', '至': 'chí', '舌': 'thiệt', '舟': 'chu', '艹': 'thảo', '虎': 'hô', '虍': 'hô',
    '虫': 'trùng', '血': 'huyết', '行': 'hành', '衣': 'y', '衤': 'y', '西': 'á', '覀': 'á',
    '见': 'kiến', '角': 'giác', '言': 'ngôn', '讠': 'ngôn', '豕': 'thỉ', '豸': 'trãi', '贝': 'bối',
    '走': 'tẩu', '足': 'túc', '身': 'thân', '车': 'xa', '辛': 'tân', '辶': 'sước', '酉': 'dậu',
    '釆': 'biện', '里': 'lý', '金': 'kim', '钅': 'kim', '长': 'trường', '门': 'môn', '隹': 'chuy',
    '雨': 'vũ', '青': 'thanh', '面': 'diện', '革': 'cách', '音': 'âm', '页': 'hiệt', '风': 'phong',
    '飞': 'phi', '食': 'thực', '饣': 'thực', '首': 'thủ', '香': 'hương', '马': 'mã', '高': 'cao',
    '鱼': 'ngư', '鸟': 'điểu', '麻': 'ma', '黄': 'hoàng', '黑': 'hắc', '鼓': 'cổ', '鼻': 'tỵ',
    '齐': 'tề', '齿': 'xỉ', '竹': 'trúc', '肉': 'nhục', '爿': 'tường', '辵': 'sước', '邑': 'ấp', '阜': 'phụ',
}

PUNCT = {
    '，': ',', '。': '.', '？': '?', '！': '!', '：': ':', '；': ';', '、': ',', '“': '"', '”': '"',
    '（': '(', '）': ')', '—': '—', '…': '…', '《': '«', '》': '»',
}
OPENING = {'“', '（', '《'}
PROPER = {
    '中国', '北京', '上海', '河内', '越南', '美国', '四川', '春节', '亚洲', '长江', '长城', '汉语',
    '中文', '英语', '母亲节', '儿童节', '北京大学', '汉字', '普通话',
}
SURNAME_BEFORE = ('老师', '教授', '经理', '先生', '小姐')

TONE_MARKS = {
    'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ',
}
MARK_TO_TONE = {}
for base, marks in TONE_MARKS.items():
    for i, m in enumerate(marks):
        MARK_TO_TONE[m] = (base, i + 1)


def tone_of(syl):
    for ch in syl.lower():
        if ch in MARK_TO_TONE:
            return MARK_TO_TONE[ch][1]
    return 0


def set_tone(syl, tone):
    """Đổi dấu thanh của một âm tiết pinyin (1–4, 0 = thanh nhẹ)."""
    plain = ''.join(MARK_TO_TONE[c][0] if c in MARK_TO_TONE else c for c in syl)
    if tone == 0:
        return plain
    low = plain.lower()
    for v in ('a', 'e'):
        if v in low:
            idx = low.index(v)
            break
    else:
        if 'ou' in low:
            idx = low.index('o')
        else:
            idx = max(i for i, c in enumerate(low) if c in 'aeiouü')
    base = plain[idx]
    mark = TONE_MARKS[base.lower()][tone - 1]
    if base.isupper():
        mark = mark.upper()
    return plain[:idx] + mark + plain[idx + 1:]


def sandhi(chars, syls):
    """Biến điệu của 一 và 不 (yí/yì, bú) như cách viết trong giáo trình."""
    out = list(syls)
    for i, ch in enumerate(chars):
        if ch not in '一不' or i + 1 >= len(chars):
            continue
        nxt = out[i + 1]
        if not re.search('[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]', nxt or ''):
            continue
        # 个 đọc nhẹ nhưng gốc là thanh 4: 一个 → yí ge
        t = 4 if chars[i + 1] == '个' else tone_of(nxt)
        if ch == '一':
            prev = chars[i - 1] if i > 0 else ''
            if (prev and prev in '第十') or chars[i + 1] in '日月号〇一二三四五六七八九十':
                continue
            if tone_of(out[i]) == 0:
                continue
            out[i] = set_tone(out[i], 2 if t == 4 else 4)
        else:
            if tone_of(out[i]) == 0:
                continue
            out[i] = set_tone(out[i], 2 if t == 4 else 4)
    return out


def vn_new_style(text):
    """Đặt dấu thanh kiểu mới: hoà → hòa, thuỷ → thủy (trừ qu-)."""
    pairs = {
        'oà': 'òa', 'oá': 'óa', 'oả': 'ỏa', 'oã': 'õa', 'oạ': 'ọa',
        'oè': 'òe', 'oé': 'óe', 'oẻ': 'ỏe', 'oẽ': 'õe', 'oẹ': 'ọe',
        'uỳ': 'ùy', 'uý': 'úy', 'uỷ': 'ủy', 'uỹ': 'ũy', 'uỵ': 'ụy',
    }

    def fix(word):
        low = word.lower()
        for old, new in pairs.items():
            if low.endswith(old) and not (old.startswith('u') and low.endswith('q' + old)):
                return word[: len(word) - 2] + new
        return word

    return ' '.join(fix(w) for w in text.split(' '))


def load_hanviet(path):
    raw = Path(path).read_text(encoding='utf-8')
    raw = raw[raw.index('{'): raw.rindex('}') + 1]
    return json.loads(raw)


def hv_for(trad, numeric, hvdata, simp):
    if simp in HV_WORD:
        return HV_WORD[simp]
    out = []
    for i, ch in enumerate(trad):
        s = simp[i] if i < len(simp) else ch
        if s in HV_CHAR_FIX:
            out.append(HV_CHAR_FIX[s])
            continue
        cands = []
        entry = hvdata.get(ch) or hvdata.get(s) or {}
        if '*' in entry:
            cands = entry['*']
        else:
            py = numeric[i].lower() if i < len(numeric) else ''
            if py in entry:
                cands = entry[py]
            elif py.endswith('5') or py == 'r':
                for t in '1234':
                    cands += [c for c in entry.get(py[:-1] + t, []) if c not in cands]
            if not cands:
                for vals in entry.values():
                    cands += [c for c in vals if c not in cands]
        pref = HV_CHAR_PREF.get(s)
        if pref and (pref in cands or not cands):
            out.append(pref)
        elif cands:
            out.append(cands[0])
        elif s == '儿':
            out.append('nhi')
        else:
            raise SystemExit(f'Thiếu Hán Việt cho {ch} trong {simp} ({numeric})')
    return ' '.join(out)


def form_penalty(f):
    meaning = '; '.join(f['meanings'])
    p = f['transcriptions']['pinyin']
    score = 0
    if re.match(r'^(old )?variant of', meaning):
        score += 4
    if meaning.startswith('(onom.)') or 'surname' in meaning[:20]:
        score += 2
    if p[:1].isupper():
        score += 1
    return score


def choose_form(word):
    forms = [f for f in word['forms']]
    want = PINYIN_CHOICE.get(word['simplified'])
    if want:
        matches = sorted((f for f in forms if f['transcriptions']['pinyin'] == want), key=form_penalty)
        if matches:
            return matches[0], want
        return forms[0], want
    good = []
    for f in forms:
        p = f['transcriptions']['pinyin']
        meaning = '; '.join(f['meanings'])
        if len(forms) > 1 and p[:1].isupper():
            continue
        if re.match(r'^(old )?variant of', meaning):
            continue
        good.append(f)
    readings = {f['transcriptions']['pinyin'] for f in good}
    if len(readings) != 1:
        raise SystemExit(f"Cần chọn âm đọc cho {word['simplified']}: {[f['transcriptions']['pinyin'] for f in forms]}")
    return good[0], good[0]['transcriptions']['pinyin']


def numeric_of(pinyin_syls):
    out = []
    for s in pinyin_syls:
        t = tone_of(s)
        plain = ''.join(MARK_TO_TONE[c][0] if c in MARK_TO_TONE else c for c in s).lower().replace('ü', 'u:')
        out.append(plain + str(t if t else 5))
    return out


def parse_authored(path):
    rows = []
    for n, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        parts = line.split('|')
        if len(parts) != 7:
            raise SystemExit(f'{path.name}:{n}: cần 7 cột, có {len(parts)}')
        hanzi, topic, vi, en, ex_zh, ex_vi, ex_en = (p.strip() for p in parts)
        if topic not in TOPIC_IDS:
            raise SystemExit(f'{path.name}:{n}: chủ đề lạ {topic}')
        rows.append(dict(hanzi=hanzi, topic=topic, vi=vi, en=en, ex_zh=ex_zh, ex_vi=ex_vi, ex_en=ex_en))
    return rows


def build_lookup(levels):
    """Bảng tra pinyin cấp từ (có thanh nhẹ) để ghép vào câu ví dụ."""
    look = {}
    for lv in levels:
        for w in json.loads((SRC / f'hsk-old{lv}.json').read_text(encoding='utf-8')):
            s = w['simplified']
            if len(s) < 2 or s in look:
                continue
            try:
                _, p = choose_form(w)
            except SystemExit:
                # nhiều cách đọc: ưu tiên dạng có thanh nhẹ (东西 dōngxi, 便宜 piányi)
                forms = sorted(w['forms'], key=lambda f: (form_penalty(f), -sum(1 for s in f['transcriptions']['pinyin'].split(' ') if tone_of(s) == 0)))
                p = forms[0]['transcriptions']['pinyin']
            syls = p.split(' ')
            look[s] = syls[:1] + [x.lower() for x in syls[1:]]
    for s, p in EXTRA_PY.items():
        look[s] = p.split(' ')
    return look


# Từ thường gặp trong câu ví dụ nhưng không nằm trong danh sách HSK (để tách từ cho đúng)
EXTRA_WORDS = '''
一点儿 有点儿 点儿 这里 那里 哪里 这儿 那儿 哪儿 这个 那个 哪个 这些 那些 哪些 一些 电话 足球
篮球 火车 火车站 车站 运动会 下班 邮件 地上 草地 打车 上去 下去 出来 出去 进来 回来 过来 下来
一下 一下子 东边 西边 早上 晚上 下午 上午 今天 明天 昨天 今年 明年 去年 每天 预报 星期 春天 夏天
秋天 冬天 春节 过年 牛奶 咖啡 苹果 鸡蛋 牛肉 牛肉面 米饭 水果 西瓜 手套 钢琴 博物馆 陌生人
短信 外表 现象 生产 遵守 好吃 好看 好听 好喝 有意思 打球 踢球 跑步 洗脸 刷牙 搬家 上学 放学
下课 上课 考上 生病 病人 女孩子 女孩 女生 小狗 小猫 小鸟 大楼 门口 马路 前面 后面 下面 左边
右边 旁边 里面 外面 河内 越南 上海 美国 四川 亚洲 英语 汉字 生词 口语 写作 发音 作家 游客 员工
天黑 大雨 大风 下雨 苹果汁 树叶 生日 运动鞋 报纸 说明书 儿童节 母亲节 医学 大自然 早饭 午饭
晚饭 早餐 房费 一会儿 一共 一起 喝茶 夜路 一身 小吃 难忘 开朗 多少 多大 多久 怎么样 为什么
什么 时候 小时候 有时候 走路 找路 电子书 拍照 点头 张开 天亮 脸红 他们 她们 你们 它们 大学
气温 月底 年底 钱包 父母 国外 轻易 旅行 想法 逛街 长期 大小 之间 之前 美好 感到 大声 院子
垃圾 行李 箱子 房子 到期 收到 睡着 越来越 现代化 饭菜 姓名 长久 家人 饭店 红色 蓝色 南方 东方
西方 海边 暑假 出门 各地 分钟 回事 看看 尝尝 猜猜 谈谈 走走 试试 想想 听听 说说 问问 慢慢
好好 深深 常常 打开 关上
'''.split()
NOT_WORDS = {'一个', '个人', '这是', '有人', '去世', '手指', '电子邮件', '看起来', '天气预报', '北京大学'}
# Âm đọc cho từ không có trong danh sách HSK (giữ thanh nhẹ như giáo trình)
EXTRA_PY = {
    '行李': 'xíng li', '房子': 'fáng zi', '箱子': 'xiāng zi', '院子': 'yuàn zi', '东西': 'dōng xi',
    '告诉': 'gào su', '便宜': 'pián yi', '他们': 'tā men', '她们': 'tā men', '你们': 'nǐ men',
    '它们': 'tā men', '睡着': 'shuì zháo', '出去': 'chū qu', '出来': 'chū lai', '进来': 'jìn lai',
    '回来': 'huí lai', '上去': 'shàng qu', '下去': 'xià qu', '过来': 'guò lai', '下来': 'xià lai',
    '时候': 'shí hou', '小时候': 'xiǎo shí hou', '有时候': 'yǒu shí hou', '这个': 'zhè ge',
    '那个': 'nà ge', '哪个': 'nǎ ge', '地上': 'dì shang', '外面': 'wài mian', '里面': 'lǐ mian',
    '下面': 'xià mian', '前面': 'qián mian', '后面': 'hòu mian', '左边': 'zuǒ bian', '右边': 'yòu bian',
    '东边': 'dōng bian', '西边': 'xī bian', '早上': 'zǎo shang', '晚上': 'wǎn shang', '多少': 'duō shao',
    '点儿': 'diǎn r', '一点儿': 'yì diǎn r', '有点儿': 'yǒu diǎn r', '这儿': 'zhè r', '那儿': 'nà r',
    '哪儿': 'nǎ r', '这些': 'zhè xiē', '那些': 'nà xiē', '哪些': 'nǎ xiē', '一些': 'yì xiē',
    '大学': 'dà xué', '父母': 'fù mǔ', '姓名': 'xìng míng', '垃圾': 'lā jī', '家人': 'jiā rén',
}
AA_VERBS = set('看尝猜谈走试想听说问')
NUMERALS = set('〇零一二两三四五六七八九十百千万亿')
DIGITS = set('〇零一二三四五六七八九十')
MEASURE_AFTER = set('一两三四五六七八九十几这那哪每半上下')
COMPLEMENT_VERBS = set('找看听买吃做写学走跑拿搬睡过想说记打关回进出起来去用')
COMPLEMENTS = set('到了着起动完见开懂清去来下上过好')


def is_han(c):
    return '一' <= c <= '鿿'


def max_match(run, lexicon, reverse=False):
    toks = []
    if not reverse:
        i = 0
        while i < len(run):
            for size in (4, 3, 2):
                w = run[i:i + size]
                if len(w) == size and w in lexicon:
                    toks.append(w)
                    i += size
                    break
            else:
                toks.append(run[i])
                i += 1
        return toks
    j = len(run)
    while j > 0:
        for size in (4, 3, 2):
            if j - size < 0:
                continue
            w = run[j - size:j]
            if w in lexicon:
                toks.append(w)
                j -= size
                break
        else:
            toks.append(run[j - 1])
            j -= 1
    return toks[::-1]


def segment(zh, lexicon):
    """Tách từ theo từ điển (khớp dài nhất hai chiều) để viết pinyin theo từ."""
    n = len(zh)

    def fixed_atom(i):
        """Trả về độ dài của cụm cố định bắt đầu ở i (số, 第+số, số trước 分钟), 0 nếu không có."""
        c = zh[i]
        if not is_han(c):
            return 1
        if c == '第' and i + 1 < n and zh[i + 1] in NUMERALS:
            j = i + 1
            while j < n and zh[j] in NUMERALS:
                j += 1
            return j - i
        if c in NUMERALS:
            j = i
            while j < n and zh[j] in NUMERALS:
                j += 1
            if j - i > 1 or zh[j:j + 2] == '分钟':
                return j - i
        return 0

    atoms = []  # (loại, chuỗi)
    i = 0
    run = ''
    while i < n:
        size = fixed_atom(i)
        if size:
            if run:
                atoms.append(('run', run))
                run = ''
            atoms.append(('x', zh[i:i + size]))
            i += size
        else:
            run += zh[i]
            i += 1
    if run:
        atoms.append(('run', run))
    toks = []
    for kind, s in atoms:
        if kind == 'x':
            toks.append(s)
            continue
        fwd = max_match(s, lexicon)
        bwd = max_match(s, lexicon, reverse=True)
        score = lambda t: (len(t), sum(1 for x in t if len(x) == 1))
        # chiều ngược chỉ thắng khi tách ra ít từ hơn hẳn
        best = bwd if score(bwd) < score(fwd) else fwd
        # "一个人": 个 là lượng từ, không ghép thành 个人
        fixed = []
        for t in best:
            if len(t) > 1 and t[0] in '个只' and fixed and fixed[-1][-1:] in MEASURE_AFTER:
                fixed.extend([t[0], t[1:]])
            else:
                fixed.append(t)
        toks.extend(fixed)
    return toks


SENTENCE_FIX = {}


def sentence_pinyin(zh, lookup, target, target_syls, lexicon):
    if zh in SENTENCE_FIX:
        return SENTENCE_FIX[zh]
    chars = list(zh)
    readings = lazy_pinyin(zh, style=Style.TONE, errors=lambda x: list(x))
    if len(readings) != len(chars):
        raise SystemExit(f'Không khớp độ dài pinyin: {zh}')
    tokens = segment(zh, lexicon)
    pos = 0
    spans = []
    for tok in tokens:
        n = len(tok)
        if tok == target and len(target_syls) == n:
            readings[pos:pos + n] = target_syls
        elif tok in lookup and len(lookup[tok]) == n:
            readings[pos:pos + n] = lookup[tok]
        elif n == 2 and tok[0] == tok[1] and tok[0] in AA_VERBS:
            readings[pos + 1] = set_tone(readings[pos + 1], 0)
        spans.append((pos, pos + n, tok))
        pos += n
    tok_at = {}
    for a, b, t in spans:
        for k in range(a, b):
            tok_at[k] = t
    # các chữ đa âm hay sai khi đứng riêng
    for i, ch in enumerate(chars):
        prev = chars[i - 1] if i else ''
        nxt = chars[i + 1] if i + 1 < len(chars) else ''
        alone = tok_at.get(i) == ch
        if not alone:
            continue
        if ch == '得':
            readings[i] = 'dé' if nxt == '了' else 'de'
        elif ch == '地':
            readings[i] = 'dì' if nxt in '上下里方' else 'de'
        elif ch == '个':
            readings[i] = 'ge'
        elif ch == '了':
            readings[i] = 'liǎo' if prev == '不' and i >= 2 and is_han(chars[i - 2]) else 'le'
        elif ch == '着':
            readings[i] = 'zháo' if prev == '不' else 'zhe'
        elif ch == '不' and i >= 1 and ((nxt in '了着') or (prev in COMPLEMENT_VERBS and nxt in COMPLEMENTS)) and is_han(prev):
            readings[i] = 'bu'
        elif ch == '只' and prev in MEASURE_AFTER:
            readings[i] = 'zhī'
        elif ch == '长':
            readings[i] = 'zhǎng' if nxt in '得大' else 'cháng'
        elif ch == '都':
            readings[i] = 'dōu'
        elif ch == '还' and readings[i] == 'huán' and nxt not in '给钱书':
            readings[i] = 'hái'
        elif ch == '为' and readings[i] == 'wéi':
            readings[i] = 'wèi'
        elif ch == '种':
            readings[i] = 'zhòng' if nxt in '水树花菜' and prev not in MEASURE_AFTER else 'zhǒng'
    # đưa 一/不 về thanh gốc rồi biến điệu theo quy tắc
    for i, ch in enumerate(chars):
        if ch == '一' and tone_of(readings[i]) != 0:
            readings[i] = 'yī'
        if ch == '不' and tone_of(readings[i]) != 0:
            readings[i] = 'bù'
    readings = sandhi(chars, readings)
    # dựng chuỗi: từ cách nhau bằng dấu cách, âm tiết trong từ cách nhau bằng |
    words = []
    for a, b, tok in spans:
        if all(c in PUNCT or not is_han(c) for c in tok):
            for c in tok:
                mark = PUNCT.get(c, c)
                if c in OPENING:
                    words.append(['open', mark])
                else:
                    words.append(['punct', mark])
            continue
        syls = readings[a:b]
        if tok in PROPER or (tok == '王' and (b < len(chars) and zh[b:].startswith(SURNAME_BEFORE) or (a > 0 and chars[a - 1] == '老'))):
            syls = [syls[0][:1].upper() + syls[0][1:]] + syls[1:]
        if tok.endswith('儿') and len(tok) > 1 and syls[-1] in ('ér', 'er', 'r'):
            syls = syls[:-1] + ['r']
        # 们 và 儿 đứng riêng thì ghép vào từ trước: 孩子们 háizimen, 玩儿 wánr
        if tok in ('们', '儿') and words and words[-1][0] == 'word':
            words[-1][1] += '|men' if tok == '们' else 'r'
            continue
        words.append(['word', '|'.join(syls)])
    out = ''
    pending_open = ''
    cap_next = True
    for kind, val in words:
        if kind == 'punct':
            out += val
            if val in '.?!':
                cap_next = True
        elif kind == 'open':
            pending_open += val
            out += ' '
            cap_next = True
        else:
            if out and not out.endswith(' '):
                out += ' '
            if cap_next:
                val = val[:1].upper() + val[1:]
                cap_next = False
            out += pending_open + val
            pending_open = ''
    out = re.sub(r'\s+', ' ', out).strip()
    out = out.replace('|r ', 'r ').replace('|r.', 'r.').replace('|r,', 'r,').replace('|r?', 'r?').replace('|r!', 'r!')
    if out:
        out = out[0].upper() + out[1:]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hv', required=True)
    ap.add_argument('--mmah', required=True)
    ap.add_argument('--strokes', required=True)
    args = ap.parse_args()

    hvdata = load_hanviet(args.hv)
    mmah = {}
    for line in Path(args.mmah).read_text(encoding='utf-8').splitlines():
        d = json.loads(line)
        mmah[d['character']] = d

    datasets = {lv: {w['simplified']: w for w in json.loads((SRC / f'hsk-old{lv}.json').read_text(encoding='utf-8'))} for lv in (3, 4)}
    lookup = build_lookup((1, 2, 3, 4, 5, 6))
    lexicon = (set(lookup) | set(EXTRA_WORDS) | PROPER) - NOT_WORDS

    authored = {
        3: parse_authored(SRC / 'hsk3.txt'),
        4: parse_authored(SRC / 'hsk4-1.txt') + parse_authored(SRC / 'hsk4-2.txt'),
    }

    words = []
    problems = []
    for lv in (3, 4):
        seen = set()
        for i, row in enumerate(authored[lv], 1):
            h = row['hanzi']
            if h in seen:
                problems.append(f'Trùng {h} (HSK {lv})')
            seen.add(h)
            src = datasets[lv].get(h)
            if not src:
                problems.append(f'Không có {h} trong danh sách HSK {lv}')
                continue
            form, py = choose_form(src)
            syls = py.split(' ')
            syls = syls[:1] + [s.lower() for s in syls[1:]]
            if len(syls) != len(h):
                problems.append(f'Số âm tiết không khớp: {h} {py}')
            numeric = numeric_of(syls)
            syls = sandhi(list(h), syls)
            trad = form['traditional']
            hv = vn_new_style(hv_for(trad, numeric, hvdata, h))
            if row['ex_zh'].find(h) < 0:
                problems.append(f'Câu ví dụ không chứa từ {h}: {row["ex_zh"]}')
            pos = POS_FIX.get(h) or (src.get('pos') or ['x'])[0]
            words.append({
                'id': f'{lv}-{i:03d}',
                'level': lv,
                'hanzi': h,
                'trad': trad if trad != h else None,
                'py': syls,
                'pos': POS_VI.get(pos),
                'hv': hv,
                'vi': row['vi'],
                'en': row['en'],
                'topic': row['topic'],
                'ex': {
                    'zh': row['ex_zh'],
                    'py': sentence_pinyin(row['ex_zh'], lookup, h, syls, lexicon | {h}),
                    'vi': row['ex_vi'],
                    'en': row['ex_en'],
                },
            })
        missing = set(datasets[lv]) - seen
        for m in sorted(missing):
            problems.append(f'Thiếu từ {m} của HSK {lv}')

    # bài học: theo cấp → chủ đề, mỗi bài tối đa LESSON_MAX từ
    lessons = []
    for lv in (3, 4):
        for tid in TOPIC_IDS:
            group = [w for w in words if w['level'] == lv and w['topic'] == tid]
            if not group:
                continue
            parts = math.ceil(len(group) / LESSON_MAX)
            size = math.ceil(len(group) / parts)
            for p in range(parts):
                chunk = group[p * size:(p + 1) * size]
                lid = f'{lv}-{tid}-{p + 1}'
                for w in chunk:
                    w['lesson'] = lid
                lessons.append({'id': lid, 'level': lv, 'topic': tid, 'part': p + 1, 'parts': parts, 'words': [w['id'] for w in chunk]})

    # dữ liệu từng chữ: bộ thủ, số nét, âm đọc gặp trong từ vựng
    chars = {}
    stroke_dir = OUT / 'strokes'
    if stroke_dir.exists():
        shutil.rmtree(stroke_dir)
    stroke_dir.mkdir(parents=True)
    for w in words:
        hv_syls = w['hv'].split(' ')
        for i, ch in enumerate(w['hanzi']):
            info = chars.setdefault(ch, {'py': [], 'hv': [], 'words': []})
            if i < len(w['py']) and w['py'][i] not in info['py'] and w['py'][i] != 'r':
                info['py'].append(w['py'][i])
            if i < len(hv_syls) and hv_syls[i] not in info['hv']:
                info['hv'].append(hv_syls[i])
            info['words'].append(w['id'])
    buckets = {}
    for ch, info in chars.items():
        m = mmah.get(ch, {})
        rad = m.get('radical')
        info['radical'] = rad
        if rad == '阝':
            # 阝 bên trái là bộ phụ (阜), bên phải là bộ ấp (邑)
            info['radVi'] = 'phụ' if (m.get('decomposition') or '').startswith('⿰阝') else 'ấp'
        elif rad == ch:
            info['radVi'] = RADICAL_VI.get(rad) or (info['hv'][0] if info['hv'] else None)
        else:
            info['radVi'] = RADICAL_VI.get(rad)
        if not info['radVi']:
            problems.append(f'Thiếu tên bộ thủ {rad} ({ch})')
        info['def'] = m.get('definition')
        src = Path(args.strokes) / f'{ch}.json'
        if not src.exists():
            problems.append(f'Không có dữ liệu nét cho {ch}')
            continue
        data = json.loads(src.read_text(encoding='utf-8'))
        info['strokes'] = len(data['strokes'])
        buckets.setdefault(ord(ch) % STROKE_BUCKETS, {})[ch] = data

    if problems:
        print('\n'.join(problems))
        raise SystemExit(f'{len(problems)} lỗi dữ liệu')
    for b, group in sorted(buckets.items()):
        (stroke_dir / f'{b:02x}.json').write_text(json.dumps(dict(sorted(group.items())), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    out = {
        'version': 1,
        'topics': [{'id': t[0], 'vi': t[1], 'en': t[2], 'icon': t[3]} for t in TOPICS],
        'lessons': lessons,
        'words': [{k: v for k, v in w.items() if v is not None} for w in words],
        'chars': chars,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / 'words.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"{len(words)} từ, {len(lessons)} bài, {len(chars)} chữ ({len(buckets)} tệp nét) → data/words.json, data/strokes/")


if __name__ == '__main__':
    main()
