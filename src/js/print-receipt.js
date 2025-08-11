document.addEventListener('DOMContentLoaded', () => {
    console.log('print-receipt.js: بدء تهيئة زر الطباعة');

    // الوصول إلى زر الطباعة
    const printButton = document.getElementById('printReceipt');
    if (!printButton) {
        console.error('print-receipt.js: زر الطباعة غير موجود في DOM');
        alert('خطأ في تحميل الصفحة: زر الطباعة غير موجود');
        return;
    }
    console.log('print-receipt.js: تم العثور على زر الطباعة في DOM');

    // دالة لإرسال النص إلى الطابعة
    async function sendToPrinter(receiptText) {
        const ports = ['5000', '5001']; // قائمة البورتات للمحاولة
        let lastError = null;

        for (const port of ports) {
            try {
                console.log(`print-receipt.js: محاولة إرسال النص إلى الطابعة على البورت ${port}`);
                console.log('print-receipt.js: نص الإيصال المرسل:', receiptText);
                const payload = { message: receiptText };
                console.log('print-receipt.js: JSON المرسل:', JSON.stringify(payload, null, 2));

                const response = await fetch(`http://127.0.0.1:${port}/print`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`print-receipt.js: استجابة الخطأ من الخادم على البورت ${port}:`, errorText);
                    throw new Error(`فشل الاتصال بخادم الطباعة على البورت ${port}: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log(`print-receipt.js: تم إرسال النص للطباعة بنجاح على البورت ${port}`, result);
                alert(result.status || 'تم إرسال الإيصال للطباعة بنجاح');
                return; // الخروج بعد نجاح الطباعة
            } catch (error) {
                console.error(`print-receipt.js: خطأ في الطباعة على البورت ${port}:`, error.message);
                lastError = error;
            }
        }

        // إذا فشلت كل المحاولات
        console.error('print-receipt.js: فشلت كل محاولات الطباعة');
        alert(`فشل الطباعة: ${lastError.message}`);
    }

    // دالة لتوليد نص الإيصال
    function generateReceiptText() {
        console.log('print-receipt.js: توليد نص الإيصال');

        // --- 1. الوصول إلى عناصر DOM ---
        const selectClient = document.getElementById('clientSelect');
        const dateVente = document.getElementById('saleDate');
        const estCredit = document.getElementById('isCredit');
        const remiseVente = document.getElementById('saleDiscount');
        const fraisLivraison = document.getElementById('deliveryPrice');
        const fraisTravail = document.getElementById('laborCost'); // حقل تكلفة العمال الجديد
        const corpsTableauArticles = document.getElementById('saleItemsTableBody');
        const affichageSousTotal = document.getElementById('subtotal');
        const affichageTotal = document.getElementById('total');
        const inputMontantPaye = document.getElementById('paidAmount');
        const affichageReste = document.getElementById('remaining');

        // --- 2. التحقق من وجود العناصر ---
        if (!selectClient || !dateVente || !estCredit || !remiseVente || !fraisLivraison || 
            !fraisTravail || !corpsTableauArticles || !affichageSousTotal || !affichageTotal || 
            !inputMontantPaye || !affichageReste) {
            console.error('print-receipt.js: أحد عناصر DOM أو أكثر غير موجود');
            alert('خطأ: أحد عناصر الصفحة غير موجود.');
            return null;
        }

        // --- 3. استخراج البيانات ---
        const nomClient = selectClient.selectedOptions[0]?.textContent.split(' (')[0] || 'بيع نقدي';
        const date = dateVente.value || new Date().toISOString().split('T')[0];
        const estCreditValeur = parseInt(estCredit.value) || 0;
        const remiseVenteValeur = parseFloat(remiseVente.value) || 0;
        const fraisLivraisonValeur = parseFloat(fraisLivraison.value) || 0;
        const fraisTravailValeur = parseFloat(fraisTravail.value) || 0; // استخراج تكلفة العمال
        const sousTotal = parseFloat(affichageSousTotal.textContent) || 0;
        const total = parseFloat(affichageTotal.textContent) || 0;
        const montantPaye = parseFloat(inputMontantPaye.value) || 0;
        const resteAPayer = parseFloat(affichageReste.textContent) || 0;

        const articlesVendus = Array.from(corpsTableauArticles.children).map(row => ({
            nomProduit: row.cells[0]?.textContent.trim() || 'غير معروف',
            quantite: parseFloat(row.cells[1]?.textContent) || 0,
            prixUnitaire: parseFloat(row.cells[2]?.textContent) || 0,
            remise: parseFloat(row.cells[3]?.textContent) || 0,
            total: parseFloat(row.cells[4]?.textContent) || 0
        }));

        if (articlesVendus.length === 0) {
            console.error('print-receipt.js: لا توجد عناصر في المبيعات');
            alert('يرجى إضافة منتج واحد على الأقل.');
            return null;
        }

        // --- 4. توليد نص الإيصال ---
        const numeroRecu = `${date.replace(/-/g, '')}-001`;
        const ligneSeparatrice = '-'.repeat(40);
        let texteRecu = '';

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `        شركة المواد المثالية\n`;
        texteRecu += ` العنوان: جيجل، شقفة، بوغاطن\n`;
        texteRecu += `         الهاتف: 0558815453\n`;
        texteRecu += `       رقم الإيصال: ${numeroRecu}\n`;
        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `التاريخ: ${date}\n`;
        texteRecu += `العميل: ${nomClient}\n`;
        texteRecu += `نوع البيع: ${estCreditValeur ? 'كريدي' : 'نقدي'}\n`;
        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `المنتج          الكمية  سعر الوحدة  الخصم  الإجمالي\n`;
        texteRecu += `${ligneSeparatrice}\n`;

        articlesVendus.forEach(item => {
            const nom = item.nomProduit.padEnd(15).slice(0, 15);
            const qte = item.quantite.toString().padStart(3);
            const pu = item.prixUnitaire.toFixed(0).padStart(6);
            const rem = item.remise.toFixed(0).padStart(4);
            const tot = item.total.toFixed(0).padStart(7);
            texteRecu += `${nom} ${qte} ${pu} ${rem} ${tot}\n`;
        });

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `المجموع الفرعي:    ${sousTotal.toFixed(2)} د.ج\n`;
        if (remiseVenteValeur > 0)
            texteRecu += `الخصم:             ${remiseVenteValeur.toFixed(2)} د.ج\n`;
        if (fraisLivraisonValeur > 0)
            texteRecu += `تكلفة التوصيل:     ${fraisLivraisonValeur.toFixed(2)} د.ج\n`;
        if (fraisTravailValeur > 0)
            texteRecu += `تكلفة العمال:      ${fraisTravailValeur.toFixed(2)} د.ج\n`;
        texteRecu += `الإجمالي:           ${total.toFixed(2)} د.ج\n`;
        texteRecu += `المدفوع:           ${montantPaye.toFixed(2)} د.ج\n`;
        if (estCreditValeur)
            texteRecu += `المتبقي:           ${resteAPayer.toFixed(2)} د.ج\n`;

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += ` شكراً لثقتكم بنا !\n`;
        texteRecu += ` [ختم الشركة]\n`;
        texteRecu += `${ligneSeparatrice}`;

        console.log('print-receipt.js: نص الإيصال المولد:\n', texteRecu);
        return texteRecu;
    }

    // التعامل مع النقر على زر الطباعة
    printButton.addEventListener('click', () => {
        console.log('print-receipt.js: النقر على زر الطباعة');
        const saleItemsTableBody = document.getElementById('saleItemsTableBody');
        if (!saleItemsTableBody || saleItemsTableBody.children.length === 0) {
            console.error('print-receipt.js: لا توجد عناصر مبيعات للطباعة');
            alert('يرجى إضافة منتج واحد على الأقل قبل الطباعة.');
            return;
        }

        const receiptText = generateReceiptText();
        if (receiptText) {
            sendToPrinter(receiptText);
        }
    });
});