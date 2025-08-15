import SalesDB from '../database/SalesDB.js';
import SaleItemsDB from '../database/SaleItemsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    const salesDB = new SalesDB();
    const saleItemsDB = new SaleItemsDB();

    // UI Elements
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clientSearchInput = document.getElementById('clientSearch');
    const saleTypeSelect = document.getElementById('saleType');
    const applyFiltersButton = document.getElementById('applyFilters');
    const salesTableBody = document.getElementById('salesTableBody');
    const saleDetailsModal = document.getElementById('saleDetailsModal');
    const saleItemsTableBody = document.getElementById('saleItemsTableBody');
    const saleSummary = document.getElementById('saleSummary');
    const closeModalButton = document.getElementById('closeModal');
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const toggleSensitiveButton = document.getElementById('toggleSensitive');
    const sensitiveIconShow = document.getElementById('sensitive-icon-show');
    const sensitiveIconHide = document.getElementById('sensitive-icon-hide');
    const toggleThemeButton = document.getElementById('toggleTheme');

    let currentPage = 1;
    const itemsPerPage = 10;
    let currentSales = [];
    let sensitiveInfoVisible = false;

    // Check if user is admin
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const isAuthenticated = localStorage.getItem('isAuthenticated');

    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    if (toggleThemeButton) {
        toggleThemeButton.innerHTML = savedTheme === 'dark' ? '<i data-lucide="sun" class="w-4 h-4"></i>' : '<i data-lucide="moon" class="w-4 h-4"></i>';
    }

    // Initialize sensitive information visibility
    if (isAdmin || isAuthenticated === null || isAuthenticated === 'true') {
        sensitiveInfoVisible = true;
        document.querySelectorAll('.sensitive-column, .sensitive-header').forEach(element => {
            element.classList.add('visible');
        });
        sensitiveIconShow.classList.add('hidden');
        sensitiveIconHide.classList.remove('hidden');
        toggleSensitiveButton.title = 'إخفاء المعلومات الحساسة';
    } else {
        sensitiveInfoVisible = false;
        sensitiveIconShow.classList.remove('hidden');
        sensitiveIconHide.classList.add('hidden');
        toggleSensitiveButton.title = 'إظهار المعلومات الحساسة';
    }

    // Show toggle button for non-admins
    if (!isAdmin) {
        toggleSensitiveButton.classList.remove('hidden');
    }

    // Custom Flatpickr locale for Arabic
    const customLocale = {
        weekdays: {
            shorthand: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
            longhand: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
        },
        months: {
            shorthand: ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
            longhand: ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
        },
        firstDayOfWeek: 1,
        rangeSeparator: " إلى ",
        weekAbbreviation: "أسبوع",
        scrollTitle: "اسحب للتمرير",
        toggleTitle: "انقر للتبديل",
        amPM: ["ص", "م"]
    };

    // Set default date range to last 30 days
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    startDateInput.value = startDate;
    endDateInput.value = endDate;

    // Initialize Flatpickr for date inputs
    const startDatePicker = flatpickr(startDateInput, {
        dateFormat: "Y-m-d",
        locale: customLocale,
        maxDate: "2025-08-11",
        defaultDate: startDate,
        theme: savedTheme
    });
    const endDatePicker = flatpickr(endDateInput, {
        dateFormat: "Y-m-d",
        locale: customLocale,
        maxDate: "2025-08-11",
        defaultDate: endDate,
        theme: savedTheme
    });

    // Toggle theme
    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        const newTheme = isDark ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        toggleThemeButton.innerHTML = isDark ? '<i data-lucide="sun" class="w-4 h-4"></i>' : '<i data-lucide="moon" class="w-4 h-4"></i>';
        lucide.createIcons();
        startDatePicker.set('theme', newTheme);
        endDatePicker.set('theme', newTheme);
    }

    if (toggleThemeButton) {
        toggleThemeButton.addEventListener('click', toggleTheme);
    }

    // Toggle sensitive information visibility
    function toggleSensitiveInfo() {
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        if (isAuthenticated === 'true') {
            localStorage.setItem('isAuthenticated', 'false');
            sensitiveInfoVisible = !sensitiveInfoVisible;
        } else if (isAuthenticated === null || isAuthenticated === 'false') {
            if (isAuthenticated === 'false') {
                const currentURL = window.location.href;
                const authURL = `auth.html?redirect=${encodeURIComponent(currentURL)}`;
                window.location.href = authURL;
                return;
            }
            sensitiveInfoVisible = !sensitiveInfoVisible;
        }

        document.querySelectorAll('.sensitive-column, .sensitive-header').forEach(element => {
            element.classList.toggle('visible', sensitiveInfoVisible);
        });
        sensitiveIconShow.classList.toggle('hidden', sensitiveInfoVisible);
        sensitiveIconHide.classList.toggle('hidden', !sensitiveInfoVisible);
        toggleSensitiveButton.title = sensitiveInfoVisible ? 'إخفاء المعلومات الحساسة' : 'إظهار المعلومات الحساسة';
        renderPage(currentPage);
        if (isAuthenticated !== null && !isAdmin) {
            localStorage.setItem('isAuthenticated', sensitiveInfoVisible ? 'true' : 'false');
        }
    }

    toggleSensitiveButton.addEventListener('click', toggleSensitiveInfo);

    // Print receipt functionality
    async function sendToPrinter(receiptData) {
        const ports = ['5000', '5001'];
        let lastError = null;

        for (const port of ports) {
            try {
                console.log(`إرسال البيانات إلى خادم الطباعة على المنفذ ${port}`);
                console.log('البيانات المرسلة:', JSON.stringify(receiptData, null, 2));

                const response = await fetch(`http://127.0.0.1:${port}/print`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify(receiptData)
                });

                const result = await response.json();

                if (!response.ok) {
                    console.error(`استجابة خطأ من الخادم على المنفذ ${port}:`, result.error);
                    throw new Error(result.error || `فشل الاتصال بخادم الطباعة على المنفذ ${port}`);
                }
                
                console.log(`تم الإرسال بنجاح إلى الطابعة على المنفذ ${port}`, result);
                return;

            } catch (error) {
                console.error(`خطأ في الطباعة على المنفذ ${port}:`, error.message);
                lastError = error;
            }
        }

        console.error('فشلت كل محاولات الطباعة');
        alert(`فشل الطباعة: تأكد من أن برنامج الطباعة يعمل. الخطأ: ${lastError.message}`);
    }

    function generateReceiptData(sale, saleItems) {
        console.log('توليد بيانات الإيصال');

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
        const saleDateForReceiptNumber = sale.date.replace(/-/g, '');

        const receiptData = {
            numeroRecu: `${saleDateForReceiptNumber}-${sale.sale_id}`,
            transactionTimestamp: preciseTimestamp,
            nomClient: sale.client_name || 'بيع نقدي',
            estCredit: sale.is_credit,
            articlesVendus: saleItems.map(item => ({
                nomProduit: item.product_name || 'غير معروف',
                quantite: item.quantity || 0,
                prixUnitaire: item.unit_price || 0,
                remise: item.discount_amount || 0,
                total: item.total_price || 0
            })),
            sousTotal: sale.subtotal || 0,
            remiseVente: sale.sale_discount_amount || 0,
            fraisLivraison: sale.delivery_price || 0,
            fraisTravail: sale.labor_cost || 0,
            total: sale.total || 0,
            montantPaye: sale.paid || 0,
            resteAPayer: sale.remaining || 0,
        };

        console.log('بيانات الإيصال المولدة:', receiptData);
        return receiptData;
    }

    async function loadSales(page = 1) {
        try {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            const clientSearch = clientSearchInput.value.trim().toLowerCase();
            const saleType = saleTypeSelect.value;

            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (startDate && !dateRegex.test(startDate)) {
                throw new Error('تنسيق تاريخ البداية غير صالح. استخدم YYYY-MM-DD.');
            }
            if (endDate && !dateRegex.test(endDate)) {
                throw new Error('تنسيق تاريخ النهاية غير صالح. استخدم YYYY-MM-DD.');
            }

            let sales = await salesDB.getAllSales(startDate, endDate);

            if (saleType === 'credit') {
                sales = sales.filter(sale => sale.is_credit && sale.remaining > 0);
            } else if (saleType === 'paid') {
                sales = sales.filter(sale => sale.remaining === 0);
            }

            if (clientSearch) {
                sales = sales.filter(sale => sale.client_name && sale.client_name.toLowerCase().includes(clientSearch));
            }
            
            currentSales = sales;
            renderPage(page);

        } catch (error) {
            console.error('خطأ في تحميل المبيعات:', error);
            salesTableBody.innerHTML = `<tr><td colspan="${isAdmin || sensitiveInfoVisible ? 12 : 9}" class="text-center p-4 text-danger">فشل تحميل المبيعات: ${error.message}</td></tr>`;
        }
    }

    function renderPage(page) {
        currentPage = page;
        const totalSales = currentSales.length;
        const totalPages = Math.ceil(totalSales / itemsPerPage) || 1;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedSales = currentSales.slice(startIndex, startIndex + itemsPerPage);

        salesTableBody.innerHTML = '';
        if (paginatedSales.length === 0) {
            salesTableBody.innerHTML = `<tr><td colspan="${isAdmin || sensitiveInfoVisible ? 12 : 9}" class="text-center p-4 text-gray-500 dark:text-gray-400">لا توجد مبيعات تطابق معايير البحث.</td></tr>`;
        } else {
            paginatedSales.forEach(sale => {
                const remainingClass = sale.remaining > 0 ? 'text-danger' : 'text-gray-500 dark:text-gray-400';
                const typeClass = sale.is_credit ? 'text-warning' : 'text-success';
                const typeText = sale.is_credit ? 'كريدي' : 'منتهي';
                const profitClass = sale.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-danger';
                const sensitiveClass = (isAdmin || sensitiveInfoVisible) ? 'sensitive-column visible' : 'sensitive-column';

                const row = `
                    <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                        <td class="p-3 text-right">${sale.sale_id}</td>
                        <td class="p-3 text-right" dir="ltr">${sale.date}</td>
                        <td class="p-3 text-right">${sale.client_name || 'بيع نقدي'}</td>
                        <td class="p-3 text-right">${sale.total.toFixed(2)}</td>
                        <td class="p-3 text-right ${sensitiveClass}">${(sale.sale_discount_amount || 0).toFixed(2)}</td>
                        <td class="p-3 text-right">${(sale.delivery_price || 0).toFixed(2)}</td>
                        <td class="p-3 text-right">${(sale.labor_cost || 0).toFixed(2)}</td>
                        <td class="p-3 text-right ${sensitiveClass}">${(sale.profit || 0).toFixed(2)}</td>
                        <td class="p-3 text-right text-success">${sale.paid.toFixed(2)}</td>
                        <td class="p-3 text-right font-semibold ${remainingClass}">${sale.remaining.toFixed(2)}</td>
                        <td class="p-3 text-right font-semibold ${typeClass}">${typeText}</td>
                        <td class="p-3 text-right">
                            <div class="flex gap-2 justify-end">
                                <button class="view-details p-2 rounded-md text-primary dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="تفاصيل" data-sale-id="${sale.sale_id}">
                                    <i data-lucide="eye" class="w-4 h-4"></i>
                                </button>
                                <button class="delete-sale p-2 rounded-md text-danger dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors" title="حذف" data-sale-id="${sale.sale_id}">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                salesTableBody.insertAdjacentHTML('beforeend', row);
            });
        }
        
        pageInfo.textContent = `صفحة ${currentPage} من ${totalPages}`;
        prevPageButton.disabled = currentPage === 1;
        nextPageButton.disabled = currentPage === totalPages;

        lucide.createIcons();
    }

    async function showSaleDetails(saleId) {
        try {
            const sale = currentSales.find(s => s.sale_id === saleId);
            if (!sale) throw new Error('البيع غير موجود');

            // Populate sale summary
            const sensitiveClass = (isAdmin || sensitiveInfoVisible) ? 'sensitive-column visible' : 'sensitive-column';
            saleSummary.innerHTML = `
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">رقم البيع</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${sale.sale_id}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">التاريخ</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${sale.date}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">العميل</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${sale.client_name || 'بيع نقدي'}</p>
                </div>
                <div class="text-center p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <label class="block text-sm text-blue-600 dark:text-blue-300">الإجمالي النهائي</label>
                    <p class="text-lg font-bold text-primary dark:text-blue-300">${sale.total.toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg ${sensitiveClass}">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">المجموع الفرعي</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${sale.subtotal.toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg ${sensitiveClass}">
                    <label class="block text-sm text-yellow-600 dark:text-yellow-400">خصم المبيعات</label>
                    <p class="text-lg font-bold text-warning dark:text-yellow-400">${(sale.sale_discount_amount || 0).toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">تكلفة التوصيل</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${(sale.delivery_price || 0).toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">تكلفة العمالة</label>
                    <p class="text-lg font-bold text-gray-800 dark:text-white">${(sale.labor_cost || 0).toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <label class="block text-sm text-green-600 dark:text-green-400">المدفوع</label>
                    <p class="text-lg font-bold text-success dark:text-green-400">${sale.paid.toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <label class="block text-sm text-red-600 dark:text-red-400">المتبقي</label>
                    <p class="text-lg font-bold text-danger dark:text-red-400">${sale.remaining.toFixed(2)}</p>
                </div>
                <div class="text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg ${sensitiveClass}">
                    <label class="block text-sm text-gray-600 dark:text-gray-400">الربح</label>
                    <p class="text-lg font-bold ${(sale.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-danger')}">${(sale.profit || 0).toFixed(2)}</p>
                </div>
                <div class="text-center p-3">
                    <button id="printReceipt" class="p-2 rounded-md text-white bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors" title="طباعة الإيصال">
                        <i data-lucide="printer" class="w-4 h-4 inline-block mr-1"></i>طباعة
                    </button>
                </div>
            `;

            const saleItems = await saleItemsDB.getSaleItemsBySale(saleId);
            saleItemsTableBody.innerHTML = '';
            saleItems.forEach(item => {
                const itemProfitClass = item.item_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-danger';
                const sensitiveClass = (isAdmin || sensitiveInfoVisible) ? 'sensitive-column visible' : 'sensitive-column';
                const row = `
                    <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                        <td class="p-3 font-medium text-gray-900 dark:text-white text-right">${item.product_name}</td>
                        <td class="p-3 text-right">${item.quantity}</td>
                        <td class="p-3 text-right">${item.unit_price.toFixed(2)}</td>
                        <td class="p-3 text-right ${sensitiveClass}">${item.discount_amount.toFixed(2)}</td>
                        <td class="p-3 text-right">${item.total_price.toFixed(2)}</td>
                        <td class="p-3 font-semibold ${itemProfitClass} text-right ${sensitiveClass}">${(item.item_profit || 0).toFixed(2)}</td>
                        <td class="p-3 text-right">
                            <button class="delete-item p-2 rounded-md text-danger dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors" title="حذف العنصر" data-item-id="${item.sale_item_id}">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </td>
                    </tr>
                `;
                saleItemsTableBody.insertAdjacentHTML('beforeend', row);
            });
            
            saleDetailsModal.classList.remove('invisible', 'opacity-0');
            saleDetailsModal.classList.add('visible', 'opacity-100');

            // Add event listener for print button
            const printButton = document.getElementById('printReceipt');
            if (printButton) {
                printButton.addEventListener('click', () => {
                    console.log('النقر على زر الطباعة');
                    const receiptData = generateReceiptData(sale, saleItems);
                    if (receiptData) {
                        sendToPrinter(receiptData);
                    }
                });
            }

            lucide.createIcons();
        } catch (error) {
            console.error('خطأ في تحميل تفاصيل البيع:', error);
            alert('فشل تحميل تفاصيل البيع: ' + error.message);
        }
    }

    async function deleteSale(saleId) { 
        if (!confirm('هل أنت متأكد من حذف هذا البيع؟ سيتم إعادة المخزون للمنتجات المباعة وكافة التأثيرات الأخرى.')) return; 
        try { 
            await salesDB.deleteSale(saleId); 
            await loadSales(currentPage); 
        } catch (error) { 
            console.error('خطأ في حذف البيع:', error); 
            alert('فشل حذف البيع: ' + error.message); 
        } 
    }
    
    async function deleteSaleItem(itemId) { 
        if (!confirm('هل أنت متأكد من حذف هذا العنصر؟ سيتم إعادة المخزون وتحديث الفاتورة.')) return; 
        try { 
            await saleItemsDB.deleteSaleItem(itemId); 
            const saleId = currentSales.find(s => s.sale_items?.some(i => i.sale_item_id === itemId))?.sale_id; 
            await loadSales(currentPage); 
            if (saleId) await showSaleDetails(saleId); 
        } catch (error) { 
            console.error('خطأ في حذف العنصر:', error); 
            alert('فشل حذف العنصر: ' + error.message); 
        } 
    }
    
    function closeModal() {
        saleDetailsModal.classList.remove('visible', 'opacity-100');
        saleDetailsModal.classList.add('invisible', 'opacity-0');
    }

    salesTableBody.addEventListener('click', e => {
        const viewBtn = e.target.closest('.view-details');
        const deleteBtn = e.target.closest('.delete-sale');
        if (viewBtn) showSaleDetails(parseInt(viewBtn.dataset.saleId));
        if (deleteBtn) deleteSale(parseInt(deleteBtn.dataset.saleId));
    });
    
    saleItemsTableBody.addEventListener('click', e => {
        const deleteItemBtn = e.target.closest('.delete-item');
        if (deleteItemBtn) {
            deleteSaleItem(parseInt(deleteItemBtn.dataset.itemId));
        }
    });

    applyFiltersButton.addEventListener('click', () => loadSales(1));
    closeModalButton.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    prevPageButton.addEventListener('click', () => { if (currentPage > 1) renderPage(currentPage - 1); });
    nextPageButton.addEventListener('click', () => { const totalPages = Math.ceil(currentSales.length / itemsPerPage); if (currentPage < totalPages) renderPage(currentPage + 1); });

    await loadSales();
});