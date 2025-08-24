document.addEventListener('DOMContentLoaded', () => {
    console.log('print-receipt.js: بدء تهيئة زر الطباعة');

    const printButton = document.getElementById('printReceipt');
    if (!printButton) {
        console.error('print-receipt.js: زر الطباعة غير موجود في DOM');
        return;
    }

    // دالة لإرسال البيانات المهيكلة إلى الطابعة
    async function sendToPrinter(receiptData) {
        const ports = ['5000', '5001'];
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
                    body: JSON.stringify(receiptData)
                });

                const result = await response.json();
                if (!response.ok) {
                    console.error(`print-receipt.js: استجابة الخطأ من الخادم على البورت ${port}:`, result.error);
                    throw new Error(result.error || `فشل الاتصال بخادم الطباعة على البورت ${port}`);
                }
                
                console.log(`print-receipt.js: تم الإرسال بنجاح على البورت ${port}`, result);
                return;

            } catch (error) {
                console.error(`print-receipt.js: خطأ في الطباعة على البورت ${port}:`, error.message);
                lastError = error;
            }
        }

        console.error('print-receipt.js: فشلت كل محاولات الطباعة');
        alert(`فشل الطباعة: تأكد من أن برنامج الطباعة يعمل. الخطأ: ${lastError.message}`);
    }

    // دالة لتوليد كائن بيانات الإيصال
    function generateReceiptData() {
        console.log('print-receipt.js: توليد بيانات الإيصال');

        // --- الوصول إلى عناصر DOM مع فحص الأخطاء ---
        const selectClient = document.getElementById('clientSelect');
        const dateVente = document.getElementById('saleDate');
        const estCredit = document.getElementById('isCredit');
        const remiseVente = document.getElementById('saleDiscount');
        const fraisLivraison = document.getElementById('deliveryPrice');
        const fraisTravail = document.getElementById('laborCost');
        const corpsTableauArticles = document.getElementById('saleItemsTableBody');
        const affichageSousTotal = document.getElementById('subtotal');
        const affichageTotal = document.getElementById('total');
        const inputMontantPaye = document.getElementById('paidAmount');
        const affichageReste = document.getElementById('remaining');

        if (!selectClient || !dateVente || !estCredit || !remiseVente || !fraisLivraison ||
            !fraisTravail || !corpsTableauArticles || !affichageSousTotal || !affichageTotal ||
            !inputMontantPaye || !affichageReste) {
            console.error('print-receipt.js: عنصر DOM مفقود');
            alert('خطأ: بعض عناصر النموذج مفقودة. يرجى التحقق من النموذج.');
            return null;
        }

        const articlesVendus = Array.from(corpsTableauArticles.children).map(row => {
            const nomProduit = row.cells[0]?.textContent.trim();
            const quantite = parseFloat(row.cells[1]?.textContent) || 0;
            const prixUnitaire = parseFloat(row.cells[2]?.textContent) || 0;
            const remise = parseFloat(row.cells[3]?.textContent) || 0;
            const total = parseFloat(row.cells[4]?.textContent) || 0;
            if (!nomProduit) {
                console.warn('print-receipt.js: منتج بدون اسم في الجدول');
            }
            return { nomProduit: nomProduit || 'غير معروف', quantite, prixUnitaire, remise, total };
        });

        if (articlesVendus.length === 0) {
            console.error('print-receipt.js: لا توجد منتجات في الجدول');
            alert('يرجى إضافة منتج واحد على الأقل.');
            return null;
        }

        // --- إنشاء طابع زمني دقيق ومعرف إيصال فريد ---
        const now = new Date();
        const formatTimestamp = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };
        const preciseTimestamp = formatTimestamp(now);
        const saleDateForReceiptNumber = dateVente.value.replace(/-/g, '') || 
            `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const uniqueId = `${saleDateForReceiptNumber}-${Math.floor(now.getTime() % 10000)}`;

        const receiptData = {
            type: 'receipt',
            numeroRecu: uniqueId,
            transactionTimestamp: preciseTimestamp,
            nomClient: selectClient.selectedOptions[0]?.textContent.split(' (')[0] || 'بيع نقدي',
            estCredit: parseInt(estCredit.value) === 1,
            articlesVendus,
            sousTotal: parseFloat(affichageSousTotal.textContent) || 0,
            remiseVente: parseFloat(remiseVente.value) || 0,
            fraisLivraison: parseFloat(fraisLivraison.value) || 0,
            fraisTravail: parseFloat(fraisTravail.value) || 0,
            total: parseFloat(affichageTotal.textContent) || 0,
            montantPaye: parseFloat(inputMontantPaye.value) || 0,
            resteAPayer: parseFloat(affichageReste.textContent) || 0,
        };
        
        console.log('print-receipt.js: بيانات الإيصال المولدة:', JSON.stringify(receiptData, null, 2));
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