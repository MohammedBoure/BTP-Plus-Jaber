from flask import Flask, request, jsonify
from flask_cors import CORS
import win32print
import win32ui
import win32con
import logging # <-- 1. استيراد مكتبة التسجيل
import json    # <-- 2. استيراد مكتبة JSON لتنسيق البيانات في السجل

# --- 3. إعداد نظام التسجيل (Logging) ---
# سيتم إنشاء ملف جديد باسم printer_service.log في نفس مجلد التطبيق
logging.basicConfig(
    filename='printer_service.log',
    level=logging.INFO, # تسجيل الرسائل من مستوى INFO فما فوق (INFO, WARNING, ERROR, CRITICAL)
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8' # ضروري جداً لدعم اللغة العربية في ملف السجل
)

# --- إعدادات الطابعة والتنسيق الثابتة ---
PRINTER_NAME = "POSPrinter POS80"
PAGE_WIDTH = 576
MARGIN = 20

# --- تهيئة خادم Flask ---
app = Flask(__name__)
CORS(app)

# --- تعريف الخطوط المستخدمة ---
font_config = {
    "title": {"name": "Tahoma", "height": 36, "weight": 700},
    "normal": {"name": "Tahoma", "height": 28, "weight": 400},
    "small": {"name": "Tahoma", "height": 24, "weight": 400},
}

