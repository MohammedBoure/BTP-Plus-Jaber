document.addEventListener('DOMContentLoaded', () => {
    console.log('print-receipt.js: بدء تهيئة زر الطباعة');

    const printButton = document.getElementById('printReceipt');
    if (!printButton) {
        console.error('print-receipt.js: زر الطباعة غير موجود في DOM');
        return;
    }

    // دالة لإرسال البيانات المهيكلة إلى الطابعة
    async function sendToPrinter(receiptData) {
        const ports = ['5000', '5001']; // قائمة البورتات للمحاولة
        let lastError = null;

        for (const port of ports) {
            try {
                console.log(`print-receipt.js: محاولة إرسال البيانات إلى الخادم على البورت ${port}`);
                console.log('print-receipt.js: البيانات المرسلة:', JSON.stringify(receiptData, null, 2));

                const response = await fetch(`http://127.0.0.1:${port}/print`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify(receiptData) // إرسال كائن البيانات مباشرة
                });

                const result = await response.json(); // قراءة الرد كـ JSON

                if (!response.ok) {
                    console.error(`print-receipt.js: استجابة الخطأ من الخادم على البورت ${port}:`, result.error);
                    throw new Error(result.error || `فشل الاتصال بخادم الطباعة على البورت ${port}`);
                }
                
                console.log(`print-receipt.js: تم الإرسال بنجاح على البورت ${port}`, result);
                alert(result.status || 'تم إرسال الإيصال للطباعة بنجاح');
                return; // الخروج بعد نجاح الطباعة

            } catch (error) {
                console.error(`print-receipt.js: خطأ في الطباعة على البورت ${port}:`, error.message);
                lastError = error;
            }
        }

        // إذا فشلت كل المحاولات
        console.error('print-receipt.js: فشلت كل محاولات الطباعة');
        alert(`فشل الطباعة: تأكد من أن برنامج الطباعة يعمل. الخطأ: ${lastError.message}`);
    }

    // دالة لتوليد كائن بيانات الإيصال (بدلاً من نص)
    function generateReceiptData() {
        console.log('print-receipt.js: توليد بيانات الإيصال');

        // --- 1. الوصول إلى عناصر DOM (لا تغيير هنا) ---
        const selectClient = document.getElementById('clientSelect');
        const dateVente = document.getElementById('saleDate'); // سنستخدمه فقط لـ numeroRecu
        const estCredit = document.getElementById('isCredit');
        const remiseVente = document.getElementById('saleDiscount');
        const fraisLivraison = document.getElementById('deliveryPrice');
        const fraisTravail = document.getElementById('laborCost');
        const corpsTableauArticles = document.getElementById('saleItemsTableBody');
        const affichageSousTotal = document.getElementById('subtotal');
        const affichageTotal = document.getElementById('total');
        const inputMontantPaye = document.getElementById('paidAmount');
        const affichageReste = document.getElementById('remaining');

        const articlesVendus = Array.from(corpsTableauArticles.children).map(row => ({
            nomProduit: row.cells[0]?.textContent.trim() || 'غير معروف',
            quantite: parseFloat(row.cells[1]?.textContent) || 0,
            prixUnitaire: parseFloat(row.cells[2]?.textContent) || 0,
            remise: parseFloat(row.cells[3]?.textContent) || 0,
            total: parseFloat(row.cells[4]?.textContent) || 0
        }));

        if (articlesVendus.length === 0) {
            alert('يرجى إضافة منتج واحد على الأقل.');
            return null;
        }

        // --- 4. تجميع البيانات مع إنشاء طابع زمني دقيق ---
        
        // *** بداية التعديل ***
        // إنشاء كائن تاريخ جديد لالتقاط اللحظة الحالية بدقة
        const now = new Date();

        // دالة لتنسيق التاريخ والوقت بشكل قياسي ومقروء
        const formatTimestamp = (date) => {
            const year = date.getFullYear();
            // getMonth() يبدأ من 0، لذلك نضيف 1
            const month = String(date.getMonth() + 1).padStart(2, '0'); 
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };

        const preciseTimestamp = formatTimestamp(now);
        const saleDateForReceiptNumber = dateVente.value.replace(/-/g, '') || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        // *** نهاية التعديل ***

        const receiptData = {
            numeroRecu: `${saleDateForReceiptNumber}-001`,
            // هذا هو الحقل الجديد الذي سيحمل الوقت الدقيق للعملية
            transactionTimestamp: preciseTimestamp, 
            
            nomClient: selectClient.selectedOptions[0]?.textContent.split(' (')[0] || 'بيع نقدي',
            estCredit: parseInt(estCredit.value) === 1,
            
            articlesVendus: articlesVendus,

            sousTotal: parseFloat(affichageSousTotal.textContent) || 0,
            remiseVente: parseFloat(remiseVente.value) || 0,
            fraisLivraison: parseFloat(fraisLivraison.value) || 0,
            fraisTravail: parseFloat(fraisTravail.value) || 0,
            total: parseFloat(affichageTotal.textContent) || 0,
            montantPaye: parseFloat(inputMontantPaye.value) || 0,
            resteAPayer: parseFloat(affichageReste.textContent) || 0,
        };
        
        console.log('print-receipt.js: بيانات الإيصال المولدة (مع وقت دقيق):', receiptData);
        return receiptData;
    }

    // التعامل مع النقر على زر الطباعة
    printButton.addEventListener('click', () => {
        console.log('print-receipt.js: النقر على زر الطباعة');
        
        const receiptData = generateReceiptData();
        if (receiptData) {
            sendToPrinter(receiptData);
        }
    });
});