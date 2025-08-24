from flask import Flask, request, jsonify
from flask_cors import CORS
import win32ui
import win32con
import win32print
import win32gui
import pywintypes
import logging
from logging.handlers import TimedRotatingFileHandler
import json

# --- إعداد نظام التسجيل (Logging) ---
log_handler = TimedRotatingFileHandler(
    filename='printer_service.log', when='D', interval=1, backupCount=30, encoding='utf-8'
)
log_handler.setLevel(logging.INFO)
log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
log_handler.setFormatter(log_formatter)
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(log_handler)

# --- إعدادات الطابعة ---
PRINTER_NAME = "POSPrinter POS80"
PAGE_WIDTH_PIXELS = 576
MARGIN = 20

# --- تهيئة خادم Flask ---
app = Flask(__name__)
CORS(app)

# --- تعريف الخطوط ---
font_config = {
    "title": {"name": "Tahoma", "height": 36, "weight": 700},
    "normal_bold": {"name": "Tahoma", "height": 28, "weight": 700},
    "normal": {"name": "Tahoma", "height": 28, "weight": 400},
    "small": {"name": "Tahoma", "height": 24, "weight": 400},
}

# --- [الإضافة] دالة مساعدة للتنسيق الذكي للأرقام ---
def format_number(value):
    """
    تنسق الرقم: كرقم صحيح إذا لم يكن له جزء عشري،
    أو كرقم عشري بفاصلتين إذا كان له جزء عشري.
    """
    try:
        val_float = float(value)
        if val_float == int(val_float):
            return f"{int(val_float):,}"
        else:
            return f"{val_float:,.2f}"
    except (ValueError, TypeError):
        return str(value)


def calculate_and_print(data, print_function, doc_name):
    """
    المدير العام للطباعة: يحسب الارتفاع، يجهز الورق الطويل، وينفذ الطباعة.
    """
    total_height = print_function(data, calculate_only=True)

    h_printer = win32print.OpenPrinter(PRINTER_NAME)
    properties = win32print.GetPrinter(h_printer, 2)
    devmode = properties['pDevMode']
    
    paper_length_mm10 = int((total_height / 96) * 25.4 * 10)

    devmode.PaperSize = 0
    devmode.PaperLength = paper_length_mm10
    devmode.Fields |= win32con.DM_PAPERSIZE | win32con.DM_PAPERLENGTH

    win32print.ClosePrinter(h_printer)

    hDC_handle = win32gui.CreateDC("WINSPOOL", PRINTER_NAME, devmode)
    hDC = win32ui.CreateDCFromHandle(hDC_handle)
    
    hDC.StartDoc(doc_name)
    hDC.StartPage()
    
    try:
        print_function(data, calculate_only=False, hDC=hDC)
    finally:
        hDC.EndPage()
        hDC.EndDoc()
        hDC.DeleteDC()