def print_receipt(data):
    """الدالة الرئيسية التي تأخذ بيانات الفاتورة كـ dict وتنفذ عملية الطباعة."""
    try:
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(PRINTER_NAME)
    except win32ui.error as e:
        # تسجيل الخطأ في ملف السجل بدلاً من الطباعة
        logging.error(f"خطأ في الاتصال بالطابعة '{PRINTER_NAME}': {e}")
        raise ConnectionError(f"لا يمكن الاتصال بالطابعة. هل الاسم '{PRINTER_NAME}' صحيح؟")

    try:
        hDC.StartDoc("فاتورة بيع")
        hDC.StartPage()
        hDC.SetTextAlign(win32con.TA_RIGHT)

        fonts = {key: win32ui.CreateFont(val) for key, val in font_config.items()}
        y_pos = MARGIN

        def draw_centered_text(text, font, y_offset=40):
            nonlocal y_pos
            hDC.SelectObject(font)
            hDC.SetTextAlign(win32con.TA_LEFT)
            text_width, _ = hDC.GetTextExtent(text)
            x = int((PAGE_WIDTH - text_width) / 2)
            hDC.TextOut(x, y_pos, text)
            y_pos += y_offset
            hDC.SetTextAlign(win32con.TA_RIGHT)

        def draw_line_separator(y_offset=25):
            nonlocal y_pos
            hDC.MoveTo((MARGIN, y_pos))
            hDC.LineTo((PAGE_WIDTH - MARGIN, y_pos))
            y_pos += y_offset

        def draw_two_column_text(label, value, font, y_offset=35):
            nonlocal y_pos
            hDC.SelectObject(font)
            hDC.TextOut(PAGE_WIDTH - MARGIN, y_pos, f"{label}")
            hDC.SetTextAlign(win32con.TA_LEFT)
            hDC.TextOut(MARGIN, y_pos, str(value))
            hDC.SetTextAlign(win32con.TA_RIGHT)
            y_pos += y_offset
            
        company_name = data.get('companyName', 'بيع مواد البناء الخام')
        company_info = data.get('companyInfo', ["العنوان: جيجل، شقفة، بوغطن", "الهاتف: 0660091466"])
        
        # --- 1. رأس الفاتورة ---
        draw_centered_text(company_name, fonts["title"])
        for line in company_info:
            draw_centered_text(line, fonts["small"], y_offset=30)
        draw_two_column_text("رقم الإيصال", data.get('numeroRecu', 'N/A'), fonts["normal"], y_offset=45)
        draw_line_separator()

        # --- 2. بيانات العميل ---
        timestamp = data.get('transactionTimestamp', data.get('date', 'N/A'))
        draw_two_column_text("تاريخ ووقت العملية", timestamp, fonts["normal"])
        draw_two_column_text("العميل", data.get('nomClient', 'N/A'), fonts["normal"])
        draw_two_column_text("نوع البيع", 'كريدي' if data.get('estCredit') else 'نقدي', fonts["normal"])
        y_pos += 10
        draw_line_separator()
        
        # --- 3. جدول المنتجات ---
        col_total = MARGIN + 100; col_price = MARGIN + 230; col_qty = MARGIN + 350; col_name = PAGE_WIDTH - MARGIN
        hDC.SelectObject(fonts["normal"])
        hDC.TextOut(col_name, y_pos, "المنتج"); hDC.SetTextAlign(win32con.TA_CENTER)
        hDC.TextOut(col_qty, y_pos, "الكمية"); hDC.TextOut(col_price, y_pos, "السعر")
        hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, "الإجمالي")
        y_pos += 35; hDC.SetTextAlign(win32con.TA_RIGHT); draw_line_separator(y_offset=20)

        for item in data.get('articlesVendus', []):
            hDC.SelectObject(fonts["normal"]); hDC.TextOut(col_name, y_pos, str(item.get('nomProduit', '')))
            hDC.SetTextAlign(win32con.TA_CENTER)
            hDC.TextOut(col_qty, y_pos, str(item.get('quantite', 0)))
            hDC.TextOut(col_price, y_pos, f"{item.get('prixUnitaire', 0):,}")
            hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, f"{item.get('total', 0):,}")
            y_pos += 35; hDC.SetTextAlign(win32con.TA_RIGHT)
        draw_line_separator()

        # --- 4. المجاميع ---
        draw_two_column_text("المجموع الفرعي", f"{data.get('sousTotal', 0):,.2f} د.ج", fonts["normal"])
        if data.get('remiseVente', 0) > 0: draw_two_column_text("الخصم", f"{data.get('remiseVente', 0):,.2f} د.ج", fonts["normal"])
        if data.get('fraisLivraison', 0) > 0: draw_two_column_text("تكلفة التوصيل", f"{data.get('fraisLivraison', 0):,.2f} د.ج", fonts["normal"])
        if data.get('fraisTravail', 0) > 0: draw_two_column_text("تكلفة العمال", f"{data.get('fraisTravail', 0):,.2f} د.ج", fonts["normal"])
        draw_two_column_text("الإجمالي", f"{data.get('total', 0):,.2f} د.ج", fonts["title"], y_offset=45)
        draw_two_column_text("المدفوع", f"{data.get('montantPaye', 0):,.2f} د.ج", fonts["normal"])
        if data.get('estCredit'): draw_two_column_text("المتبقي", f"{data.get('resteAPayer', 0):,.2f} د.ج", fonts["normal"])
        draw_line_separator()
        
        # --- 5. رسالة شكر ---
        draw_centered_text("شكراً لتعاملكم معنا", fonts["small"], y_offset=60)
    finally:
        hDC.EndPage(); hDC.EndDoc(); hDC.DeleteDC()


@app.route('/print', methods=['POST'])
def handle_print_request():
    """نقطة النهاية (API Endpoint) التي تستقبل الطلب."""
    if not request.is_json:
        return jsonify({"error": "الطلب يجب أن يكون بصيغة JSON"}), 400
    receipt_data = request.get_json()

    # --- 4. استبدال الـ print بالتسجيل في الملف ---
    logging.info("="*30)
    logging.info("تم استلام طلب طباعة جديد بالبيانات التالية:")
    # استخدام json.dumps لتنسيق البيانات بشكل جميل في ملف السجل
    logging.info(json.dumps(receipt_data, indent=2, ensure_ascii=False))
    
    try:
        print_receipt(receipt_data)
        logging.info("تم إرسال الفاتورة إلى الطابعة بنجاح.")
        return jsonify({"status": "تم إرسال الفاتورة للطباعة بنجاح"}), 200
    except Exception as e:
        # تسجيل تفاصيل الخطأ الكاملة (Traceback) للمساعدة في التشخيص
        logging.error(f"حدث خطأ فادح أثناء عملية الطباعة: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logging.info("خادم الطباعة بدأ العمل على http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