def print_receipt(data, calculate_only=False, hDC=None):
    y_pos = MARGIN
    def draw(height):
        nonlocal y_pos; y_pos += height

    # --- حساب الارتفاع ---
    draw(40);
    for _ in data.get('companyInfo', []): draw(30)
    draw(25); draw(45); draw(35); draw(35); draw(35);
    draw(10); draw(25);
    draw(35); draw(20);
    for _ in data.get('articlesVendus', []): draw(35)
    draw(25); draw(30); draw(35);
    if data.get('remiseVente', 0) > 0: draw(35)
    if data.get('fraisLivraison', 0) > 0: draw(35)
    if data.get('fraisTravail', 0) > 0: draw(35)
    draw(45); draw(35);
    if data.get('estCredit'): draw(35)
    draw(25); draw(60);

    if calculate_only:
        return y_pos + MARGIN

    # --- الطباعة الفعلية ---
    fonts = {key: win32ui.CreateFont(val) for key, val in font_config.items()}
    y_pos = MARGIN
    
    def draw_centered_text(text, font, y_offset=40):
        nonlocal y_pos; hDC.SelectObject(font); hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(int(PAGE_WIDTH_PIXELS / 2), y_pos, text); y_pos += y_offset
    def draw_line_separator(y_offset=25):
        nonlocal y_pos; hDC.MoveTo((MARGIN, y_pos)); hDC.LineTo((PAGE_WIDTH_PIXELS - MARGIN, y_pos)); y_pos += y_offset
    def draw_two_column_text(label, value, font, y_offset=35):
        nonlocal y_pos; hDC.SelectObject(font); hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(PAGE_WIDTH_PIXELS - MARGIN, y_pos, f"{label}"); hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(MARGIN, y_pos, str(value)); y_pos += y_offset
    
    company_name = data.get('companyName', 'مؤسسة بوطويل لبيع مواد البناء')
    company_info = data.get('companyInfo', ["العنوان: جيجل، الشقفة، مزوارة", "الهاتف: 0660091466"])
    draw_centered_text(company_name, fonts["title"]);
    for line in company_info: draw_centered_text(line, fonts["small"], y_offset=30)
    draw_line_separator()
    draw_two_column_text("رقم الإيصال", data.get('numeroRecu', 'N/A'), fonts["normal"], y_offset=45)
    timestamp = data.get('transactionTimestamp', data.get('date', 'N/A'))
    draw_two_column_text("التاريخ", timestamp, fonts["normal"])
    draw_two_column_text("العميل", data.get('nomClient', 'N/A'), fonts["normal"])
    draw_two_column_text("نوع البيع", 'كريدي' if data.get('estCredit') else 'نقدي', fonts["normal"])
    y_pos += 10
    draw_line_separator()
    
    # --- [تعديل] ضبط المسافات بين الأعمدة ---
    col_name  = PAGE_WIDTH_PIXELS - MARGIN; col_qty = MARGIN + 260; col_price = MARGIN + 160; col_total = MARGIN
    
    hDC.SelectObject(fonts["normal_bold"])
    hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(col_name, y_pos, "المنتج")
    hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(col_qty, y_pos, "الكمية"); hDC.TextOut(col_price, y_pos, "السعر")
    hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, "الإجمالي")
    y_pos += 35
    draw_line_separator(y_offset=20)
    for item in data.get('articlesVendus', []):
        hDC.SelectObject(fonts["normal"])
        hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(col_name, y_pos, str(item.get('nomProduit', '')))
        hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(col_qty, y_pos, f"{int(item.get('quantite', 0)):,}"); hDC.TextOut(col_price, y_pos, format_number(item.get('prixUnitaire', 0)))
        hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, format_number(item.get('total', 0)))
        y_pos += 35
    draw_line_separator()
    draw_centered_text("(المبالغ بالدينار الجزائري)", fonts["small"], y_offset=30)
    draw_two_column_text("المجموع الفرعي", format_number(data.get('sousTotal', 0)), fonts["normal"])
    if data.get('remiseVente', 0) > 0: draw_two_column_text("الخصم", format_number(data.get('remiseVente', 0)), fonts["normal"])
    if data.get('fraisLivraison', 0) > 0: draw_two_column_text("تكلفة التوصيل", format_number(data.get('fraisLivraison', 0)), fonts["normal"])
    if data.get('fraisTravail', 0) > 0: draw_two_column_text("تكلفة العمال", format_number(data.get('fraisTravail', 0)), fonts["normal"])
    draw_two_column_text("الإجمالي", format_number(data.get('total', 0)), fonts["title"], y_offset=45)
    draw_two_column_text("المدفوع", format_number(data.get('montantPaye', 0)), fonts["normal"])
    if data.get('estCredit'): draw_two_column_text("المتبقي", format_number(data.get('resteAPayer', 0)), fonts["normal"])
    draw_line_separator()
    draw_centered_text("شكراً لتعاملكم معنا", fonts["small"], y_offset=60)


def print_debt_invoices(data, calculate_only=False, hDC=None):
    is_summary = data.get('type') == 'debt_summary'
    y_pos = MARGIN
    def draw(height):
        nonlocal y_pos; y_pos += height

    invoices_list = data.get('invoices', [])
    total_labor_cost = sum(inv.get('labor_cost', 0) for inv in invoices_list)
    total_delivery_cost = sum(inv.get('delivery_price', 0) for inv in invoices_list)

    draw(40);
    for _ in data.get('companyInfo', []): draw(30)
    draw(25); draw(45); draw(35); draw(25);
    draw(45); draw(30);
    if is_summary:
        for _ in invoices_list:
            draw(35); draw(35);
            if _.get('delivery_price', 0) > 0: draw(35)
            if _.get('labor_cost', 0) > 0: draw(35)
            draw(35); draw(40); draw(25)
    else:
        for invoice in invoices_list:
            draw(35); draw(35); draw(15);
            draw(35); draw(20)
            for _ in invoice.get('items', []): draw(35)
            draw(25)
            if invoice.get('delivery_price', 0) > 0: draw(35)
            if invoice.get('labor_cost', 0) > 0: draw(35)
            draw(35); draw(35); draw(20); draw(30)
    draw(25); draw(10);
    draw(35);
    if total_labor_cost > 0: draw(35)
    if total_delivery_cost > 0: draw(35)
    draw(15); draw(45); draw(60);

    if calculate_only:
        return y_pos + MARGIN

    fonts = {key: win32ui.CreateFont(val) for key, val in font_config.items()}
    y_pos = MARGIN
    
    def draw_centered_text(text, font, y_offset=40):
        nonlocal y_pos; hDC.SelectObject(font); hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(int(PAGE_WIDTH_PIXELS / 2), y_pos, text); y_pos += y_offset
    def draw_line_separator(y_offset=25):
        nonlocal y_pos; hDC.MoveTo((MARGIN, y_pos)); hDC.LineTo((PAGE_WIDTH_PIXELS - MARGIN, y_pos)); y_pos += y_offset
    def draw_two_column_text(label, value, font, y_offset=35):
        nonlocal y_pos; hDC.SelectObject(font); hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(PAGE_WIDTH_PIXELS - MARGIN, y_pos, f"{label}"); hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(MARGIN, y_pos, str(value)); y_pos += y_offset
    
    company_name = data.get('companyName', 'مؤسسة بوطويل')
    company_info = data.get('companyInfo', [])
    draw_centered_text(company_name, fonts["title"])
    for line in company_info: draw_centered_text(line, fonts["small"], y_offset=30)
    draw_line_separator()
    draw_two_column_text("العميل", data.get('clientName', 'N/A'), fonts["normal_bold"], y_offset=45)
    draw_two_column_text("تاريخ الطباعة", data.get('printDate', 'N/A'), fonts["normal"])
    draw_line_separator()

    if is_summary:
        draw_centered_text("كشف الديون الشامل", fonts["title"], y_offset=45)
        draw_centered_text("(المبالغ بالدينار الجزائري)", fonts["small"], y_offset=30)
        for invoice in invoices_list:
            draw_two_column_text("رقم الفاتورة", invoice.get('sale_id', 'N/A'), fonts["normal_bold"])
            draw_two_column_text("التاريخ", invoice.get('date', 'N/A'), fonts["normal"])
            if invoice.get('delivery_price', 0) > 0: draw_two_column_text("تكلفة التوصيل", format_number(invoice.get('delivery_price', 0)), fonts["normal"])
            if invoice.get('labor_cost', 0) > 0: draw_two_column_text("تكلفة العمال", format_number(invoice.get('labor_cost', 0)), fonts["normal"])
            draw_two_column_text("إجمالي الفاتورة", format_number(invoice.get('total', 0)), fonts["normal"])
            draw_two_column_text("المتبقي", format_number(invoice.get('remaining', 0)), fonts["normal_bold"], y_offset=40)
            draw_line_separator()
    else:
        draw_centered_text("تفاصيل فواتير الديون", fonts["title"], y_offset=45)
        draw_centered_text("(المبالغ بالدينار الجزائري)", fonts["small"], y_offset=30)
        for invoice in invoices_list:
            draw_centered_text(f"--- فاتورة رقم #{invoice.get('sale_id', 'N/A')} ---", fonts["normal_bold"])
            draw_two_column_text("التاريخ", invoice.get('date', 'N/A'), fonts["normal"])
            draw_line_separator(y_offset=15)
            col_name  = PAGE_WIDTH_PIXELS - MARGIN; col_qty = MARGIN + 260; col_price = MARGIN + 160; col_total = MARGIN
            hDC.SelectObject(fonts["normal_bold"])
            hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(col_name, y_pos, "المنتج")
            hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(col_qty, y_pos, "الكمية"); hDC.TextOut(col_price, y_pos, "السعر")
            hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, "الإجمالي")
            y_pos += 35
            draw_line_separator(y_offset=20)
            for product in invoice.get('items', []):
                hDC.SelectObject(fonts["normal"])
                hDC.SetTextAlign(win32con.TA_RIGHT); hDC.TextOut(col_name, y_pos, str(product.get('product_name', '')))
                hDC.SetTextAlign(win32con.TA_CENTER); hDC.TextOut(col_qty, y_pos, f"{int(product.get('quantity', 0)):,}"); hDC.TextOut(col_price, y_pos, format_number(product.get('unit_price', 0)))
                hDC.SetTextAlign(win32con.TA_LEFT); hDC.TextOut(col_total, y_pos, format_number(product.get('total_price', 0)))
                y_pos += 35
            draw_line_separator()
            if invoice.get('delivery_price', 0) > 0: draw_two_column_text("تكلفة التوصيل", format_number(invoice.get('delivery_price', 0)), fonts["normal"])
            if invoice.get('labor_cost', 0) > 0: draw_two_column_text("تكلفة العمال", format_number(invoice.get('labor_cost', 0)), fonts["normal"])
            draw_two_column_text("إجمالي الفاتورة", format_number(invoice.get('total', 0)), fonts["normal_bold"])
            draw_two_column_text("المتبقي من الفاتورة", format_number(invoice.get('remaining', 0)), fonts["normal_bold"])
            y_pos += 20
            draw_line_separator(y_offset=30)
    
    total_invoices_amount = sum(inv.get('total', 0) for inv in invoices_list)
    draw_line_separator()
    y_pos += 10
    draw_two_column_text("إجمالي مبلغ الفواتير", format_number(total_invoices_amount), fonts["normal_bold"])
    if total_labor_cost > 0:
        draw_two_column_text("منها إجمالي العمالة", format_number(total_labor_cost), fonts["normal"])
    if total_delivery_cost > 0:
        draw_two_column_text("منها إجمالي النقل", format_number(total_delivery_cost), fonts["normal"])
    y_pos += 15
    draw_two_column_text("الإجمالي المتبقي الكلي", format_number(data.get('totalRemaining', 0)), fonts["title"], y_offset=45)
    draw_centered_text("شكراً لتعاملكم معنا", fonts["small"], y_offset=60)


@app.route('/print', methods=['POST'])
def handle_print_request():
    if not request.is_json:
        return jsonify({"error": "الطلب يجب أن يكون بصيغة JSON"}), 400
    
    data = request.get_json()
    logger.info("="*30)
    logger.info("تم استلام طلب طباعة جديد بالبيانات التالية:")
    logger.info(json.dumps(data, indent=2, ensure_ascii=False))
    
    try:
        print_type = data.get('type', 'receipt')
        if print_type == 'receipt':
            calculate_and_print(data, print_receipt, "فاتورة بيع")
        elif print_type in ['debt_summary', 'debt_invoices']:
            data['type'] = print_type
            calculate_and_print(data, print_debt_invoices, "فاتورة ديون")
        else:
            logger.warning(f"نوع طباعة غير معروف: {print_type}")
            return jsonify({"error": "نوع الطباعة غير مدعوم."}), 400

        logger.info("تم إرسال البيانات إلى الطابعة بنجاح.")
        return jsonify({"status": "تم الإرسال للطباعة بنجاح"}), 200
        
    except (ConnectionError, pywintypes.error) as e:
        logger.error(f"خطأ في الاتصال بالطابعة أو إعداداتها: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"حدث خطأ فادح أثناء عملية الطباعة: {e}", exc_info=True)
        return jsonify({"error": f"حدث خطأ غير متوقع: {e}"}), 500

if __name__ == '__main__':
    port = 5000
    logger.info(f"خادم الطباعة بدأ العمل على http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=False)